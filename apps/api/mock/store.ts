import { WORKSHOPS, WorkshopMock } from './data/workshops.mock';
import { WORK_TYPES, WorkTypeMock } from './data/work-types.mock';
import {
  MECHANIC_APPOINTMENTS, BODYSHOP_APPOINTMENTS,
  MechanicAppointment, BodyshopAppointment,
} from './data/appointments.mock';

// ─── In-memory store ──────────────────────────────────────────────────────────

export const db = {
  workshops: [...WORKSHOPS],
  workTypes: [...WORK_TYPES],
  mechanicAppointments: [...MECHANIC_APPOINTMENTS],
  bodyshopAppointments: [...BODYSHOP_APPOINTMENTS],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function findWorkshop(id: string): WorkshopMock {
  const ws = db.workshops.find(w => w.id === id);
  if (!ws) throw new Error(`Workshop not found: ${id}`);
  return ws;
}

export function findWorkType(id: string): WorkTypeMock {
  const wt = db.workTypes.find(w => w.id === id);
  if (!wt) throw new Error(`WorkType not found: ${id}`);
  return wt;
}

export interface ProcessTimes {
  bodyworkHours: number;
  prepHours: number;
  paintHours: number;
  totalHours: number;
  estimatedDays: number;
}

export function getProcessTimes(workTypeId: string): ProcessTimes {
  const wt = findWorkType(workTypeId);
  return {
    bodyworkHours: wt.bodyworkHours,
    prepHours: wt.prepHours,
    paintHours: wt.paintHours,
    totalHours: wt.bodyworkHours + wt.prepHours + wt.paintHours,
    estimatedDays: wt.estimatedDays,
  };
}

export function getMechanicAppointmentsByDate(
  workshopId: string,
  dateStr: string,
): MechanicAppointment[] {
  return db.mechanicAppointments.filter(
    a => a.workshopId === workshopId &&
         a.scheduledDate === dateStr &&
         a.status !== 'CANCELLED',
  );
}

export function getBodyshopAppointmentsByDate(
  workshopId: string,
  dateStr: string,
): BodyshopAppointment[] {
  return db.bodyshopAppointments.filter(
    a => a.workshopId === workshopId &&
         a.scheduledDate === dateStr &&
         a.status !== 'CANCELLED',
  );
}

export function getSummary() {
  return {
    workshops: db.workshops.length,
    workTypes: db.workTypes.length,
    appointments: db.mechanicAppointments.length + db.bodyshopAppointments.length,
  };
}

export function addWorkshop(workshop: WorkshopMock): void {
  db.workshops.push(workshop);
}

export function removeWorkshop(id: string): void {
  const idx = db.workshops.findIndex(w => w.id === id);
  if (idx === -1) throw new Error(`Workshop not found for removal: ${id}`);
  db.workshops.splice(idx, 1);
}
