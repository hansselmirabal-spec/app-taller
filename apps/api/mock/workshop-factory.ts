import { WorkshopMock } from './data/workshops.mock';
import { addWorkshop } from './store';

// ─── Generador de IDs ─────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Validaciones comunes ─────────────────────────────────────────────────────

function validateCommon(totalTechnicians: number, hoursPerDay: number): void {
  if (totalTechnicians < 2) {
    throw new Error(`Mínimo 2 técnicos requeridos. Recibido: ${totalTechnicians}`);
  }
  if (hoursPerDay < 4 || hoursPerDay > 12) {
    throw new Error(`hoursPerDay fuera de rango (4–12). Recibido: ${hoursPerDay}`);
  }
}

// ─── MECHANIC ─────────────────────────────────────────────────────────────────

export interface CreateMechanicParams {
  name: string;
  totalTechnicians: number;
  hoursPerDay: number;
  workingDaysPerMonth?: number;
  presenceRate?: number;
  productivityRate?: number;
  lostHoursRate?: number;
  bufferRate?: number;
  avgJobHours?: number;
}

export function createMechanicWorkshop(params: CreateMechanicParams): WorkshopMock {
  const {
    name,
    totalTechnicians,
    hoursPerDay,
    workingDaysPerMonth = 23,
    presenceRate       = 0.92,
    productivityRate   = 0.85,
    lostHoursRate      = 0.05,
    bufferRate         = 0.10,
    avgJobHours        = 3.5,
  } = params;

  validateCommon(totalTechnicians, hoursPerDay);

  const workshop: WorkshopMock = {
    id: generateId('ws-mechanic'),
    name,
    type: 'MECHANIC',
    technicians: totalTechnicians,
    hoursPerDay,
    presenceRate,
    productivityRate,
    lostHoursRate,
    bufferRate,
    avgJobHours,
    // guardamos workingDaysPerMonth en la extensión del tipo
    ...(workingDaysPerMonth !== 23 ? { workingDaysPerMonth } : { workingDaysPerMonth }),
  } as WorkshopMock & { workingDaysPerMonth: number };

  (workshop as any).workingDaysPerMonth = workingDaysPerMonth;

  addWorkshop(workshop);
  return workshop;
}

// ─── BODYSHOP ─────────────────────────────────────────────────────────────────

export interface CreateBodyshopParams {
  name: string;
  totalTechnicians: number;
  hoursPerDay: number;
  workingDaysPerMonth?: number;
  presenceRate?: number;
  productivityRate?: number;
  lostHoursRate?: number;
  bufferRate?: number;
  mixBodywork?: number;
  mixPrep?: number;
  mixPaint?: number;
}

export function createBodyshopWorkshop(params: CreateBodyshopParams): WorkshopMock {
  const {
    name,
    totalTechnicians,
    hoursPerDay,
    workingDaysPerMonth = 23,
    presenceRate        = 0.90,
    productivityRate    = 0.82,
    lostHoursRate       = 0.06,
    bufferRate          = 0.12,
    mixBodywork         = 0.45,
    mixPrep             = 0.30,
    mixPaint            = 0.25,
  } = params;

  validateCommon(totalTechnicians, hoursPerDay);

  const mixTotal = round2(mixBodywork + mixPrep + mixPaint);
  if (Math.abs(mixTotal - 1.0) > 0.01) {
    throw new Error(`El mix de procesos debe sumar 1.0. Actual: ${mixTotal.toFixed(2)}`);
  }

  const workshop: WorkshopMock = {
    id: generateId('ws-bodyshop'),
    name,
    type: 'BODYSHOP',
    technicians: totalTechnicians,
    hoursPerDay,
    presenceRate,
    productivityRate,
    lostHoursRate,
    bufferRate,
    processMix: {
      bodywork: mixBodywork,
      prep:     mixPrep,
      paint:    mixPaint,
    },
  } as WorkshopMock;

  (workshop as any).workingDaysPerMonth = workingDaysPerMonth;

  addWorkshop(workshop);
  return workshop;
}
