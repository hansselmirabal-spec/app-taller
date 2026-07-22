import { Test } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { BodyshopService } from '../modules/bodyshop/bodyshop.service';
import { BodyshopEntry } from '../modules/bodyshop/bodyshop-entry.entity';
import { BodyshopProcess } from '../modules/bodyshop/bodyshop-process.entity';
import { BodyshopProcessTech } from '../modules/bodyshop/bodyshop-process-tech.entity';
import { BodyshopEntryProcessSlot } from '../modules/bodyshop/bodyshop-entry-process-slot.entity';
import { TechnicianAbsence } from '../modules/capacity/technician-absence.entity';
import { WorkingDay } from '../modules/capacity/working-day.entity';
import { BudgetAppointment } from '../modules/budget-appointments/budget-appointment.entity';
import { TrackingLog } from '../modules/tracking/tracking-log.entity';
import { TechniciansService } from '../modules/technicians/technicians.service';
import { WorkshopsService } from '../modules/workshops/workshops.service';
import { DmsAgendamientoService } from '../modules/bodyshop/dms-agendamiento.service';
import { BodyshopScheduleService } from '../modules/bodyshop/bodyshop-schedule.service';
import { TrackingService } from '../modules/tracking/tracking.service';

// ─── IDs ─────────────────────────────────────────────────────────────────────

const WS_ID     = 'ws-001';
const ENTRY_ID  = 'entry-001';
const WT_ID     = 'wt-001';
const TECH_BW   = 'tech-bw-001';   // CHAPERIA
const TECH_PREP = 'tech-prep-001'; // PREPARACION
const TECH_PAINT= 'tech-paint-001';// PINTURA
const USER_ID   = 'user-001';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MOCK_WORKSHOP = {
  id: WS_ID, name: 'Test Bodyshop', type: 'BODYSHOP',
  config: { processSpecialtyIds: { BODYWORK: ['CHAPERIA'], PREP: ['PREPARACION'], PAINT: ['PINTURA'] } },
};

const MOCK_TECHS = [
  { id: TECH_BW,    name: 'Chapero 1',   specialty: 'CHAPERIA',    dailyHours: 8, active: true  },
  { id: TECH_PREP,  name: 'Preparador 1',specialty: 'PREPARACION', dailyHours: 8, active: true  },
  { id: TECH_PAINT, name: 'Pintor 1',    specialty: 'PINTURA',     dailyHours: 8, active: true  },
];

const MOCK_ENTRY: any = {
  id: ENTRY_ID, workshopId: WS_ID, date: '2026-06-10',
  workTypeId: WT_ID,
  workType: { id: WT_ID, bodywork_hours: '8', prep_hours: '4', paint_hours: '6' },
  customerName: 'Test Cliente', plate: 'TST 001',
  status: 'scheduled',
  bodyworkHours: 8, prepHours: 4, paintHours: 6,
  stayDays: 2, channel: 'walk_in', notes: null,
  technicianId: null, technician: null,
  processTechsList: [],
  createdBy: USER_ID, createdAt: new Date(),
};

// ─── Query Builder stub ───────────────────────────────────────────────────────

function makeQb(result: any[] = [MOCK_ENTRY]) {
  const qb: any = {};
  ['leftJoinAndSelect', 'where', 'andWhere', 'orderBy'].forEach(m => {
    qb[m] = jest.fn().mockReturnValue(qb);
  });
  qb.getOne  = jest.fn().mockResolvedValue(result[0] ?? null);
  qb.getMany = jest.fn().mockResolvedValue(result);
  return qb;
}

function makeEntryRepo(overrides: any = {}) {
  return {
    create:             jest.fn().mockImplementation((d: any) => d),
    save:               jest.fn().mockImplementation((d: any) => Promise.resolve({ id: ENTRY_ID, ...d })),
    findOne:            jest.fn().mockResolvedValue(MOCK_ENTRY),
    find:               jest.fn().mockResolvedValue([]),
    createQueryBuilder: jest.fn().mockReturnValue(makeQb()),
    ...overrides,
  };
}

function makePtRepo(overrides: any = {}) {
  return {
    create:  jest.fn().mockImplementation((d: any) => d),
    save:    jest.fn().mockResolvedValue({}),
    findOne: jest.fn().mockResolvedValue(null),
    delete:  jest.fn().mockResolvedValue({}),
    ...overrides,
  };
}

function makeAbsenceQb(results: any[] = []) {
  const qb: any = {};
  ['leftJoinAndSelect', 'where'].forEach(m => { qb[m] = jest.fn().mockReturnValue(qb); });
  qb.getMany = jest.fn().mockResolvedValue(results);
  return qb;
}

function makeAbsenceRepo(absences: any[] = []) {
  return {
    find: jest.fn().mockResolvedValue(absences),
    createQueryBuilder: jest.fn().mockReturnValue(makeAbsenceQb(absences)),
  };
}

function makeWorkingDayRepo() {
  return { findOne: jest.fn().mockResolvedValue(null) };
}

function makeTechniciansService(techs = MOCK_TECHS) {
  return { findAll: jest.fn().mockResolvedValue(techs) };
}

function makeWorkshopsService(ws = MOCK_WORKSHOP) {
  return { findOne: jest.fn().mockResolvedValue(ws) };
}

// ── Dependencias agregadas cuando el constructor real creció a 13 args
// (scheduling, tracking init y push a DMS) — el test se había quedado con 7.

function makeProcessRepo() {
  return { find: jest.fn().mockResolvedValue([]) };
}

function makeSlotRepo(overrides: any = {}) {
  return {
    create: jest.fn().mockImplementation((d: any) => d),
    save:   jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    ...overrides,
  };
}

function makeBudgetApptRepo() {
  return { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null) };
}

function makeTrackingLogRepo() {
  return { find: jest.fn().mockResolvedValue([]) };
}

function makeDmsAgendamiento() {
  return {
    getSucursales: jest.fn().mockResolvedValue([]),
    getAsesores:   jest.fn().mockResolvedValue([]),
    push:          jest.fn().mockResolvedValue({ success: true }),
  };
}

function makeScheduleService(date = '2026-06-10') {
  return {
    simulate: jest.fn().mockResolvedValue({
      canSchedule: true,
      slots: [{ date, processName: 'Chapería' }],
      estimatedFinishDate: date,
      warnings: [],
    }),
  };
}

function makeTrackingService() {
  return {
    initForBodyshop: jest.fn().mockResolvedValue(undefined),
    syncBodyshopPlannedHours: jest.fn().mockResolvedValue(undefined),
  };
}

// create() ahora escribe entry+slots+asignación de técnico dentro de
// dataSource.transaction(manager => ...). El mock enruta manager.create/save
// hacia el repo mock correspondiente según la entidad, para que los asserts
// existentes sobre entryRepo/slotRepo/ptRepo sigan funcionando sin cambios.
const ENTITY_TAG = Symbol('entityClass');

function makeManager(entryRepo: any, slotRepo: any, ptRepo: any) {
  const repoFor = (entity: any) => {
    if (entity === BodyshopEntry) return entryRepo;
    if (entity === BodyshopEntryProcessSlot) return slotRepo;
    if (entity === BodyshopProcessTech) return ptRepo;
    throw new Error(`makeManager: entidad sin mock: ${entity?.name}`);
  };
  return {
    create: (entity: any, data: any) => {
      const created = repoFor(entity).create(data);
      if (created && typeof created === 'object') {
        Object.defineProperty(created, ENTITY_TAG, { value: entity, enumerable: false, configurable: true });
      }
      return created;
    },
    save: (a: any, b?: any) => {
      if (typeof a === 'function') return repoFor(a).save(b);
      const tag = a?.[ENTITY_TAG];
      if (tag) return repoFor(tag).save(a);
      throw new Error('makeManager.save: no se pudo determinar la entidad target');
    },
  };
}

function makeDataSource(manager: ReturnType<typeof makeManager>) {
  return { transaction: jest.fn().mockImplementation(async (cb: any) => cb(manager)) };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('BodyshopService', () => {
  let service: BodyshopService;
  let entryRepo: ReturnType<typeof makeEntryRepo>;
  let ptRepo: ReturnType<typeof makePtRepo>;
  let absenceRepo: ReturnType<typeof makeAbsenceRepo>;
  let workingDayRepo: ReturnType<typeof makeWorkingDayRepo>;
  let techniciansService: ReturnType<typeof makeTechniciansService>;
  let workshopsService: ReturnType<typeof makeWorkshopsService>;

  async function build(overrides: {
    entryRepo?: any; ptRepo?: any; absenceRepo?: any;
    workingDayRepo?: any; techsSvc?: any; wsSvc?: any;
    processRepo?: any; slotRepo?: any; budgetApptRepo?: any; trackingLogRepo?: any;
    dmsAgendamiento?: any; scheduleService?: any; trackingService?: any;
  } = {}) {
    entryRepo         = overrides.entryRepo      ?? makeEntryRepo();
    ptRepo            = overrides.ptRepo         ?? makePtRepo();
    absenceRepo       = overrides.absenceRepo    ?? makeAbsenceRepo();
    workingDayRepo    = overrides.workingDayRepo ?? makeWorkingDayRepo();
    techniciansService= overrides.techsSvc       ?? makeTechniciansService();
    workshopsService  = overrides.wsSvc          ?? makeWorkshopsService();
    const processRepo      = overrides.processRepo      ?? makeProcessRepo();
    const slotRepo         = overrides.slotRepo         ?? makeSlotRepo();
    const budgetApptRepo   = overrides.budgetApptRepo   ?? makeBudgetApptRepo();
    const trackingLogRepo  = overrides.trackingLogRepo  ?? makeTrackingLogRepo();
    const dmsAgendamiento  = overrides.dmsAgendamiento  ?? makeDmsAgendamiento();
    const scheduleService  = overrides.scheduleService  ?? makeScheduleService();
    const trackingService  = overrides.trackingService  ?? makeTrackingService();
    const dataSource        = makeDataSource(makeManager(entryRepo, slotRepo, ptRepo));

    const mod = await Test.createTestingModule({
      providers: [
        BodyshopService,
        { provide: getRepositoryToken(BodyshopEntry),             useValue: entryRepo },
        { provide: getRepositoryToken(BodyshopProcess),           useValue: processRepo },
        { provide: getRepositoryToken(BodyshopProcessTech),       useValue: ptRepo },
        { provide: getRepositoryToken(BodyshopEntryProcessSlot),  useValue: slotRepo },
        { provide: getRepositoryToken(TechnicianAbsence),         useValue: absenceRepo },
        { provide: getRepositoryToken(WorkingDay),                useValue: workingDayRepo },
        { provide: getRepositoryToken(BudgetAppointment),         useValue: budgetApptRepo },
        { provide: getRepositoryToken(TrackingLog),               useValue: trackingLogRepo },
        { provide: TechniciansService,       useValue: techniciansService },
        { provide: WorkshopsService,         useValue: workshopsService },
        { provide: DmsAgendamientoService,   useValue: dmsAgendamiento },
        { provide: BodyshopScheduleService,  useValue: scheduleService },
        { provide: TrackingService,          useValue: trackingService },
        { provide: getDataSourceToken(),     useValue: dataSource },
      ],
    }).compile();
    service = mod.get(BodyshopService);
  }

  beforeEach(() => build());

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('crea entry y retorna objeto formateado', async () => {
      // create() reusa el mismo createQueryBuilder para 2 cosas distintas:
      // 1) chequeo de patente duplicada (debe dar null, si no rechaza)
      // 2) recarga de la entry recién guardada al final (debe encontrarla)
      const qb = makeQb([]);
      qb.getOne = jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(MOCK_ENTRY);
      entryRepo = makeEntryRepo({ createQueryBuilder: jest.fn().mockReturnValue(qb) });
      await build({ entryRepo });

      const dto = {
        workshopId: WS_ID, date: '2026-06-10', workTypeId: WT_ID,
        customerName: 'Test', plate: 'TST 001',
        bodyworkHours: 8, prepHours: 4, paintHours: 6,
        stayDays: 2, channel: 'walk_in' as const,
      };
      const result = await service.create(dto, USER_ID);
      expect(entryRepo.create).toHaveBeenCalled();
      expect(entryRepo.save).toHaveBeenCalled();
      expect(result).toHaveProperty('id');
    });

    it('asigna status="scheduled" siempre', async () => {
      // Mismo motivo que el test anterior: 2 llamadas a getOne (duplicado + recarga).
      const qb = makeQb([]);
      qb.getOne = jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(MOCK_ENTRY);
      entryRepo = makeEntryRepo({ createQueryBuilder: jest.fn().mockReturnValue(qb) });
      await build({ entryRepo });

      await service.create({
        workshopId: WS_ID, date: '2026-06-10', workTypeId: WT_ID,
        customerName: 'Test', plate: 'TST 001',
        bodyworkHours: 8, prepHours: 4, paintHours: 6,
        stayDays: 1, channel: 'phone',
      }, USER_ID);
      expect(entryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'scheduled' }),
      );
    });

    it('si falla el guardado de slots, no inicializa tracking (entry+slots+técnico son atómicos)', async () => {
      const qb = makeQb([]);
      qb.getOne = jest.fn().mockResolvedValueOnce(null);
      entryRepo = makeEntryRepo({ createQueryBuilder: jest.fn().mockReturnValue(qb) });
      const slotRepo        = makeSlotRepo({ save: jest.fn().mockRejectedValue(new Error('DB down')) });
      const trackingService = makeTrackingService();
      await build({ entryRepo, slotRepo, trackingService });

      const dto = {
        workshopId: WS_ID, date: '2026-06-10', workTypeId: WT_ID,
        customerName: 'Test', plate: 'TST 001',
        bodyworkHours: 8, prepHours: 4, paintHours: 6,
        stayDays: 2, channel: 'walk_in' as const,
      };

      await expect(service.create(dto, USER_ID)).rejects.toThrow('DB down');
      expect(trackingService.initForBodyshop).not.toHaveBeenCalled();
    });
  });

  // ── cancel ────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('admin puede cancelar cualquier entry', async () => {
      entryRepo.findOne.mockResolvedValue({ ...MOCK_ENTRY, createdBy: 'otro-user' });
      await service.cancel(ENTRY_ID, { id: USER_ID, role: 'admin' });
      expect(entryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'cancelled' }),
      );
    });

    it('usuario solo puede cancelar su propio entry', async () => {
      entryRepo.findOne.mockResolvedValue({ ...MOCK_ENTRY, createdBy: USER_ID });
      await service.cancel(ENTRY_ID, { id: USER_ID, role: 'receptionist' });
      expect(entryRepo.save).toHaveBeenCalled();
    });

    it('ForbiddenException si no es dueño y no es admin', async () => {
      entryRepo.findOne.mockResolvedValue({ ...MOCK_ENTRY, createdBy: 'otro' });
      await expect(service.cancel(ENTRY_ID, { id: USER_ID, role: 'receptionist' }))
        .rejects.toThrow(ForbiddenException);
    });

    it('NotFoundException si entry no existe', async () => {
      entryRepo.findOne.mockResolvedValue(null);
      await expect(service.cancel('bad', { id: USER_ID, role: 'admin' }))
        .rejects.toThrow(NotFoundException);
    });
  });

  // ── updateHours ──────────────────────────────────────────────────────────
  // QA reportó una inconsistencia: ajustar horas desde Agenda no se reflejaba
  // en el Kanban/Seguimiento del mismo vehículo, que seguía mostrando el plan
  // viejo — porque updateHours() nunca sincronizaba tracking_logs.planned_hours.

  describe('updateHours', () => {
    it('sincroniza tracking_logs.planned_hours cuando cambian las horas', async () => {
      const trackingService = makeTrackingService();
      const freshEntry = { ...MOCK_ENTRY, bodyworkHours: 8, prepHours: 4, paintHours: 6 };
      const entryRepo = makeEntryRepo({ findOne: jest.fn().mockResolvedValue(freshEntry) });
      await build({ trackingService, entryRepo });

      await service.updateHours(ENTRY_ID, { bodyworkHours: 18.2, prepHours: 11.5, paintHours: 6 });

      expect(trackingService.syncBodyshopPlannedHours).toHaveBeenCalledWith(
        ENTRY_ID,
        { BODYWORK: 18.2, PREP: 11.5, PAINT: 6 },
      );
    });

    it('no sincroniza tracking_logs si las horas no cambiaron', async () => {
      const trackingService = makeTrackingService();
      const freshEntry = { ...MOCK_ENTRY, bodyworkHours: 8, prepHours: 4, paintHours: 6 };
      const entryRepo = makeEntryRepo({ findOne: jest.fn().mockResolvedValue(freshEntry) });
      await build({ trackingService, entryRepo });

      await service.updateHours(ENTRY_ID, { bodyworkHours: 8, prepHours: 4, paintHours: 6 });

      expect(trackingService.syncBodyshopPlannedHours).not.toHaveBeenCalled();
    });
  });

  // ── updateStatus ─────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('cambia el status correctamente', async () => {
      const qb = makeQb([{ ...MOCK_ENTRY, status: 'in_progress' }]);
      entryRepo = makeEntryRepo({ createQueryBuilder: jest.fn().mockReturnValue(qb) });
      await build({ entryRepo });

      const result = await service.updateStatus(ENTRY_ID, 'in_progress');
      expect(entryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'in_progress' }),
      );
      expect(result.status).toBe('in_progress');
    });
  });

  // ── assignProcessTechnician ───────────────────────────────────────────────

  describe('assignProcessTechnician', () => {
    it('crea nueva asignación si no existe', async () => {
      ptRepo.findOne.mockResolvedValue(null);
      const qb = makeQb([MOCK_ENTRY]);
      entryRepo = makeEntryRepo({ createQueryBuilder: jest.fn().mockReturnValue(qb) });
      await build({ entryRepo });

      await service.assignProcessTechnician(ENTRY_ID, 'BODYWORK', TECH_BW);
      expect(ptRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ entryId: ENTRY_ID, process: 'BODYWORK', technicianId: TECH_BW }),
      );
      expect(ptRepo.save).toHaveBeenCalled();
    });

    it('actualiza asignación existente', async () => {
      ptRepo.findOne.mockResolvedValue({ id: 'pt-001', entryId: ENTRY_ID, process: 'BODYWORK', technicianId: 'old-tech' });
      const qb = makeQb([MOCK_ENTRY]);
      entryRepo = makeEntryRepo({ createQueryBuilder: jest.fn().mockReturnValue(qb) });
      await build({ entryRepo });

      await service.assignProcessTechnician(ENTRY_ID, 'BODYWORK', TECH_BW);
      expect(ptRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ technicianId: TECH_BW }),
      );
    });

    it('elimina asignación cuando technicianId es null', async () => {
      const qb = makeQb([MOCK_ENTRY]);
      entryRepo = makeEntryRepo({ createQueryBuilder: jest.fn().mockReturnValue(qb) });
      await build({ entryRepo });

      await service.assignProcessTechnician(ENTRY_ID, 'BODYWORK', null);
      expect(ptRepo.delete).toHaveBeenCalledWith({ entryId: ENTRY_ID, process: 'BODYWORK' });
    });
  });

  // ── getDayCapacity ────────────────────────────────────────────────────────

  describe('getDayCapacity', () => {
    it('día laboral sin ausencias: 24h por proceso (3 techs × 8h)', async () => {
      const qb = makeQb([]); // sin entries
      entryRepo = makeEntryRepo({ createQueryBuilder: jest.fn().mockReturnValue(qb) });
      await build({ entryRepo });

      // 2026-06-10 es miércoles (no domingo)
      const result = await service.getDayCapacity(WS_ID, '2026-06-10');
      expect(result.byProcess.BODYWORK.commercializableHours).toBe(8);
      expect(result.byProcess.PREP.commercializableHours).toBe(8);
      expect(result.byProcess.PAINT.commercializableHours).toBe(8);
      expect(result.commercializableTotal).toBe(24);
    });

    it('domingo: todos los procesos en 0', async () => {
      const qb = makeQb([]);
      entryRepo = makeEntryRepo({ createQueryBuilder: jest.fn().mockReturnValue(qb) });
      await build({ entryRepo });

      // 2026-06-07 es domingo
      const result = await service.getDayCapacity(WS_ID, '2026-06-07');
      expect(result.commercializableTotal).toBe(0);
      expect(result.globalStatus).toBe('OK');
    });

    it('feriado global: todos en 0', async () => {
      const qb = makeQb([]);
      entryRepo = makeEntryRepo({ createQueryBuilder: jest.fn().mockReturnValue(qb) });
      workingDayRepo = makeWorkingDayRepo();
      workingDayRepo.findOne = jest.fn().mockResolvedValue({ date: '2026-06-10', isWorkingDay: false });
      await build({ entryRepo, workingDayRepo });

      const result = await service.getDayCapacity(WS_ID, '2026-06-10');
      expect(result.commercializableTotal).toBe(0);
    });

    it('ausencia full: reduce horas del proceso correspondiente', async () => {
      const qb = makeQb([]);
      entryRepo = makeEntryRepo({ createQueryBuilder: jest.fn().mockReturnValue(qb) });
      absenceRepo = makeAbsenceRepo();
      absenceRepo.find = jest.fn().mockResolvedValue([
        { technicianId: TECH_BW, date: '2026-06-10', type: 'full' },
      ]);
      await build({ entryRepo, absenceRepo });

      const result = await service.getDayCapacity(WS_ID, '2026-06-10');
      // TECH_BW (CHAPERIA) ausente → BODYWORK baja de 8 a 0
      expect(result.byProcess.BODYWORK.commercializableHours).toBe(0);
      expect(result.byProcess.PREP.commercializableHours).toBe(8);
      expect(result.byProcess.PAINT.commercializableHours).toBe(8);
    });

    it('ausencia half: reduce a la mitad', async () => {
      const qb = makeQb([]);
      entryRepo = makeEntryRepo({ createQueryBuilder: jest.fn().mockReturnValue(qb) });
      absenceRepo = makeAbsenceRepo();
      absenceRepo.find = jest.fn().mockResolvedValue([
        { technicianId: TECH_PREP, date: '2026-06-10', type: 'half' },
      ]);
      await build({ entryRepo, absenceRepo });

      const result = await service.getDayCapacity(WS_ID, '2026-06-10');
      expect(result.byProcess.PREP.commercializableHours).toBe(4);
    });

    it('entry activo ocupa horas del proceso — asignación secuencial por fase (chapería día 0, prep día 1, pintura día 2)', async () => {
      // Con 1 técnico por proceso (8h/día cada uno): bwDays=ceil(8/8)=1,
      // prepDays=ceil(4/8)=1, pntDays=ceil(6/8)=1 → 3 fases, un día cada una.
      const entryWithHours = {
        ...MOCK_ENTRY,
        bodyworkHours: 8, prepHours: 4, paintHours: 6,
        processTechsList: [],
      };
      const qb = makeQb([entryWithHours]);
      entryRepo = makeEntryRepo({ createQueryBuilder: jest.fn().mockReturnValue(qb) });
      await build({ entryRepo });

      const dia0 = await service.getDayCapacity(WS_ID, '2026-06-10'); // fase chapería
      expect(dia0.byProcess.BODYWORK.occupiedHours).toBe(8);
      expect(dia0.byProcess.PREP.occupiedHours).toBe(0);
      expect(dia0.byProcess.PAINT.occupiedHours).toBe(0);

      const dia1 = await service.getDayCapacity(WS_ID, '2026-06-11'); // fase preparación
      expect(dia1.byProcess.BODYWORK.occupiedHours).toBe(0);
      expect(dia1.byProcess.PREP.occupiedHours).toBe(4);
      expect(dia1.byProcess.PAINT.occupiedHours).toBe(0);

      const dia2 = await service.getDayCapacity(WS_ID, '2026-06-12'); // fase pintura
      expect(dia2.byProcess.BODYWORK.occupiedHours).toBe(0);
      expect(dia2.byProcess.PREP.occupiedHours).toBe(0);
      expect(dia2.byProcess.PAINT.occupiedHours).toBe(6);
    });

    it('status RISK cuando occupancyRate >= 0.8', async () => {
      // 8h comm, 7h occ → 87.5% → RISK
      const entryAlmostFull = { ...MOCK_ENTRY, bodyworkHours: 7, prepHours: 0, paintHours: 0, processTechsList: [] };
      const qb = makeQb([entryAlmostFull]);
      entryRepo = makeEntryRepo({ createQueryBuilder: jest.fn().mockReturnValue(qb) });
      await build({ entryRepo });

      const result = await service.getDayCapacity(WS_ID, '2026-06-10');
      expect(result.byProcess.BODYWORK.status).toBe('RISK');
    });

    it('status OVERLOADED cuando occupancyRate >= 1', async () => {
      // La asignación reparte las horas de una sola entry en varios días
      // (ver test de fases más arriba), así que una entry sola nunca supera
      // su propia capacidad diaria. OVERLOADED requiere 2+ entries superpuestas
      // el mismo día: acá 5h + 5h = 10h contra 8h de capacidad (1 técnico).
      const entryA = { ...MOCK_ENTRY, id: 'e-a', bodyworkHours: 5, prepHours: 0, paintHours: 0, processTechsList: [] };
      const entryB = { ...MOCK_ENTRY, id: 'e-b', bodyworkHours: 5, prepHours: 0, paintHours: 0, processTechsList: [] };
      const qb = makeQb([entryA, entryB]);
      entryRepo = makeEntryRepo({ createQueryBuilder: jest.fn().mockReturnValue(qb) });
      await build({ entryRepo });

      const result = await service.getDayCapacity(WS_ID, '2026-06-10');
      expect(result.byProcess.BODYWORK.status).toBe('OVERLOADED');
    });

    // ── entriesInShop (cambio del día 29: estadía abarca el día) ─────────────

    it('entriesInShop incluye entries que ingresaron antes pero siguen en taller', async () => {
      const entryDelDia = { ...MOCK_ENTRY, id: 'e-hoy',   date: '2026-06-10', stayDays: 1, bodyworkHours: 4, prepHours: 0, paintHours: 0, processTechsList: [] };
      const entryPrevio = { ...MOCK_ENTRY, id: 'e-prev',  date: '2026-06-08', stayDays: 5, bodyworkHours: 8, prepHours: 0, paintHours: 0, processTechsList: [] };

      // Una sola query trae todas las entries en taller. El service filtra
      // las del día en memoria para byProcess.
      entryRepo = makeEntryRepo({
        createQueryBuilder: jest.fn().mockReturnValue(makeQb([entryPrevio, entryDelDia])),
      });
      await build({ entryRepo });

      const result = await service.getDayCapacity(WS_ID, '2026-06-10');

      // byProcess se calcula SOLO con entries del día (entryDelDia: 4h)
      expect(result.byProcess.BODYWORK.occupiedHours).toBe(4);
      // entries devueltas son las que están en taller (los 2)
      expect(result.entries).toHaveLength(2);
      expect(result.entries.map((e: any) => e.id).sort()).toEqual(['e-hoy', 'e-prev']);
    });

    it('los % de byProcess NO se inflan con entries de días anteriores', async () => {
      const entryDelDia = { ...MOCK_ENTRY, id: 'e-hoy',  date: '2026-06-10', stayDays: 1, bodyworkHours: 2, prepHours: 0, paintHours: 0, processTechsList: [] };
      const entryPrevio = { ...MOCK_ENTRY, id: 'e-prev', date: '2026-06-08', stayDays: 5, bodyworkHours: 8, prepHours: 0, paintHours: 0, processTechsList: [] };

      entryRepo = makeEntryRepo({
        createQueryBuilder: jest.fn().mockReturnValue(makeQb([entryPrevio, entryDelDia])),
      });
      await build({ entryRepo });

      const result = await service.getDayCapacity(WS_ID, '2026-06-10');

      // Con 8h disponibles y solo 2h del día → 25%, NO 125% que sería sumar el previo
      expect(result.byProcess.BODYWORK.occupiedHours).toBe(2);
      expect(result.byProcess.BODYWORK.occupancyRate).toBe(0.25);
    });

    it('día sin ingresos pero con vehículos en estadía: byProcess en 0, entries no vacío', async () => {
      const entryPrevio = { ...MOCK_ENTRY, id: 'e-prev', date: '2026-06-05', stayDays: 10, bodyworkHours: 8, prepHours: 0, paintHours: 0, processTechsList: [] };

      entryRepo = makeEntryRepo({
        createQueryBuilder: jest.fn().mockReturnValue(makeQb([entryPrevio])),
      });
      await build({ entryRepo });

      const result = await service.getDayCapacity(WS_ID, '2026-06-10');

      expect(result.byProcess.BODYWORK.occupiedHours).toBe(0);
      expect(result.byProcess.BODYWORK.occupancyRate).toBe(0);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].id).toBe('e-prev');
    });
  });

  // ── getMonthlyReport ──────────────────────────────────────────────────────

  describe('getMonthlyReport', () => {
    it('retorna fila por cada técnico activo con proceso mapeado', async () => {
      await build();
      const rows = await service.getMonthlyReport(WS_ID, 2026, 6);
      expect(rows).toHaveLength(3); // 3 techs activos con proceso
      expect(rows.every(r => ['BODYWORK', 'PREP', 'PAINT'].includes(r.process))).toBe(true);
    });

    it('assignedHours suma solo entries no cancelados del mes', async () => {
      const juneEntry = {
        ...MOCK_ENTRY,
        date: '2026-06-10', status: 'done',
        bodyworkHours: 8, prepHours: 4, paintHours: 6,
        processTechsList: [
          { process: 'BODYWORK', technicianId: TECH_BW },
          { process: 'PREP',     technicianId: TECH_PREP },
          { process: 'PAINT',    technicianId: TECH_PAINT },
        ],
      };
      const cancelledEntry = {
        ...MOCK_ENTRY, id: 'e-002', date: '2026-06-11', status: 'cancelled',
        bodyworkHours: 99, processTechsList: [{ process: 'BODYWORK', technicianId: TECH_BW }],
      };
      entryRepo = makeEntryRepo();
      entryRepo.find.mockResolvedValue([juneEntry, cancelledEntry]);
      await build({ entryRepo });

      const rows = await service.getMonthlyReport(WS_ID, 2026, 6);
      const bwRow = rows.find(r => r.process === 'BODYWORK');
      // Solo entry done cuenta → 8h
      expect(bwRow?.assignedHours).toBe(8);
      // workedHours también 8 porque status='done'
      expect(bwRow?.workedHours).toBe(8);
    });

    it('rankLoadAsc = 1 para el técnico con menor carga relativa', async () => {
      await build();
      const rows = await service.getMonthlyReport(WS_ID, 2026, 6);
      const ranks = rows.map(r => r.rankLoadAsc).sort((a, b) => a - b);
      expect(ranks[0]).toBe(1);
    });
  });

  // ── getSchedule ──────────────────────────────────────────────────────────
  // QA reportó una inconsistencia: el kanban mostraba "Duración plan: 32.9h"
  // (incluyendo procesos extra como Pulido/Mecánica) pero el detalle del
  // vehículo en Agenda mostraba "32.2h" — solo Chapería+Prep+Pintura.
  // totalPlannedHours acá debe incluir los procesos extra igual que el kanban.
  describe('getSchedule', () => {
    it('totalPlannedHours suma también los procesos extra (Pulido, Mecánica) desde tracking_logs', async () => {
      const scheduleEntry = {
        ...MOCK_ENTRY, id: 'e-sched', date: '2026-06-10', stayDays: 5,
        bodyworkHours: 17.5, prepHours: 17.2, paintHours: 7.7,
        processTechsList: [],
      };
      entryRepo = makeEntryRepo({ createQueryBuilder: jest.fn().mockReturnValue(makeQb([scheduleEntry])) });

      const trackingLogRepo = makeTrackingLogRepo();
      trackingLogRepo.find = jest.fn().mockResolvedValue([
        { sourceId: 'e-sched', processCode: 'BODYWORK', plannedHours: 17.5, status: 'pending', processType: 'MOTHER' },
        { sourceId: 'e-sched', processCode: 'PREP',     plannedHours: 17.2, status: 'pending', processType: 'MOTHER' },
        { sourceId: 'e-sched', processCode: 'PAINT',    plannedHours: 7.7,  status: 'pending', processType: 'MOTHER' },
        { sourceId: 'e-sched', processCode: 'POLISH',   plannedHours: 0.3,  status: 'pending', processType: 'PARALLEL' },
        { sourceId: 'e-sched', processCode: 'MECHANIC', plannedHours: 0.4,  status: 'pending', processType: 'PARALLEL' },
      ]);

      await build({ entryRepo, trackingLogRepo });
      const result = await service.getSchedule(WS_ID, '2026-06-01', '2026-06-30');

      const entry = result.entries.find((e: any) => e.id === 'e-sched');
      expect(entry?.totalPlannedHours).toBe(43.1); // 17.5 + 17.2 + 7.7 + 0.3 + 0.4
    });
  });
});
