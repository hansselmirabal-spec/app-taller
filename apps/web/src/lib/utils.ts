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

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    scheduled: 'Agendado',
    in_progress: 'En proceso',
    done: 'Terminado',
    cancelled: 'Cancelado',
  };
  return map[status] ?? status;
}
