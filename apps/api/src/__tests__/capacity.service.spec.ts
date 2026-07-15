import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CapacityService } from '../modules/capacity/capacity.service';
import { TechnicianAbsence } from '../modules/capacity/technician-absence.entity';
import { WorkingDay } from '../modules/capacity/working-day.entity';
import { Appointment } from '../modules/appointments/appointment.entity';
import { BodyshopEntry } from '../modules/bodyshop/bodyshop-entry.entity';
import { TechniciansService } from '../modules/technicians/technicians.service';
import { WorkshopsService } from '../modules/workshops/workshops.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const T1 = { id: 'tech-1', name: 'Carlos Rodríguez', dailyHours: 8, active: true };
const T2 = { id: 'tech-2', name: 'Miguel Benítez',   dailyHours: 8, active: true };
const T3 = { id: 'tech-3', name: 'Luis Zárate',      dailyHours: 6, active: true };

const MONDAY    = '2026-05-04'; // getDay() = 1
const WEDNESDAY = '2026-05-06'; // getDay() = 3
const SUNDAY    = '2026-05-03'; // getDay() = 0

// ── Setup ─────────────────────────────────────────────────────────────────────

describe('CapacityService', () => {
  let service: CapacityService;
  let absenceRepo: { find: jest.Mock; findOne: jest.Mock; save: jest.Mock; create: jest.Mock; remove: jest.Mock };
  let workingDayRepo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock; remove: jest.Mock };
  let appointmentRepo: any;
  let bsEntryRepo: any;
  let techniciansService: { findAll: jest.Mock; findOne: jest.Mock };
  let workshopsService: { findAll: jest.Mock; findOne: jest.Mock };

  beforeEach(async () => {
    absenceRepo = {
      find:    jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      save:    jest.fn(e => Promise.resolve({ id: 'abs-1', ...e })),
      create:  jest.fn(e => e),
      remove:  jest.fn().mockResolvedValue(undefined),
    };

    workingDayRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      save:    jest.fn(e => Promise.resolve(e)),
      create:  jest.fn(e => e),
      remove:  jest.fn().mockResolvedValue(undefined),
    };

    appointmentRepo = {
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn(() => ({
        select:    jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where:     jest.fn().mockReturnThis(),
        andWhere:  jest.fn().mockReturnThis(),
        groupBy:   jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      })),
    } as any;

    bsEntryRepo = {
      createQueryBuilder: jest.fn(() => ({
        select:    jest.fn().mockReturnThis(),
        where:     jest.fn().mockReturnThis(),
        andWhere:  jest.fn().mockReturnThis(),
        getMany:   jest.fn().mockResolvedValue([]),
      })),
    } as any;

    techniciansService = {
      findAll: jest.fn().mockResolvedValue([T1, T2, T3]),
      findOne: jest.fn().mockResolvedValue(T1),
    };

    workshopsService = {
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'ws-1', name: 'Test Workshop', config: {} }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CapacityService,
        { provide: getRepositoryToken(TechnicianAbsence), useValue: absenceRepo },
        { provide: getRepositoryToken(WorkingDay),        useValue: workingDayRepo },
        { provide: getRepositoryToken(Appointment),       useValue: appointmentRepo },
        { provide: getRepositoryToken(BodyshopEntry),     useValue: bsEntryRepo },
        { provide: TechniciansService,                    useValue: techniciansService },
        { provide: WorkshopsService,                      useValue: workshopsService },
      ],
    }).compile();

    service = module.get<CapacityService>(CapacityService);
  });

  // ── getDailyCapacity ────────────────────────────────────────────────────────

  describe('getDailyCapacity()', () => {
    it('devuelve horas completas en día laboral sin ausencias', async () => {
      const result = await service.getDailyCapacity(MONDAY);

      expect(result).toHaveLength(3);
      expect(result.find(r => r.technicianId === 'tech-1')?.availableHours).toBe(8);
      expect(result.find(r => r.technicianId === 'tech-3')?.availableHours).toBe(6);
    });

    it('devuelve 0 horas para todos los técnicos en domingo', async () => {
      const result = await service.getDailyCapacity(SUNDAY);

      result.forEach(r => expect(r.availableHours).toBe(0));
    });

    it('devuelve 0 horas cuando el día es feriado global (isWorkingDay = false)', async () => {
      workingDayRepo.findOne.mockResolvedValue({ date: MONDAY, isWorkingDay: false });

      const result = await service.getDailyCapacity(MONDAY);

      result.forEach(r => expect(r.availableHours).toBe(0));
    });

    it('devuelve 0 horas para técnico con ausencia total', async () => {
      absenceRepo.find.mockResolvedValue([
        { technicianId: 'tech-1', date: MONDAY, type: 'full' },
      ]);

      const result = await service.getDailyCapacity(MONDAY);

      expect(result.find(r => r.technicianId === 'tech-1')?.availableHours).toBe(0);
      expect(result.find(r => r.technicianId === 'tech-2')?.availableHours).toBe(8);
    });

    it('devuelve mitad de horas para técnico con media jornada', async () => {
      absenceRepo.find.mockResolvedValue([
        { technicianId: 'tech-1', date: MONDAY, type: 'half' },
      ]);

      const result = await service.getDailyCapacity(MONDAY);

      expect(result.find(r => r.technicianId === 'tech-1')?.availableHours).toBe(4);
    });

    it('devuelve mitad de horas para técnico con tipo holiday', async () => {
      absenceRepo.find.mockResolvedValue([
        { technicianId: 'tech-3', date: MONDAY, type: 'holiday' },
      ]);

      const result = await service.getDailyCapacity(MONDAY);

      expect(result.find(r => r.technicianId === 'tech-3')?.availableHours).toBe(3); // 6 / 2
    });

    it('descuenta usedHours del mapa pasado como parámetro', async () => {
      const result = await service.getDailyCapacity(MONDAY, { 'tech-1': 5 });

      const cap = result.find(r => r.technicianId === 'tech-1');
      expect(cap?.usedHours).toBe(5);
      expect(cap?.availableHours).toBe(8); // availableHours no se reduce — es la capacidad bruta
    });

    it('no incluye técnicos inactivos (findAll solo retorna activos)', async () => {
      techniciansService.findAll.mockResolvedValue([T1, T2]); // T3 inactivo, no lo retorna

      const result = await service.getDailyCapacity(MONDAY);

      expect(result).toHaveLength(2);
      expect(result.find(r => r.technicianId === 'tech-3')).toBeUndefined();
    });

    it('isWorkingDay = false en domingo aunque no haya config en DB', async () => {
      const result = await service.getDailyCapacity(SUNDAY);

      result.forEach(r => expect(r.isWorkingDay).toBe(false));
    });

    it('maneja múltiples técnicos con ausencias mixtas', async () => {
      absenceRepo.find.mockResolvedValue([
        { technicianId: 'tech-1', date: WEDNESDAY, type: 'full' },
        { technicianId: 'tech-2', date: WEDNESDAY, type: 'half' },
      ]);

      const result = await service.getDailyCapacity(WEDNESDAY);

      expect(result.find(r => r.technicianId === 'tech-1')?.availableHours).toBe(0);
      expect(result.find(r => r.technicianId === 'tech-2')?.availableHours).toBe(4);
      expect(result.find(r => r.technicianId === 'tech-3')?.availableHours).toBe(6);
    });

    it('expone el tipo de ausencia en la respuesta', async () => {
      absenceRepo.find.mockResolvedValue([
        { technicianId: 'tech-1', date: MONDAY, type: 'full' },
      ]);

      const result = await service.getDailyCapacity(MONDAY);

      expect(result.find(r => r.technicianId === 'tech-1')?.absenceType).toBe('full');
      expect(result.find(r => r.technicianId === 'tech-2')?.absenceType).toBeNull();
    });
  });

  // ── createAbsence ───────────────────────────────────────────────────────────

  describe('createAbsence()', () => {
    it('crea ausencia cuando no existe una previa', async () => {
      absenceRepo.findOne.mockResolvedValue(null);
      absenceRepo.create.mockReturnValue({ technicianId: 'tech-1', date: MONDAY, type: 'full' });

      const result = await service.createAbsence('tech-1', MONDAY, 'full');

      expect(absenceRepo.save).toHaveBeenCalled();
      expect(result.type).toBe('full');
    });

    it('lanza ConflictException si ya existe ausencia para ese técnico y fecha', async () => {
      absenceRepo.findOne.mockResolvedValue({ id: 'abs-1', technicianId: 'tech-1', date: MONDAY });

      await expect(service.createAbsence('tech-1', MONDAY, 'half')).rejects.toThrow(ConflictException);
    });

    it('lanza NotFoundException si el técnico no existe', async () => {
      techniciansService.findOne.mockRejectedValue(new NotFoundException('Technician not found'));

      await expect(service.createAbsence('no-existe', MONDAY, 'full')).rejects.toThrow(NotFoundException);
    });
  });

  // ── deleteAbsence ───────────────────────────────────────────────────────────

  describe('deleteAbsence()', () => {
    it('elimina la ausencia correctamente', async () => {
      const absence = { id: 'abs-1', technicianId: 'tech-1', date: MONDAY };
      absenceRepo.findOne.mockResolvedValue(absence);

      await service.deleteAbsence('abs-1');

      expect(absenceRepo.remove).toHaveBeenCalledWith(absence);
    });

    it('lanza NotFoundException si la ausencia no existe', async () => {
      absenceRepo.findOne.mockResolvedValue(null);

      await expect(service.deleteAbsence('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  // ── upsertWorkingDay ────────────────────────────────────────────────────────

  describe('upsertWorkingDay()', () => {
    it('crea un nuevo día laboral cuando no existe', async () => {
      workingDayRepo.findOne.mockResolvedValue(null);
      workingDayRepo.create.mockReturnValue({ date: MONDAY, isWorkingDay: false, note: 'Feriado' });

      await service.upsertWorkingDay(MONDAY, false, 'Feriado');

      expect(workingDayRepo.save).toHaveBeenCalled();
    });

    it('actualiza el día laboral existente', async () => {
      const existing = { date: MONDAY, isWorkingDay: true, note: '' };
      workingDayRepo.findOne.mockResolvedValue(existing);

      await service.upsertWorkingDay(MONDAY, false, 'Feriado nacional');

      expect(existing.isWorkingDay).toBe(false);
      expect(workingDayRepo.save).toHaveBeenCalledWith(existing);
    });
  });
});
