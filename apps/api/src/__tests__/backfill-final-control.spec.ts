/**
 * backfill-final-control — one-off script that inserts missing FINAL_CONTROL
 * TrackingLog rows for legacy bodyshop entries (openspec change
 * `control-final-backfill-legacy`). Tests use a mocked QueryRunner; no real
 * DB connection is opened.
 */

import * as fs from 'fs';
import {
  parseArgs,
  resolveLogStatus,
  buildAuditPayload,
  SELECTION_PREDICATE_SQL,
  run,
  DEFAULT_OUT_DIR,
  ParsedArgs,
} from '../database/backfill-final-control';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeQueryRunner(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    query: jest.fn(),
    release: jest.fn(),
    ...overrides,
  } as any;
}

function mockExit() {
  return jest.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
}

// ─── resolveLogStatus ────────────────────────────────────────────────────────

describe('resolveLogStatus', () => {
  it("returns 'skipped' for a done entry", () => {
    expect(resolveLogStatus('done')).toBe('skipped');
  });

  it.each(['scheduled', 'in_progress', 'blocked'])(
    "returns 'pending' for a %s entry",
    (status) => {
      expect(resolveLogStatus(status)).toBe('pending');
    },
  );
});

// ─── parseArgs ───────────────────────────────────────────────────────────────

describe('parseArgs', () => {
  it('defaults to dry-run with the default out dir', () => {
    expect(parseArgs([])).toEqual<ParsedArgs>({ apply: false, outDir: DEFAULT_OUT_DIR });
  });

  it('sets apply=true on --apply', () => {
    expect(parseArgs(['--apply'])).toEqual<ParsedArgs>({ apply: true, outDir: DEFAULT_OUT_DIR });
  });

  it('overrides outDir on --out=<dir>', () => {
    expect(parseArgs(['--out=/tmp/backfill'])).toEqual<ParsedArgs>({
      apply: false,
      outDir: '/tmp/backfill',
    });
  });

  it('combines --apply and --out=<dir>', () => {
    expect(parseArgs(['--apply', '--out=/tmp/backfill'])).toEqual<ParsedArgs>({
      apply: true,
      outDir: '/tmp/backfill',
    });
  });

  it('exits 1 on an unknown flag', () => {
    const exitSpy = mockExit();
    parseArgs(['--bogus']);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});

// ─── SELECTION_PREDICATE_SQL ─────────────────────────────────────────────────

describe('SELECTION_PREDICATE_SQL', () => {
  it('never filters by date/timestamp — full history, no 60-day cutoff', () => {
    const lower = SELECTION_PREDICATE_SQL.toLowerCase();
    expect(lower).not.toContain('created_at');
    expect(lower).not.toContain('interval');
    expect(lower).not.toContain('now()');
    expect(lower).not.toContain('date_trunc');
  });

  it('excludes cancelled entries and requires prior logs without FINAL_CONTROL', () => {
    expect(SELECTION_PREDICATE_SQL).toContain("<> 'cancelled'");
    expect(SELECTION_PREDICATE_SQL).toContain("process_code = 'FINAL_CONTROL'");
  });
});

// ─── buildAuditPayload ───────────────────────────────────────────────────────

describe('buildAuditPayload', () => {
  it('builds the payload shape and a rollbackSql keyed by tracking_logs.id', () => {
    const rows = [
      {
        entryId: 'entry-1',
        plate: 'ABC123',
        entryStatus: 'in_progress',
        insertedLogId: 'log-1',
        logStatus: 'pending' as const,
        insertedAt: '2026-08-21T18:04:11.000Z',
      },
      {
        entryId: 'entry-2',
        plate: 'XYZ999',
        entryStatus: 'done',
        insertedLogId: 'log-2',
        logStatus: 'skipped' as const,
        insertedAt: '2026-08-21T18:04:11.000Z',
      },
    ];

    const payload = buildAuditPayload('2026-08-21T18-04-11Z', rows, 'localhost/taller_db', 'jperez');

    expect(payload).toEqual({
      runId: '2026-08-21T18-04-11Z',
      changeName: 'control-final-backfill-legacy',
      database: 'localhost/taller_db',
      executedBy: 'jperez',
      count: 2,
      rows,
      rollbackSql: "DELETE FROM tracking_logs WHERE id IN ('log-1', 'log-2');",
    });
  });
});

// ─── run() orchestration ─────────────────────────────────────────────────────

describe('run()', () => {
  const PREVIEW_ROW = { id: 'entry-1', plate: 'ABC123', status: 'in_progress' };
  const INSERTED_ROW = { id: 'log-1', source_id: 'entry-1', status: 'pending' };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('dry-run issues zero INSERTs and rolls back', async () => {
    const exitSpy = mockExit();
    const qr = makeQueryRunner({ query: jest.fn().mockResolvedValueOnce([PREVIEW_ROW]) });

    await run(qr, { apply: false, outDir: '/tmp/out' }, 'localhost/taller_db');

    expect(qr.query).toHaveBeenCalledTimes(1);
    expect(qr.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(qr.commitTransaction).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('apply commits on success and writes the audit file', async () => {
    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    const mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as any);
    const qr = makeQueryRunner({
      query: jest.fn()
        .mockResolvedValueOnce([PREVIEW_ROW])
        .mockResolvedValueOnce([INSERTED_ROW]),
    });

    await run(qr, { apply: true, outDir: '/tmp/out' }, 'localhost/taller_db');

    expect(qr.query).toHaveBeenCalledTimes(2);
    expect(mkdirSpy).toHaveBeenCalledWith('/tmp/out', { recursive: true });
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(qr.commitTransaction).toHaveBeenCalledTimes(1);
    expect(qr.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('rolls back and skips the audit file on a preview/inserted count mismatch', async () => {
    const exitSpy = mockExit();
    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    const qr = makeQueryRunner({
      query: jest.fn()
        .mockResolvedValueOnce([PREVIEW_ROW, { ...PREVIEW_ROW, id: 'entry-2' }])
        .mockResolvedValueOnce([INSERTED_ROW]),
    });

    await run(qr, { apply: true, outDir: '/tmp/out' }, 'localhost/taller_db');

    expect(qr.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(qr.commitTransaction).not.toHaveBeenCalled();
    expect(writeSpy).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('rolls back and skips the commit when the audit file write fails', async () => {
    const exitSpy = mockExit();
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as any);
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('disk full');
    });
    const qr = makeQueryRunner({
      query: jest.fn()
        .mockResolvedValueOnce([PREVIEW_ROW])
        .mockResolvedValueOnce([INSERTED_ROW]),
    });

    await run(qr, { apply: true, outDir: '/tmp/out' }, 'localhost/taller_db');

    expect(qr.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(qr.commitTransaction).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('does not swallow the original error when rollbackTransaction itself throws', async () => {
    const exitSpy = mockExit();
    const qr = makeQueryRunner({
      query: jest.fn().mockRejectedValueOnce(new Error('connection terminated')),
      rollbackTransaction: jest.fn().mockRejectedValueOnce(new Error('rollback also failed')),
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await run(qr, { apply: false, outDir: '/tmp/out' }, 'localhost/taller_db');

    expect(exitSpy).toHaveBeenCalledWith(1);
    // El error original ("connection terminated") se sigue logueando aunque
    // el propio rollback también haya fallado — no debe perderse.
    expect(errorSpy).toHaveBeenCalledWith(
      '❌ Backfill failed, transaction rolled back. No audit file written.',
      expect.objectContaining({ message: 'connection terminated' }),
    );
  });

  it('aborts before commit if an inserted row has no matching preview row (same count, different membership)', async () => {
    const exitSpy = mockExit();
    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    // Conteo igual (1 vs 1) pero source_id de la fila insertada no matchea
    // ningún preview — simula una escritura concurrente entre el SELECT y
    // el INSERT que el guard de conteo por sí solo no puede detectar.
    const qr = makeQueryRunner({
      query: jest.fn()
        .mockResolvedValueOnce([PREVIEW_ROW])
        .mockResolvedValueOnce([{ ...INSERTED_ROW, source_id: 'entry-otra' }]),
    });

    await run(qr, { apply: true, outDir: '/tmp/out' }, 'localhost/taller_db');

    expect(qr.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(qr.commitTransaction).not.toHaveBeenCalled();
    expect(writeSpy).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('is idempotent: re-running against an already-backfilled universe inserts zero rows and still commits', async () => {
    const exitSpy = mockExit();
    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as any);
    // La corrida anterior ya dejó FINAL_CONTROL en todas las entries
    // afectadas — SELECTION_PREDICATE_SQL las excluye, preview viene vacío.
    const qr = makeQueryRunner({
      query: jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
    });

    await run(qr, { apply: true, outDir: '/tmp/out' }, 'localhost/taller_db');

    expect(qr.commitTransaction).toHaveBeenCalledTimes(1);
    expect(qr.rollbackTransaction).not.toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalledWith(1);
  });
});
