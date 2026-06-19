import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { AppointmentsService, CreateAppointmentDto } from '../modules/appointments/appointments.service';
import { Appointment } from '../modules/appointments/appointment.entity';
import { BodyshopEntry } from '../modules/bodyshop/bodyshop-entry.entity';
import { CapacityService } from '../modules/capacity/capacity.service';
import { ServiceTypesService } from '../modules/service-types/service-types.service';
import { TechniciansService } from '../modules/technicians/technicians.service';
import { WorkshopsService } from '../modules/workshops/workshops.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TECH_ID   = 'tech-1';
const SVC_ID    = 'svc-mantenimiento';
const USER_ID   = 'user-receptionist-1';
const MONDAY    = '2026-05-04';

const mockServiceType = {
  id: SVC_ID,
  name: 'Mantenimiento preventivo',
  durationHours: 2,
};

const baseDto: CreateAppointmentDto = {
  date:          MONDAY,
  timeStart:     '08:00',
  technicianId:  TECH_ID,
  serviceTypeId: SVC_ID,
  customerName:  'Juan Pérez',
  plate:         'ABC 123',
};

// Capacidad disponible: 8h libres
const fullCapacity = [
  { technicianId: TECH_ID, availableHours: 8, usedHours: 0, absenceType: null, isWorkingDay: true },
];

// Sin horas disponibles (ausencia o día no laboral)
const zeroCapacity = [
  { technicianId: TECH_ID, availableHours: 0, usedHours: 0, absenceType: 'full', isWorkingDay: false },
];

// ── Setup ─────────────────────────────────────────────────────────────────────

describe('AppointmentsService — create()', () => {
  let service: AppointmentsService;
  let repo: {
    find: jest.Mock; findOne: jest.Mock; save: jest.Mock;
    create: jest.Mock; createQueryBuilder: jest.Mock;
  };
  let capacityService: { getDailyCapacity: jest.Mock };
  let serviceTypesService: { findOne: jest.Mock };

  // qb stub que simula getCount() = 0 por defecto (sin solapamiento)
  function makeQb(count = 0) {
    const qb: any = {
      where:        jest.fn().mockReturnThis(),
      andWhere:     jest.fn().mockReturnThis(),
      getCount:     jest.fn().mockResolvedValue(count),
    };
    return qb;
  }

  beforeEach(async () => {
    repo = {
      find:    jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      save:    jest.fn(e => Promise.resolve({ id: 'appt-new', ...e })),
      create:  jest.fn(e => e),
      createQueryBuilder: jest.fn().mockReturnValue(makeQb(0)),
    };

    capacityService     = { getDailyCapacity: jest.fn().mockResolvedValue(fullCapacity) };
    serviceTypesService = { findOne: jest.fn().mockResolvedValue(mockServiceType) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: getRepositoryToken(Appointment), useValue: repo },
        { provide: getRepositoryToken(BodyshopEntry), useValue: { find: jest.fn().mockResolvedValue([]), createQueryBuilder: jest.fn() } },
        { provide: CapacityService,                 useValue: capacityService },
        { provide: ServiceTypesService,             useValue: serviceTypesService },
        { provide: TechniciansService, useValue: {
          findOne: jest.fn().mockResolvedValue({ id: TECH_ID, workshopName: null }),
          findAll: jest.fn().mockResolvedValue([]),
        } },
        { provide: WorkshopsService,   useValue: {
          findOne:    jest.fn(),
          findAll:    jest.fn().mockResolvedValue([]),
          findByName: jest.fn(),
        } },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);
  });

  // ── Creación exitosa ────────────────────────────────────────────────────────

  it('crea el turno cuando hay capacidad y no hay solapamiento', async () => {
    const result = await service.create(baseDto, USER_ID);

    expect(repo.save).toHaveBeenCalled();
    expect(result.status).toBe('scheduled');
    expect(result.createdBy).toBe(USER_ID);
  });

  it('calcula timeEnd correctamente (08:00 + 2h = 10:00)', async () => {
    repo.create.mockImplementation(e => e);
    repo.save.mockImplementation(e => Promise.resolve({ id: 'appt-new', ...e }));

    const result = await service.create(baseDto, USER_ID);

    expect(result.timeEnd).toBe('10:00');
  });

  it('calcula timeEnd con duración fraccional (08:00 + 1.5h = 09:30)', async () => {
    serviceTypesService.findOne.mockResolvedValue({ ...mockServiceType, durationHours: 1.5 });
    repo.create.mockImplementation(e => e);
    repo.save.mockImplementation(e => Promise.resolve({ id: 'appt-new', ...e }));

    const result = await service.create(baseDto, USER_ID);

    expect(result.timeEnd).toBe('09:30');
  });

  // ── Solapamiento ────────────────────────────────────────────────────────────

  it('lanza BadRequestException cuando hay solapamiento de horario', async () => {
    repo.createQueryBuilder.mockReturnValue(makeQb(1)); // 1 turno solapado

    await expect(service.create(baseDto, USER_ID)).rejects.toThrow(BadRequestException);
    await expect(service.create(baseDto, USER_ID)).rejects.toThrow('se superpone');
  });

  // ── Capacidad insuficiente ──────────────────────────────────────────────────

  it('lanza BadRequestException si el técnico no tiene horas disponibles (ausencia)', async () => {
    capacityService.getDailyCapacity.mockResolvedValue(zeroCapacity);

    await expect(service.create(baseDto, USER_ID)).rejects.toThrow(BadRequestException);
    await expect(service.create(baseDto, USER_ID)).rejects.toThrow('no tiene horas disponibles');
  });

  it('lanza BadRequestException si la duración del servicio supera las horas restantes', async () => {
    // Técnico tiene 8h pero ya usó 7h → quedan 1h, servicio requiere 2h
    const almostFull = [
      { technicianId: TECH_ID, availableHours: 8, usedHours: 7, absenceType: null, isWorkingDay: true },
    ];
    capacityService.getDailyCapacity.mockResolvedValue(almostFull);
    repo.find.mockResolvedValue([
      { id: 'appt-existing-1', status: 'scheduled', serviceType: { durationHours: 7 } },
    ]);

    await expect(service.create(baseDto, USER_ID)).rejects.toThrow(BadRequestException);
    await expect(service.create(baseDto, USER_ID)).rejects.toThrow('Horas insuficientes');
  });

  it('lanza BadRequestException si el técnico no está en el resultado de capacidad', async () => {
    capacityService.getDailyCapacity.mockResolvedValue([]); // lista vacía

    await expect(service.create(baseDto, USER_ID)).rejects.toThrow(BadRequestException);
    await expect(service.create(baseDto, USER_ID)).rejects.toThrow('Técnico no encontrado');
  });

  // ── Turnos anteriores del mismo día afectan horas usadas ───────────────────

  it('suma correctamente las horas usadas de turnos previos del día', async () => {
    // 2 turnos de 2h cada uno → 4h usadas de 8h disponibles → 4h libres para servicio de 2h: OK
    repo.find.mockResolvedValue([
      { id: 'appt-prev-1', status: 'scheduled', serviceType: { durationHours: 2 } },
      { id: 'appt-prev-2', status: 'scheduled', serviceType: { durationHours: 2 } },
    ]);

    await service.create(baseDto, USER_ID);

    // Verifica que getDailyCapacity recibió el usedHoursMap con 4h
    const call = capacityService.getDailyCapacity.mock.calls[0];
    expect(call[1]).toEqual({ [TECH_ID]: 4 });
  });

  it('ignora turnos cancelados al calcular horas usadas', async () => {
    repo.find.mockResolvedValue([
      { id: 'appt-cancelled-1', status: 'cancelled',  serviceType: { durationHours: 3 } }, // no cuenta
      { id: 'appt-active-1',   status: 'scheduled',  serviceType: { durationHours: 2 } }, // cuenta
    ]);

    await service.create(baseDto, USER_ID);

    const call = capacityService.getDailyCapacity.mock.calls[0];
    expect(call[1]).toEqual({ [TECH_ID]: 2 }); // solo 2h, no 5h
  });
});
