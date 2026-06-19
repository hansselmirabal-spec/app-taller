import { parseISO, startOfWeek, addDays } from 'date-fns';
import type { BodyshopEntry } from '@/types';

/**
 * Devuelve los 7 días (lunes a domingo) que contienen la fecha dada.
 */
export function getWeekDays(anchorDate: string): Date[] {
  const d = parseISO(anchorDate + 'T12:00:00');
  const mon = startOfWeek(d, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

/**
 * Filtra entries que están físicamente en el taller en el día dado.
 * Una entry "está en taller" si:
 *   - no está cancelada
 *   - el día está dentro del rango [date, date + stayDays)
 *
 * Reusada por el calendario semanal de chapería para mostrar todos los
 * vehículos presentes cada día (no solo los que ingresan ese día).
 */
export function entriesOnDay(entries: BodyshopEntry[], day: Date): BodyshopEntry[] {
  const dayMs = day.getTime();
  return entries.filter(e => {
    if (e.status === 'cancelled') return false;
    const start = parseISO(e.date + 'T00:00:00').getTime();
    const end   = start + e.stayDays * 86_400_000;
    return dayMs >= start && dayMs < end;
  });
}
