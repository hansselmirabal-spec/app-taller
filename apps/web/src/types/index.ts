// ─── Workshop ─────────────────────────────────────────────────────────────────

export type WorkshopType = 'MECHANIC' | 'BODYSHOP';

export interface DaySchedule {
  working: boolean;
  hours?: number; // undefined = jornada completa; número = horas parciales (ej. 4 = hasta las 12h)
}

export type WeekDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type WeeklySchedule = Record<WeekDay, DaySchedule>;

export const DEFAULT_WEEKLY_SCHEDULE: WeeklySchedule = {
  mon: { working: true },
  tue: { working: true },
  wed: { working: true },
  thu: { working: true },
  fri: { working: true },
  sat: { working: false },
  sun: { working: false },
};

export interface WorkshopConfig {
  presenceRate: number;
  productivityRate: number;
  lostHoursRate: number;
  bufferRate: number;
  avgJobHours?: number;                                         // MECHANIC only
  processMix?: { bodywork: number; prep: number; paint: number }; // BODYSHOP fallback
  // Si se definen, el motor calcula capacidad sumando horas reales de esos técnicos
  processSpecialtyIds?: {
    BODYWORK: string[];
    PREP:     string[];
    PAINT:    string[];
  };
  weeklySchedule?: WeeklySchedule;
  lunchBreak?: { enabled: boolean; start: string; end: string };
  dmsIntegration?: { dmsSucursalId?: string; dmsSucursalNombre?: string };
}

export interface Workshop {
  id: string;
  name: string;
  address?: string;
  active: boolean;
  type?: WorkshopType;   // optional para compat hacia atrás → default MECHANIC
  dmsBranch?: string | null; // sucursal del DMS Condor que filtra las OTs visibles
  alertAtrasoDays?: number;  // umbral en días para marcar OT como en atraso (default 30)
  alertCriticoDays?: number; // umbral en días para marcar OT como crítica (default 60)
  config?: WorkshopConfig;
}

// ─── Permissions / Roles ─────────────────────────────────────────────────────

export type ModuleId = 'dashboard' | 'capacity' | 'appointments' | 'kanban' | 'reports' | 'settings' | 'presupuesto' | 'documentation' | 'recursos' | 'seguimiento';

export interface ModulePermission {
  view: boolean;
  edit: boolean;
}

export type Permissions = Record<ModuleId, ModulePermission>;

export interface Role {
  id: string;
  name: string;
  permissions: Permissions;
  active: boolean;
  createdAt?: string;
}

// ─── Users / Auth ─────────────────────────────────────────────────────────────

export interface BudgetProcess {
  code: string;
  name: string;
  hours: number;
}

export interface BudgetAppointment {
  id: string;
  workshopId: string;
  date: string;
  timeStart: string;
  timeEnd: string;
  peritoId: string;
  perito?: { id: string; name: string };
  customerName: string;
  plate: string;
  phone: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  processes: BudgetProcess[] | null;
  notes: string | null;
  budgetNumber: string | null;
  linkedEntryId: string | null;
  rejectionReason: string | null;
  createdBy: string;
  createdAt: string;
}

export interface OperationalBlock {
  id: string;
  workshopId: string;
  date: string;
  timeStart: string;
  timeEnd: string;
  type: 'meeting' | 'cleaning' | 'break' | 'maintenance' | 'other';
  reason: string;
  createdBy: string;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'admin_taller' | 'receptionist' | 'perito';
  active: boolean;
  mustChangePassword?: boolean;
  roleId?: string | null;
  customRole?: Role | null;
  allowedWorkshopIds?: string[] | null;
  permissions?: Permissions;
  createdAt?: string;
}

// ─── Specialties / Technicians ────────────────────────────────────────────────

export interface Specialty {
  id: string;
  name: string;
}

export interface Technician {
  id: string;
  name: string;
  dailyHours: number;
  active: boolean;
  specialty?: string | null;
  box?: string | null;
  workshopName?: string | null;
  monthlyTargetHours?: number;
  dmsAdvisorCode?: string | null;
}

// ─── Service Types (MECHANIC) ────────────────────────────────────────────────

export interface ServiceType {
  id: string;
  name: string;
  durationHours: number;
  color: string;
  active: boolean;
  specialtyId?: string;
  specialty?: Specialty;
  specialtyName?: string | null;
}

// ─── Work Types (BODYSHOP) ────────────────────────────────────────────────────

export type WorkSeverity = 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'MULTIPLE';

export interface WorkType {
  id: string;
  workshopId: string;
  name: string;
  severity: WorkSeverity;
  estimatedDays: number;
  bodyworkHours: number;
  prepHours: number;
  paintHours: number;
  color: string;
}

// ─── Appointment (MECHANIC) ───────────────────────────────────────────────────

export interface Appointment {
  id: string;
  date: string;
  timeStart: string;
  timeEnd: string;
  technicianId: string;
  technician: Technician;
  serviceTypeId: string;
  serviceType: ServiceType;
  customerName: string;
  plate: string;
  status: 'scheduled' | 'in_progress' | 'done' | 'cancelled';
  notes?: string;
}

// ─── Bodyshop Entry (BODYSHOP turno) ─────────────────────────────────────────

export type BodyshopChannel = 'walk_in' | 'phone' | 'online' | 'insurance';

export interface ProcessTechAssignment {
  technicianId: string;
  technician?: Technician;
}

export interface BodyshopEntry {
  id: string;
  workshopId: string;
  date: string;           // fecha de ingreso
  workTypeId: string | null;
  workType: WorkType | null;
  customerName: string;
  plate: string;
  status: 'scheduled' | 'in_progress' | 'done' | 'cancelled';
  bodyworkHours: number;
  prepHours: number;
  paintHours: number;
  stayDays: number;
  channel: BodyshopChannel;
  timeStart?: string | null;
  estimatedFinishDate?: string | null;
  notes?: string;
  // Técnico global (lead / fallback)
  technicianId?: string;
  technician?: Technician;
  // Técnico por proceso — un técnico responsable por cada proceso
  processTechs?: {
    BODYWORK?: ProcessTechAssignment;
    PREP?:     ProcessTechAssignment;
    PAINT?:    ProcessTechAssignment;
  };
  // Resultado del push al DMS Condor (sólo presente en la respuesta de creación)
  dmsSync?: { success: boolean; dmsId?: string; error?: string };
}

// ─── Capacity — MECHANIC ──────────────────────────────────────────────────────

export interface TechnicianCapacity {
  technicianId: string;
  technicianName: string;
  dailyHours: number;
  availableHours: number;
  usedHours: number;
  absenceType: 'full' | 'half' | 'holiday' | 'partial' | null;
  isWorkingDay: boolean;
  blockedFrom?: string;
  blockedTo?: string;
  absenceReason?: string;
}

export type WeekCapacity = Record<string, TechnicianCapacity[]>;

// ─── Capacity — BODYSHOP ──────────────────────────────────────────────────────

export type CapacityStatus = 'OK' | 'RISK' | 'OVERLOADED';

export interface ProcessCapacity {
  process: 'BODYWORK' | 'PREP' | 'PAINT';
  label: string;
  commercializableHours: number;
  occupiedHours: number;
  availableHours: number;
  occupancyRate: number;
  status: CapacityStatus;
}

export interface BodyshopTechDayCapacity {
  technicianId: string;
  technicianName: string;
  specialty: string | null;
  process: 'BODYWORK' | 'PREP' | 'PAINT' | null;
  dailyHours: number;
  availableHours: number;
  usedHours: number;
  absenceType: string | null;
  isWorkingDay: boolean;
}

export interface BodyshopDayCapacity {
  workshopId: string;
  date: string;
  commercializableTotal: number;
  byProcess: { BODYWORK: ProcessCapacity; PREP: ProcessCapacity; PAINT: ProcessCapacity };
  byTechnician: BodyshopTechDayCapacity[];
  globalOccupancyRate: number;
  globalStatus: CapacityStatus;
  entries: BodyshopEntry[];
  pendingBudgets: number;
}

export type BodyshopWeekCapacity = Record<string, BodyshopDayCapacity>;

// ─── Absence ──────────────────────────────────────────────────────────────────

export interface Absence {
  id: string;
  technicianId: string;
  date: string;
  type: 'full' | 'half' | 'holiday' | 'partial';
  timeStart?: string;
  timeEnd?: string;
  reason?: string;
}

export interface TechnicianBlock {
  from: string;
  to: string;
  reason: string;
}

// ─── Bodyshop Catalog ─────────────────────────────────────────────────────────

export interface BodyshopCatalogPiece {
  id: string;
  code: string;
  label: string;
  groupId: string | null;
}

export interface BodyshopCatalogGroup {
  id: string;
  code: string;
  label: string;
  pieces: BodyshopCatalogPiece[];
}

export interface BodyshopCatalogProcess {
  id: string;
  code: string;
  label: string;
  order: number;
}

export interface BodyshopCatalogGrade {
  id: string;
  code: string;
  label: string;
  factor: number | null;
}
