/**
 * kanban-devolver-proceso-anterior (PR3) — funciones puras extraídas de
 * `seguimiento/kanban/page.tsx`: `byProcessOrder` y `computeAllDone`. La
 * pantalla en sí no tiene harness de React Testing Library en este repo, pero
 * esta lógica no depende de React — se testea aislada, mismo patrón usado en
 * `use-simulator-form.spec.ts`.
 */

import { byProcessOrder, computeAllDone } from '../app/(dashboard)/seguimiento/kanban/page';
import type { TrackingProcessSummary } from '../lib/api';

function makeProcess(overrides: Partial<TrackingProcessSummary> = {}): TrackingProcessSummary {
  return {
    logId: 'log-1',
    processCode: 'BODYWORK',
    processName: 'Chapería',
    processType: 'MOTHER',
    orderIndex: 1,
    plannedHours: 4,
    startedAt: null,
    completedAt: null,
    createdAt: '2026-06-10T09:00:00.000Z',
    status: 'pending',
    realHours: null,
    deviation: null,
    pausedDurationMinutes: 0,
    technicianId: null,
    technicianName: null,
    ...overrides,
  };
}

describe('byProcessOrder', () => {
  it('ordena por orderIndex ascendente', () => {
    const a = makeProcess({ logId: 'a', orderIndex: 2 });
    const b = makeProcess({ logId: 'b', orderIndex: 1 });

    expect([a, b].sort(byProcessOrder).map(p => p.logId)).toEqual(['b', 'a']);
  });

  it('desempata por createdAt ascendente cuando el orderIndex es igual (dos pasadas del mismo proceso)', () => {
    const oldPass = makeProcess({ logId: 'old', orderIndex: 2, createdAt: '2026-06-10T09:00:00.000Z' });
    const newPass = makeProcess({ logId: 'new', orderIndex: 2, createdAt: '2026-06-12T09:00:00.000Z' });

    expect([newPass, oldPass].sort(byProcessOrder).map(p => p.logId)).toEqual(['old', 'new']);
  });
});

describe('computeAllDone', () => {
  it('true cuando todos los procesos (no-AGENDA) están completed o skipped', () => {
    const processes = [
      makeProcess({ logId: 'agenda', processCode: 'AGENDA', orderIndex: 0, status: 'completed' }),
      makeProcess({ logId: 'bw', processCode: 'BODYWORK', orderIndex: 1, status: 'completed' }),
      makeProcess({ logId: 'fc', processCode: 'FINAL_CONTROL', orderIndex: 6, status: 'skipped' }),
    ];

    expect(computeAllDone(processes)).toBe(true);
  });

  it('false cuando la ÚNICA pasada de un proceso está \'returned\' (nunca se rehizo)', () => {
    const processes = [
      makeProcess({ logId: 'bw', processCode: 'BODYWORK', orderIndex: 1, status: 'completed' }),
      makeProcess({ logId: 'prep', processCode: 'PREP', orderIndex: 2, status: 'returned' }),
    ];

    expect(computeAllDone(processes)).toBe(false);
  });

  it('true cuando la pasada VIEJA quedó \'returned\' pero la pasada NUEVA del mismo proceso ya está completed — dedup por la más reciente', () => {
    const processes = [
      makeProcess({ logId: 'bw', processCode: 'BODYWORK', orderIndex: 1, status: 'completed' }),
      makeProcess({
        logId: 'prep-old', processCode: 'PREP', orderIndex: 2, status: 'returned',
        createdAt: '2026-06-10T09:00:00.000Z',
      }),
      makeProcess({
        logId: 'prep-new', processCode: 'PREP', orderIndex: 2, status: 'completed',
        createdAt: '2026-06-12T09:00:00.000Z',
      }),
    ];

    expect(computeAllDone(processes)).toBe(true);
  });

  it('ignora el orden de entrada del array — el resultado depende del orderIndex/createdAt, no de cómo llega la lista', () => {
    const processes = [
      makeProcess({
        logId: 'prep-new', processCode: 'PREP', orderIndex: 2, status: 'completed',
        createdAt: '2026-06-12T09:00:00.000Z',
      }),
      makeProcess({
        logId: 'prep-old', processCode: 'PREP', orderIndex: 2, status: 'returned',
        createdAt: '2026-06-10T09:00:00.000Z',
      }),
      makeProcess({ logId: 'bw', processCode: 'BODYWORK', orderIndex: 1, status: 'completed' }),
    ];

    expect(computeAllDone(processes)).toBe(true);
  });
});
