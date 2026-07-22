import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, startOfWeek, addDays, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// crypto.randomUUID solo existe en contextos seguros (HTTPS/localhost);
// en despliegues sobre HTTP plano hay que caer a un generador manual.
export function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getWeekDates(referenceDate: Date): Date[] {
  const monday = startOfWeek(referenceDate, { weekStartsOn: 1 });
  return Array.from({ length: 6 }, (_, i) => addDays(monday, i)); // Mon-Sat
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'yyyy-MM-dd');
}

export function formatDateDisplay(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date + 'T12:00:00') : date;
  return format(d, "EEE d MMM", { locale: es });
}

export function formatDateLong(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date + 'T12:00:00') : date;
  return format(d, "EEEE d 'de' MMMM yyyy", { locale: es });
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function availabilityColor(available: number, total: number): string {
  if (total === 0 || available === 0) return 'bg-red-100 text-red-700 border-red-200';
  const ratio = available / total;
  if (ratio > 0.5) return 'bg-green-100 text-green-700 border-green-200';
  if (ratio > 0) return 'bg-yellow-100 text-yellow-700 border-yellow-200';
  return 'bg-red-100 text-red-700 border-red-200';
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    scheduled: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    done: 'bg-green-100 text-green-700',
    cancelled: 'bg-gray-100 text-gray-500',
  };
  return map[status] ?? 'bg-gray-100 text-gray-700';
}

// Redondea a 1 decimal — sumar horas tipo 17.5 + 17.2 + 7.7 en JS da
// 42.400000000000006 por precisión de punto flotante, y eso se veía tal cual
// en la UI (reportado en QA) si no se redondea antes de mostrarlo.
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function sumBodyshopHours(entry: { bodyworkHours: number; prepHours: number; paintHours: number }): number {
  return round1(entry.bodyworkHours + entry.prepHours + entry.paintHours);
}

// Igual que sumBodyshopHours pero sumando también los procesos extra (Pulido,
// Mecánica, etc. — guardados en entry.processes) que no viven en las columnas
// bodyworkHours/prepHours/paintHours. Sin esto el "Total" del detalle de un
// vehículo queda por debajo de lo real y no coincide con "Duración plan" del
// kanban (QA reportó exactamente esta inconsistencia).
const CORE_PROCESS_CODES = new Set(['BODYWORK', 'PREP', 'PAINT']);

export function sumBodyshopHoursWithExtras(entry: {
  bodyworkHours: number; prepHours: number; paintHours: number;
  processes?: { code: string; hours: number }[] | null;
}): number {
  const extras = (entry.processes ?? [])
    .filter(p => !CORE_PROCESS_CODES.has(p.code))
    .reduce((sum, p) => sum + Number(p.hours), 0);
  return round1(entry.bodyworkHours + entry.prepHours + entry.paintHours + extras);
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    scheduled: 'Agendado',
    in_progress: 'En proceso',
    done: 'Terminado',
    cancelled: 'Cancelado',
  };
  return map[status] ?? status;
}
