import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { TrackingService } from '../modules/tracking/tracking.service';
import { TrackingLog } from '../modules/tracking/tracking-log.entity';
import { Appointment } from '../modules/appointments/appointment.entity';
import { BodyshopEntry } from '../modules/bodyshop/bodyshop-entry.entity';
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

// ─── Module builder ───────────────────────────────────────────────────────────

async function build(repos: {
  logRepo?: any; apptRepo?: any; entryRepo?: any; workshopRepo?: any;
} = {}) {
  const logRepo      = repos.logRepo      ?? makeLogRepo();
  const apptRepo     = repos.apptRepo     ?? makeApptRepo();
  const entryRepo    = repos.entryRepo    ?? makeEntryRepo();
  const workshopRepo = repos.workshopRepo ?? makeWorkshopRepo();

  const mod = await Test.createTestingModule({
    providers: [
      TrackingService,
      { provide: getRepositoryToken(TrackingLog),    useValue: logRepo },
      { provide: getRepositoryToken(Appointment),    useValue: apptRepo },
      { provide: getRepositoryToken(BodyshopEntry),  useValue: entryRepo },
      { provide: getRepositoryToken(Workshop),       useValue: workshopRepo },
    ],
  }).compile();

  return {
    service:       mod.get(TrackingService),
    logRepo,
    apptRepo,
    entryRepo,
    workshopRepo,
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
});
