/**
 * Tests de lib/bodyshop-calendar.ts — la lógica de "qué vehículos están en taller cada día".
 *
 * Cubre el bug del 29-abr donde el calendario mostraba 5 vehículos en estadía
 * pero la lista debajo solo mostraba 2 (los que ingresaban ese día).
 */

import { entriesOnDay, getWeekDays } from '../lib/bodyshop-calendar';
import { parseISO } from 'date-fns';

const baseEntry = {
  id: 'e-base',
  workshopId: 'ws-1',
  workTypeId: 'wt-1',
  workType: { id: 'wt-1', workshopId: 'ws-1', name: 'Test', severity: 'LIGHT', estimatedDays: 1, bodyworkHours: 0, prepHours: 0, paintHours: 0, color: '#000' },
  customerName: 'Cliente Test',
  plate: 'ABC123',
  channel: 'phone' as const,
  bodyworkHours: 0, prepHours: 0, paintHours: 0,
  status: 'scheduled' as 'scheduled' | 'in_progress' | 'done' | 'cancelled',
};

function entry(overrides: Partial<typeof baseEntry> & { id: string; date: string; stayDays: number }) {
  return { ...baseEntry, ...overrides } as any;
}

const dayAt = (iso: string) => parseISO(iso + 'T12:00:00');

describe('entriesOnDay()', () => {

  // ── Casos básicos ────────────────────────────────────────────────────────────

  it('incluye una entry que ingresa exactamente el día consultado (estadía=1)', () => {
    const e = entry({ id: 'e1', date: '2026-04-29', stayDays: 1 });
    const result = entriesOnDay([e], dayAt('2026-04-29'));

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('e1');
  });

  it('incluye una entry cuya estadía abarca el día consultado', () => {
    // Caso del 29: ingresó el 24, estadía 10 días, todavía está el 29
    const e = entry({ id: 'sebastian', date: '2026-04-24', stayDays: 10 });
    const result = entriesOnDay([e], dayAt('2026-04-29'));

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('sebastian');
  });

  it('NO incluye una entry que terminó antes del día consultado', () => {
    // Ingresó 24, estadía 4 → sale el 28. El 29 ya no está.
    const e = entry({ id: 'e1', date: '2026-04-24', stayDays: 4 });
    const result = entriesOnDay([e], dayAt('2026-04-29'));

    expect(result).toHaveLength(0);
  });

  it('NO incluye una entry que ingresa después del día consultado', () => {
    const e = entry({ id: 'e1', date: '2026-04-30', stayDays: 1 });
    const result = entriesOnDay([e], dayAt('2026-04-29'));

    expect(result).toHaveLength(0);
  });

  // ── Bordes ───────────────────────────────────────────────────────────────────

  it('último día de estadía: incluye (la salida es exclusiva)', () => {
    // Ingresó 28, estadía 2 → 28 y 29. El 29 debe estar.
    const e = entry({ id: 'e1', date: '2026-04-28', stayDays: 2 });
    expect(entriesOnDay([e], dayAt('2026-04-29'))).toHaveLength(1);
  });

  it('día siguiente al fin de estadía: NO incluye', () => {
    // Ingresó 28, estadía 2 → 28 y 29. El 30 ya no.
    const e = entry({ id: 'e1', date: '2026-04-28', stayDays: 2 });
    expect(entriesOnDay([e], dayAt('2026-04-30'))).toHaveLength(0);
  });

  // ── Status ───────────────────────────────────────────────────────────────────

  it('excluye entries canceladas aunque estén en rango', () => {
    const e = entry({ id: 'cancelled', date: '2026-04-29', stayDays: 1, status: 'cancelled' });
    expect(entriesOnDay([e], dayAt('2026-04-29'))).toHaveLength(0);
  });

  it('incluye entries en estado in_progress', () => {
    const e = entry({ id: 'inProgress', date: '2026-04-27', stayDays: 5, status: 'in_progress' });
    expect(entriesOnDay([e], dayAt('2026-04-29'))).toHaveLength(1);
  });

  it('incluye entries en estado done que aún están dentro de la estadía', () => {
    const e = entry({ id: 'done', date: '2026-04-29', stayDays: 1, status: 'done' });
    expect(entriesOnDay([e], dayAt('2026-04-29'))).toHaveLength(1);
  });

  // ── Caso real del bug ───────────────────────────────────────────────────────

  it('escenario real del 29-abr: 5 vehículos en taller', () => {
    const entries = [
      entry({ id: 'sebastian', date: '2026-04-24', stayDays: 10 }),                       // 24 → 4-may
      entry({ id: 'carla',     date: '2026-04-27', stayDays: 4, status: 'in_progress' }), // 27 → 1-may
      entry({ id: 'david',     date: '2026-04-28', stayDays: 3 }),                        // 28 → 1-may
      entry({ id: 'fabian',    date: '2026-04-29', stayDays: 1 }),                        // 29 → 30
      entry({ id: 'gloria',    date: '2026-04-29', stayDays: 2 }),                        // 29 → 1-may
    ];

    const result = entriesOnDay(entries, dayAt('2026-04-29'));

    expect(result.map(e => e.id).sort()).toEqual(
      ['carla', 'david', 'fabian', 'gloria', 'sebastian'],
    );
  });

  it('lista vacía devuelve vacía', () => {
    expect(entriesOnDay([], dayAt('2026-04-29'))).toEqual([]);
  });
});

// ── getWeekDays ─────────────────────────────────────────────────────────────

describe('getWeekDays()', () => {
  it('devuelve 7 días (lunes a domingo)', () => {
    const days = getWeekDays('2026-04-29'); // miércoles
    expect(days).toHaveLength(7);
  });

  it('siempre arranca en lunes (weekStartsOn=1)', () => {
    const days = getWeekDays('2026-04-29'); // miércoles
    expect(days[0].getDay()).toBe(1); // 1 = Monday
    expect(days[6].getDay()).toBe(0); // 0 = Sunday
  });

  it('devuelve la misma semana si la fecha cae en domingo', () => {
    const days = getWeekDays('2026-05-03'); // domingo
    // El lunes anterior debe ser 27-abr
    expect(days[0].toISOString().split('T')[0]).toBe('2026-04-27');
    expect(days[6].toISOString().split('T')[0]).toBe('2026-05-03');
  });
});
