import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DataSource, QueryRunner } from 'typeorm';
import { FINAL_CONTROL_FIXED_HOURS } from '../modules/bodyshop/bodyshop-hours.util';

/**
 * One-off backfill: inserts a `FINAL_CONTROL` `TrackingLog` row for every
 * legacy `bodyshop_entries` row that has prior tracking logs but never got
 * one for `process_code='FINAL_CONTROL'` (see openspec change
 * `control-final-backfill-legacy`). Dry-run by default; `--apply` required
 * to write. Does NOT touch `bodyshop_entries.processes` (jsonb) or any
 * pre-existing `tracking_logs` row.
 *
 * Invocation: `pnpm --filter @app-taller/api db:backfill:final-control`
 *             `pnpm --filter @app-taller/api db:backfill:final-control -- --apply`
 */

// ── Args ─────────────────────────────────────────────────────────────────────

export interface ParsedArgs {
  apply: boolean;
  outDir: string;
}

export const DEFAULT_OUT_DIR = path.join(__dirname, '..', '..', 'backfill-audit');

export function parseArgs(argv: string[]): ParsedArgs {
  let apply = false;
  let outDir = DEFAULT_OUT_DIR;

  for (const arg of argv) {
    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (arg.startsWith('--out=')) {
      outDir = arg.slice('--out='.length);
      continue;
    }
    console.error(`❌ Unknown argument: ${arg}`);
    process.exit(1);
    return { apply, outDir };
  }

  return { apply, outDir };
}

// ── Selection / status policy ───────────────────────────────────────────────

/**
 * Shared predicate — single source of truth for both the dry-run SELECT and
 * the apply INSERT..SELECT, so preview and write can never diverge.
 *
 * Locked requirement: NO date/timestamp filter. This is a full-history data
 * correction, not a live-kanban query — the 60-day cutoff in `getBoard()`
 * must never gate this script.
 */
export const SELECTION_PREDICATE_SQL = `
FROM bodyshop_entries e
WHERE COALESCE(e.status, 'scheduled') <> 'cancelled'
  AND EXISTS (SELECT 1 FROM tracking_logs tl
              WHERE tl.source_type = 'bodyshop' AND tl.source_id = e.id::text)
  AND NOT EXISTS (SELECT 1 FROM tracking_logs tl2
                  WHERE tl2.source_type = 'bodyshop' AND tl2.source_id = e.id::text
                    AND tl2.process_code = 'FINAL_CONTROL')
`;

const PREVIEW_SELECT_SQL = `SELECT e.id, e.plate, e.status ${SELECTION_PREDICATE_SQL};`;

// El `CASE` de acá DEBE seguir exactamente la misma regla que
// `resolveLogStatus()` de abajo — es la misma política de negocio escrita
// dos veces (SQL para el INSERT real, TS para el preview del dry-run)
// porque un solo `INSERT...SELECT` no puede compartir código con una función
// TS. Si cambia una, cambiar la otra en el mismo commit — si no, el dry-run
// muestra un status distinto al que realmente se escribe.
const APPLY_INSERT_SQL = `
INSERT INTO tracking_logs
  (id, source_type, source_id, process_name, process_code, order_index,
   planned_hours, status, process_type, started_at, completed_at,
   technician_id, technician_name, notes)
SELECT gen_random_uuid(), 'bodyshop', e.id::text, 'Control Final', 'FINAL_CONTROL', 6,
       $1, CASE WHEN e.status = 'done' THEN 'skipped' ELSE 'pending' END,
       'MOTHER', NULL, NULL, NULL, NULL, $2
${SELECTION_PREDICATE_SQL}
RETURNING id, source_id, status;
`;

// Ver comentario en APPLY_INSERT_SQL — misma regla, escrita en TS para el
// preview del dry-run. Mantener sincronizada con el CASE de arriba.
export function resolveLogStatus(entryStatus: string): 'pending' | 'skipped' {
  return entryStatus === 'done' ? 'skipped' : 'pending';
}

// ── Audit payload ───────────────────────────────────────────────────────────

export interface AuditRow {
  entryId: string;
  plate: string;
  entryStatus: string;
  insertedLogId: string;
  logStatus: 'pending' | 'skipped';
  insertedAt: string;
}

export interface AuditPayload {
  runId: string;
  changeName: string;
  database: string;
  executedBy: string;
  count: number;
  rows: AuditRow[];
  rollbackSql: string;
}

export function buildAuditPayload(
  runId: string, rows: AuditRow[], database: string, executedBy: string,
): AuditPayload {
  const ids = rows.map((r) => `'${r.insertedLogId}'`).join(', ');
  return {
    runId,
    changeName: 'control-final-backfill-legacy',
    database,
    executedBy,
    count: rows.length,
    rows,
    rollbackSql: `DELETE FROM tracking_logs WHERE id IN (${ids});`,
  };
}

function buildRunId(now: Date): string {
  return now.toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z');
}

// ── Orchestration ───────────────────────────────────────────────────────────

interface PreviewRow {
  entryId: string;
  plate: string;
  entryStatus: string;
  logStatus: 'pending' | 'skipped';
}

export async function run(queryRunner: QueryRunner, opts: ParsedArgs, database: string): Promise<void> {
  await queryRunner.startTransaction();

  try {
    const rawPreview: { id: string; plate: string; status: string }[] =
      await queryRunner.query(PREVIEW_SELECT_SQL);

    const previewRows: PreviewRow[] = rawPreview.map((r) => ({
      entryId: r.id,
      plate: r.plate,
      entryStatus: r.status,
      logStatus: resolveLogStatus(r.status),
    }));

    console.log(`Affected universe: ${previewRows.length} entries`);
    for (const row of previewRows) {
      console.log(`  ${row.entryId}  ${row.plate}  status=${row.entryStatus}  → log status=${row.logStatus}`);
    }

    if (!opts.apply) {
      await queryRunner.rollbackTransaction();
      console.log('\nDry-run complete. Zero rows inserted. Re-run with --apply to write.');
      process.exit(0);
      return;
    }

    // Un solo runId para AMBOS: el marcador `notes` que queda en la fila de
    // `tracking_logs` (fallback de correlación si el archivo de auditoría se
    // pierde) y el nombre/contenido del archivo de auditoría. Dos llamadas a
    // `new Date()` en momentos distintos producirían dos IDs distintos que
    // nunca podrían correlacionarse entre sí.
    const runId = buildRunId(new Date());
    const notes = `backfill:control-final-backfill-legacy:${runId}`;
    const inserted: { id: string; source_id: string; status: 'pending' | 'skipped' }[] =
      await queryRunner.query(APPLY_INSERT_SQL, [FINAL_CONTROL_FIXED_HOURS, notes]);

    if (inserted.length !== previewRows.length) {
      throw new Error(
        `Row count mismatch: preview selected ${previewRows.length} entries but insert returned ${inserted.length}. Aborting.`,
      );
    }

    // Map, no zip por índice: `INSERT...SELECT...RETURNING` no garantiza que
    // el orden de las filas devueltas coincida con el del `SELECT` de
    // preview — juntarlas por índice de array podría atribuir la
    // patente/status de una fila a la pieza de auditoría de otra.
    const previewByEntryId = new Map(previewRows.map((r) => [r.entryId, r]));
    const insertedAt = new Date().toISOString();
    const auditRows: AuditRow[] = inserted.map((row) => {
      const preview = previewByEntryId.get(row.source_id);
      // Nunca debería faltar — el guard de conteo de arriba solo prueba
      // cardinalidad igual, no membresía idéntica (una escritura
      // concurrente entre el SELECT y el INSERT podría, en teoría, cambiar
      // qué entries matchean manteniendo el conteo igual). Preferimos
      // fallar fuerte a auditar una fila con patente/status en blanco.
      if (!preview) {
        throw new Error(
          `Audit build failed: inserted log ${row.id} has no matching preview row for entry ${row.source_id}. Aborting before commit.`,
        );
      }
      return {
        entryId: row.source_id,
        plate: preview.plate,
        entryStatus: preview.entryStatus,
        insertedLogId: row.id,
        logStatus: row.status,
        insertedAt,
      };
    });

    const executedBy = os.userInfo().username;
    const payload = buildAuditPayload(runId, auditRows, database, executedBy);

    fs.mkdirSync(opts.outDir, { recursive: true });
    const outPath = path.join(opts.outDir, `backfill-final-control-${runId}.json`);
    // mode 0o600 — el archivo lleva patentes/nombres de clientes en texto
    // plano; que solo lo pueda leer quien lo generó.
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), { mode: 0o600 });

    console.log(JSON.stringify(payload, null, 2));

    await queryRunner.commitTransaction();
    console.log(`\n✅ Applied. ${payload.count} rows inserted. Audit file: ${outPath}`);
  } catch (err) {
    try {
      await queryRunner.rollbackTransaction();
    } catch (rollbackErr) {
      console.error('❌ Rollback itself failed — transaction state is unknown:', rollbackErr);
    }
    console.error('❌ Backfill failed, transaction rolled back. No audit file written.', err);
    process.exit(1);
  }
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

function describeDatabase(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return 'unknown';
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://taller_user:taller_pass@localhost:5432/taller_db';

  const AppDataSource = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    entities: [__dirname + '/../**/*.entity.ts'],
    synchronize: false,
  });

  await AppDataSource.initialize();
  const qr = AppDataSource.createQueryRunner();
  await qr.connect();

  try {
    await run(qr, opts, describeDatabase(databaseUrl));
  } finally {
    await qr.release();
    await AppDataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
