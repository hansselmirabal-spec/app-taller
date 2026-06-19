export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'receptionist';
}

export interface Specialty {
  id: string;
  name: string;
}

export interface Technician {
  id: string;
  name: string;
  dailyHours: number;
  active: boolean;
  specialtyId?: string;
  specialty?: Specialty;
}

export interface ServiceType {
  id: string;
  name: string;
  durationHours: number;
  color: string;
  active: boolean;
}

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

export interface TechnicianCapacity {
  technicianId: string;
  technicianName: string;
  dailyHours: number;
  availableHours: number;
  usedHours: number;
  absenceType: 'full' | 'half' | 'holiday' | null;
  isWorkingDay: boolean;
}

export type WeekCapacity = Record<string, TechnicianCapacity[]>;

export interface Absence {
  id: string;
  technicianId: string;
  date: string;
  type: 'full' | 'half' | 'holiday';
}
