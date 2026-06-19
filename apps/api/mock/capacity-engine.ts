import {
  findWorkshop, findWorkType,
  getMechanicAppointmentsByDate, getBodyshopAppointmentsByDate,
} from './store';

export type CapacityStatus = 'OK' | 'RISK' | 'OVERLOADED';

const RISK_THRESHOLD = 0.90;

// ─── MECHANIC ─────────────────────────────────────────────────────────────────

export interface MechanicCapacity {
  workshopId: string;
  date: string;
  theoreticalHours: number;
  realHours: number;
  commercializableHours: number;
  occupiedHours: number;
  availableHours: number;
  occupancyRate: number;
  status: CapacityStatus;
  availableSlots: number;
}

export function calcMechanicCapacity(workshopId: string, dateStr: string): MechanicCapacity {
  const ws = findWorkshop(workshopId);
  if (ws.type !== 'MECHANIC') {
    throw new Error(`Workshop ${workshopId} is type ${ws.type}, expected MECHANIC`);
  }

  const theoretical = ws.technicians * ws.hoursPerDay;
  const real = theoretical * ws.presenceRate * ws.productivityRate;
  const commercializable = real * (1 - ws.lostHoursRate) * (1 - ws.bufferRate);

  const appointments = getMechanicAppointmentsByDate(workshopId, dateStr);
  const occupiedHours = appointments.reduce((sum, a) => sum + a.technicianHours, 0);
  const availableHours = Math.max(0, commercializable - occupiedHours);
  const occupancyRate = commercializable > 0 ? occupiedHours / commercializable : 0;

  const status: CapacityStatus =
    occupancyRate >= 1.0 ? 'OVERLOADED' :
    occupancyRate >= RISK_THRESHOLD ? 'RISK' :
    'OK';

  const availableSlots = Math.floor(availableHours / (ws.avgJobHours ?? 1));

  return {
    workshopId,
    date: dateStr,
    theoreticalHours: round(theoretical),
    realHours: round(real),
    commercializableHours: round(commercializable),
    occupiedHours: round(occupiedHours),
    availableHours: round(availableHours),
    occupancyRate: round(occupancyRate),
    status,
    availableSlots,
  };
}

// ─── BODYSHOP ─────────────────────────────────────────────────────────────────

export interface ProcessCapacity {
  commercializableHours: number;
  occupiedHours: number;
  availableHours: number;
  occupancyRate: number;
  status: CapacityStatus;
}

export interface BodyshopCapacity {
  workshopId: string;
  date: string;
  theoreticalHours: number;
  realHours: number;
  commercializableHours: number;
  byProcess: {
    BODYWORK: ProcessCapacity;
    PREP: ProcessCapacity;
    PAINT: ProcessCapacity;
  };
  globalOccupancyRate: number;
  globalStatus: CapacityStatus;
}

export function calcBodyshopCapacity(workshopId: string, dateStr: string): BodyshopCapacity {
  const ws = findWorkshop(workshopId);
  if (ws.type !== 'BODYSHOP') {
    throw new Error(`Workshop ${workshopId} is type ${ws.type}, expected BODYSHOP`);
  }
  if (!ws.processMix) {
    throw new Error(`Workshop ${workshopId} has no processMix defined`);
  }

  const theoretical = ws.technicians * ws.hoursPerDay;
  const real = theoretical * ws.presenceRate * ws.productivityRate;
  const commercializable = real * (1 - ws.lostHoursRate) * (1 - ws.bufferRate);

  const bwCapacity   = commercializable * ws.processMix.bodywork;
  const prepCapacity = commercializable * ws.processMix.prep;
  const paintCapacity = commercializable * ws.processMix.paint;

  const appointments = getBodyshopAppointmentsByDate(workshopId, dateStr);

  const occupiedBW   = appointments.reduce((s, a) => s + a.bodyworkHours, 0);
  const occupiedPrep = appointments.reduce((s, a) => s + a.prepHours, 0);
  const occupiedPaint = appointments.reduce((s, a) => s + a.paintHours, 0);

  function buildProcess(capacity: number, occupied: number): ProcessCapacity {
    const available = Math.max(0, capacity - occupied);
    const rate = capacity > 0 ? occupied / capacity : 0;
    const status: CapacityStatus =
      rate >= 1.0 ? 'OVERLOADED' : rate >= RISK_THRESHOLD ? 'RISK' : 'OK';
    return {
      commercializableHours: round(capacity),
      occupiedHours: round(occupied),
      availableHours: round(available),
      occupancyRate: round(rate),
      status,
    };
  }

  const byProcess = {
    BODYWORK: buildProcess(bwCapacity, occupiedBW),
    PREP:     buildProcess(prepCapacity, occupiedPrep),
    PAINT:    buildProcess(paintCapacity, occupiedPaint),
  };

  const totalOccupied = occupiedBW + occupiedPrep + occupiedPaint;
  const globalRate = commercializable > 0 ? totalOccupied / commercializable : 0;
  const globalStatus: CapacityStatus =
    globalRate >= 1.0 ? 'OVERLOADED' : globalRate >= RISK_THRESHOLD ? 'RISK' : 'OK';

  return {
    workshopId,
    date: dateStr,
    theoreticalHours: round(theoretical),
    realHours: round(real),
    commercializableHours: round(commercializable),
    byProcess,
    globalOccupancyRate: round(globalRate),
    globalStatus,
  };
}

// ─── APT DATE FINDER ─────────────────────────────────────────────────────────

export interface AptDateResult {
  workshopId: string;
  workTypeId: string;
  workTypeName: string;
  aptDate: string;
  requiredHours: { bodywork: number; prep: number; paint: number };
  availableOnDate: { bodywork: number; prep: number; paint: number };
  daysSearched: number;
}

export function findAptDate(workshopId: string, workTypeId: string): AptDateResult {
  const ws = findWorkshop(workshopId);
  if (ws.type !== 'BODYSHOP') {
    throw new Error(
      `findAptDate solo aplica a talleres BODYSHOP. El taller "${ws.name}" es tipo ${ws.type}.`
    );
  }

  const wt = findWorkType(workTypeId);
  const required = {
    bodywork: wt.bodyworkHours,
    prep: wt.prepHours,
    paint: wt.paintHours,
  };

  const MAX_DAYS = 90;
  const start = new Date();
  start.setDate(start.getDate() + 1); // empezar desde mañana

  for (let i = 0; i < MAX_DAYS; i++) {
    const candidate = new Date(start);
    candidate.setDate(start.getDate() + i);

    const dow = candidate.getDay();
    if (dow === 0 || dow === 6) continue; // skip fin de semana

    const dateStr = candidate.toISOString().split('T')[0];
    const cap = calcBodyshopCapacity(workshopId, dateStr);

    const availBW   = cap.byProcess.BODYWORK.availableHours;
    const availPrep = cap.byProcess.PREP.availableHours;
    const availPaint = cap.byProcess.PAINT.availableHours;

    if (availBW >= required.bodywork && availPrep >= required.prep && availPaint >= required.paint) {
      return {
        workshopId,
        workTypeId,
        workTypeName: wt.name,
        aptDate: dateStr,
        requiredHours: required,
        availableOnDate: {
          bodywork: round(availBW),
          prep: round(availPrep),
          paint: round(availPaint),
        },
        daysSearched: i + 1,
      };
    }
  }

  throw new Error(
    `No se encontró fecha disponible para "${wt.name}" en los próximos ${MAX_DAYS} días.`
  );
}

// ─── SUMMARIZE WORKSHOP ───────────────────────────────────────────────────────

export interface WorkshopSummary {
  id: string;
  name: string;
  type: string;
  config: {
    totalTechnicians: number;
    hoursPerDay: number;
    workingDaysPerMonth: number;
    presenceRate: number;
    productivityRate: number;
    lostHoursRate: number;
    bufferRate: number;
  };
  calculated: {
    theoreticalMonthly: number;
    realMonthly: number;
    commercializableMonthly: number;
    commercializableDaily: number;
    slotsPerDay?: number;
    byProcessDaily?: { BODYWORK: number; PREP: number; PAINT: number };
  };
}

export function summarizeWorkshop(workshopId: string): WorkshopSummary {
  const ws = findWorkshop(workshopId);
  const workingDays: number = (ws as any).workingDaysPerMonth ?? 23;

  const theoretical = ws.technicians * ws.hoursPerDay * workingDays;
  const real        = theoretical * ws.presenceRate * ws.productivityRate;
  const commercial  = real * (1 - ws.lostHoursRate) * (1 - ws.bufferRate);
  const daily       = commercial / workingDays;

  const calculated: WorkshopSummary['calculated'] = {
    theoreticalMonthly:      round(theoretical),
    realMonthly:             round(real),
    commercializableMonthly: round(commercial),
    commercializableDaily:   round(daily),
  };

  if (ws.type === 'MECHANIC' && ws.avgJobHours) {
    calculated.slotsPerDay = Math.floor(daily / ws.avgJobHours);
  }

  if (ws.type === 'BODYSHOP' && ws.processMix) {
    calculated.byProcessDaily = {
      BODYWORK: round(daily * ws.processMix.bodywork),
      PREP:     round(daily * ws.processMix.prep),
      PAINT:    round(daily * ws.processMix.paint),
    };
  }

  return {
    id:   ws.id,
    name: ws.name,
    type: ws.type,
    config: {
      totalTechnicians:  ws.technicians,
      hoursPerDay:       ws.hoursPerDay,
      workingDaysPerMonth: workingDays,
      presenceRate:      ws.presenceRate,
      productivityRate:  ws.productivityRate,
      lostHoursRate:     ws.lostHoursRate,
      bufferRate:        ws.bufferRate,
    },
    calculated,
  };
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
