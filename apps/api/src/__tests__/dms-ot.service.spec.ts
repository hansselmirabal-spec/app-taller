/**
 * Unit tests for DmsOtService.
 *
 * All Postgres interactions are mocked so the tests run without a real DB.
 * Focus areas:
 *   - findOtSeguimiento: filters, pagination, sort, diasIngreso computed field
 *   - getSyncStatus: returns shaped DTO from DmsSyncState
 *   - getOperativo: returns KPI counts from raw SQL results
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DmsOtService } from '../modules/dms-sync/dms-ot.service';
import { DmsOtRow } from '../modules/dms-sync/dms-ot-row.entity';
import { DmsSyncState } from '../modules/dms-sync/dms-sync-state.entity';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeQb(rawRows: any[] = [], count = 0) {
  const qb: any = {
    select:      jest.fn().mockReturnThis(),
    andWhere:    jest.fn().mockReturnThis(),
    where:       jest.fn().mockReturnThis(),
    orderBy:     jest.fn().mockReturnThis(),
    skip:        jest.fn().mockReturnThis(),
    take:        jest.fn().mockReturnThis(),
    getCount:    jest.fn().mockResolvedValue(count),
    getRawMany:  jest.fn().mockResolvedValue(rawRows),
    getMany:     jest.fn().mockResolvedValue(rawRows),
  };
  return qb;
}

function makeOtRepoMock(rawRows: any[] = [], count = 0, queryResults: any[][] = []) {
  let queryCallIndex = 0;
  return {
    createQueryBuilder: jest.fn(() => makeQb(rawRows, count)),
    findOne:            jest.fn(),
    query:              jest.fn().mockImplementation(() => {
      const result = queryResults[queryCallIndex] ?? [];
      queryCallIndex++;
      return Promise.resolve(result);
    }),
  };
}

function makeStateRepoMock(state?: Partial<DmsSyncState>) {
  return {
    findOne: jest.fn().mockResolvedValue(state ?? null),
  };
}

// ── describe: findOtSeguimiento ────────────────────────────────────────────────

describe('DmsOtService.findOtSeguimiento', () => {
  let service: DmsOtService;
  let otRepo: ReturnType<typeof makeOtRepoMock>;
  let stateRepo: ReturnType<typeof makeStateRepoMock>;

  async function buildService(rawRows: any[], count: number, stateData?: Partial<DmsSyncState>) {
    otRepo    = makeOtRepoMock(rawRows, count);
    stateRepo = makeStateRepoMock(stateData);

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        DmsOtService,
        { provide: getRepositoryToken(DmsOtRow),      useValue: otRepo    },
        { provide: getRepositoryToken(DmsSyncState),  useValue: stateRepo },
      ],
    }).compile();

    service = mod.get(DmsOtService);
  }

  it('returns shaped paginated result with computed diasIngreso', async () => {
    const rawRows = [
      {
        nroot:           12345,
        nombrecliente:   'Juan Perez',
        estadoOt:        'Abierto',
        sucursalDesc:    'Asuncion',
        fechaIngreso:    new Date('2025-01-01'),
        syncedAt:        new Date(),
        // diasIngreso raw from Postgres
        diasIngreso:     '180.5',
      },
    ];

    await buildService(rawRows, 1);
    const result = await service.findOtSeguimiento({ page: 1, limit: 50 });

    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
    expect(result.data).toHaveLength(1);
    // diasIngreso must be a non-negative integer
    expect(result.data[0].diasIngreso).toBe(180);
  });

  it('clamps diasIngreso to 0 when null', async () => {
    const rawRows = [{ nroot: 1, diasIngreso: null }];
    await buildService(rawRows, 1);

    const result = await service.findOtSeguimiento({});
    expect(result.data[0].diasIngreso).toBe(0);
  });

  it('passes estadoOt filter to QueryBuilder', async () => {
    await buildService([], 0);
    const qb = makeQb([], 0);
    otRepo.createQueryBuilder = jest.fn(() => qb);

    await service.findOtSeguimiento({ estadoOt: 'Abierto' });

    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('estadoOt'),
      expect.objectContaining({ estadoOt: 'Abierto' }),
    );
  });

  it('passes search filter to QueryBuilder for nroot / nombre / chasis', async () => {
    await buildService([], 0);
    const qb = makeQb([], 0);
    otRepo.createQueryBuilder = jest.fn(() => qb);

    await service.findOtSeguimiento({ search: 'Juan' });

    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('ILIKE'),
      expect.objectContaining({ search: '%Juan%' }),
    );
  });

  it('defaults page=1 and limit=50 when not provided', async () => {
    await buildService([], 0);
    const result = await service.findOtSeguimiento({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
  });

  it('caps limit at 5000', async () => {
    await buildService([], 0);
    const result = await service.findOtSeguimiento({ limit: 9999 });
    expect(result.limit).toBe(5000);
  });
});

// ── describe: getSyncStatus ────────────────────────────────────────────────────

describe('DmsOtService.getSyncStatus', () => {
  let service: DmsOtService;

  async function buildService(stateData?: Partial<DmsSyncState>) {
    const otRepo    = makeOtRepoMock();
    const stateRepo = makeStateRepoMock(stateData);

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        DmsOtService,
        { provide: getRepositoryToken(DmsOtRow),     useValue: otRepo    },
        { provide: getRepositoryToken(DmsSyncState), useValue: stateRepo },
      ],
    }).compile();

    service = mod.get(DmsOtService);
  }

  it('returns nulls when no state row exists', async () => {
    await buildService(undefined);
    const status = await service.getSyncStatus();
    expect(status).toEqual({
      lastSyncAt:   null,
      openCount:    0,
      totalSynced:  0,
      updatedAt:    null,
      errorMessage: null,
    });
  });

  it('returns ISO string dates and counts from state row', async () => {
    const syncAt  = new Date('2025-06-19T10:00:00Z');
    const updated = new Date('2025-06-19T10:00:01Z');
    await buildService({
      kind:         'ot_rows',
      lastSyncAt:   syncAt,
      openCount:    120,
      totalSynced:  135,
      updatedAt:    updated,
      errorMessage: null,
    });

    const status = await service.getSyncStatus();
    expect(status.lastSyncAt).toBe(syncAt.toISOString());
    expect(status.openCount).toBe(120);
    expect(status.totalSynced).toBe(135);
    expect(status.updatedAt).toBe(updated.toISOString());
    expect(status.errorMessage).toBeNull();
  });

  it('surfaces errorMessage from state row', async () => {
    await buildService({ kind: 'ot_rows', errorMessage: 'Connection timeout' });
    const status = await service.getSyncStatus();
    expect(status.errorMessage).toBe('Connection timeout');
  });
});

// ── describe: getOperativo ─────────────────────────────────────────────────────

describe('DmsOtService.getOperativo', () => {
  let service: DmsOtService;

  async function buildServiceWithQueryResults(queryResults: any[][]) {
    const otRepo    = makeOtRepoMock([], 0, queryResults);
    const stateRepo = makeStateRepoMock();

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        DmsOtService,
        { provide: getRepositoryToken(DmsOtRow),     useValue: otRepo    },
        { provide: getRepositoryToken(DmsSyncState), useValue: stateRepo },
      ],
    }).compile();

    service = mod.get(DmsOtService);
  }

  it('returns shaped KPI object with numeric fields', async () => {
    // getOperativo calls otRepo.query 5 times: kpi, vencidos, proximosVencer, distribucion, porAsesor
    const kpiRow = [{
      otsAbiertas:       '10',
      otsCriticas:       '2',
      totalVencidos:     '3',
      otsEnAtraso:       '5',
      diasPromedio:      '18.5',
      ingresados:        '1',
      cerradosEnPeriodo: '0',
      tasaCierre:        '0',
    }];
    const vencidosRows      = [{ nroot: 1, nombrecliente: 'Ana', diasRetraso: '5' }];
    const proximosRows      = [];
    const distribucionRows  = [{ estado: 'En trabajo', count: '8' }];
    const porAsesorRows     = [{ asesor: 'Pedro', total: '10', abiertas: '7', diasPromedio: '12.0' }];

    await buildServiceWithQueryResults([kpiRow, vencidosRows, proximosRows, distribucionRows, porAsesorRows]);

    const result = await service.getOperativo('all');

    expect(result.otsAbiertas).toBe(10);
    expect(result.otsCriticas).toBe(2);
    expect(result.totalVencidos).toBe(3);
    expect(result.diasPromedio).toBe(18.5);
    expect(result.vencidos).toHaveLength(1);
    expect(result.distribucion).toEqual([{ estado: 'En trabajo', count: 8 }]);
    expect(result.porAsesor[0].asesor).toBe('Pedro');
    expect(result.porAsesor[0].abiertas).toBe(7);
  });

  it('returns zero KPIs when table is empty', async () => {
    await buildServiceWithQueryResults([[{}], [], [], [], []]);

    const result = await service.getOperativo('all');

    expect(result.otsAbiertas).toBe(0);
    expect(result.totalVencidos).toBe(0);
    expect(result.vencidos).toHaveLength(0);
    expect(result.distribucion).toHaveLength(0);
    expect(result.porAsesor).toHaveLength(0);
  });
});
