/**
 * Tests de BodyshopScheduleService.simulate() — foco en el bug de "sobreagenda
 * fantasma": cuando PREP no tiene técnico dedicado y usa los técnicos de
 * BODYWORK, ambos procesos tienen que compartir el mismo pool de horas
 * comprometidas por día. Antes del fix, el scheduler reservaba 8h de BODYWORK
 * y otras 8h de PREP el mismo día para el mismo técnico (ver auditoría, #8).
 */

import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BodyshopScheduleService } from '../modules/bodyshop/bodyshop-schedule.service';
import { BodyshopEntryProcessSlot } from '../modules/bodyshop/bodyshop-entry-process-slot.entity';
import { BodyshopProcess } from '../modules/bodyshop/bodyshop-process.entity';
import { TechnicianAbsence } from '../modules/capacity/technician-absence.entity';
import { WorkingDay } from '../modules/capacity/working-day.entity';
import { TechniciansService } from '../modules/technicians/technicians.service';
import { WorkshopsService } from '../modules/workshops/workshops.service';

const WS_ID   = 'ws-001';
const TECH_BW = 'tech-bw-001'; // único técnico: cubre BODYWORK y (por fallback) PREP

const PROCESSES = [
  { code: 'BODYWORK', name: 'Chapería',    sequence: 1, active: true },
  { code: 'PREP',     name: 'Preparación', sequence: 2, active: true },
  { code: 'PAINT',    name: 'Pintura',     sequence: 3, active: true },
];

function makeQb(rows: any[] = []) {
  const qb: any = {};
  ['innerJoin', 'select', 'addSelect', 'where', 'andWhere', 'groupBy', 'addGroupBy'].forEach(m => {
    qb[m] = jest.fn().mockReturnValue(qb);
  });
  qb.getRawMany = jest.fn().mockResolvedValue(rows);
  return qb;
}

async function build(overrides: { committedRows?: any[]; techs?: any[] } = {}) {
  const slotRepo = {
    createQueryBuilder: jest.fn().mockReturnValue(makeQb(overrides.committedRows ?? [])),
  };
  const processRepo = { find: jest.fn().mockResolvedValue(PROCESSES) };
  const absenceRepo = { find: jest.fn().mockResolvedValue([]) };
  const workingDayRepo = { findOne: jest.fn().mockResolvedValue(null) };
  const techniciansService = {
    findAll: jest.fn().mockResolvedValue(overrides.techs ?? [
      { id: TECH_BW, specialty: 'CHAPERIA', dailyHours: 8, active: true },
    ]),
  };
  const workshopsService = {
    findOne: jest.fn().mockResolvedValue({ id: WS_ID, name: 'Test Bodyshop', config: {} }),
  };

  const mod = await Test.createTestingModule({
    providers: [
      BodyshopScheduleService,
      { provide: getRepositoryToken(BodyshopEntryProcessSlot), useValue: slotRepo },
      { provide: getRepositoryToken(BodyshopProcess),          useValue: processRepo },
      { provide: getRepositoryToken(TechnicianAbsence),        useValue: absenceRepo },
      { provide: getRepositoryToken(WorkingDay),                useValue: workingDayRepo },
      { provide: TechniciansService, useValue: techniciansService },
      { provide: WorkshopsService,   useValue: workshopsService },
    ],
  }).compile();

  return mod.get(BodyshopScheduleService);
}

describe('BodyshopScheduleService.simulate() — pool compartido PREP/BODYWORK', () => {
  it('PREP sin técnico dedicado NO se agenda el mismo día que BODYWORK ya lo satura (comparten pool)', async () => {
    const service = await build();

    const sim = await service.simulate({
      bodyworkHours: 8, // satura las 8h del único técnico el día 1
      prepHours:     4, // debe correr al día siguiente, no sumarse el mismo día
      paintHours:    0,
      workshopId:    WS_ID,
      startDate:     '2026-06-10', // miércoles, día laboral
      startTime:     '08:00',
    });

    expect(sim.canSchedule).toBe(true);

    const bodyworkSlot = sim.slots.find(s => s.process === 'BODYWORK');
    const prepSlot      = sim.slots.find(s => s.process === 'PREP');

    expect(bodyworkSlot?.date).toBe('2026-06-10');
    expect(bodyworkSlot?.hours).toBe(8);

    // La corrección: PREP no puede caer el mismo día, porque el pool
    // (compartido con BODYWORK) ya está en 8/8 ese día.
    expect(prepSlot?.date).not.toBe('2026-06-10');
    expect(prepSlot?.date).toBe('2026-06-11');
  });

  it('con técnico dedicado a PREP, sí puede agendarse el mismo día que BODYWORK (pools separados)', async () => {
    const service = await build({
      techs: [
        { id: 'tech-bw',   specialty: 'CHAPERIA',    dailyHours: 8, active: true },
        { id: 'tech-prep', specialty: 'PREPARACION', dailyHours: 8, active: true },
      ],
    });

    const sim = await service.simulate({
      bodyworkHours: 8,
      prepHours:     4,
      paintHours:    0,
      workshopId:    WS_ID,
      startDate:     '2026-06-10',
      startTime:     '08:00',
    });

    const bodyworkSlot = sim.slots.find(s => s.process === 'BODYWORK');
    const prepSlot      = sim.slots.find(s => s.process === 'PREP');

    expect(bodyworkSlot?.date).toBe('2026-06-10');
    expect(prepSlot?.date).toBe('2026-06-10'); // técnico propio: no compite por el mismo pool
  });

  it('respeta compromisos previos ya guardados en el pool compartido', async () => {
    // Ya hay 5h de BODYWORK comprometidas ese día para este taller.
    const service = await build({
      committedRows: [{ process: 'BODYWORK', date: '2026-06-10', committed: '5' }],
    });

    const sim = await service.simulate({
      bodyworkHours: 0,
      prepHours:     4, // el pool compartido (BODYWORK) solo tiene 3h libres ese día
      paintHours:    0,
      workshopId:    WS_ID,
      startDate:     '2026-06-10',
      startTime:     '08:00',
    });

    const prepSlots = sim.slots.filter(s => s.process === 'PREP');
    const firstDay   = prepSlots.find(s => s.date === '2026-06-10');
    expect(firstDay?.hours).toBe(3); // solo lo que quedaba libre del pool compartido
  });
});

describe('BodyshopScheduleService.simulate() — normalización de startTime', () => {
  // budget_appointments.time_start es columna Postgres type:'time' — TypeORM la
  // devuelve como "HH:MM:SS". Sin truncar, ese valor terminaba guardado tal cual
  // en bodyshop_entry_process_slots.time_start (varchar(5)) → "value too long
  // for type character varying(5)" al aprobar un presupuesto (bug reportado en QA).
  it('trunca un startTime con segundos ("HH:MM:SS") a "HH:MM"', async () => {
    const service = await build();

    const sim = await service.simulate({
      bodyworkHours: 4,
      prepHours:     0,
      paintHours:    0,
      workshopId:    WS_ID,
      startDate:     '2026-06-10',
      startTime:     '09:00:00',
    });

    const slot = sim.slots.find(s => s.process === 'BODYWORK');
    expect(slot?.timeStart).toBe('09:00');
    expect(slot?.timeStart.length).toBe(5);
  });

  it('cae al horario de apertura si startTime viene inválido', async () => {
    const service = await build();

    const sim = await service.simulate({
      bodyworkHours: 4,
      prepHours:     0,
      paintHours:    0,
      workshopId:    WS_ID,
      startDate:     '2026-06-10',
      startTime:     'no-es-una-hora',
    });

    const slot = sim.slots.find(s => s.process === 'BODYWORK');
    expect(slot?.timeStart).toBe('08:00');
  });
});
