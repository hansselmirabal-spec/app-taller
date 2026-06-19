/**
 * API layer. MOCK_MODE=true → devuelve datos locales.
 * Para conectar backend: setear NEXT_PUBLIC_MOCK_MODE=false
 */
import {
  MOCK_WORKSHOPS, getWorkshopData, getMockCapacity,
  getBodyshopCapacity, getBodyshopWeekCapacity,
} from './mock-data';
import type {
  Technician, ServiceType, Appointment, TechnicianCapacity, Absence, Specialty, Workshop,
  WorkType, BodyshopEntry, BodyshopDayCapacity, BodyshopWeekCapacity, User, Role, Permissions,
  BodyshopCatalogGroup, BodyshopCatalogProcess, BodyshopCatalogGrade, BodyshopCatalogPiece,
} from '@/types';
import { calcMonthlyLoadReport, type TechMonthlyRow } from './bodyshop-analytics';

const MOCK = process.env.NEXT_PUBLIC_MOCK_MODE !== 'false';
const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

function delay<T>(data: T): Promise<T> {
  return new Promise(r => setTimeout(() => r(data), 150));
}

export async function http<T>(path: string, options?: RequestInit): Promise<T> {
  // Auth ahora viaja en cookie httpOnly auth_token (no leíble desde JS por XSS).
  // credentials:'include' indica al browser que mande la cookie en cada request.
  // Distinguimos 401 por path (login = credenciales inválidas, resto = sesión expirada).
  const isLoginCall = path.includes('/auth/login');
  const isPublicAuthCall = path.includes('/auth/forgot-password') || path.includes('/auth/reset-password');
  const isAuthenticatedCall = !isLoginCall && !isPublicAuthCall;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
  } catch {
    throw new Error('No se puede conectar con el servidor. Verificá tu conexión a internet o contactá al administrador.');
  }
  if (!res.ok) {
    // Intentar parse JSON; si el server responde HTML/text (proxy error, NGINX 502),
    // caemos a text() para que el mensaje sea útil en lugar del genérico.
    let msg: string | undefined;
    const ctype = res.headers.get('content-type') ?? '';
    if (ctype.includes('application/json')) {
      const body = await res.json().catch(() => ({}));
      msg = body.message || body.error;
    } else {
      const text = await res.text().catch(() => '');
      if (text && text.length < 300) msg = text.trim();
    }

    if (res.status === 401) {
      // En endpoints autenticados, 401 = sesión expirada (cookie inválida/vencida).
      // En login, 401 = credenciales inválidas (mensaje del backend).
      if (isAuthenticatedCall) throw new Error('Sesión expirada. Por favor volvé a iniciar sesión.');
      throw new Error(msg || 'Credenciales inválidas.');
    }
    if (res.status === 403) throw new Error('No tenés permisos para realizar esta acción.');
    if (res.status === 404) throw new Error('El recurso solicitado no fue encontrado.');
    if (res.status >= 500) throw new Error(msg || `Error ${res.status} del servidor. Intentá de nuevo en unos minutos.`);
    throw new Error(msg || 'Ocurrió un error al procesar la solicitud.');
  }
  const json = await res.json();
  return json.data;
}

// Endpoint de logout: el server limpia la cookie httpOnly.
// Llamado desde clearAuth() en lib/auth.ts.
export async function apiLogout(): Promise<void> {
  try {
    await fetch(`${BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch {
    // Si falla la llamada (ej. server caído), igual limpiamos localStorage en lib/auth.
  }
}

// ─── AUTH ────────────────────────────────────────────────────────────────────

import { FULL_PERMISSIONS, RECEPTIONIST_PERMISSIONS } from './permissions';

export async function login(email: string, password: string) {
  if (MOCK) {
    const users: Record<string, any> = {
      'admin@taller.com':     { id: 'u1', name: 'Administrador', email: 'admin@taller.com',     role: 'admin',        active: true, permissions: FULL_PERMISSIONS },
      'recepcion@taller.com': { id: 'u2', name: 'Recepcion',     email: 'recepcion@taller.com', role: 'receptionist', active: true, permissions: RECEPTIONIST_PERMISSIONS },
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

export async function forgotPassword(email: string): Promise<{ message: string }> {
  if (MOCK) return delay({ message: 'Si el email existe, vas a recibir un enlace.' });
  return http<{ message: string }>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
  if (MOCK) return delay({ message: 'Contraseña actualizada (mock).' });
  return http<{ message: string }>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
}

// ─── WORKSHOPS ───────────────────────────────────────────────────────────────

export async function getWorkshops(): Promise<Workshop[]> {
  if (MOCK) {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    const user = raw ? JSON.parse(raw) : null;
    if (user?.role === 'admin' || !user?.allowedWorkshopIds?.length) {
      return delay([...MOCK_WORKSHOPS]);
    }
    return delay(MOCK_WORKSHOPS.filter(w => user.allowedWorkshopIds.includes(w.id)));
  }
  return http<Workshop[]>('/workshops');
}

export async function createWorkshop(data: { name: string; address?: string; type?: Workshop['type']; dmsBranch?: string | null; alertAtrasoDays?: number; alertCriticoDays?: number }): Promise<Workshop> {
  if (MOCK) {
    const w: Workshop = { id: `w${Date.now()}`, active: true, ...data };
    MOCK_WORKSHOPS.push(w);
    return delay(w);
  }
  return http<Workshop>('/workshops', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateWorkshop(id: string, data: { name?: string; address?: string; type?: Workshop['type']; dmsBranch?: string | null; alertAtrasoDays?: number; alertCriticoDays?: number; config?: object }): Promise<Workshop> {
  if (MOCK) {
    const idx = MOCK_WORKSHOPS.findIndex(w => w.id === id);
    if (idx !== -1) Object.assign(MOCK_WORKSHOPS[idx], data);
    return delay(MOCK_WORKSHOPS[idx]);
  }
  return http<Workshop>(`/workshops/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteWorkshop(id: string): Promise<void> {
  if (MOCK) {
    const idx = MOCK_WORKSHOPS.findIndex(w => w.id === id);
    if (idx !== -1) MOCK_WORKSHOPS.splice(idx, 1);
    return delay(undefined);
  }
  await http(`/workshops/${id}`, { method: 'DELETE' });
}

// ─── TECHNICIANS ─────────────────────────────────────────────────────────────

export async function getTechnicians(workshopId: string, workshopName?: string): Promise<Technician[]> {
  if (MOCK) return delay([...getWorkshopData(workshopId).technicians]);
  const qs = workshopName ? `?workshopName=${encodeURIComponent(workshopName)}` : '';
  return http<Technician[]>(`/technicians${qs}`);
}

export async function createTechnician(
  workshopId: string,
  data: { name: string; dailyHours?: number; specialty?: string | null; box?: string | null; dmsAdvisorCode?: string | null },
  workshopName?: string,
): Promise<Technician> {
  if (MOCK) {
    const { technicians } = getWorkshopData(workshopId);
    const t: Technician = { id: `${workshopId}_t${Date.now()}`, active: true, dailyHours: 8, ...data };
    technicians.push(t);
    return delay(t);
  }
  return http<Technician>('/technicians', { method: 'POST', body: JSON.stringify({ ...data, workshopName }) });
}

export async function updateTechnician(
  workshopId: string,
  id: string,
  data: Partial<Technician>,
): Promise<Technician> {
  if (MOCK) {
    const { technicians } = getWorkshopData(workshopId);
    const idx = technicians.findIndex(t => t.id === id);
    if (idx !== -1) {
      Object.assign(technicians[idx], data);
    }
    return delay(technicians[idx]);
  }
  return http<Technician>(`/technicians/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

// ─── SPECIALTIES ─────────────────────────────────────────────────────────────

export async function getSpecialties(workshopId: string): Promise<Specialty[]> {
  if (MOCK) return delay([...getWorkshopData(workshopId).specialties]);
  return http<Specialty[]>(`/specialties?workshopId=${workshopId}`);
}

export async function createSpecialty(workshopId: string, data: { name: string }): Promise<Specialty> {
  if (MOCK) {
    const { specialties } = getWorkshopData(workshopId);
    const sp: Specialty = { id: `${workshopId}_sp${Date.now()}`, ...data };
    specialties.push(sp);
    return delay(sp);
  }
  return http<Specialty>('/specialties', { method: 'POST', body: JSON.stringify({ ...data, workshopId }) });
}

export async function updateSpecialty(workshopId: string, id: string, data: { name: string }): Promise<Specialty> {
  if (MOCK) {
    const { specialties } = getWorkshopData(workshopId);
    const idx = specialties.findIndex(s => s.id === id);
    if (idx !== -1) Object.assign(specialties[idx], data);
    return delay(specialties[idx]);
  }
  return http<Specialty>(`/specialties/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteSpecialty(workshopId: string, id: string): Promise<void> {
  if (MOCK) {
    const { specialties } = getWorkshopData(workshopId);
    const idx = specialties.findIndex(s => s.id === id);
    if (idx !== -1) specialties.splice(idx, 1);
    return delay(undefined);
  }
  await http(`/specialties/${id}`, { method: 'DELETE' });
}

// ─── SERVICE TYPES ───────────────────────────────────────────────────────────

export async function getServiceTypes(workshopId: string): Promise<ServiceType[]> {
  if (MOCK) return delay([...getWorkshopData(workshopId).serviceTypes]);
  return http<ServiceType[]>(`/service-types?workshopId=${workshopId}`);
}

export async function createServiceType(
  workshopId: string,
  data: Omit<ServiceType, 'id' | 'active'>,
): Promise<ServiceType> {
  if (MOCK) {
    const { serviceTypes } = getWorkshopData(workshopId);
    const st: ServiceType = { id: `${workshopId}_st${Date.now()}`, active: true, ...data };
    serviceTypes.push(st);
    return delay(st);
  }
  return http<ServiceType>('/service-types', { method: 'POST', body: JSON.stringify({ ...data, workshopId }) });
}

export async function updateServiceType(
  workshopId: string,
  id: string,
  data: Partial<ServiceType>,
): Promise<ServiceType> {
  if (MOCK) {
    const { serviceTypes } = getWorkshopData(workshopId);
    const idx = serviceTypes.findIndex(s => s.id === id);
    if (idx !== -1) Object.assign(serviceTypes[idx], data);
    return delay(serviceTypes[idx]);
  }
  return http<ServiceType>(`/service-types/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

// ─── CAPACITY ────────────────────────────────────────────────────────────────

export interface AvailableSlot {
  time: string;
  technicianId: string;
  technicianName: string;
  specialty: string | null;
  hasSpecialtyMatch: boolean;
}

export interface AlternativeDay {
  date: string;
  dayLabel: string;
  slotsCount: number;
  slots: AvailableSlot[];
}

export type SlotsResponse =
  | { available: true;  requestedDate: string; slotsCount: number; slots: AvailableSlot[] }
  | { available: false; requestedDate: string; reason: string; alternatives: AlternativeDay[]; searchedDays: number };

export async function getAvailableSlots(params: {
  workshopId: string;
  date: string;
  workshopType: 'MECHANIC' | 'BODYSHOP';
  durationMinutes?: number;
  serviceSpecialty?: string | null;
  bodyworkHours?: number;
  prepHours?: number;
  paintHours?: number;
  /** Buscar próximas fechas desde `date` (inclusive) sin importar si la fecha tiene cupo */
  findNext?: boolean;
}): Promise<SlotsResponse> {
  if (MOCK) {
    if (params.findNext) {
      // En modo mock: simula alternativas para el buscador proactivo
      const today = new Date();
      return delay({
        available: false as const,
        requestedDate: params.date,
        reason: 'NO_CAPACITY',
        searchedDays: 5,
        alternatives: [0, 1, 2].map(offset => {
          const d = new Date(today);
          d.setDate(d.getDate() + offset + 1);
          const dateStr = d.toISOString().split('T')[0];
          return {
            date: dateStr,
            dayLabel: `día ${d.getDate()}`,
            slotsCount: 4,
            slots: ['08:00','09:00','10:00','11:00'].map(time => ({
              time, technicianId: 'mock-tech', technicianName: 'Técnico Mock',
              specialty: null, hasSpecialtyMatch: true,
            })),
          };
        }),
      });
    }
    // En modo mock: simula que el día solicitado tiene cupo
    return delay({
      available: true as const,
      requestedDate: params.date,
      slotsCount: 8,
      slots: ['08:00','08:30','09:00','09:30','10:00','10:30','11:00','13:00'].map(time => ({
        time,
        technicianId:     'mock-tech',
        technicianName:   'Técnico Mock',
        specialty:        null,
        hasSpecialtyMatch: true,
      })),
    });
  }
  const qs = new URLSearchParams({
    workshopId:   params.workshopId,
    date:         params.date,
    workshopType: params.workshopType,
    ...(params.durationMinutes  != null ? { durationMinutes:  String(params.durationMinutes)  } : {}),
    ...(params.serviceSpecialty       ? { serviceSpecialty: params.serviceSpecialty           } : {}),
    ...(params.bodyworkHours    != null ? { bodyworkHours:    String(params.bodyworkHours)    } : {}),
    ...(params.prepHours        != null ? { prepHours:        String(params.prepHours)        } : {}),
    ...(params.paintHours       != null ? { paintHours:       String(params.paintHours)       } : {}),
    ...(params.findNext                 ? { findNext:         'true'                          } : {}),
  });
  // El endpoint /capacity/slots devuelve JSON directo (sin wrapper { data: ... }).
  // Se replica el manejo de errores de http() para cubrir 401, errores de red y HTML inesperado.
  let res: Response;
  try {
    res = await fetch(`${BASE}/capacity/slots?${qs}`, { credentials: 'include' });
  } catch {
    throw new Error('No se puede conectar con el servidor. Verificá tu conexión a internet o contactá al administrador.');
  }
  if (!res.ok) {
    let msg: string | undefined;
    const ctype = res.headers.get('content-type') ?? '';
    if (ctype.includes('application/json')) {
      const body = await res.json().catch(() => ({}));
      msg = body.message || body.error;
    } else {
      const text = await res.text().catch(() => '');
      if (text && text.length < 300) msg = text.trim();
    }
    if (res.status === 401) throw new Error('Sesión expirada. Por favor volvé a iniciar sesión.');
    if (res.status === 403) throw new Error('No tenés permisos para realizar esta acción.');
    if (res.status === 404) throw new Error('El recurso solicitado no fue encontrado.');
    if (res.status >= 500) throw new Error(msg || `Error ${res.status} del servidor. Intentá de nuevo en unos minutos.`);
    throw new Error(msg || 'Error al consultar disponibilidad.');
  }
  return res.json() as Promise<SlotsResponse>;
}

export async function getDailyCapacity(workshopId: string, date: string): Promise<TechnicianCapacity[]> {
  if (MOCK) return delay(getMockCapacity(date, workshopId));
  return http<TechnicianCapacity[]>(`/capacity?date=${date}&workshopId=${workshopId}`);
}

export async function getWeekCapacity(
  workshopId: string,
  from: string,
  to: string,
): Promise<Record<string, TechnicianCapacity[]>> {
  if (MOCK) {
    const result: Record<string, TechnicianCapacity[]> = {};
    const current = new Date(from + 'T12:00:00');
    const end = new Date(to + 'T12:00:00');
    while (current <= end) {
      const d = current.toISOString().split('T')[0];
      result[d] = getMockCapacity(d, workshopId);
      current.setDate(current.getDate() + 1);
    }
    return delay(result);
  }
  return http<Record<string, TechnicianCapacity[]>>(`/capacity?from=${from}&to=${to}&workshopId=${workshopId}`);
}

export async function getAbsences(workshopId: string): Promise<Absence[]> {
  if (MOCK) {
    const { absences } = getWorkshopData(workshopId);
    return delay([...absences]);
  }
  return http<Absence[]>('/capacity/absences');
}

export async function createAbsence(workshopId: string, data: Omit<Absence, 'id'>): Promise<Absence> {
  if (MOCK) {
    const { absences } = getWorkshopData(workshopId);
    const ab: Absence = { id: `${workshopId}_ab${Date.now()}`, ...data };
    absences.push(ab);
    return delay(ab);
  }
  return http<Absence>('/capacity/absences', { method: 'POST', body: JSON.stringify({ ...data, workshopId }) });
}

export async function deleteAbsence(workshopId: string, id: string): Promise<void> {
  if (MOCK) {
    const { absences } = getWorkshopData(workshopId);
    const idx = absences.findIndex(a => a.id === id);
    if (idx !== -1) absences.splice(idx, 1);
    return delay(undefined);
  }
  await http(`/capacity/absences/${id}`, { method: 'DELETE' });
}

// ─── APPOINTMENTS ────────────────────────────────────────────────────────────

// PostgreSQL devuelve time como "HH:MM:SS" — normalizar a "HH:MM"
function normalizeAppt(a: Appointment): Appointment {
  return {
    ...a,
    timeStart: a.timeStart?.slice(0, 5) ?? a.timeStart,
    timeEnd:   a.timeEnd?.slice(0, 5)   ?? a.timeEnd,
  };
}

export async function getAppointmentsByDate(workshopId: string, date: string): Promise<Appointment[]> {
  if (MOCK) {
    return delay(
      getWorkshopData(workshopId).appointments.filter(a => a.date === date && a.status !== 'cancelled'),
    );
  }
  const rows = await http<Appointment[]>(`/appointments?date=${date}&workshopId=${workshopId}`);
  return rows.map(normalizeAppt);
}

export async function getAppointmentsByRange(workshopId: string, from: string, to: string): Promise<Appointment[]> {
  if (MOCK) {
    return delay(
      getWorkshopData(workshopId).appointments.filter(
        a => a.date >= from && a.date <= to && a.status !== 'cancelled',
      ),
    );
  }
  const rows = await http<Appointment[]>(`/appointments?from=${from}&to=${to}&workshopId=${workshopId}`);
  return rows.map(normalizeAppt);
}

export async function createAppointment(
  workshopId: string,
  data: {
    date: string; timeStart: string; technicianId: string;
    serviceTypeId: string; customerName: string; plate: string; notes?: string;
  },
): Promise<Appointment> {
  if (MOCK) {
    const { technicians, serviceTypes, appointments } = getWorkshopData(workshopId);
    const tech = technicians.find(t => t.id === data.technicianId)!;
    const st = serviceTypes.find(s => s.id === data.serviceTypeId)!;
    const [h, m] = data.timeStart.split(':').map(Number);
    const endMinutes = h * 60 + m + st.durationHours * 60;
    const timeEnd = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
    const appt: Appointment = {
      id: `${workshopId}_a${Date.now()}`, ...data, timeEnd,
      technician: tech, serviceType: st, status: 'scheduled',
    };
    appointments.push(appt);
    return delay(appt);
  }
  return http<Appointment>('/appointments', { method: 'POST', body: JSON.stringify({ ...data, workshopId }) });
}

export async function updateAppointmentStatus(
  workshopId: string,
  id: string,
  status: string,
): Promise<Appointment> {
  if (MOCK) {
    const { appointments } = getWorkshopData(workshopId);
    const idx = appointments.findIndex(a => a.id === id);
    if (idx !== -1) appointments[idx].status = status as any;
    return delay(appointments[idx]);
  }
  return http<Appointment>(`/appointments/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

export async function patchAppointment(
  workshopId: string,
  id: string,
  data: { timeEnd?: string; customerName?: string; plate?: string; notes?: string },
): Promise<Appointment> {
  if (MOCK) {
    const { appointments } = getWorkshopData(workshopId);
    const idx = appointments.findIndex(a => a.id === id);
    if (idx !== -1) Object.assign(appointments[idx], data);
    return delay(appointments[idx]);
  }
  return http<Appointment>(`/appointments/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function cancelAppointment(workshopId: string, id: string): Promise<void> {
  if (MOCK) {
    const { appointments } = getWorkshopData(workshopId);
    const idx = appointments.findIndex(a => a.id === id);
    if (idx !== -1) appointments[idx].status = 'cancelled';
    return delay(undefined);
  }
  await http(`/appointments/${id}`, { method: 'DELETE' });
}

export async function rescheduleAppointment(
  workshopId: string,
  id: string,
  data: { date: string; timeStart: string; technicianId: string },
): Promise<Appointment> {
  if (MOCK) {
    const ws = getWorkshopData(workshopId);
    const idx = ws.appointments.findIndex(a => a.id === id);
    if (idx === -1) throw new Error('Turno no encontrado');
    const appt = ws.appointments[idx];
    // Recalcular timeEnd según duración del servicio
    const [h, m] = data.timeStart.split(':').map(Number);
    const durationMin = appt.serviceType.durationHours * 60;
    const endMin = h * 60 + m + durationMin;
    const timeEnd = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
    // Detectar conflicto con otro turno del mismo técnico en ese horario
    const conflict = ws.appointments.find(a =>
      a.id !== id &&
      a.status !== 'cancelled' &&
      a.date === data.date &&
      a.technicianId === data.technicianId &&
      timeToMinutes(data.timeStart) < timeToMinutes(a.timeEnd) &&
      timeToMinutes(timeEnd) > timeToMinutes(a.timeStart),
    );
    if (conflict) throw new Error(`Conflicto con ${conflict.customerName} (${conflict.timeStart}–${conflict.timeEnd})`);
    const tech = ws.technicians.find(t => t.id === data.technicianId);
    ws.appointments[idx] = {
      ...appt,
      date: data.date,
      timeStart: data.timeStart,
      timeEnd,
      technicianId: data.technicianId,
      technician: tech ?? appt.technician,
    };
    return delay(ws.appointments[idx]);
  }
  return http<Appointment>(`/appointments/${id}/reschedule`, { method: 'PATCH', body: JSON.stringify(data) });
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// ─── BODYSHOP ─────────────────────────────────────────────────────────────────

export async function getWorkTypes(workshopId: string): Promise<WorkType[]> {
  if (MOCK) {
    const { workTypes = [] } = getWorkshopData(workshopId);
    return delay([...workTypes]);
  }
  return http<WorkType[]>(`/work-types?workshopId=${workshopId}`);
}

export async function createWorkType(
  workshopId: string,
  data: Omit<WorkType, 'id' | 'workshopId'>,
): Promise<WorkType> {
  if (MOCK) {
    const ws = getWorkshopData(workshopId);
    const wt: WorkType = { ...data, id: `${workshopId}_wt${Date.now()}`, workshopId };
    ws.workTypes = ws.workTypes ?? [];
    ws.workTypes.push(wt);
    return delay(wt);
  }
  return http<WorkType>('/work-types', { method: 'POST', body: JSON.stringify({ ...data, workshopId }) });
}

export async function updateWorkType(
  workshopId: string,
  id: string,
  data: Partial<Omit<WorkType, 'id' | 'workshopId'>>,
): Promise<WorkType> {
  if (MOCK) {
    const ws = getWorkshopData(workshopId);
    const wt = (ws.workTypes ?? []).find(w => w.id === id);
    if (!wt) throw new Error('Tipo de trabajo no encontrado');
    Object.assign(wt, data);
    return delay({ ...wt });
  }
  return http<WorkType>(`/work-types/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteWorkType(workshopId: string, id: string): Promise<void> {
  if (MOCK) {
    const ws = getWorkshopData(workshopId);
    ws.workTypes = (ws.workTypes ?? []).filter(w => w.id !== id);
    return delay(undefined);
  }
  await http(`/work-types/${id}`, { method: 'DELETE' });
}

export interface BodyshopTechAvailability {
  id: string;
  name: string;
  specialty: string | null;
  process: 'BODYWORK' | 'PREP' | 'PAINT' | null;
  dailyHours: number;
  hoursAssigned: number;
  hoursFree: number;
  overhour: boolean;
  absenceLabel: string | null;
}

export async function getBodyshopTechAvailability(workshopId: string, date: string): Promise<BodyshopTechAvailability[]> {
  if (MOCK) {
    const ws = getWorkshopData(workshopId);
    const specIds = ws.config?.processSpecialtyIds;
    return delay(ws.technicians.filter(t => t.active).map(t => {
      const sp = (t.specialty ?? '').toUpperCase();
      let proc: BodyshopTechAvailability['process'] = null;
      if (specIds) {
        if (specIds.BODYWORK.includes(sp)) proc = 'BODYWORK';
        else if (specIds.PREP.includes(sp)) proc = 'PREP';
        else if (specIds.PAINT.includes(sp)) proc = 'PAINT';
      }
      return { id: t.id, name: t.name, specialty: t.specialty ?? null, process: proc, dailyHours: t.dailyHours, hoursAssigned: 0, hoursFree: t.dailyHours, overhour: false, absenceLabel: null };
    }));
  }
  return http<BodyshopTechAvailability[]>(`/bodyshop/tech-availability?workshopId=${workshopId}&date=${date}`);
}

export async function getBodyshopDayCapacity(workshopId: string, date: string): Promise<BodyshopDayCapacity> {
  if (MOCK) return delay(getBodyshopCapacity(date, workshopId));
  return http<BodyshopDayCapacity>(`/capacity/bodyshop?workshopId=${workshopId}&date=${date}`);
}

export async function getBodyshopWeek(workshopId: string, from: string, to: string): Promise<BodyshopWeekCapacity> {
  if (MOCK) return delay(getBodyshopWeekCapacity(from, to, workshopId));
  return http<BodyshopWeekCapacity>(`/capacity/bodyshop/week?workshopId=${workshopId}&from=${from}&to=${to}`);
}

export async function createBodyshopEntry(
  workshopId: string,
  data: Omit<BodyshopEntry, 'id' | 'workType'>,
): Promise<BodyshopEntry> {
  if (MOCK) {
    const ws       = getWorkshopData(workshopId);
    const workType = (ws.workTypes ?? []).find(wt => wt.id === data.workTypeId)!;
    const entry: BodyshopEntry = { ...data, id: `${workshopId}_be${Date.now()}`, workType };

    // Auto-asignar técnico por especialidad al crear
    const specIds = ws.config?.processSpecialtyIds;
    if (specIds && ws.technicians.length > 0) {
      const pick = (ids: string[]) => ws.technicians.find(t => t.active && ids.includes((t.specialty ?? '').toUpperCase()));
      entry.processTechs = {};
      const bw = pick(specIds.BODYWORK);
      const pr = pick(specIds.PREP);
      const pa = pick(specIds.PAINT);
      if (bw && entry.bodyworkHours > 0) entry.processTechs.BODYWORK = { technicianId: bw.id, technician: bw };
      if (pr && entry.prepHours > 0)     entry.processTechs.PREP     = { technicianId: pr.id, technician: pr };
      if (pa && entry.paintHours > 0)    entry.processTechs.PAINT    = { technicianId: pa.id, technician: pa };
    }

    ws.bodyshopEntries = ws.bodyshopEntries ?? [];
    ws.bodyshopEntries.push(entry);
    return delay(entry);
  }
  return http<BodyshopEntry>('/bodyshop/entries', { method: 'POST', body: JSON.stringify({ ...data, workshopId }) });
}

export async function cancelBodyshopEntry(workshopId: string, id: string): Promise<void> {
  if (MOCK) {
    const ws = getWorkshopData(workshopId);
    const entry = (ws.bodyshopEntries ?? []).find(e => e.id === id);
    if (entry) entry.status = 'cancelled';
    return delay(undefined);
  }
  await http(`/bodyshop/entries/${id}/cancel`, { method: 'PATCH' });
}

// ─── KANBAN ──────────────────────────────────────────────────────────────────

export async function getAppointmentsKanban(workshopId: string, from: string, to: string): Promise<Appointment[]> {
  if (MOCK) {
    return delay(
      getWorkshopData(workshopId).appointments.filter(a => a.date >= from && a.date <= to),
    );
  }
  const rows = await http<Appointment[]>(`/appointments?from=${from}&to=${to}&workshopId=${workshopId}&includeAll=true`);
  return rows.map(normalizeAppt);
}

export async function getBodyshopEntriesByRange(workshopId: string, from: string, to: string): Promise<BodyshopEntry[]> {
  if (MOCK) {
    const ws = getWorkshopData(workshopId);
    return delay((ws.bodyshopEntries ?? []).filter(e => {
      // Overlap: entry [date, date+stayDays) intersects [from, to]
      const entryEnd = new Date(e.date + 'T00:00:00');
      entryEnd.setDate(entryEnd.getDate() + (e.stayDays ?? 1) - 1);
      const entryEndStr = entryEnd.toISOString().substring(0, 10);
      return e.date <= to && entryEndStr >= from;
    }));
  }
  return http<BodyshopEntry[]>(`/bodyshop/entries?workshopId=${workshopId}&from=${from}&to=${to}`);
}

export async function updateBodyshopEntryStatus(
  workshopId: string,
  id: string,
  status: BodyshopEntry['status'],
): Promise<BodyshopEntry> {
  if (MOCK) {
    const ws = getWorkshopData(workshopId);
    const entry = (ws.bodyshopEntries ?? []).find(e => e.id === id);
    if (!entry) throw new Error('Ingreso no encontrado');
    entry.status = status;
    return delay({ ...entry });
  }
  return http<BodyshopEntry>(`/bodyshop/entries/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

export async function patchBodyshopEntryHours(
  workshopId: string,
  id: string,
  dto: { bodyworkHours?: number; prepHours?: number; paintHours?: number; stayDays?: number },
): Promise<BodyshopEntry> {
  if (MOCK) {
    const ws = getWorkshopData(workshopId);
    const entry = (ws.bodyshopEntries ?? []).find(e => e.id === id);
    if (!entry) throw new Error('Ingreso no encontrado');
    Object.assign(entry, dto);
    return delay({ ...entry });
  }
  return http<BodyshopEntry>(`/bodyshop/entries/${id}/hours`, { method: 'PATCH', body: JSON.stringify(dto) });
}

export async function assignBodyshopTechnician(
  workshopId: string,
  entryId: string,
  technicianId: string | null,
): Promise<BodyshopEntry> {
  if (MOCK) {
    const ws    = getWorkshopData(workshopId);
    const entry = (ws.bodyshopEntries ?? []).find(e => e.id === entryId);
    if (!entry) throw new Error('Ingreso no encontrado');
    const tech  = technicianId
      ? ws.technicians.find(t => t.id === technicianId) ?? null
      : null;
    entry.technicianId = tech?.id;
    entry.technician   = tech ?? undefined;
    return delay({ ...entry });
  }
  return http<BodyshopEntry>(`/bodyshop/entries/${entryId}/technician`, {
    method: 'PATCH',
    body: JSON.stringify({ technicianId }),
  });
}

export async function assignBodyshopProcessTechnician(
  workshopId: string,
  entryId: string,
  process: 'BODYWORK' | 'PREP' | 'PAINT',
  technicianId: string | null,
): Promise<BodyshopEntry> {
  if (MOCK) {
    const ws    = getWorkshopData(workshopId);
    const entry = (ws.bodyshopEntries ?? []).find(e => e.id === entryId);
    if (!entry) throw new Error('Ingreso no encontrado');
    const tech = technicianId ? ws.technicians.find(t => t.id === technicianId) ?? null : null;
    if (!entry.processTechs) entry.processTechs = {};
    if (tech) {
      entry.processTechs[process] = { technicianId: tech.id, technician: tech };
    } else {
      delete entry.processTechs[process];
    }
    return delay({ ...entry });
  }
  return http<BodyshopEntry>(`/bodyshop/entries/${entryId}/process-technician`, {
    method: 'PATCH',
    body: JSON.stringify({ process, technicianId }),
  });
}

export async function releaseTechNoStart(entryId: string): Promise<BodyshopEntry> {
  if (MOCK) return delay({ id: entryId } as unknown as BodyshopEntry);
  return http<BodyshopEntry>(`/bodyshop/entries/${entryId}/release-tech`, { method: 'POST' });
}

export async function getBodyshopMonthlyReport(
  workshopId: string,
  year: number,
  month: number,
): Promise<TechMonthlyRow[]> {
  if (MOCK) {
    const ws = getWorkshopData(workshopId);
    const specIds = ws.config?.processSpecialtyIds;
    if (!specIds) return delay([]);
    return delay(
      calcMonthlyLoadReport(
        ws.bodyshopEntries ?? [],
        ws.technicians,
        ws.absences,
        specIds,
        year,
        month,
      ),
    );
  }
  return http<TechMonthlyRow[]>(
    `/bodyshop/reports/monthly?workshopId=${workshopId}&year=${year}&month=${month}`,
  );
}

export type { TechMonthlyRow };

// ─── Bodyshop Schedule (Gantt por proceso) ────────────────────────────────────

export interface BodyshopProcessWindow {
  process: 'BODYWORK' | 'PREP' | 'PAINT';
  startDay: number;
  endDay: number;
  hours: number;
  days: number;
}

export interface BodyshopScheduleEntry {
  id: string;
  plate: string;
  customerName: string;
  status: string;
  date: string;
  stayDays: number;
  estimatedFinishDate: string | null;
  bodyworkHours: number;
  prepHours: number;
  paintHours: number;
  totalPlannedHours: number;
  plannedExitDate: string | null;
  processWindows: BodyshopProcessWindow[];
  processTechs: Record<string, { technicianId: string; technicianName: string }>;
  currentTrackingCode: string | null;
  plannedProcessToday: string | null;
  isDelayed: boolean;
  delayDays: number;
}

export interface BodyshopScheduleKpis {
  totalInShop: number;
  onSchedule: number;
  delayed: number;
  done: number;
  exitToday: number;
  totalHoursWeek: number;
}

export interface BodyshopSchedule {
  baseDailyCap: { BODYWORK: number; PREP: number; PAINT: number };
  entries: BodyshopScheduleEntry[];
  kpis: BodyshopScheduleKpis;
}

export async function getBodyshopSchedule(workshopId: string, from: string, to: string): Promise<BodyshopSchedule> {
  if (MOCK) return delay({
    baseDailyCap: { BODYWORK: 0, PREP: 0, PAINT: 0 },
    entries: [],
    kpis: { totalInShop: 0, onSchedule: 0, delayed: 0, done: 0, exitToday: 0, totalHoursWeek: 0 },
  });
  return http<BodyshopSchedule>(`/bodyshop/schedule?workshopId=${workshopId}&from=${from}&to=${to}`);
}

// ─── Roles ────────────────────────────────────────────────────────────────────

// Store en memoria para el modo mock — persiste durante la sesión del browser
const _mockRoles: Role[] = [];

export async function getRoles(): Promise<Role[]> {
  if (MOCK) return delay([..._mockRoles]);
  return http<Role[]>('/roles');
}

export async function createRole(data: { name: string; permissions: Permissions }): Promise<Role> {
  if (MOCK) {
    const role: Role = { id: crypto.randomUUID(), ...data, active: true };
    _mockRoles.push(role);
    return delay(role);
  }
  return http<Role>('/roles', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateRole(
  id: string,
  data: { name?: string; permissions?: Permissions; active?: boolean },
): Promise<Role> {
  if (MOCK) {
    const idx = _mockRoles.findIndex(r => r.id === id);
    if (idx !== -1) {
      _mockRoles[idx] = { ..._mockRoles[idx], ...data };
      return delay(_mockRoles[idx]);
    }
    return delay({ id, name: data.name ?? '', permissions: data.permissions ?? {} as Permissions, active: data.active ?? true });
  }
  return http<Role>(`/roles/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteRole(id: string): Promise<void> {
  if (MOCK) {
    const idx = _mockRoles.findIndex(r => r.id === id);
    if (idx !== -1) _mockRoles.splice(idx, 1);
    return delay(undefined as any);
  }
  await http(`/roles/${id}`, { method: 'DELETE' });
}

// ─── Users ────────────────────────────────────────────────────────────────────

const _mockUsers: User[] = [
  { id: '1', name: 'Administrador', email: 'admin@taller.com',     role: 'admin',        active: true, allowedWorkshopIds: null },
  { id: '2', name: 'Recepción',     email: 'recepcion@taller.com', role: 'receptionist', active: true, allowedWorkshopIds: null },
];

export async function getUsers(): Promise<User[]> {
  if (MOCK) return delay(_mockUsers.map(u => ({ ...u, customRole: _mockRoles.find(r => r.id === u.roleId) ?? null })));
  return http<User[]>('/users');
}

export async function createUser(data: {
  name: string;
  email: string;
  role: 'admin' | 'receptionist' | 'perito';
  roleId?: string | null;
  allowedWorkshopIds?: string[] | null;
}): Promise<User> {
  if (MOCK) {
    const user: User = {
      id: crypto.randomUUID(), name: data.name, email: data.email,
      role: data.role, active: true, mustChangePassword: true,
      roleId: data.roleId ?? null,
      allowedWorkshopIds: data.allowedWorkshopIds ?? null,
    };
    _mockUsers.push(user);
    console.info(`[MOCK] Welcome email would be sent to ${data.email} with a temporary password`);
    return delay(user);
  }
  return http<User>('/users', { method: 'POST', body: JSON.stringify(data) });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  if (MOCK) {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    const user = raw ? JSON.parse(raw) : null;
    if (!user) throw new Error('No autenticado');
    const idx = _mockUsers.findIndex(u => u.id === user.id);
    if (idx !== -1) {
      _mockUsers[idx] = { ..._mockUsers[idx], mustChangePassword: false };
      const updated = { ...user, mustChangePassword: false };
      localStorage.setItem('user', JSON.stringify(updated));
    }
    return delay(undefined);
  }
  await http('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  // Actualizar flag en localStorage para que el layout no redirija de vuelta
  if (typeof window !== 'undefined') {
    const raw = localStorage.getItem('user');
    if (raw) {
      const user = JSON.parse(raw);
      localStorage.setItem('user', JSON.stringify({ ...user, mustChangePassword: false }));
    }
  }
}

export async function updateUser(
  id: string,
  data: { name?: string; role?: 'admin' | 'receptionist' | 'perito'; active?: boolean; password?: string; roleId?: string | null; allowedWorkshopIds?: string[] | null },
): Promise<User> {
  if (MOCK) {
    const idx = _mockUsers.findIndex(u => u.id === id);
    if (idx !== -1) _mockUsers[idx] = { ..._mockUsers[idx], ...data };
    const u = _mockUsers[idx] ?? { id, name: data.name ?? '', email: '', role: data.role ?? 'receptionist', active: data.active ?? true };
    return delay({ ...u, customRole: _mockRoles.find(r => r.id === u.roleId) ?? null });
  }
  return http<User>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

// ─── Bodyshop Catalog ─────────────────────────────────────────────────────────

// ─── Field adapters: new API uses `name`, settings page expects `label` ─────────

function groupToUi(g: any): BodyshopCatalogGroup {
  return {
    id: g.id,
    code: g.code ?? g.name.toUpperCase().replace(/\s+/g, '_').slice(0, 10),
    label: g.name,
    pieces: (g.pieces ?? []).map((p: any) => ({
      id: p.id, code: p.code, label: p.name, groupId: p.groupId ?? g.id,
    })),
  };
}
function processToUi(p: any): BodyshopCatalogProcess {
  return { id: p.id, code: p.code, label: p.name, order: p.sequence ?? 0 };
}
function gradeToUi(g: any): BodyshopCatalogGrade {
  return { id: g.id, code: g.code, label: g.name, factor: g.severity ?? null };
}

export async function getBodyshopCatalogGroups(): Promise<BodyshopCatalogGroup[]> {
  if (MOCK) return delay([]);
  const data = await http<any[]>('/bodyshop/catalog/piece-groups');
  return data.map(groupToUi);
}

export async function getBodyshopCatalogProcesses(): Promise<BodyshopCatalogProcess[]> {
  if (MOCK) return delay([]);
  const data = await http<any[]>('/bodyshop/catalog/processes');
  return data.map(processToUi);
}

export async function getBodyshopCatalogGrades(): Promise<BodyshopCatalogGrade[]> {
  if (MOCK) return delay([]);
  const data = await http<any[]>('/bodyshop/catalog/grades');
  return data.map(gradeToUi);
}

export async function getBodyshopCatalogPieces(): Promise<BodyshopCatalogPiece[]> {
  if (MOCK) return delay([]);
  const data = await http<any[]>('/bodyshop/catalog/pieces');
  return data.map((p: any) => ({ id: p.id, code: p.code, label: p.name, groupId: p.groupId }));
}

// ─── Bodyshop Catalog Mutations ───────────────────────────────────────────────

export async function createBodyshopCatalogGroup(dto: { code: string; label: string }): Promise<BodyshopCatalogGroup> {
  const r = await http<any>('/bodyshop/catalog/groups', { method: 'POST', body: JSON.stringify({ name: dto.label, code: dto.code }) });
  return groupToUi(r);
}
export async function updateBodyshopCatalogGroup(id: string, dto: { code?: string; label?: string }): Promise<BodyshopCatalogGroup> {
  const r = await http<any>(`/bodyshop/catalog/groups/${id}`, { method: 'PATCH', body: JSON.stringify({ name: dto.label, code: dto.code }) });
  return groupToUi(r);
}
export async function deleteBodyshopCatalogGroup(id: string): Promise<void> {
  await http(`/bodyshop/catalog/groups/${id}`, { method: 'DELETE' });
}

export async function createBodyshopCatalogPiece(dto: { code: string; label: string; groupId?: string | null }): Promise<BodyshopCatalogPiece> {
  const r = await http<any>('/bodyshop/catalog/pieces-crud', { method: 'POST', body: JSON.stringify({ name: dto.label, code: dto.code, groupId: dto.groupId }) });
  return { id: r.id, code: r.code, label: r.name, groupId: r.groupId };
}
export async function updateBodyshopCatalogPiece(id: string, dto: { code?: string; label?: string; groupId?: string | null }): Promise<BodyshopCatalogPiece> {
  const r = await http<any>(`/bodyshop/catalog/pieces-crud/${id}`, { method: 'PATCH', body: JSON.stringify({ name: dto.label, code: dto.code, groupId: dto.groupId }) });
  return { id: r.id, code: r.code, label: r.name, groupId: r.groupId };
}
export async function deleteBodyshopCatalogPiece(id: string): Promise<void> {
  await http(`/bodyshop/catalog/pieces-crud/${id}`, { method: 'DELETE' });
}

export async function createBodyshopCatalogProcess(dto: { code: string; label: string; order: number }): Promise<BodyshopCatalogProcess> {
  const r = await http<any>('/bodyshop/catalog/processes-crud', { method: 'POST', body: JSON.stringify({ name: dto.label, code: dto.code, sequence: dto.order }) });
  return processToUi(r);
}
export async function updateBodyshopCatalogProcess(id: string, dto: { code?: string; label?: string; order?: number }): Promise<BodyshopCatalogProcess> {
  const r = await http<any>(`/bodyshop/catalog/processes-crud/${id}`, { method: 'PATCH', body: JSON.stringify({ name: dto.label, code: dto.code, sequence: dto.order }) });
  return processToUi(r);
}
export async function deleteBodyshopCatalogProcess(id: string): Promise<void> {
  await http(`/bodyshop/catalog/processes-crud/${id}`, { method: 'DELETE' });
}

export async function createBodyshopCatalogGrade(dto: { code: string; label: string; factor?: number | null }): Promise<BodyshopCatalogGrade> {
  const r = await http<any>('/bodyshop/catalog/grades-crud', { method: 'POST', body: JSON.stringify({ name: dto.label, code: dto.code, severity: dto.factor }) });
  return gradeToUi(r);
}
export async function updateBodyshopCatalogGrade(id: string, dto: { code?: string; label?: string; factor?: number | null }): Promise<BodyshopCatalogGrade> {
  const r = await http<any>(`/bodyshop/catalog/grades-crud/${id}`, { method: 'PATCH', body: JSON.stringify({ name: dto.label, code: dto.code, severity: dto.factor }) });
  return gradeToUi(r);
}
export async function deleteBodyshopCatalogGrade(id: string): Promise<void> {
  await http(`/bodyshop/catalog/grades-crud/${id}`, { method: 'DELETE' });
}

// ─── Bodyshop v2 — Work Items & Schedule Simulation ──────────────────────────

export interface BodyshopProcess {
  id: string;
  code: string;
  name: string;
  sequence: number;
  active: boolean;
}

export interface BodyshopGrade {
  id: string;
  code: string;
  name: string;
  severity: number;
}

export interface BodyshopPieceGroup {
  id: string;
  code?: string;
  name: string;
  order: number;
  pieces?: BodyshopPiece[];
}

export interface BodyshopPiece {
  id: string;
  code: string;
  name: string;
  groupId: string | null;
  group?: BodyshopPieceGroup | null;
  applicableProcesses: string[];
  active: boolean;
}

export interface BodyshopHoursCalcResult {
  pieceId: string;
  processId: string;
  gradeId: string;
  suggestedHours: number | null;
}

export interface BodyshopProcessScheduleEntry {
  processCode: string;
  processName: string;
  date: string;
  hours: number;
}

export interface BodyshopScheduleSimulation {
  canSchedule: boolean;
  /** @deprecated use canSchedule */
  canStart?: boolean;
  startDate: string | null;
  estimatedFinishDate: string | null;
  slots: BodyshopProcessSlotResult[];
  /** @deprecated use slots */
  processSchedule?: BodyshopProcessScheduleEntry[];
  warnings: string[];
}

export interface BodyshopProcessSlotResult {
  process:     string;
  processName: string;
  date:        string;
  timeStart:   string;
  timeEnd:     string;
  hours:       number;
  sequence:    number;
}

export interface BodyshopEntrySchedule {
  entryId:             string;
  estimatedFinishDate: string | null;
  stayDays:            number;
  slots: Array<{
    id:              string;
    process:         string;
    date:            string;
    timeStart:       string;
    timeEnd:         string;
    hours:           number;
    originalHours:   number;
    adjustedHours:   number | null;
    sequence:        number;
    status:          string;
    technicianId:    string | null;
    technician:      { id: string; name: string } | null;
    adjustmentReason: string | null;
    adjustedBy:      string | null;
    adjustedAt:      string | null;
  }>;
}

export interface AddBodyshopWorkItemInput {
  pieceId: string;
  gradeId: string;
  sequence?: number;
  notes?: string;
  processes: Array<{
    processId: string;
    suggestedHours: number;
    adjustedHours?: number;
    adjustmentReason?: string;
  }>;
}

export async function getBodyshopProcesses(): Promise<BodyshopProcess[]> {
  if (MOCK) return delay([]);
  return http<BodyshopProcess[]>('/bodyshop/catalog/processes');
}

export async function getBodyshopGrades(): Promise<BodyshopGrade[]> {
  if (MOCK) return delay([]);
  return http<BodyshopGrade[]>('/bodyshop/catalog/grades');
}

export async function getBodyshopPieceGroups(): Promise<BodyshopPieceGroup[]> {
  if (MOCK) return delay([]);
  return http<BodyshopPieceGroup[]>('/bodyshop/catalog/piece-groups');
}

export async function getBodyshopPieces(groupId?: string): Promise<BodyshopPiece[]> {
  if (MOCK) return delay([]);
  const q = groupId ? `?groupId=${encodeURIComponent(groupId)}` : '';
  return http<BodyshopPiece[]>(`/bodyshop/catalog/pieces${q}`);
}

export async function calculateBodyshopWorkHours(
  items: Array<{ pieceId: string; processId: string; gradeId: string }>,
  workshopId?: string,
): Promise<BodyshopHoursCalcResult[]> {
  if (MOCK) return delay(items.map(i => ({ ...i, suggestedHours: null })));
  return http<BodyshopHoursCalcResult[]>('/bodyshop/catalog/calculate-hours', {
    method: 'POST',
    body: JSON.stringify({ items, workshopId }),
  });
}

export async function simulateBodyshopSchedule(input: {
  bodyworkHours: number;
  prepHours:     number;
  paintHours:    number;
  workshopId:    string;
  startDate:     string;
  startTime?:    string;
}): Promise<BodyshopScheduleSimulation> {
  if (MOCK) return delay({ canSchedule: false, startDate: null, estimatedFinishDate: null, slots: [], warnings: [] });
  return http<BodyshopScheduleSimulation>('/bodyshop/simulate-schedule', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getBodyshopEntrySchedule(entryId: string): Promise<BodyshopEntrySchedule> {
  if (MOCK) return delay({ entryId, estimatedFinishDate: null, stayDays: 0, slots: [] });
  return http<BodyshopEntrySchedule>(`/bodyshop/entries/${entryId}/schedule`);
}

export async function adjustBodyshopProcessSlot(
  entryId: string,
  slotId:  string,
  dto: { adjustedHours: number; reason: string },
): Promise<unknown> {
  if (MOCK) return delay({ ok: true });
  return http(`/bodyshop/entries/${entryId}/slots/${slotId}/adjust`, {
    method: 'PATCH',
    body: JSON.stringify(dto),
  });
}

export async function addBodyshopWorkItem(
  entryId: string,
  dto: AddBodyshopWorkItemInput,
): Promise<unknown> {
  return http(`/bodyshop/entries/${entryId}/work-items`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function removeBodyshopWorkItem(entryId: string, itemId: string): Promise<void> {
  await http(`/bodyshop/entries/${entryId}/work-items/${itemId}`, { method: 'DELETE' });
}

// ─── DMS ADVISOR SLOTS ────────────────────────────────────────────────────────

export interface DmsAdvisorSlotItem {
  timeStart: string;
  timeEnd: string;
  isOccupied: boolean;
}

export interface DmsAdvisor {
  advisorCode: string;
  advisorName: string;
  sucursalId: string;
  freeSlots: number;
  slots: DmsAdvisorSlotItem[];
}

// http() ya extrae json.data — no volver a llamar .data sobre el resultado.
// advisor-slots: json.data = { date, sucursalIdis, categoryId, advisors: [] }
export async function getDmsAdvisorSlots(
  date: string,
  sucursalIdis?: string | null,
  categoryId = 1,
): Promise<DmsAdvisor[]> {
  if (MOCK) return delay([]);
  const qs = sucursalIdis
    ? `?date=${date}&sucursalIdis=${encodeURIComponent(sucursalIdis)}&categoryId=${categoryId}`
    : `?date=${date}&categoryId=${categoryId}`;
  const res = await http<{ date: string; sucursalIdis: string | null; categoryId: number; advisors: DmsAdvisor[] }>(
    `/dms-sync/advisor-slots${qs}`,
  );
  return res.advisors;
}

// advisors: json.data = [{ code, name, sucursalIdis }, ...]
export async function getDmsAdvisors(
  sucursalIdis?: string | null,
): Promise<{ code: string; name: string; sucursalIdis: string }[]> {
  if (MOCK) return delay([]);
  const qs = sucursalIdis ? `?sucursalIdis=${encodeURIComponent(sucursalIdis)}` : '';
  const res = await http<{ code: string; name: string; sucursalIdis: string }[]>(
    `/dms-sync/advisors${qs}`,
  );
  return res;
}

export async function getDmsBodyshopSucursales(): Promise<{ id: string; nombre: string }[]> {
  if (MOCK) return delay([]);
  return http<{ id: string; nombre: string }[]>('/bodyshop/dms/sucursales');
}

export async function getDmsBodyshopAsesores(sucursalId?: string | null): Promise<{ codigo: string; nombre: string }[]> {
  if (MOCK) return delay([]);
  const qs = sucursalId ? `?sucursalId=${encodeURIComponent(sucursalId)}` : '';
  return http<{ codigo: string; nombre: string }[]>(`/bodyshop/dms/asesores${qs}`);
}

// ── Tracking ─────────────────────────────────────────────────────────────────

export interface TrackingProcessSummary {
  logId: string;
  processCode: string;
  processName: string;
  processType: 'MOTHER' | 'PARALLEL';
  orderIndex: number;
  plannedHours: number;
  startedAt: string | null;
  completedAt: string | null;
  status: string;
  realHours: number | null;
  deviation: number | null;
  pausedDurationMinutes: number;
  technicianId: string | null;
  technicianName: string | null;
}

export interface TrackingCard {
  id: string;
  sourceId: string;
  sourceType: 'mechanic' | 'bodyshop';
  status: string;
  plate: string;
  customerName: string;
  vehicleType: string | null;
  techName: string | null;
  serviceOrType: string | null;
  currentProcess: {
    logId: string;
    processCode: string;
    processName: string;
    orderIndex: number;
    plannedHours: number;
    startedAt: string | null;
    status: string;
    blockedReason: string | null;
  } | null;
  plannedTotalHours: number;
  realTotalHours: number;
  deviationTotal: number;
  overdueHours: number;
  semaphore: 'green' | 'normal' | 'red' | 'orange';
  allProcesses: TrackingProcessSummary[];
  motherProcesses: TrackingProcessSummary[];
  parallelProcesses: TrackingProcessSummary[];
  parallelBlocking: boolean;
  entryDate: string | null;
  exitDate: string | null;
  suggestedExitDate: string | null;
  waitingForResource: boolean;
  resourceNote: string | null;
  resourceBlockedAt: string | null;
  advisorTime: string | null;
  noStartAt: string | null;
  noStartHoursLost: number | null;
}

export interface TrackingColumn {
  processCode: string;
  processName: string;
  orderIndex: number;
  cards: TrackingCard[];
}

export interface TrackingBoard {
  date: string;
  workshopId: string;
  workshopName: string;
  columns: TrackingColumn[];
  alertCount: number;
}

export async function getTrackingBoard(date: string, workshopId: string): Promise<TrackingBoard> {
  if (MOCK) return delay({ date, workshopId, workshopName: 'Mock', columns: [], alertCount: 0 });
  return http<TrackingBoard>(`/tracking/board?date=${date}&workshopId=${encodeURIComponent(workshopId)}`);
}

export async function startTrackingProcess(
  logId: string,
  technicianId?: string,
  technicianName?: string,
): Promise<void> {
  if (MOCK) return delay(undefined);
  await http(`/tracking/process/${logId}/start`, {
    method: 'PATCH',
    body: JSON.stringify({ technicianId, technicianName }),
  });
}

export async function completeTrackingProcess(logId: string, notes?: string): Promise<void> {
  if (MOCK) return delay(undefined);
  await http(`/tracking/process/${logId}/complete`, {
    method: 'PATCH',
    body: JSON.stringify({ notes }),
  });
}

export async function blockTrackingProcess(logId: string, reason: string): Promise<void> {
  if (MOCK) return delay(undefined);
  await http(`/tracking/process/${logId}/block`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  });
}

export async function unblockTrackingProcess(logId: string): Promise<void> {
  if (MOCK) return delay(undefined);
  await http(`/tracking/process/${logId}/unblock`, { method: 'PATCH' });
}

export async function setTrackingExitDate(
  sourceType: 'mechanic' | 'bodyshop',
  sourceId: string,
  date: string | null,
): Promise<void> {
  if (MOCK) return delay(undefined);
  await http(`/tracking/exit-date/${sourceType}/${sourceId}`, {
    method: 'PATCH',
    body: JSON.stringify({ date }),
  });
}

export interface ResourceAgendaItem {
  entryId: string;
  plate: string;
  customerName: string;
  date: string;
  currentProcessName: string;
  resourceNote: string | null;
  resourceBlockedAt: string | null;
}

export async function setTrackingResource(entryId: string, note: string): Promise<void> {
  if (MOCK) return delay(undefined);
  await http(`/tracking/resource/${entryId}`, {
    method: 'PATCH',
    body: JSON.stringify({ note }),
  });
}

export async function clearTrackingResource(entryId: string): Promise<void> {
  if (MOCK) return delay(undefined);
  await http(`/tracking/resource/${entryId}`, { method: 'DELETE' });
}

export async function getResourceAgenda(workshopId: string): Promise<ResourceAgendaItem[]> {
  if (MOCK) return delay([]);
  return http<ResourceAgendaItem[]>(`/tracking/resources?workshopId=${encodeURIComponent(workshopId)}`);
}

// ── Budget Appointments ────────────────────────────────────────────────────────

import type { BudgetAppointment, BudgetProcess } from '@/types';

export async function getBudgetAppointments(workshopId: string, date: string): Promise<BudgetAppointment[]> {
  if (MOCK) return delay([]);
  return http<BudgetAppointment[]>(`/budget-appointments?workshopId=${encodeURIComponent(workshopId)}&date=${date}`);
}

export async function getBudgetAppointment(id: string): Promise<BudgetAppointment> {
  if (MOCK) return delay({ id } as unknown as BudgetAppointment);
  return http<BudgetAppointment>(`/budget-appointments/${id}`);
}

export async function createBudgetAppointment(dto: {
  workshopId: string;
  date: string;
  timeStart: string;
  timeEnd: string;
  customerName: string;
  plate: string;
  phone?: string | null;
  notes?: string | null;
  budgetNumber?: string | null;
  peritoId?: string | null;
}): Promise<BudgetAppointment> {
  if (MOCK) return delay({ id: `mock-ba-${Date.now()}`, status: 'pending', processes: [], ...dto } as unknown as BudgetAppointment);
  return http<BudgetAppointment>('/budget-appointments', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function updateBudgetProcesses(id: string, processes: BudgetProcess[]): Promise<BudgetAppointment> {
  if (MOCK) return delay({ id, processes } as unknown as BudgetAppointment);
  return http<BudgetAppointment>(`/budget-appointments/${id}/processes`, {
    method: 'PATCH',
    body: JSON.stringify({ processes }),
  });
}

export async function cancelBudgetAppointment(id: string): Promise<BudgetAppointment> {
  if (MOCK) return delay({ id, status: 'cancelled' } as unknown as BudgetAppointment);
  return http<BudgetAppointment>(`/budget-appointments/${id}/cancel`, { method: 'PATCH' });
}

export async function approveBudgetAppointment(id: string, repairStartDate?: string): Promise<{ budget: BudgetAppointment; entryId: string }> {
  if (MOCK) return delay({ budget: { id, status: 'approved' } as unknown as BudgetAppointment, entryId: `mock-entry-${Date.now()}` });
  return http<{ budget: BudgetAppointment; entryId: string }>(`/budget-appointments/${id}/approve`, {
    method: 'POST',
    body: repairStartDate ? JSON.stringify({ repairStartDate }) : undefined,
  });
}

export async function rejectBudgetAppointment(id: string, reason: string): Promise<BudgetAppointment> {
  if (MOCK) return delay({ id, status: 'rejected' } as unknown as BudgetAppointment);
  return http<BudgetAppointment>(`/budget-appointments/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

// ── Budget Simulator ───────────────────────────────────────────────────────────

export interface SimulatorPieza { pieza: string; grupo: number }
export type DamageLevel = 'Leve' | 'Medio' | 'Grave' | 'Sustitucion';

export interface SimulatorEstimateItem { pieza: string; damageLevel: DamageLevel; qty: number }

export interface SimulatorProcessBreakdown { proceso: string; horas: number; descripcion: string }

export interface SimulatorLineResult {
  pieza: string; damageLevel: DamageLevel; qty: number;
  breakdown: SimulatorProcessBreakdown[];
  bodyworkHours: number; prepHours: number; paintHours: number;
  totalHoras: number; totalMdo: number;
}

export interface SimulatorEstimateResult {
  lines: SimulatorLineResult[];
  bodyworkHours: number; prepHours: number; paintHours: number;
  totalHoras: number; totalMdo: number; tarifa: number; moneda: string;
}

export async function getBudgetSimulatorPiezas(): Promise<SimulatorPieza[]> {
  if (MOCK) return delay([]);
  return http<SimulatorPieza[]>('/budget-simulator/piezas');
}

export async function budgetSimulatorEstimate(items: SimulatorEstimateItem[]): Promise<SimulatorEstimateResult> {
  if (MOCK) return delay({ lines: [], bodyworkHours: 0, prepHours: 0, paintHours: 0, totalHoras: 0, totalMdo: 0, tarifa: 0, moneda: 'PYG' });
  return http<SimulatorEstimateResult>('/budget-simulator/estimate', {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
}

// ── Budget Simulator Catalog ───────────────────────────────────────────────────

export interface CatalogItem {
  id:               string;
  pieza:            string;
  grupo:            number;
  proceso:          string;
  gradoOriginal:    string | null;
  tipoDano:         string;
  nroTrabajo:       number;
  codigoPosicion:   string;
  descripcionFinal: string;
  horas:            number;
  active:           boolean;
}

export interface CatalogListResult {
  items: CatalogItem[];
  total: number;
  page:  number;
  limit: number;
  pages: number;
}

export async function getCatalogItems(params: {
  search?: string; pieza?: string; proceso?: string;
  page?: number; limit?: number; activeOnly?: boolean;
}): Promise<CatalogListResult> {
  const qs = new URLSearchParams();
  if (params.search)    qs.set('search',     params.search);
  if (params.pieza)     qs.set('pieza',      params.pieza);
  if (params.proceso)   qs.set('proceso',    params.proceso);
  if (params.page)      qs.set('page',       String(params.page));
  if (params.limit)     qs.set('limit',      String(params.limit));
  if (params.activeOnly !== undefined) qs.set('activeOnly', String(params.activeOnly));
  return http<CatalogListResult>(`/budget-simulator/catalog?${qs}`);
}

export async function updateCatalogItem(id: string, dto: { horas?: number; descripcionFinal?: string; active?: boolean }): Promise<CatalogItem> {
  return http<CatalogItem>(`/budget-simulator/catalog/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(dto),
  });
}

export async function createCatalogItem(dto: Omit<CatalogItem, 'id' | 'active'>): Promise<CatalogItem> {
  return http<CatalogItem>('/budget-simulator/catalog', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function deleteCatalogItem(id: string): Promise<CatalogItem> {
  return http<CatalogItem>(`/budget-simulator/catalog/${id}`, { method: 'DELETE' });
}

export async function importCatalogFromExcel(file: File): Promise<{ created: number; updated: number; errors: string[] }> {
  const fd = new FormData();
  fd.append('file', file);
  const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
  const res = await fetch(`${BASE_URL}/budget-simulator/catalog/import`, {
    method: 'POST',
    credentials: 'include',
    body: fd,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Error al importar' }));
    throw new Error(err.message ?? 'Error al importar');
  }
  const json = await res.json();
  return json.data ?? json;
}

// ── Operational Blocks ─────────────────────────────────────────────────────────

import type { OperationalBlock } from '@/types';

export async function getOperationalBlocks(workshopId: string, date: string): Promise<OperationalBlock[]> {
  if (MOCK) return delay([]);
  return http<OperationalBlock[]>(`/operational-blocks?workshopId=${encodeURIComponent(workshopId)}&date=${date}`);
}

export async function createOperationalBlock(dto: Omit<OperationalBlock, 'id' | 'createdBy' | 'createdAt'>): Promise<OperationalBlock> {
  if (MOCK) return delay({ id: `mock-ob-${Date.now()}`, createdBy: 'mock', createdAt: new Date().toISOString(), ...dto });
  return http<OperationalBlock>('/operational-blocks', { method: 'POST', body: JSON.stringify(dto) });
}

export async function updateOperationalBlock(id: string, dto: Partial<Pick<OperationalBlock, 'timeStart' | 'timeEnd' | 'type' | 'reason'>>): Promise<OperationalBlock> {
  if (MOCK) return delay({ id, ...dto } as unknown as OperationalBlock);
  return http<OperationalBlock>(`/operational-blocks/${id}`, { method: 'PATCH', body: JSON.stringify(dto) });
}

export async function deleteOperationalBlock(id: string): Promise<void> {
  if (MOCK) return delay(undefined);
  await http(`/operational-blocks/${id}`, { method: 'DELETE' });
}
