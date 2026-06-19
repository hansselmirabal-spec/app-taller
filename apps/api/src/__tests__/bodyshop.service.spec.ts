import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { BodyshopService } from '../modules/bodyshop/bodyshop.service';
import { BodyshopEntry } from '../modules/bodyshop/bodyshop-entry.entity';
import { BodyshopProcessTech } from '../modules/bodyshop/bodyshop-process-tech.entity';
import { TechnicianAbsence } from '../modules/capacity/technician-absence.entity';
import { WorkingDay } from '../modules/capacity/working-day.entity';
import { TechniciansService } from '../modules/technicians/technicians.service';
import { WorkshopsService } from '../modules/workshops/workshops.service';

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
  } = {}) {
    entryRepo         = overrides.entryRepo      ?? makeEntryRepo();
    ptRepo            = overrides.ptRepo         ?? makePtRepo();
    absenceRepo       = overrides.absenceRepo    ?? makeAbsenceRepo();
    workingDayRepo    = overrides.workingDayRepo ?? makeWorkingDayRepo();
    techniciansService= overrides.techsSvc       ?? makeTechniciansService();
    workshopsService  = overrides.wsSvc          ?? makeWorkshopsService();

    const mod = await Test.createTestingModule({
      providers: [
        BodyshopService,
        { provide: getRepositoryToken(BodyshopEntry),       useValue: entryRepo },
        { provide: getRepositoryToken(BodyshopProcessTech), useValue: ptRepo },
        { provide: getRepositoryToken(TechnicianAbsence),   useValue: absenceRepo },
        { provide: getRepositoryToken(WorkingDay),          useValue: workingDayRepo },
        { provide: TechniciansService, useValue: techniciansService },
        { provide: WorkshopsService,  useValue: workshopsService },
      ],
    }).compile();
    service = mod.get(BodyshopService);
  }

  beforeEach(() => build());

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('crea entry y retorna objeto formateado', async () => {
      const qb = makeQb([MOCK_ENTRY]);
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
      const qb = makeQb([MOCK_ENTRY]);
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

    it('entry activo ocupa horas del proceso', async () => {
      const entryWithHours = {
        ...MOCK_ENTRY,
        bodyworkHours: 8, prepHours: 4, paintHours: 6,
        processTechsList: [],
      };
      const qb = makeQb([entryWithHours]);
      entryRepo = makeEntryRepo({ createQueryBuilder: jest.fn().mockReturnValue(qb) });
      await build({ entryRepo });

      const result = await service.getDayCapacity(WS_ID, '2026-06-10');
      expect(result.byProcess.BODYWORK.occupiedHours).toBe(8);
      expect(result.byProcess.PREP.occupiedHours).toBe(4);
      expect(result.byProcess.PAINT.occupiedHours).toBe(6);
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
      const entryOver = { ...MOCK_ENTRY, bodyworkHours: 10, prepHours: 0, paintHours: 0, processTechsList: [] };
      const qb = makeQb([entryOver]);
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
});
