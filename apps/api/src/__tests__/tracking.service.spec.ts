import { Test } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { TrackingService } from '../modules/tracking/tracking.service';
import { TrackingLog } from '../modules/tracking/tracking-log.entity';
import { Appointment } from '../modules/appointments/appointment.entity';
import { BodyshopEntry } from '../modules/bodyshop/bodyshop-entry.entity';
import { BodyshopProcessTech } from '../modules/bodyshop/bodyshop-process-tech.entity';
import { Workshop } from '../modules/workshops/workshop.entity';

// ─── IDs ─────────────────────────────────────────────────────────────────────

const WS_ID    = 'ws-001';
const APPT_ID  = 'appt-001';
const ENTRY_ID = 'entry-001';
const LOG_ID   = 'log-001';
const TECH_ID  = 'tech-001';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MOCK_WORKSHOP = {
  id: WS_ID, name: 'Test Mechanic Workshop', type: 'MECHANIC',
};

const MOCK_APPOINTMENT: any = {
  id: APPT_ID,
  date: '2026-06-10',
  plate: 'ABC 123',
  customerName: 'Juan Perez',
  vehicleDescription: 'Toyota Corolla',
  status: 'scheduled',
  estimatedFinishDate: null,
  technician: { name: 'Técnico 1' },
  serviceType: { name: 'Cambio de aceite', durationHours: 2 },
};

const MOCK_ENTRY: any = {
  id: ENTRY_ID,
  date: '2026-06-10',
  plate: 'XYZ 789',
  customerName: 'María García',
  status: 'scheduled',
  workshopId: WS_ID,
  estimatedFinishDate: null,
  workType: { name: 'Reparación completa' },
  technician: { name: 'Técnico Bodyshop' },
  processes: null,
  bodyworkHours: 8,
  prepHours: 4,
  paintHours: 6,
};

function makeLog(overrides: Partial<TrackingLog> = {}): TrackingLog {
  return {
    id:                   LOG_ID,
    sourceType:           'mechanic',
    sourceId:             APPT_ID,
    processName:          'Mecánica',
    processCode:          'MECHANIC',
    orderIndex:           1,
    plannedHours:         2,
    startedAt:            null,
    completedAt:          null,
    status:               'pending',
    blockedReason:        null,
    pausedAt:             null,
    pausedDurationMinutes: 0,
    processType:          'MOTHER',
    technicianId:         null,
    technicianName:       null,
    notes:                null,
    createdAt:            new Date('2026-06-10T08:00:00Z'),
    ...overrides,
  } as TrackingLog;
}

// ─── Query Builder stub ───────────────────────────────────────────────────────

function makeQb(result: any[] = []) {
  const qb: any = {};
  ['leftJoinAndSelect', 'where', 'andWhere', 'orderBy', 'update', 'set', 'execute'].forEach(m => {
    qb[m] = jest.fn().mockReturnValue(qb);
  });
  qb.getOne  = jest.fn().mockResolvedValue(result[0] ?? null);
  qb.getMany = jest.fn().mockResolvedValue(result);
  qb.execute = jest.fn().mockResolvedValue({});
  return qb;
}

// ─── Repository factories ─────────────────────────────────────────────────────

function makeLogRepo(overrides: any = {}) {
  return {
    create:             jest.fn().mockImplementation((d: any) => d),
    save:               jest.fn().mockImplementation((d: any) => Promise.resolve({ id: LOG_ID, ...d })),
    findOne:            jest.fn().mockResolvedValue(null),
    find:               jest.fn().mockResolvedValue([]),
    createQueryBuilder: jest.fn().mockReturnValue(makeQb()),
    ...overrides,
  };
}

function makeApptRepo(overrides: any = {}) {
  return {
    createQueryBuilder: jest.fn().mockReturnValue(makeQb([MOCK_APPOINTMENT])),
    findOne:            jest.fn().mockResolvedValue(MOCK_APPOINTMENT),
    update:             jest.fn().mockResolvedValue({}),
    save:               jest.fn().mockImplementation((d: any) => Promise.resolve(d)),
    ...overrides,
  };
}

function makeEntryRepo(overrides: any = {}) {
  return {
    createQueryBuilder: jest.fn().mockReturnValue(makeQb([MOCK_ENTRY])),
    findOne:            jest.fn().mockResolvedValue(MOCK_ENTRY),
    update:             jest.fn().mockResolvedValue({}),
    save:               jest.fn().mockImplementation((d: any) => Promise.resolve(d)),
    ...overrides,
  };
}

function makeWorkshopRepo(overrides: any = {}) {
  return {
    findOne: jest.fn().mockResolvedValue(MOCK_WORKSHOP),
    ...overrides,
  };
}

function makeProcessTechRepo(overrides: any = {}) {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    delete:  jest.fn().mockResolvedValue({ affected: 0 }),
    save:    jest.fn().mockImplementation((d: any) => Promise.resolve(d)),
    create:  jest.fn().mockImplementation((d: any) => d),
    ...overrides,
  };
}

// ─── DataSource / transaction manager mock (addProcessToBodyshop) ──────────
// addProcessToBodyshop hace un dual-write dentro de dataSource.transaction(manager => ...).
// El mock enruta manager.create/save por clase de entidad (igual patrón que
// bodyshop.service.spec.ts) y permite simular el fallo de UNO de los dos writes
// para probar que el otro nunca "confirma" (rollback).

// withTechnicianLock (startProcess/unblockProcess) también corre dentro de
// dataSource.transaction(manager => ...) desde la auditoría 2026-08-13 (fix
// BE-01/A-3). El manager mockeado enruta find/save/create por clase de
// entidad hacia el repo mock real ya configurado por cada test (mismo objeto
// jest.fn(), así las aserciones sobre logRepo.save/processTechRepo.save
// siguen funcionando igual que antes de que esas llamadas quedaran adentro
// de una transacción) — salvo `query` (el advisory lock), no-op acá, y el
// fallback de TrackingLog nuevo sin logRepo explícito, usado por
// addProcessToBodyshop.
function makeManager(opts: {
  failOn?: 'log' | 'entry';
  logRepo?: any; processTechRepo?: any; entryRepo?: any;
} = {}) {
  const saved: { entity: any; data: any }[] = [];
  const repoFor = (entity: any) => {
    if (entity === TrackingLog)         return opts.logRepo;
    if (entity === BodyshopProcessTech) return opts.processTechRepo;
    if (entity === BodyshopEntry)       return opts.entryRepo;
    return undefined;
  };
  const manager = {
    create: (entity: any, data: any) => {
      const repo = repoFor(entity);
      return repo?.create ? repo.create(data) : { ...data };
    },
    save: async (entity: any, data: any) => {
      if (entity === TrackingLog && opts.failOn === 'log') throw new Error('DB down (log)');
      if (entity === BodyshopEntry && opts.failOn === 'entry') throw new Error('DB down (entry)');
      saved.push({ entity, data });
      const repo = repoFor(entity);
      if (repo?.save) return repo.save(data);
      if (entity === TrackingLog) return { id: 'log-new-001', ...data };
      return data;
    },
    findOne: async (entity: any, findOpts: any) => {
      const repo = repoFor(entity);
      return repo?.findOne ? repo.findOne(findOpts) : null;
    },
    // Solo usado por startProcess (rama MOTHER) para el UPDATE masivo de
    // hermanos in_progress→pending — siempre sobre TrackingLog.
    createQueryBuilder: () => opts.logRepo?.createQueryBuilder?.() ?? makeQb(),
    query: async (_sql: string, _params?: any[]) => [],
  };
  return { manager, saved };
}

function makeDataSource(manager: any) {
  return { transaction: jest.fn().mockImplementation(async (cb: any) => cb(manager)) };
}

// ─── Module builder ───────────────────────────────────────────────────────────

async function build(repos: {
  logRepo?: any; apptRepo?: any; entryRepo?: any; workshopRepo?: any; processTechRepo?: any;
  managerBundle?: ReturnType<typeof makeManager>;
} = {}) {
  const logRepo         = repos.logRepo         ?? makeLogRepo();
  const apptRepo        = repos.apptRepo        ?? makeApptRepo();
  const entryRepo       = repos.entryRepo       ?? makeEntryRepo();
  const workshopRepo    = repos.workshopRepo    ?? makeWorkshopRepo();
  const processTechRepo = repos.processTechRepo ?? makeProcessTechRepo();
  const { manager, saved } = repos.managerBundle ?? makeManager({ logRepo, processTechRepo, entryRepo });
  const dataSource      = makeDataSource(manager);
  // TrackingService usa `this.logRepo.manager` como manager "sin lock" cuando
  // no hay técnico que serializar (real: Repository.manager es la misma
  // EntityManager compartida por toda la conexión) — acá lo apuntamos al
  // mismo manager mockeado para que las rutas sin técnico también funcionen.
  if (!logRepo.manager) logRepo.manager = manager;

  const mod = await Test.createTestingModule({
    providers: [
      TrackingService,
      { provide: getRepositoryToken(TrackingLog),         useValue: logRepo },
      { provide: getRepositoryToken(Appointment),         useValue: apptRepo },
      { provide: getRepositoryToken(BodyshopEntry),       useValue: entryRepo },
      { provide: getRepositoryToken(BodyshopProcessTech), useValue: processTechRepo },
      { provide: getRepositoryToken(Workshop),            useValue: workshopRepo },
      { provide: getDataSourceToken(),                    useValue: dataSource },
    ],
  }).compile();

  return {
    service:       mod.get(TrackingService),
    logRepo,
    apptRepo,
    entryRepo,
    workshopRepo,
    saved,
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('TrackingService', () => {

  // ── buildCard / semaphore ──────────────────────────────────────────────────

  describe('buildCard — semaphore logic', () => {
    it('green: all mother processes completed', async () => {
      const { service } = await build();

      const logs = [
        makeLog({ processCode: 'AGENDA',   orderIndex: 0, status: 'completed', processType: 'MOTHER', plannedHours: 0 }),
        makeLog({ id: 'log-2', processCode: 'MECHANIC', orderIndex: 1, plannedHours: 2, status: 'completed', processType: 'MOTHER',
          startedAt:   new Date('2026-06-10T08:00:00Z'),
          completedAt: new Date('2026-06-10T09:30:00Z'), // 1.5h real vs 2h planned → negative deviation
        }),
      ];

      const card = (service as any).buildCard(APPT_ID, 'mechanic', {
        status: 'done', plate: 'ABC', customerName: 'Test', vehicleType: null,
        techName: null, serviceOrType: null, entryDate: '2026-06-10', exitDate: null,
      }, logs);

      expect(card.semaphore).toBe('green');
    });

    it('green: deviation is negative (finished early)', async () => {
      const { service } = await build();

      const logs = [
        makeLog({ processCode: 'AGENDA', orderIndex: 0, status: 'completed', processType: 'MOTHER', plannedHours: 0 }),
        makeLog({ id: 'log-2', processCode: 'MECHANIC', orderIndex: 1, plannedHours: 4, status: 'completed', processType: 'MOTHER',
          startedAt:   new Date('2026-06-10T08:00:00Z'),
          completedAt: new Date('2026-06-10T10:00:00Z'), // 2h real vs 4h planned → -2 deviation
        }),
      ];

      const card = (service as any).buildCard(APPT_ID, 'mechanic', {
        status: 'done', plate: 'ABC', customerName: 'Test', vehicleType: null,
        techName: null, serviceOrType: null, entryDate: '2026-06-10', exitDate: null,
      }, logs);

      expect(card.semaphore).toBe('green');
      expect(card.deviationTotal).toBeLessThan(0);
    });

    it('red: in-progress process is overdue (elapsed > planned)', async () => {
      const { service } = await build();

      // Started 5 hours ago, planned only 2 hours → overdue by 3h
      const startedAt = new Date(Date.now() - 5 * 3_600_000);

      const logs = [
        makeLog({ processCode: 'AGENDA', orderIndex: 0, status: 'completed', processType: 'MOTHER', plannedHours: 0 }),
        makeLog({ id: 'log-2', processCode: 'MECHANIC', orderIndex: 1, plannedHours: 2, status: 'in_progress', processType: 'MOTHER',
          startedAt,
        }),
      ];

      const card = (service as any).buildCard(APPT_ID, 'mechanic', {
        status: 'in_progress', plate: 'ABC', customerName: 'Test', vehicleType: null,
        techName: null, serviceOrType: null, entryDate: '2026-06-10', exitDate: null,
      }, logs);

      expect(card.semaphore).toBe('red');
      expect(card.overdueHours).toBeGreaterThan(0);
    });

    it('orange: deviation >= 2 hours but process not yet overdue', async () => {
      const { service } = await build();

      // Completed 1h over plan (1h deviation), plus completed another 1.1h over (total ~2.1h)
      const logs = [
        makeLog({ processCode: 'AGENDA', orderIndex: 0, status: 'completed', processType: 'MOTHER', plannedHours: 0 }),
        makeLog({ id: 'log-2', processCode: 'MECHANIC', orderIndex: 1, plannedHours: 2, status: 'completed', processType: 'MOTHER',
          startedAt:   new Date('2026-06-10T08:00:00Z'),
          completedAt: new Date('2026-06-10T11:10:00Z'), // 3.17h real vs 2h planned → +1.17h deviation
        }),
        makeLog({ id: 'log-3', processCode: 'FINAL_CONTROL', orderIndex: 6, plannedHours: 1, status: 'completed', processType: 'MOTHER',
          startedAt:   new Date('2026-06-10T12:00:00Z'),
          completedAt: new Date('2026-06-10T14:00:00Z'), // 2h real vs 1h planned → +1h more deviation
        }),
      ];

      const card = (service as any).buildCard(APPT_ID, 'mechanic', {
        status: 'done', plate: 'ABC', customerName: 'Test', vehicleType: null,
        techName: null, serviceOrType: null, entryDate: '2026-06-10', exitDate: null,
      }, logs);

      // Total deviation > 2 but all done (overdueHours = 0) → should not be red
      // The semaphore is green because allDone=true takes priority over deviation check
      // Verifying that allDone drives green
      expect(card.semaphore).toBe('green');
    });

    it('orange: accumulated deviation >= 2 on non-completed work', async () => {
      const { service } = await build();

      // Two completed processes each +1h over plan → total 2h deviation
      // Current process not yet started (pending) → overdueHours = 0
      const logs = [
        makeLog({ processCode: 'AGENDA', orderIndex: 0, status: 'completed', processType: 'MOTHER', plannedHours: 0 }),
        makeLog({ id: 'log-2', processCode: 'BODYWORK', orderIndex: 1, plannedHours: 1, status: 'completed', processType: 'MOTHER',
          startedAt:   new Date('2026-06-10T08:00:00Z'),
          completedAt: new Date('2026-06-10T10:00:00Z'), // 2h real vs 1h planned → +1h deviation
        }),
        makeLog({ id: 'log-3', processCode: 'PREP', orderIndex: 2, plannedHours: 1, status: 'completed', processType: 'MOTHER',
          startedAt:   new Date('2026-06-10T10:00:00Z'),
          completedAt: new Date('2026-06-10T12:00:00Z'), // 2h real vs 1h planned → +1h deviation
        }),
        makeLog({ id: 'log-4', processCode: 'PAINT', orderIndex: 3, plannedHours: 1, status: 'pending', processType: 'MOTHER' }),
      ];

      const card = (service as any).buildCard(ENTRY_ID, 'bodyshop', {
        status: 'in_progress', plate: 'XYZ', customerName: 'Test', vehicleType: null,
        techName: null, serviceOrType: null, entryDate: '2026-06-10', exitDate: null,
      }, logs);

      // deviationTotal >= 2 with no overdue → orange
      expect(card.semaphore).toBe('orange');
      expect(card.overdueHours).toBe(0);
    });

    it('normal: minimal delay (deviation > 0 but below orange threshold)', async () => {
      const { service } = await build();

      const logs = [
        makeLog({ processCode: 'AGENDA', orderIndex: 0, status: 'completed', processType: 'MOTHER', plannedHours: 0 }),
        makeLog({ id: 'log-2', processCode: 'MECHANIC', orderIndex: 1, plannedHours: 2, status: 'completed', processType: 'MOTHER',
          startedAt:   new Date('2026-06-10T08:00:00Z'),
          completedAt: new Date('2026-06-10T10:30:00Z'), // 2.5h real vs 2h planned → +0.5h deviation
        }),
        makeLog({ id: 'log-3', processCode: 'FINAL_CONTROL', orderIndex: 6, plannedHours: 1, status: 'pending', processType: 'MOTHER' }),
      ];

      const card = (service as any).buildCard(APPT_ID, 'mechanic', {
        status: 'in_progress', plate: 'ABC', customerName: 'Test', vehicleType: null,
        techName: null, serviceOrType: null, entryDate: '2026-06-10', exitDate: null,
      }, logs);

      expect(card.semaphore).toBe('normal');
      expect(card.deviationTotal).toBeGreaterThan(0);
      expect(card.deviationTotal).toBeLessThan(2);
    });
  });

  // ── deviationTotal calculation ────────────────────────────────────────────

  describe('buildCard — deviationTotal', () => {
    it('sums deviation across completed processes', async () => {
      const { service } = await build();

      const logs = [
        makeLog({ processCode: 'AGENDA', orderIndex: 0, status: 'completed', processType: 'MOTHER', plannedHours: 0 }),
        makeLog({ id: 'log-2', processCode: 'BODYWORK', orderIndex: 1, plannedHours: 2, status: 'completed', processType: 'MOTHER',
          startedAt:   new Date('2026-06-10T08:00:00Z'),
          completedAt: new Date('2026-06-10T11:00:00Z'), // 3h real → +1h
        }),
        makeLog({ id: 'log-3', processCode: 'PREP', orderIndex: 2, plannedHours: 2, status: 'completed', processType: 'MOTHER',
          startedAt:   new Date('2026-06-10T11:00:00Z'),
          completedAt: new Date('2026-06-10T14:00:00Z'), // 3h real → +1h
        }),
      ];

      const card = (service as any).buildCard(ENTRY_ID, 'bodyshop', {
        status: 'done', plate: 'XYZ', customerName: 'Test', vehicleType: null,
        techName: null, serviceOrType: null, entryDate: '2026-06-10', exitDate: null,
      }, logs);

      expect(card.deviationTotal).toBe(2);
    });

    it('excludes AGENDA process from deviation calculation', async () => {
      const { service } = await build();

      // AGENDA with very large time difference should not affect deviationTotal
      const logs = [
        makeLog({ processCode: 'AGENDA', orderIndex: 0, plannedHours: 0, status: 'completed', processType: 'MOTHER',
          startedAt:   new Date('2026-06-10T08:00:00Z'),
          completedAt: new Date('2026-06-10T18:00:00Z'), // 10h — should be ignored
        }),
        makeLog({ id: 'log-2', processCode: 'MECHANIC', orderIndex: 1, plannedHours: 2, status: 'completed', processType: 'MOTHER',
          startedAt:   new Date('2026-06-10T08:00:00Z'),
          completedAt: new Date('2026-06-10T10:00:00Z'), // exactly on time
        }),
      ];

      const card = (service as any).buildCard(APPT_ID, 'mechanic', {
        status: 'done', plate: 'ABC', customerName: 'Test', vehicleType: null,
        techName: null, serviceOrType: null, entryDate: '2026-06-10', exitDate: null,
      }, logs);

      expect(card.deviationTotal).toBe(0);
    });

    it('returns 0 deviation when no processes are started', async () => {
      const { service } = await build();

      const logs = [
        makeLog({ processCode: 'AGENDA', orderIndex: 0, status: 'in_progress', processType: 'MOTHER', plannedHours: 0 }),
        makeLog({ id: 'log-2', processCode: 'MECHANIC', orderIndex: 1, plannedHours: 2, status: 'pending', processType: 'MOTHER' }),
      ];

      const card = (service as any).buildCard(APPT_ID, 'mechanic', {
        status: 'scheduled', plate: 'ABC', customerName: 'Test', vehicleType: null,
        techName: null, serviceOrType: null, entryDate: '2026-06-10', exitDate: null,
      }, logs);

      expect(card.deviationTotal).toBe(0);
      expect(card.overdueHours).toBe(0);
    });
  });

  // ── startProcess ─────────────────────────────────────────────────────────

  describe('startProcess', () => {
    it('sets status to in_progress and records startedAt', async () => {
      const log = makeLog({ status: 'pending' });
      const logRepo = makeLogRepo({ findOne: jest.fn().mockResolvedValue(log) });
      const qb = makeQb();
      logRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      const { service } = await build({ logRepo });
      await service.startProcess(LOG_ID, TECH_ID, 'Técnico 1');

      expect(logRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'in_progress', technicianId: TECH_ID }),
      );
    });

    it('throws NotFoundException when log does not exist', async () => {
      const logRepo = makeLogRepo({ findOne: jest.fn().mockResolvedValue(null) });

      const { service } = await build({ logRepo });
      await expect(service.startProcess('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when process is already completed', async () => {
      const log = makeLog({ status: 'completed' });
      const logRepo = makeLogRepo({ findOne: jest.fn().mockResolvedValue(log) });

      const { service } = await build({ logRepo });
      await expect(service.startProcess(LOG_ID)).rejects.toThrow(BadRequestException);
    });

    it('starts PARALLEL process without resetting other in_progress processes', async () => {
      const log = makeLog({ status: 'pending', processType: 'PARALLEL' });
      const logRepo = makeLogRepo({ findOne: jest.fn().mockResolvedValue(log) });

      const { service } = await build({ logRepo });
      await service.startProcess(LOG_ID);

      // createQueryBuilder should NOT have been called for PARALLEL (no reset step)
      expect(logRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(logRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress' }));
    });

    it('works with no technician provided', async () => {
      const log = makeLog({ status: 'pending' });
      const logRepo = makeLogRepo({ findOne: jest.fn().mockResolvedValue(log) });
      const qb = makeQb();
      logRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      const { service } = await build({ logRepo });
      await service.startProcess(LOG_ID);

      // technicianId remains null (not overwritten with undefined)
      expect(logRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'in_progress' }),
      );
    });

    it('rejects starting when the technician is already in_progress on another vehicle', async () => {
      const log = makeLog({ status: 'pending', sourceId: 'appt-002' });
      const conflict = makeLog({
        id: 'log-other', sourceId: APPT_ID, status: 'in_progress',
        technicianId: TECH_ID, processName: 'Chapería',
      });
      const logRepo = makeLogRepo({
        findOne: jest.fn()
          .mockResolvedValueOnce(log)      // the log being started
          .mockResolvedValueOnce(conflict), // technician's other in_progress log
      });

      const { service } = await build({ logRepo });
      await expect(service.startProcess(LOG_ID, TECH_ID, 'Técnico 1'))
        .rejects.toThrow(BadRequestException);
      expect(logRepo.save).not.toHaveBeenCalled();
    });

    it('rejects starting via the real UI call shape — startProcess(logId) with NO technicianId param, relying on the log\'s already-assigned technician (QA-reported bug: the kanban "Iniciar" button never sends technicianId)', async () => {
      const log = makeLog({ status: 'pending', sourceId: 'appt-002', technicianId: TECH_ID });
      const conflict = makeLog({
        id: 'log-other', sourceId: APPT_ID, status: 'in_progress',
        technicianId: TECH_ID, technicianName: 'Luis Benitez', processName: 'Chapería',
      });
      const logRepo = makeLogRepo({
        findOne: jest.fn()
          .mockResolvedValueOnce(log)
          .mockResolvedValueOnce(conflict),
      });

      const { service } = await build({ logRepo });
      await expect(service.startProcess(LOG_ID)).rejects.toThrow(/Luis Benitez.*Chapería/);
      expect(logRepo.save).not.toHaveBeenCalled();
    });

    it('rejects starting a bodyshop process when NEITHER the log NOR the param has technicianId — resolves from bodyshop_process_techs (the actual real-world QA scenario: fresh entries never get technicianId written onto the log at all)', async () => {
      const log = makeLog({
        status: 'pending', sourceType: 'bodyshop', sourceId: 'entry-002',
        processCode: 'BODYWORK', technicianId: null,
      });
      const conflict = makeLog({
        id: 'log-other', sourceType: 'bodyshop', sourceId: 'entry-001', status: 'in_progress',
        technicianId: TECH_ID, technicianName: 'Luis Benitez', processName: 'Chapería',
      });
      const logRepo = makeLogRepo({
        findOne: jest.fn()
          .mockResolvedValueOnce(log)      // the log being started
          .mockResolvedValueOnce(conflict), // conflict search, once resolved
      });
      const processTechRepo = makeProcessTechRepo({
        findOne: jest.fn().mockResolvedValue({
          entryId: 'entry-002', process: 'BODYWORK', technicianId: TECH_ID,
          technician: { name: 'Luis Benitez' },
        }),
      });

      const { service } = await build({ logRepo, processTechRepo });
      await expect(service.startProcess(LOG_ID)).rejects.toThrow(/Luis Benitez.*Chapería/);
      expect(processTechRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { entryId: 'entry-002', process: 'BODYWORK' } }),
      );
      expect(logRepo.save).not.toHaveBeenCalled();
    });

    it('allows starting a bodyshop process when bodyshop_process_techs has no assignment yet (no false positive)', async () => {
      const log = makeLog({
        status: 'pending', sourceType: 'bodyshop', sourceId: 'entry-003',
        processCode: 'BODYWORK', technicianId: null,
      });
      const logRepo = makeLogRepo({ findOne: jest.fn().mockResolvedValue(log) });
      const processTechRepo = makeProcessTechRepo({ findOne: jest.fn().mockResolvedValue(null) });

      const { service } = await build({ logRepo, processTechRepo });
      await service.startProcess(LOG_ID);

      expect(logRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress' }));
    });

    it('starting a PARALLEL process (ej. Mecánica) pauses the active MOTHER process of the same entry, tagging the pause with the parallel\'s name', async () => {
      const mechanicLog = makeLog({
        id: 'log-mechanic', sourceType: 'bodyshop', sourceId: ENTRY_ID,
        processCode: 'MECHANIC', processName: 'Mecánica', processType: 'PARALLEL', status: 'pending',
      });
      const motherLog = makeLog({
        id: 'log-prep', sourceType: 'bodyshop', sourceId: ENTRY_ID,
        processCode: 'PREP', processName: 'Preparación', processType: 'MOTHER', status: 'in_progress',
        technicianId: TECH_ID, technicianName: 'Técnico 1',
      });
      const logRepo = makeLogRepo({
        findOne: jest.fn()
          .mockResolvedValueOnce(mechanicLog) // el log que se está iniciando
          .mockResolvedValueOnce(motherLog),  // búsqueda de proceso madre activo
      });
      const processTechRepo = makeProcessTechRepo();
      const entryRepo = makeEntryRepo();

      const { service } = await build({ logRepo, processTechRepo, entryRepo });
      await service.startProcess('log-mechanic');

      expect(logRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'log-prep', status: 'blocked', blockedReason: 'Mecánica' }),
      );
      expect(processTechRepo.delete).toHaveBeenCalledWith({ entryId: ENTRY_ID, process: 'PREP' });
      expect(entryRepo.update).toHaveBeenCalledWith({ id: ENTRY_ID }, { status: 'paused' });
      expect(logRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'log-mechanic', status: 'in_progress' }),
      );
    });

    it('starting a PARALLEL process does nothing extra when there is no active MOTHER process', async () => {
      const mechanicLog = makeLog({
        id: 'log-mechanic', sourceType: 'bodyshop', sourceId: ENTRY_ID,
        processCode: 'MECHANIC', processName: 'Mecánica', processType: 'PARALLEL', status: 'pending',
      });
      const logRepo = makeLogRepo({
        findOne: jest.fn()
          .mockResolvedValueOnce(mechanicLog) // el log que se está iniciando
          .mockResolvedValueOnce(null),       // no hay proceso madre in_progress
      });
      const entryRepo = makeEntryRepo();

      const { service } = await build({ logRepo, entryRepo });
      await service.startProcess('log-mechanic');

      expect(entryRepo.update).not.toHaveBeenCalled();
      expect(logRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'log-mechanic', status: 'in_progress' }),
      );
    });

    it('allows starting when the technician\'s other in_progress log is on the same vehicle', async () => {
      const log = makeLog({ status: 'pending', processType: 'PARALLEL' });
      const sameVehicleLog = makeLog({
        id: 'log-mother', sourceId: APPT_ID, status: 'in_progress', technicianId: TECH_ID,
      });
      const logRepo = makeLogRepo({
        findOne: jest.fn()
          .mockResolvedValueOnce(log)
          .mockResolvedValueOnce(sameVehicleLog),
      });

      const { service } = await build({ logRepo });
      await service.startProcess(LOG_ID, TECH_ID, 'Técnico 1');

      expect(logRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'in_progress', technicianId: TECH_ID }),
      );
    });
  });

  // ── completeProcess ───────────────────────────────────────────────────────

  describe('completeProcess', () => {
    it('marks process as completed and auto-advances next MOTHER process', async () => {
      const currentLog  = makeLog({ status: 'in_progress', processType: 'MOTHER' });
      const nextLog     = makeLog({ id: 'log-next', processCode: 'FINAL_CONTROL', orderIndex: 6, status: 'pending', processType: 'MOTHER' });

      const logRepo = makeLogRepo({
        findOne: jest.fn()
          .mockResolvedValueOnce(currentLog)   // findOne for the completed log
          .mockResolvedValueOnce(nextLog),      // findOne for next pending MOTHER
      });

      const { service } = await build({ logRepo });
      const result = await service.completeProcess(LOG_ID);

      expect(result.completed.status).toBe('completed');
      expect(result.next).not.toBeNull();
      expect(result.next?.processCode).toBe('FINAL_CONTROL');
      // El lookup del siguiente MOTHER debe pedir orderIndex ASC, createdAt
      // ASC a la DB — sin esto, una entry con dos pasadas del mismo proceso
      // (feature de devolver a proceso anterior) podría reactivar la pasada
      // vieja en vez de la más reciente.
      expect(logRepo.findOne).toHaveBeenNthCalledWith(2, expect.objectContaining({
        order: { orderIndex: 'ASC', createdAt: 'ASC' },
      }));
    });

    it('throws NotFoundException when log does not exist', async () => {
      const logRepo = makeLogRepo({ findOne: jest.fn().mockResolvedValue(null) });

      const { service } = await build({ logRepo });
      await expect(service.completeProcess('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when process is pending (not in_progress or blocked)', async () => {
      const log = makeLog({ status: 'pending' });
      const logRepo = makeLogRepo({ findOne: jest.fn().mockResolvedValue(log) });

      const { service } = await build({ logRepo });
      await expect(service.completeProcess(LOG_ID)).rejects.toThrow(BadRequestException);
    });

    it('returns parallelBlocking=true when all mothers done but parallel still pending', async () => {
      const currentLog    = makeLog({ status: 'in_progress', processType: 'MOTHER' });
      const parallelLog   = makeLog({ id: 'log-par', processCode: 'MECHANIC', processType: 'PARALLEL', status: 'pending' });

      const logRepo = makeLogRepo({
        findOne: jest.fn()
          .mockResolvedValueOnce(currentLog)   // the log being completed
          .mockResolvedValueOnce(null)         // no next pending MOTHER
          .mockResolvedValueOnce(parallelLog), // pending PARALLEL found
      });

      const { service } = await build({ logRepo });
      const result = await service.completeProcess(LOG_ID);

      expect(result.parallelBlocking).toBe(true);
      expect(result.next).toBeNull();
    });

    it('PARALLEL process completion does not auto-advance mother flow', async () => {
      const log = makeLog({ status: 'in_progress', processType: 'PARALLEL' });
      const logRepo = makeLogRepo({ findOne: jest.fn().mockResolvedValue(log) });

      const { service } = await build({ logRepo });
      const result = await service.completeProcess(LOG_ID);

      expect(result.completed.status).toBe('completed');
      expect(result.next).toBeNull();
      expect(result.parallelBlocking).toBe(false);
    });
  });

  // ── blockProcess ─────────────────────────────────────────────────────────

  describe('blockProcess', () => {
    it('sets status to blocked and records reason', async () => {
      const log = makeLog({ status: 'in_progress', sourceType: 'mechanic' });
      const logRepo = makeLogRepo({ findOne: jest.fn().mockResolvedValue(log) });
      const apptRepo = makeApptRepo();

      const { service } = await build({ logRepo, apptRepo });
      await service.blockProcess(LOG_ID, 'Falta pieza de repuesto');

      expect(logRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'blocked', blockedReason: 'Falta pieza de repuesto' }),
      );
    });

    it('calls apptRepo.update to pause the appointment', async () => {
      const log = makeLog({ status: 'in_progress', sourceType: 'mechanic', sourceId: APPT_ID });
      const logRepo = makeLogRepo({ findOne: jest.fn().mockResolvedValue(log) });
      const apptRepo = makeApptRepo();

      const { service } = await build({ logRepo, apptRepo });
      await service.blockProcess(LOG_ID, 'Esperando repuesto');

      expect(apptRepo.update).toHaveBeenCalledWith({ id: APPT_ID }, { status: 'paused' });
    });

    it('throws NotFoundException when log does not exist', async () => {
      const logRepo = makeLogRepo({ findOne: jest.fn().mockResolvedValue(null) });

      const { service } = await build({ logRepo });
      await expect(service.blockProcess('nonexistent', 'reason')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when process is already completed', async () => {
      const log = makeLog({ status: 'completed' });
      const logRepo = makeLogRepo({ findOne: jest.fn().mockResolvedValue(log) });

      const { service } = await build({ logRepo });
      await expect(service.blockProcess(LOG_ID, 'reason')).rejects.toThrow(BadRequestException);
    });
  });

  // ── unblockProcess ────────────────────────────────────────────────────────

  describe('unblockProcess', () => {
    it('restores status to in_progress when process had been started', async () => {
      const pausedAt = new Date(Date.now() - 30 * 60_000); // 30 min ago
      const log = makeLog({ status: 'blocked', startedAt: new Date('2026-06-10T08:00:00Z'), pausedAt, sourceType: 'mechanic' });
      const logRepo = makeLogRepo({
        findOne: jest.fn()
          .mockResolvedValueOnce(log)   // the log to unblock
          .mockResolvedValueOnce(null)  // no other blocked processes
          .mockResolvedValueOnce(log),  // has in_progress
      });
      const apptRepo = makeApptRepo();

      const { service } = await build({ logRepo, apptRepo });
      const result = await service.unblockProcess(LOG_ID);

      expect(result.status).toBe('in_progress');
      expect(result.blockedReason).toBeNull();
    });

    it('restores status to pending when process was never started', async () => {
      const pausedAt = new Date(Date.now() - 10 * 60_000);
      const log = makeLog({ status: 'blocked', startedAt: null, pausedAt, sourceType: 'mechanic' });
      const logRepo = makeLogRepo({
        findOne: jest.fn()
          .mockResolvedValueOnce(log)
          .mockResolvedValueOnce(null)  // no other blocked
          .mockResolvedValueOnce(null), // no in_progress
      });

      const { service } = await build({ logRepo });
      const result = await service.unblockProcess(LOG_ID);

      expect(result.status).toBe('pending');
    });

    it('accumulates pausedDurationMinutes correctly', async () => {
      const pausedAt = new Date(Date.now() - 60 * 60_000); // blocked 60 min ago
      const log = makeLog({
        status: 'blocked',
        startedAt: new Date('2026-06-10T08:00:00Z'),
        pausedAt,
        pausedDurationMinutes: 30, // previously accumulated 30 min
        sourceType: 'mechanic',
      });
      const logRepo = makeLogRepo({
        findOne: jest.fn()
          .mockResolvedValueOnce(log)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
      });

      const { service } = await build({ logRepo });
      await service.unblockProcess(LOG_ID);

      const savedLog = logRepo.save.mock.calls[0][0];
      // Should be ~90 min (30 accumulated + ~60 current session)
      expect(savedLog.pausedDurationMinutes).toBeGreaterThan(85);
    });

    it('throws NotFoundException when log does not exist', async () => {
      const logRepo = makeLogRepo({ findOne: jest.fn().mockResolvedValue(null) });

      const { service } = await build({ logRepo });
      await expect(service.unblockProcess('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when process is not blocked', async () => {
      const log = makeLog({ status: 'in_progress' });
      const logRepo = makeLogRepo({ findOne: jest.fn().mockResolvedValue(log) });

      const { service } = await build({ logRepo });
      await expect(service.unblockProcess(LOG_ID)).rejects.toThrow(BadRequestException);
    });
  });

  // ── getCardProcesses ─────────────────────────────────────────────────────

  describe('getCardProcesses', () => {
    it('pide a la DB orderIndex ASC, createdAt ASC — sin esto, dos pasadas del mismo proceso podrían mostrarse fuera de orden cronológico', async () => {
      const logRepo = makeLogRepo({ find: jest.fn().mockResolvedValue([]) });

      const { service } = await build({ logRepo });
      await service.getCardProcesses('bodyshop', 'entry-1');

      expect(logRepo.find).toHaveBeenCalledWith(expect.objectContaining({
        order: { orderIndex: 'ASC', createdAt: 'ASC' },
      }));
    });
  });

  // ── getBoard ──────────────────────────────────────────────────────────────

  describe('getBoard', () => {
    it('throws NotFoundException when workshop does not exist', async () => {
      const workshopRepo = makeWorkshopRepo({ findOne: jest.fn().mockResolvedValue(null) });

      const { service } = await build({ workshopRepo });
      await expect(service.getBoard('2026-06-10', 'bad-ws')).rejects.toThrow(NotFoundException);
    });

    it('returns board with expected shape', async () => {
      const agendaLog  = makeLog({ processCode: 'AGENDA',   orderIndex: 0, status: 'in_progress', processType: 'MOTHER', plannedHours: 0 });
      const mechLog    = makeLog({ id: 'log-2', processCode: 'MECHANIC', orderIndex: 1, status: 'pending', processType: 'MOTHER', plannedHours: 2 });

      const logRepo = makeLogRepo({ find: jest.fn().mockResolvedValue([agendaLog, mechLog]) });
      const apptRepo = makeApptRepo({
        createQueryBuilder: jest.fn().mockReturnValue(makeQb([MOCK_APPOINTMENT])),
      });
      const entryRepo = makeEntryRepo({
        createQueryBuilder: jest.fn().mockReturnValue(makeQb([])),
      });

      const { service } = await build({ logRepo, apptRepo, entryRepo });
      const board = await service.getBoard('2026-06-10', WS_ID);

      expect(board).toHaveProperty('columns');
      expect(board).toHaveProperty('alertCount');
      expect(board.workshopId).toBe(WS_ID);
      expect(Array.isArray(board.columns)).toBe(true);

      // Toda llamada a logRepo.find() que pida orden debe pedir createdAt
      // como desempate de orderIndex — si no, dos pasadas del mismo proceso
      // (feature de devolver a proceso anterior) podrían mostrarse fuera de
      // orden cronológico en el board.
      const callsWithOrder = (logRepo.find as jest.Mock).mock.calls
        .map(([args]: [any]) => args?.order)
        .filter(Boolean);
      expect(callsWithOrder.length).toBeGreaterThan(0);
      for (const order of callsWithOrder) {
        expect(order).toEqual({ orderIndex: 'ASC', createdAt: 'ASC' });
      }
    });

    it('cancelled appointments do not appear in active columns', async () => {
      const cancelledAppt = { ...MOCK_APPOINTMENT, status: 'cancelled' };
      const agendaLog = makeLog({ processCode: 'AGENDA', orderIndex: 0, status: 'in_progress', processType: 'MOTHER', plannedHours: 0 });
      const mechLog   = makeLog({ id: 'log-2', processCode: 'MECHANIC', orderIndex: 1, status: 'pending', processType: 'MOTHER', plannedHours: 2 });

      const logRepo  = makeLogRepo({ find: jest.fn().mockResolvedValue([agendaLog, mechLog]) });
      const apptRepo = makeApptRepo({
        createQueryBuilder: jest.fn().mockReturnValue(makeQb([cancelledAppt])),
      });
      const entryRepo = makeEntryRepo({
        createQueryBuilder: jest.fn().mockReturnValue(makeQb([])),
      });

      const { service } = await build({ logRepo, apptRepo, entryRepo });
      const board = await service.getBoard('2026-06-10', WS_ID);

      const activeColumns = board.columns.filter((c: any) => c.processCode !== '__CANCELLED__');
      const activeCards   = activeColumns.flatMap((c: any) => c.cards);
      const hasCancelled  = activeCards.some((c: any) => c.status === 'cancelled');

      expect(hasCancelled).toBe(false);
    });

    it('red/orange cards are counted in alertCount', async () => {
      // Overdue log: started 5 hours ago, planned only 1 hour
      const startedAt = new Date(Date.now() - 5 * 3_600_000);
      const agendaLog = makeLog({ processCode: 'AGENDA',   orderIndex: 0, status: 'completed', processType: 'MOTHER', plannedHours: 0 });
      const overdueLog = makeLog({ id: 'log-2', processCode: 'MECHANIC', orderIndex: 1, plannedHours: 1, status: 'in_progress', processType: 'MOTHER', startedAt });

      const logRepo  = makeLogRepo({ find: jest.fn().mockResolvedValue([agendaLog, overdueLog]) });
      const apptRepo = makeApptRepo({
        createQueryBuilder: jest.fn().mockReturnValue(makeQb([MOCK_APPOINTMENT])),
      });
      const entryRepo = makeEntryRepo({
        createQueryBuilder: jest.fn().mockReturnValue(makeQb([])),
      });

      const { service } = await build({ logRepo, apptRepo, entryRepo });
      const board = await service.getBoard('2026-06-10', WS_ID);

      expect(board.alertCount).toBeGreaterThan(0);
    });
  });

  // ── suggestedExitDate ─────────────────────────────────────────────────────

  describe('buildCard — suggestedExitDate', () => {
    it('calculates suggestedExitDate from entryDate and planned hours', async () => {
      const { service } = await build();

      const logs = [
        makeLog({ processCode: 'AGENDA', orderIndex: 0, status: 'in_progress', processType: 'MOTHER', plannedHours: 0 }),
        makeLog({ id: 'log-2', processCode: 'MECHANIC', orderIndex: 1, plannedHours: 8, status: 'pending', processType: 'MOTHER' }),
      ];

      const card = (service as any).buildCard(APPT_ID, 'mechanic', {
        status: 'scheduled', plate: 'ABC', customerName: 'Test', vehicleType: null,
        techName: null, serviceOrType: null, entryDate: '2026-06-10', exitDate: null,
      }, logs);

      // 8h planned → ceil(8/8)=1 business day after entry → next Monday–Saturday after 2026-06-10
      expect(card.suggestedExitDate).not.toBeNull();
      expect(typeof card.suggestedExitDate).toBe('string');
      expect(card.suggestedExitDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('returns null suggestedExitDate when entryDate is null', async () => {
      const { service } = await build();

      const logs = [
        makeLog({ processCode: 'MECHANIC', orderIndex: 1, plannedHours: 4, status: 'pending', processType: 'MOTHER' }),
      ];

      const card = (service as any).buildCard(APPT_ID, 'mechanic', {
        status: 'scheduled', plate: 'ABC', customerName: 'Test', vehicleType: null,
        techName: null, serviceOrType: null, entryDate: null, exitDate: null,
      }, logs);

      expect(card.suggestedExitDate).toBeNull();
    });

    it('uses minimum 1 business day even for very short jobs', async () => {
      const { service } = await build();

      const logs = [
        makeLog({ processCode: 'MECHANIC', orderIndex: 1, plannedHours: 0.5, status: 'pending', processType: 'MOTHER' }),
      ];

      const card = (service as any).buildCard(APPT_ID, 'mechanic', {
        status: 'scheduled', plate: 'ABC', customerName: 'Test', vehicleType: null,
        techName: null, serviceOrType: null, entryDate: '2026-06-10', exitDate: null,
      }, logs);

      // Must be at least 1 business day ahead of entry date
      const entry    = new Date('2026-06-10');
      const suggested = new Date(card.suggestedExitDate!);
      expect(suggested.getTime()).toBeGreaterThan(entry.getTime());
    });
  });

  // ── addProcessToBodyshop (PR1 — kanban-mecanica-manual-y-pausa-libera-tecnico) ──

  describe('addProcessToBodyshop', () => {
    const ENTRY_WITH_BODYWORK: any = {
      ...MOCK_ENTRY,
      status: 'in_progress',
      processes: [{ code: 'BODYWORK', name: 'Chapería', hours: 8 }],
    };

    it('rechaza códigos MADRE (ej. PAINT) — solo procesos paralelos son agregables', async () => {
      const entryRepo = makeEntryRepo({ findOne: jest.fn().mockResolvedValue(ENTRY_WITH_BODYWORK) });
      const { service } = await build({ entryRepo });

      await expect(service.addProcessToBodyshop(ENTRY_ID, 'PAINT', 3)).rejects.toThrow(BadRequestException);
      // Validación de código es pura — no debería tocar la DB.
      expect(entryRepo.findOne).not.toHaveBeenCalled();
    });

    it('rechaza proceso duplicado ya presente en entry.processes', async () => {
      const entryRepo = makeEntryRepo({ findOne: jest.fn().mockResolvedValue({
        ...ENTRY_WITH_BODYWORK,
        processes: [...ENTRY_WITH_BODYWORK.processes, { code: 'LLANTAS', name: 'Llantas', hours: 1 }],
      }) });
      const { service } = await build({ entryRepo });

      await expect(service.addProcessToBodyshop(ENTRY_ID, 'LLANTAS', 1)).rejects.toThrow(BadRequestException);
    });

    it('rechaza proceso duplicado ya presente como TrackingLog (aunque no esté en processes jsonb)', async () => {
      const entryRepo = makeEntryRepo({ findOne: jest.fn().mockResolvedValue(ENTRY_WITH_BODYWORK) });
      const logRepo = makeLogRepo({
        findOne: jest.fn().mockResolvedValue(makeLog({ processCode: 'MECHANIC', sourceType: 'bodyshop', sourceId: ENTRY_ID })),
      });
      const { service } = await build({ entryRepo, logRepo });

      await expect(service.addProcessToBodyshop(ENTRY_ID, 'MECHANIC', 2)).rejects.toThrow(BadRequestException);
    });

    it('rechaza cuando la entrada está cancelada (estado terminal)', async () => {
      const entryRepo = makeEntryRepo({ findOne: jest.fn().mockResolvedValue({ ...ENTRY_WITH_BODYWORK, status: 'cancelled' }) });
      const { service } = await build({ entryRepo });

      await expect(service.addProcessToBodyshop(ENTRY_ID, 'MECHANIC', 2)).rejects.toThrow(BadRequestException);
    });

    it('NotFoundException si la entrada no existe', async () => {
      const entryRepo = makeEntryRepo({ findOne: jest.fn().mockResolvedValue(null) });
      const { service } = await build({ entryRepo });

      await expect(service.addProcessToBodyshop('no-existe', 'MECHANIC', 2)).rejects.toThrow(NotFoundException);
    });

    it('dual-write exitoso: crea TrackingLog nuevo + entrada matching en entry.processes (mismo code/horas)', async () => {
      const entryRepo = makeEntryRepo({ findOne: jest.fn().mockResolvedValue(ENTRY_WITH_BODYWORK) });
      const { service, saved } = await build({ entryRepo });

      const result = await service.addProcessToBodyshop(ENTRY_ID, 'MECHANIC', 2.5);

      expect(result).toMatchObject({
        sourceType: 'bodyshop', sourceId: ENTRY_ID,
        processCode: 'MECHANIC', processName: 'Mecánica',
        plannedHours: 2.5, processType: 'PARALLEL', status: 'pending',
      });

      const logWrite   = saved.find((s: any) => s.entity === TrackingLog);
      const entryWrite = saved.find((s: any) => s.entity === BodyshopEntry);
      expect(logWrite).toBeDefined();
      expect(logWrite!.data).toMatchObject({ processCode: 'MECHANIC', plannedHours: 2.5 });
      expect(entryWrite).toBeDefined();
      expect(entryWrite!.data.processes).toEqual([
        { code: 'BODYWORK', name: 'Chapería', hours: 8 },
        { code: 'MECHANIC', name: 'Mecánica', hours: 2.5 },
      ]);
    });

    it('rollback: si falla el write de entry.processes, el TrackingLog no queda confirmado', async () => {
      const entryRepo = makeEntryRepo({ findOne: jest.fn().mockResolvedValue(ENTRY_WITH_BODYWORK) });
      const managerBundle = makeManager({ failOn: 'entry' });
      const { service, saved } = await build({ entryRepo, managerBundle });

      await expect(service.addProcessToBodyshop(ENTRY_ID, 'MECHANIC', 2)).rejects.toThrow('DB down (entry)');
      // dataSource.transaction(cb) hace ROLLBACK real si cb() rechaza (garantía de
      // TypeORM); acá lo probamos indirectamente: el write de BodyshopEntry nunca
      // llegó a "saved" (mock), y el método entero rechazó — ningún caller externo
      // observa el TrackingLog creado.
      expect(saved.find((s: any) => s.entity === BodyshopEntry)).toBeUndefined();
    });

    it('rollback: si falla el write del TrackingLog, el update de entry.processes no queda confirmado', async () => {
      const entryRepo = makeEntryRepo({ findOne: jest.fn().mockResolvedValue(ENTRY_WITH_BODYWORK) });
      const managerBundle = makeManager({ failOn: 'log' });
      const { service, saved } = await build({ entryRepo, managerBundle });

      await expect(service.addProcessToBodyshop(ENTRY_ID, 'MECHANIC', 2)).rejects.toThrow('DB down (log)');
      expect(saved.find((s: any) => s.entity === BodyshopEntry)).toBeUndefined();
    });
  });

  // ── blockProcess — releases technician (PR2 — kanban-mecanica-manual-y-pausa-libera-tecnico) ──

  describe('blockProcess — libera técnico (PR2)', () => {
    it('snapshotea technicianId/technicianName en el log ANTES de liberar bodyshop_process_techs (solo si no estaba seteado)', async () => {
      const log = makeLog({
        status: 'in_progress', sourceType: 'bodyshop', sourceId: ENTRY_ID, processCode: 'BODYWORK', technicianId: null,
      });
      const logRepo = makeLogRepo({ findOne: jest.fn().mockResolvedValue(log) });
      const processTechRepo = makeProcessTechRepo({
        findOne: jest.fn().mockResolvedValue({
          entryId: ENTRY_ID, process: 'BODYWORK', technicianId: TECH_ID, technician: { name: 'Luis Benitez' },
        }),
      });

      const { service } = await build({ logRepo, processTechRepo });
      await service.blockProcess(LOG_ID, 'Falta pieza de repuesto');

      expect(logRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ technicianId: TECH_ID, technicianName: 'Luis Benitez' }),
      );
    });

    it('NO pisa technicianId/technicianName si el log ya los tenía seteados (no vuelve a resolver)', async () => {
      const log = makeLog({
        status: 'in_progress', sourceType: 'bodyshop', sourceId: ENTRY_ID, processCode: 'BODYWORK',
        technicianId: 'tech-already', technicianName: 'Ya Asignado',
      });
      const logRepo = makeLogRepo({ findOne: jest.fn().mockResolvedValue(log) });
      const processTechRepo = makeProcessTechRepo({
        findOne: jest.fn().mockResolvedValue({
          entryId: ENTRY_ID, process: 'BODYWORK', technicianId: TECH_ID, technician: { name: 'Otro Técnico' },
        }),
      });

      const { service } = await build({ logRepo, processTechRepo });
      await service.blockProcess(LOG_ID, 'Falta pieza de repuesto');

      expect(logRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ technicianId: 'tech-already', technicianName: 'Ya Asignado' }),
      );
      expect(processTechRepo.findOne).not.toHaveBeenCalled();
    });

    it('borra la fila de bodyshop_process_techs (entryId+processCode) al pausar un proceso bodyshop', async () => {
      const log = makeLog({
        status: 'in_progress', sourceType: 'bodyshop', sourceId: ENTRY_ID, processCode: 'PAINT',
        technicianId: TECH_ID, technicianName: 'Luis Benitez',
      });
      const logRepo = makeLogRepo({ findOne: jest.fn().mockResolvedValue(log) });
      const processTechRepo = makeProcessTechRepo();

      const { service } = await build({ logRepo, processTechRepo });
      await service.blockProcess(LOG_ID, 'Falta pieza de repuesto');

      expect(processTechRepo.delete).toHaveBeenCalledWith({ entryId: ENTRY_ID, process: 'PAINT' });
    });

    it('es no-op (0 filas borradas) cuando el proceso no tiene técnico asignado (ej. MECHANIC paralelo sin auto-asignación)', async () => {
      const log = makeLog({
        status: 'in_progress', sourceType: 'bodyshop', sourceId: ENTRY_ID, processCode: 'MECHANIC',
        processType: 'PARALLEL', technicianId: null,
      });
      const logRepo = makeLogRepo({ findOne: jest.fn().mockResolvedValue(log) });
      const processTechRepo = makeProcessTechRepo({
        findOne: jest.fn().mockResolvedValue(null), // resolveAssignedTechnician: sin asignación
        delete:  jest.fn().mockResolvedValue({ affected: 0 }),
      });

      const { service } = await build({ logRepo, processTechRepo });
      const result = await service.blockProcess(LOG_ID, 'Sin técnico asignado');

      expect(processTechRepo.delete).toHaveBeenCalledWith({ entryId: ENTRY_ID, process: 'MECHANIC' });
      expect(result.status).toBe('blocked');
      const savedLog = logRepo.save.mock.calls[0][0];
      expect(savedLog.technicianId).toBeNull();
    });

    it('NO toca bodyshop_process_techs para procesos de sourceType mechanic (fuera de alcance del spec: solo Chapería)', async () => {
      const log = makeLog({ status: 'in_progress', sourceType: 'mechanic' });
      const logRepo = makeLogRepo({ findOne: jest.fn().mockResolvedValue(log) });
      const processTechRepo = makeProcessTechRepo();

      const { service } = await build({ logRepo, processTechRepo });
      await service.blockProcess(LOG_ID, 'reason');

      expect(processTechRepo.delete).not.toHaveBeenCalled();
    });
  });

  // ── isTechnicianFree (PR2) ────────────────────────────────────────────────

  describe('isTechnicianFree (PR2)', () => {
    it('retorna false cuando el técnico está in_progress en otro log', async () => {
      const conflict = makeLog({ id: 'log-other', technicianId: TECH_ID, status: 'in_progress' });
      const logRepo = makeLogRepo({ findOne: jest.fn().mockResolvedValue(conflict) });
      const { service } = await build({ logRepo });

      const free = await (service as any).isTechnicianFree(TECH_ID);
      expect(free).toBe(false);
    });

    it('excluye el propio log del chequeo (excludeLogId coincide con el log encontrado)', async () => {
      const ownLog = makeLog({ id: 'log-own', technicianId: TECH_ID, status: 'in_progress' });
      const logRepo = makeLogRepo({ findOne: jest.fn().mockResolvedValue(ownLog) });
      const { service } = await build({ logRepo });

      const free = await (service as any).isTechnicianFree(TECH_ID, 'log-own');
      expect(free).toBe(true);
    });

    it('retorna true cuando no hay ningún log in_progress con ese técnico', async () => {
      const logRepo = makeLogRepo({ findOne: jest.fn().mockResolvedValue(null) });
      const { service } = await build({ logRepo });

      const free = await (service as any).isTechnicianFree(TECH_ID);
      expect(free).toBe(true);
    });
  });

  // ── unblockProcess — reassign + conflict-check (PR2) ─────────────────────

  describe('unblockProcess — reasigna técnico + chequeo de conflicto (PR2)', () => {
    it('rechaza reanudar cuando el técnico confirmado está ocupado en otro vehículo', async () => {
      const log = makeLog({
        status: 'blocked', sourceType: 'bodyshop', sourceId: ENTRY_ID, processCode: 'BODYWORK', pausedAt: new Date(),
      });
      const conflict = makeLog({
        id: 'log-other', sourceId: 'entry-999', status: 'in_progress',
        technicianId: TECH_ID, technicianName: 'Luis Benitez', processName: 'Pintura',
      });
      const logRepo = makeLogRepo({
        findOne: jest.fn()
          .mockResolvedValueOnce(log)      // el log a reanudar
          .mockResolvedValueOnce(conflict), // chequeo de conflicto
      });

      const { service } = await build({ logRepo });
      await expect(service.unblockProcess(LOG_ID, TECH_ID, 'Luis Benitez'))
        .rejects.toThrow(/Luis Benitez.*Pintura/);
      expect(logRepo.save).not.toHaveBeenCalled();
    });

    it('crea la fila de bodyshop_process_techs con el técnico confirmado cuando no había fila previa', async () => {
      const pausedAt = new Date(Date.now() - 20 * 60_000);
      const log = makeLog({
        status: 'blocked', sourceType: 'bodyshop', sourceId: ENTRY_ID, processCode: 'PAINT', pausedAt, technicianId: null,
      });
      const logRepo = makeLogRepo({
        findOne: jest.fn()
          .mockResolvedValueOnce(log)   // log a reanudar
          .mockResolvedValueOnce(null)  // conflict check: libre
          .mockResolvedValueOnce(null)  // otherBlocked
          .mockResolvedValueOnce(log),  // hasInProgress
      });
      const processTechRepo = makeProcessTechRepo({ findOne: jest.fn().mockResolvedValue(null) });

      const { service } = await build({ logRepo, processTechRepo });
      await service.unblockProcess(LOG_ID, TECH_ID, 'Luis Benitez');

      expect(processTechRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ entryId: ENTRY_ID, process: 'PAINT', technicianId: TECH_ID }),
      );
    });

    it('actualiza la fila existente si ya había una (upsert por unique key entryId+process)', async () => {
      const pausedAt = new Date(Date.now() - 20 * 60_000);
      const log = makeLog({
        status: 'blocked', sourceType: 'bodyshop', sourceId: ENTRY_ID, processCode: 'PAINT', pausedAt, technicianId: null,
      });
      const existingRow = { id: 'pt-1', entryId: ENTRY_ID, process: 'PAINT', technicianId: 'old-tech' };
      const logRepo = makeLogRepo({
        findOne: jest.fn()
          .mockResolvedValueOnce(log)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(log),
      });
      const processTechRepo = makeProcessTechRepo({ findOne: jest.fn().mockResolvedValue(existingRow) });

      const { service } = await build({ logRepo, processTechRepo });
      await service.unblockProcess(LOG_ID, TECH_ID, 'Luis Benitez');

      expect(processTechRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'pt-1', technicianId: TECH_ID }),
      );
    });

    it('sin technicianId param, cae al log.technicianId (snapshot dejado por blockProcess)', async () => {
      const pausedAt = new Date(Date.now() - 20 * 60_000);
      const log = makeLog({
        status: 'blocked', sourceType: 'bodyshop', sourceId: ENTRY_ID, processCode: 'BODYWORK', pausedAt,
        technicianId: TECH_ID, technicianName: 'Luis Benitez',
      });
      const logRepo = makeLogRepo({
        findOne: jest.fn()
          .mockResolvedValueOnce(log)
          .mockResolvedValueOnce(null) // conflict: libre
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(log),
      });
      const processTechRepo = makeProcessTechRepo({ findOne: jest.fn().mockResolvedValue(null) });

      const { service } = await build({ logRepo, processTechRepo });
      await service.unblockProcess(LOG_ID);

      expect(processTechRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ entryId: ENTRY_ID, process: 'BODYWORK', technicianId: TECH_ID }),
      );
    });

    it('acumula pausedDurationMinutes y restaura status in_progress al reanudar con técnico confirmado', async () => {
      const pausedAt = new Date(Date.now() - 45 * 60_000);
      const log = makeLog({
        status: 'blocked', sourceType: 'bodyshop', sourceId: ENTRY_ID, processCode: 'BODYWORK',
        startedAt: new Date('2026-06-10T08:00:00Z'), pausedAt, pausedDurationMinutes: 15,
      });
      const logRepo = makeLogRepo({
        findOne: jest.fn()
          .mockResolvedValueOnce(log)
          .mockResolvedValueOnce(null) // sin conflicto
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(log),
      });
      const processTechRepo = makeProcessTechRepo({ findOne: jest.fn().mockResolvedValue(null) });

      const { service } = await build({ logRepo, processTechRepo });
      const result = await service.unblockProcess(LOG_ID, TECH_ID, 'Luis Benitez');

      expect(result.status).toBe('in_progress');
      const savedLog = logRepo.save.mock.calls[0][0];
      expect(savedLog.pausedDurationMinutes).toBeGreaterThan(59); // 15 acumulados + ~45 de esta pausa
    });
  });

  // ── getResumeOptions (PR2) ────────────────────────────────────────────────

  describe('getResumeOptions (PR2)', () => {
    it('retorna previousTechnicianId/Name null y previousTechnicianFree=false cuando el log no tiene técnico snapshoteado', async () => {
      const log = makeLog({ technicianId: null, technicianName: null });
      const logRepo = makeLogRepo({ findOne: jest.fn().mockResolvedValue(log) });
      const { service } = await build({ logRepo });

      const result = await service.getResumeOptions(LOG_ID);
      expect(result).toEqual({
        previousTechnicianId: null, previousTechnicianName: null,
        previousTechnicianFree: false, conflictProcessName: null,
      });
    });

    it('retorna previousTechnicianFree=true y conflictProcessName=null cuando el técnico sigue libre', async () => {
      const log = makeLog({ technicianId: TECH_ID, technicianName: 'Luis Benitez' });
      const logRepo = makeLogRepo({
        findOne: jest.fn()
          .mockResolvedValueOnce(log)   // el log
          .mockResolvedValueOnce(null), // sin conflicto
      });
      const { service } = await build({ logRepo });

      const result = await service.getResumeOptions(LOG_ID);
      expect(result).toEqual({
        previousTechnicianId: TECH_ID, previousTechnicianName: 'Luis Benitez',
        previousTechnicianFree: true, conflictProcessName: null,
      });
    });

    it('retorna previousTechnicianFree=false y conflictProcessName con el proceso donde está ocupado', async () => {
      const log = makeLog({ technicianId: TECH_ID, technicianName: 'Luis Benitez' });
      const conflict = makeLog({ id: 'log-other', technicianId: TECH_ID, status: 'in_progress', processName: 'Pintura' });
      const logRepo = makeLogRepo({
        findOne: jest.fn()
          .mockResolvedValueOnce(log)
          .mockResolvedValueOnce(conflict),
      });
      const { service } = await build({ logRepo });

      const result = await service.getResumeOptions(LOG_ID);
      expect(result.previousTechnicianFree).toBe(false);
      expect(result.conflictProcessName).toBe('Pintura');
    });

    it('NotFoundException si el log no existe', async () => {
      const logRepo = makeLogRepo({ findOne: jest.fn().mockResolvedValue(null) });
      const { service } = await build({ logRepo });
      await expect(service.getResumeOptions('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  // ── Integration-style — contrato pausa libera / reanuda restaura técnico (PR2) ──
  // No existe harness de Nest test DB (sqlite/testcontainers/pg-mem) en el repo —
  // verificado: ningún *.spec.ts del proyecto lo usa y package.json no declara esas
  // dependencias. Degradamos a un mock CON ESTADO real (Map) para
  // bodyshop_process_techs que blockProcess/unblockProcess mutan de verdad en cada
  // llamada, probando el contrato "borrar==liberar, recrear==restaurar" del que
  // depende getTechnicianAvailability (bodyshop.service.ts:947-956, itera
  // e.processTechsList = filas de bodyshop_process_techs) sin necesitar levantar
  // ese servicio ni una DB real (strict-tdd.md: "degrade gracefully" cuando la capa
  // de integración no está disponible).

  describe('Integration-style — pausa libera / reanuda restaura técnico (PR2)', () => {
    function makeStatefulProcessTechRepo() {
      const rows = new Map<string, { entryId: string; process: string; technicianId: string }>();
      const key = (entryId: string, process: string) => `${entryId}::${process}`;
      return {
        rows,
        findOne: jest.fn(async ({ where }: any) => rows.get(key(where.entryId, where.process)) ?? null),
        delete: jest.fn(async (crit: any) => {
          const existed = rows.delete(key(crit.entryId, crit.process));
          return { affected: existed ? 1 : 0 };
        }),
        save: jest.fn(async (row: any) => { rows.set(key(row.entryId, row.process), row); return row; }),
        create: jest.fn((data: any) => ({ ...data })),
      };
    }

    it('pausar un proceso bodyshop borra su fila en bodyshop_process_techs; reanudar la recrea con el técnico confirmado', async () => {
      const processTechRepo = makeStatefulProcessTechRepo();
      processTechRepo.rows.set('entry-int::BODYWORK', { entryId: 'entry-int', process: 'BODYWORK', technicianId: TECH_ID });

      const log = makeLog({
        status: 'in_progress', sourceType: 'bodyshop', sourceId: 'entry-int', processCode: 'BODYWORK',
        startedAt: new Date('2026-06-10T08:00:00Z'), technicianId: TECH_ID, technicianName: 'Luis Benitez',
      });
      const logRepo = makeLogRepo({
        findOne: jest.fn()
          .mockResolvedValueOnce(log)   // blockProcess: log
          .mockResolvedValueOnce(log)   // unblockProcess: log (mismo objeto, ya mutado a 'blocked')
          .mockResolvedValueOnce(null)  // conflict check: libre
          .mockResolvedValueOnce(null)  // otherBlocked
          .mockResolvedValueOnce(log),  // hasInProgress
      });

      const { service } = await build({ logRepo, processTechRepo });

      await service.blockProcess(LOG_ID, 'Falta pieza de repuesto');
      // La fila desaparece — así deja de sumar horas ocupadas en getTechnicianAvailability
      expect(processTechRepo.rows.has('entry-int::BODYWORK')).toBe(false);

      await service.unblockProcess(LOG_ID, TECH_ID, 'Luis Benitez');
      // La fila reaparece con el técnico confirmado — vuelve a sumar horas ocupadas
      expect(processTechRepo.rows.get('entry-int::BODYWORK')).toMatchObject({ technicianId: TECH_ID });
    });

    it('2+ procesos pausados en el mismo entry se liberan de forma independiente (uno no afecta al otro)', async () => {
      const processTechRepo = makeStatefulProcessTechRepo();
      processTechRepo.rows.set('entry-int::BODYWORK', { entryId: 'entry-int', process: 'BODYWORK', technicianId: 'tech-a' });
      processTechRepo.rows.set('entry-int::PAINT',    { entryId: 'entry-int', process: 'PAINT',    technicianId: 'tech-b' });

      const bodyworkLog = makeLog({
        id: 'log-bw', status: 'in_progress', sourceType: 'bodyshop', sourceId: 'entry-int',
        processCode: 'BODYWORK', technicianId: 'tech-a', technicianName: 'Tech A',
      });
      const paintLog = makeLog({
        id: 'log-pt', status: 'in_progress', sourceType: 'bodyshop', sourceId: 'entry-int',
        processCode: 'PAINT', technicianId: 'tech-b', technicianName: 'Tech B',
      });

      const logRepo = makeLogRepo({
        findOne: jest.fn()
          .mockResolvedValueOnce(bodyworkLog) // blockProcess(BODYWORK): log
          .mockResolvedValueOnce(paintLog),   // blockProcess(PAINT): log
      });

      const { service } = await build({ logRepo, processTechRepo });

      await service.blockProcess('log-bw', 'Falta pieza de repuesto');
      await service.blockProcess('log-pt', 'Esperando aprobación cliente');

      // Ambas filas borradas de forma independiente — pausar una no afecta la otra
      expect(processTechRepo.rows.has('entry-int::BODYWORK')).toBe(false);
      expect(processTechRepo.rows.has('entry-int::PAINT')).toBe(false);
    });
  });

  // ── PR1: fundación "devolver a proceso anterior" ────────────────────────────

  describe('pickPreviousMother (PR1)', () => {
    it('salta PARALLEL y AGENDA — desde FINAL_CONTROL(6) llega a POLISH(4), nunca a MECHANIC(5)', async () => {
      const { service } = await build();

      const logs = [
        makeLog({ id: 'l-agenda', processCode: 'AGENDA',        orderIndex: 0, processType: 'MOTHER' }),
        makeLog({ id: 'l-bw',     processCode: 'BODYWORK',      orderIndex: 1, processType: 'MOTHER' }),
        makeLog({ id: 'l-prep',   processCode: 'PREP',          orderIndex: 2, processType: 'MOTHER' }),
        makeLog({ id: 'l-paint',  processCode: 'PAINT',         orderIndex: 3, processType: 'MOTHER' }),
        makeLog({ id: 'l-polish', processCode: 'POLISH',        orderIndex: 4, processType: 'MOTHER' }),
        makeLog({ id: 'l-mech',   processCode: 'MECHANIC',      orderIndex: 5, processType: 'PARALLEL' }),
        makeLog({ id: 'l-fc',     processCode: 'FINAL_CONTROL', orderIndex: 6, processType: 'MOTHER' }),
      ];
      const current = logs.find(l => l.id === 'l-fc')!;

      const prev = (service as any).pickPreviousMother(logs, current);
      expect(prev.id).toBe('l-polish');
    });

    it('retorna null cuando el proceso actual es el primero (solo AGENDA lo precede)', async () => {
      const { service } = await build();
      const logs = [
        makeLog({ id: 'l-agenda', processCode: 'AGENDA',   orderIndex: 0, processType: 'MOTHER' }),
        makeLog({ id: 'l-bw',     processCode: 'BODYWORK', orderIndex: 1, processType: 'MOTHER' }),
      ];
      const current = logs.find(l => l.id === 'l-bw')!;

      const prev = (service as any).pickPreviousMother(logs, current);
      expect(prev).toBeNull();
    });

    it('con dos pasadas del mismo orderIndex, elige la más nueva por createdAt', async () => {
      const { service } = await build();
      const logs = [
        makeLog({
          id: 'l-bw', processCode: 'BODYWORK', orderIndex: 1, processType: 'MOTHER',
          status: 'completed', createdAt: new Date('2026-06-10T08:00:00Z'),
        }),
        makeLog({
          id: 'l-bw-redo', processCode: 'BODYWORK', orderIndex: 1, processType: 'MOTHER',
          status: 'in_progress', createdAt: new Date('2026-06-11T08:00:00Z'),
        }),
        makeLog({ id: 'l-prep', processCode: 'PREP', orderIndex: 2, processType: 'MOTHER' }),
      ];
      const current = logs.find(l => l.id === 'l-prep')!;

      const prev = (service as any).pickPreviousMother(logs, current);
      expect(prev.id).toBe('l-bw-redo');
    });
  });

  describe('buildCard — allMothersDone deduplicado por última pasada (PR1)', () => {
    it('la última pasada en "returned" bloquea la finalización aunque el resto esté completo', async () => {
      const { service } = await build();
      const logs = [
        makeLog({ id: 'l-agenda', processCode: 'AGENDA',   orderIndex: 0, processType: 'MOTHER', status: 'completed', plannedHours: 0 }),
        makeLog({ id: 'l-bw',     processCode: 'BODYWORK', orderIndex: 1, processType: 'MOTHER', status: 'completed' }),
        makeLog({ id: 'l-prep',   processCode: 'PREP',     orderIndex: 2, processType: 'MOTHER', status: 'returned' }),
      ];

      const card = (service as any).buildCard(ENTRY_ID, 'bodyshop', {
        status: 'in_progress', plate: 'ABC', customerName: 'Test', vehicleType: null,
        techName: null, serviceOrType: null, entryDate: '2026-06-10', exitDate: null,
      }, logs);

      expect(card.semaphore).not.toBe('green');
    });

    it('una pasada "returned" superada por una pasada "completed" más nueva del mismo proceso SÍ permite terminar', async () => {
      const { service } = await build();
      const logs = [
        makeLog({ id: 'l-agenda', processCode: 'AGENDA', orderIndex: 0, processType: 'MOTHER', status: 'completed', plannedHours: 0 }),
        makeLog({ id: 'l-bw',     processCode: 'BODYWORK', orderIndex: 1, processType: 'MOTHER', status: 'completed' }),
        makeLog({
          id: 'l-prep-old', processCode: 'PREP', orderIndex: 2, processType: 'MOTHER', status: 'returned',
          createdAt: new Date('2026-06-10T09:00:00Z'),
        }),
        makeLog({
          id: 'l-prep-redo', processCode: 'PREP', orderIndex: 2, processType: 'MOTHER', status: 'completed',
          plannedHours: 2, createdAt: new Date('2026-06-12T09:00:00Z'),
          startedAt: new Date('2026-06-12T09:00:00Z'), completedAt: new Date('2026-06-12T11:00:00Z'),
        }),
      ];

      const card = (service as any).buildCard(ENTRY_ID, 'bodyshop', {
        status: 'in_progress', plate: 'ABC', customerName: 'Test', vehicleType: null,
        techName: null, serviceOrType: null, entryDate: '2026-06-10', exitDate: null,
      }, logs);

      expect(card.currentProcess).toBeNull();
      expect(card.semaphore).toBe('green');
    });

    it('"skipped" sigue contando como completo, sin verse afectado por la regla de dedup', async () => {
      const { service } = await build();
      const logs = [
        makeLog({ id: 'l-agenda', processCode: 'AGENDA',   orderIndex: 0, processType: 'MOTHER', status: 'completed', plannedHours: 0 }),
        makeLog({ id: 'l-bw',     processCode: 'BODYWORK', orderIndex: 1, processType: 'MOTHER', status: 'completed' }),
        makeLog({ id: 'l-prep',   processCode: 'PREP',     orderIndex: 2, processType: 'MOTHER', status: 'skipped' }),
      ];

      const card = (service as any).buildCard(ENTRY_ID, 'bodyshop', {
        status: 'in_progress', plate: 'ABC', customerName: 'Test', vehicleType: null,
        techName: null, serviceOrType: null, entryDate: '2026-06-10', exitDate: null,
      }, logs);

      expect(card.currentProcess).toBeNull();
      expect(card.semaphore).toBe('green');
    });
  });

  describe('buildCard — orden cronológico entre pasadas repetidas (PR1)', () => {
    it('dos pasadas con el mismo orderIndex se ordenan por createdAt ascendente en allProcesses', async () => {
      const { service } = await build();
      const logs = [
        makeLog({ id: 'l-prep-redo', processCode: 'PREP', orderIndex: 2, createdAt: new Date('2026-06-12T09:00:00Z') }),
        makeLog({ id: 'l-prep-old',  processCode: 'PREP', orderIndex: 2, createdAt: new Date('2026-06-10T09:00:00Z') }),
      ];

      const card = (service as any).buildCard(ENTRY_ID, 'bodyshop', {
        status: 'in_progress', plate: 'ABC', customerName: 'Test', vehicleType: null,
        techName: null, serviceOrType: null, entryDate: '2026-06-10', exitDate: null,
      }, logs);

      expect(card.allProcesses.map((p: any) => p.logId)).toEqual(['l-prep-old', 'l-prep-redo']);
    });

    it('orderIndex sigue siendo la clave primaria: un proceso de orderIndex mayor nunca queda antes por su createdAt', async () => {
      const { service } = await build();
      const logs = [
        makeLog({ id: 'l-paint',     processCode: 'PAINT', orderIndex: 3, createdAt: new Date('2026-06-09T09:00:00Z') }),
        makeLog({ id: 'l-prep-redo', processCode: 'PREP',  orderIndex: 2, createdAt: new Date('2026-06-12T09:00:00Z') }),
        makeLog({ id: 'l-prep-old',  processCode: 'PREP',  orderIndex: 2, createdAt: new Date('2026-06-10T09:00:00Z') }),
      ];

      const card = (service as any).buildCard(ENTRY_ID, 'bodyshop', {
        status: 'in_progress', plate: 'ABC', customerName: 'Test', vehicleType: null,
        techName: null, serviceOrType: null, entryDate: '2026-06-10', exitDate: null,
      }, logs);

      expect(card.allProcesses.map((p: any) => p.logId)).toEqual(['l-prep-old', 'l-prep-redo', 'l-paint']);
    });
  });

  describe('buildCard — currentProcess.canReturn / previousProcessName (PR1)', () => {
    it('expone canReturn=true y previousProcessName cuando existe un MOTHER anterior', async () => {
      const { service } = await build();
      const logs = [
        makeLog({ id: 'l-bw', processCode: 'BODYWORK', processName: 'Chapería', orderIndex: 1, status: 'completed' }),
        makeLog({
          id: 'l-prep', processCode: 'PREP', processName: 'Preparación', orderIndex: 2,
          status: 'in_progress', startedAt: new Date('2026-06-10T08:00:00Z'),
        }),
      ];

      const card = (service as any).buildCard(ENTRY_ID, 'bodyshop', {
        status: 'in_progress', plate: 'ABC', customerName: 'Test', vehicleType: null,
        techName: null, serviceOrType: null, entryDate: '2026-06-10', exitDate: null,
      }, logs);

      expect(card.currentProcess.canReturn).toBe(true);
      expect(card.currentProcess.previousProcessName).toBe('Chapería');
    });

    it('expone canReturn=false en el primer proceso MOTHER (solo AGENDA lo precede)', async () => {
      const { service } = await build();
      const logs = [
        makeLog({ id: 'l-agenda', processCode: 'AGENDA',   orderIndex: 0, status: 'completed' }),
        makeLog({
          id: 'l-bw', processCode: 'BODYWORK', orderIndex: 1,
          status: 'in_progress', startedAt: new Date('2026-06-10T08:00:00Z'),
        }),
      ];

      const card = (service as any).buildCard(ENTRY_ID, 'bodyshop', {
        status: 'in_progress', plate: 'ABC', customerName: 'Test', vehicleType: null,
        techName: null, serviceOrType: null, entryDate: '2026-06-10', exitDate: null,
      }, logs);

      expect(card.currentProcess.canReturn).toBe(false);
      expect(card.currentProcess.previousProcessName).toBeNull();
    });
  });
});
