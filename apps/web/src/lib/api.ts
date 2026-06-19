/**
 * API layer. MOCK_MODE=true → devuelve datos locales.
 * Para conectar backend: setear NEXT_PUBLIC_MOCK_MODE=false
 */
import {
  MOCK_TECHNICIANS, MOCK_SERVICE_TYPES, MOCK_APPOINTMENTS,
  MOCK_ABSENCES, getMockCapacity, MOCK_SPECIALTIES,
} from './mock-data';
import type { Technician, ServiceType, Appointment, TechnicianCapacity, Absence, Specialty } from '@/types';

const MOCK = process.env.NEXT_PUBLIC_MOCK_MODE !== 'false';
const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

function delay<T>(data: T): Promise<T> {
  return new Promise(r => setTimeout(() => r(data), 150));
}

async function http<T>(path: string, options?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Request failed');
  }
  const json = await res.json();
  return json.data;
}

// ─── AUTH ────────────────────────────────────────────────────────────────────

export async function login(email: string, password: string) {
  if (MOCK) {
    const users: Record<string, any> = {
      'admin@taller.com': { id: 'u1', name: 'Administrador', email: 'admin@taller.com', role: 'admin' },
      'recepcion@taller.com': { id: 'u2', name: 'Recepcion', email: 'recepcion@taller.com', role: 'receptionist' },
    };
    const user = users[email];
    if (!user) throw new Error('Credenciales incorrectas');
    return delay({ access_token: 'mock-token', user });
  }
  return http<{ access_token: string; user: any }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

// ─── TECHNICIANS ─────────────────────────────────────────────────────────────

export async function getTechnicians(): Promise<Technician[]> {
  if (MOCK) return delay(MOCK_TECHNICIANS);
  return http<Technician[]>('/technicians');
}

export async function createTechnician(data: { name: string; dailyHours?: number; specialtyId?: string }): Promise<Technician> {
  if (MOCK) {
    const specialty = data.specialtyId ? MOCK_SPECIALTIES.find(s => s.id === data.specialtyId) : undefined;
    const t: Technician = { id: `t${Date.now()}`, active: true, dailyHours: 8, ...data, specialty };
    MOCK_TECHNICIANS.push(t);
    return delay(t);
  }
  return http<Technician>('/technicians', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateTechnician(id: string, data: Partial<Technician>): Promise<Technician> {
  if (MOCK) {
    const idx = MOCK_TECHNICIANS.findIndex(t => t.id === id);
    if (idx !== -1) {
      Object.assign(MOCK_TECHNICIANS[idx], data);
      if (data.specialtyId !== undefined) {
        MOCK_TECHNICIANS[idx].specialty = MOCK_SPECIALTIES.find(s => s.id === data.specialtyId);
      }
    }
    return delay(MOCK_TECHNICIANS[idx]);
  }
  return http<Technician>(`/technicians/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

// ─── SPECIALTIES ─────────────────────────────────────────────────────────────

export async function getSpecialties(): Promise<Specialty[]> {
  if (MOCK) return delay(MOCK_SPECIALTIES);
  return http<Specialty[]>('/specialties');
}

export async function createSpecialty(data: { name: string }): Promise<Specialty> {
  if (MOCK) {
    const sp: Specialty = { id: `sp${Date.now()}`, ...data };
    MOCK_SPECIALTIES.push(sp);
    return delay(sp);
  }
  return http<Specialty>('/specialties', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateSpecialty(id: string, data: { name: string }): Promise<Specialty> {
  if (MOCK) {
    const idx = MOCK_SPECIALTIES.findIndex(s => s.id === id);
    if (idx !== -1) Object.assign(MOCK_SPECIALTIES[idx], data);
    return delay(MOCK_SPECIALTIES[idx]);
  }
  return http<Specialty>(`/specialties/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteSpecialty(id: string): Promise<void> {
  if (MOCK) {
    const idx = MOCK_SPECIALTIES.findIndex(s => s.id === id);
    if (idx !== -1) MOCK_SPECIALTIES.splice(idx, 1);
    return delay(undefined);
  }
  await http(`/specialties/${id}`, { method: 'DELETE' });
}

// ─── SERVICE TYPES ───────────────────────────────────────────────────────────

export async function getServiceTypes(): Promise<ServiceType[]> {
  if (MOCK) return delay(MOCK_SERVICE_TYPES);
  return http<ServiceType[]>('/service-types');
}

export async function createServiceType(data: Omit<ServiceType, 'id' | 'active'>): Promise<ServiceType> {
  if (MOCK) {
    const st: ServiceType = { id: `st${Date.now()}`, active: true, ...data };
    MOCK_SERVICE_TYPES.push(st);
    return delay(st);
  }
  return http<ServiceType>('/service-types', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateServiceType(id: string, data: Partial<ServiceType>): Promise<ServiceType> {
  if (MOCK) {
    const idx = MOCK_SERVICE_TYPES.findIndex(s => s.id === id);
    if (idx !== -1) Object.assign(MOCK_SERVICE_TYPES[idx], data);
    return delay(MOCK_SERVICE_TYPES[idx]);
  }
  return http<ServiceType>(`/service-types/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

// ─── CAPACITY ────────────────────────────────────────────────────────────────

export async function getDailyCapacity(date: string): Promise<TechnicianCapacity[]> {
  if (MOCK) return delay(getMockCapacity(date));
  return http<TechnicianCapacity[]>(`/capacity?date=${date}`);
}

export async function getWeekCapacity(from: string, to: string): Promise<Record<string, TechnicianCapacity[]>> {
  if (MOCK) {
    const result: Record<string, TechnicianCapacity[]> = {};
    const current = new Date(from + 'T12:00:00');
    const end = new Date(to + 'T12:00:00');
    while (current <= end) {
      const d = current.toISOString().split('T')[0];
      result[d] = getMockCapacity(d);
      current.setDate(current.getDate() + 1);
    }
    return delay(result);
  }
  return http<Record<string, TechnicianCapacity[]>>(`/capacity?from=${from}&to=${to}`);
}

export async function createAbsence(data: Omit<Absence, 'id'>): Promise<Absence> {
  if (MOCK) {
    const ab: Absence = { id: `ab${Date.now()}`, ...data };
    MOCK_ABSENCES.push(ab);
    return delay(ab);
  }
  return http<Absence>('/capacity/absences', { method: 'POST', body: JSON.stringify(data) });
}

export async function deleteAbsence(id: string): Promise<void> {
  if (MOCK) {
    const idx = MOCK_ABSENCES.findIndex(a => a.id === id);
    if (idx !== -1) MOCK_ABSENCES.splice(idx, 1);
    return delay(undefined);
  }
  await http(`/capacity/absences/${id}`, { method: 'DELETE' });
}

// ─── APPOINTMENTS ────────────────────────────────────────────────────────────

export async function getAppointmentsByDate(date: string): Promise<Appointment[]> {
  if (MOCK) return delay(MOCK_APPOINTMENTS.filter(a => a.date === date && a.status !== 'cancelled'));
  return http<Appointment[]>(`/appointments?date=${date}`);
}

export async function getAppointmentsByRange(from: string, to: string): Promise<Appointment[]> {
  if (MOCK) return delay(MOCK_APPOINTMENTS.filter(a => a.date >= from && a.date <= to && a.status !== 'cancelled'));
  return http<Appointment[]>(`/appointments?from=${from}&to=${to}`);
}

export async function createAppointment(data: {
  date: string; timeStart: string; technicianId: string;
  serviceTypeId: string; customerName: string; plate: string; notes?: string;
}): Promise<Appointment> {
  if (MOCK) {
    const tech = MOCK_TECHNICIANS.find(t => t.id === data.technicianId)!;
    const st = MOCK_SERVICE_TYPES.find(s => s.id === data.serviceTypeId)!;
    const [h, m] = data.timeStart.split(':').map(Number);
    const endMinutes = h * 60 + m + st.durationHours * 60;
    const timeEnd = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
    const appt: Appointment = {
      id: `a${Date.now()}`, ...data, timeEnd,
      technician: tech, serviceType: st, status: 'scheduled',
    };
    MOCK_APPOINTMENTS.push(appt);
    return delay(appt);
  }
  return http<Appointment>('/appointments', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateAppointmentStatus(id: string, status: string): Promise<Appointment> {
  if (MOCK) {
    const idx = MOCK_APPOINTMENTS.findIndex(a => a.id === id);
    if (idx !== -1) MOCK_APPOINTMENTS[idx].status = status as any;
    return delay(MOCK_APPOINTMENTS[idx]);
  }
  return http<Appointment>(`/appointments/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

export async function cancelAppointment(id: string): Promise<void> {
  if (MOCK) {
    const idx = MOCK_APPOINTMENTS.findIndex(a => a.id === id);
    if (idx !== -1) MOCK_APPOINTMENTS[idx].status = 'cancelled';
    return delay(undefined);
  }
  await http(`/appointments/${id}`, { method: 'DELETE' });
}
