/**
 * kanban-devolver-multi-proceso-anterior (PR3) — funciones puras extraídas de
 * `ReturnProcessModal`: `sortReturnTargets` (re-orden defensivo del cliente,
 * orderIndex DESC) y `computeCascadeTargets` (destinos que se devolverán en
 * cascada junto con el elegido — usados para el hint "También se
 * devolverán: …"). Mismo patrón que `kanban-return-process-order.spec.ts`:
 * el componente no tiene harness de React Testing Library en este repo, así
 * que la lógica se testea aislada de React.
 */

import { sortReturnTargets, computeCascadeTargets } from '../components/kanban/return-process-modal';
import type { ReturnTarget } from '../lib/api';

function makeTarget(overrides: Partial<ReturnTarget> = {}): ReturnTarget {
  return {
    processCode: 'PREP',
    processName: 'Preparación',
    orderIndex: 2,
    ...overrides,
  };
}

describe('sortReturnTargets', () => {
  it('ordena por orderIndex descendente (el más cercano primero)', () => {
    const bodywork = makeTarget({ processCode: 'BODYWORK', processName: 'Chapería', orderIndex: 1 });
    const prep     = makeTarget({ processCode: 'PREP', processName: 'Preparación', orderIndex: 2 });

    expect(sortReturnTargets([bodywork, prep]).map(t => t.processCode)).toEqual(['PREP', 'BODYWORK']);
  });

  it('con 3+ destinos disponibles (caso central de esta funcionalidad: elegir uno NO inmediato), ordena todos correctamente del más cercano al más lejano', () => {
    const bodywork = makeTarget({ processCode: 'BODYWORK', processName: 'Chapería', orderIndex: 1 });
    const prep     = makeTarget({ processCode: 'PREP', processName: 'Preparación', orderIndex: 2 });
    const paint    = makeTarget({ processCode: 'PAINT', processName: 'Pintura', orderIndex: 3 });

    // Desde Pulida (orderIndex 4), llegan desordenados (como podrían venir
    // de cualquier fuente, no solo del backend ya ordenado).
    expect(sortReturnTargets([bodywork, paint, prep]).map(t => t.processCode))
      .toEqual(['PAINT', 'PREP', 'BODYWORK']);
  });

  it('no muta el array original', () => {
    const bodywork = makeTarget({ processCode: 'BODYWORK', orderIndex: 1 });
    const prep     = makeTarget({ processCode: 'PREP', orderIndex: 2 });
    const original = [bodywork, prep];

    sortReturnTargets(original);

    expect(original.map(t => t.processCode)).toEqual(['BODYWORK', 'PREP']);
  });
});

describe('computeCascadeTargets', () => {
  it('devuelve los destinos con orderIndex mayor al elegido (se devolverán en cascada)', () => {
    const bodywork = makeTarget({ processCode: 'BODYWORK', processName: 'Chapería', orderIndex: 1 });
    const prep     = makeTarget({ processCode: 'PREP', processName: 'Preparación', orderIndex: 2 });
    const targets  = [prep, bodywork];

    expect(computeCascadeTargets(targets, 'BODYWORK').map(t => t.processCode)).toEqual(['PREP']);
  });

  it('devuelve array vacío cuando el elegido es el más cercano (nada que saltar)', () => {
    const bodywork = makeTarget({ processCode: 'BODYWORK', processName: 'Chapería', orderIndex: 1 });
    const prep     = makeTarget({ processCode: 'PREP', processName: 'Preparación', orderIndex: 2 });
    const targets  = [prep, bodywork];

    expect(computeCascadeTargets(targets, 'PREP')).toEqual([]);
  });

  it('devuelve array vacío cuando el processCode elegido no está en la lista de destinos', () => {
    const bodywork = makeTarget({ processCode: 'BODYWORK', processName: 'Chapería', orderIndex: 1 });

    expect(computeCascadeTargets([bodywork], 'NONEXISTENT')).toEqual([]);
  });

  it('con 3 destinos disponibles, elegir el MÁS LEJANO (no el inmediato) marca los 2 intermedios como cascada — el caso central de esta funcionalidad', () => {
    const bodywork = makeTarget({ processCode: 'BODYWORK', processName: 'Chapería', orderIndex: 1 });
    const prep     = makeTarget({ processCode: 'PREP', processName: 'Preparación', orderIndex: 2 });
    const paint    = makeTarget({ processCode: 'PAINT', processName: 'Pintura', orderIndex: 3 });
    const targets  = [paint, prep, bodywork]; // ya ordenados, como los manda el backend

    expect(computeCascadeTargets(targets, 'BODYWORK').map(t => t.processCode))
      .toEqual(['PAINT', 'PREP']);
  });

  it('con 3 destinos disponibles, elegir el intermedio marca solo el más lejano como cascada, no el más cercano', () => {
    const bodywork = makeTarget({ processCode: 'BODYWORK', processName: 'Chapería', orderIndex: 1 });
    const prep     = makeTarget({ processCode: 'PREP', processName: 'Preparación', orderIndex: 2 });
    const paint    = makeTarget({ processCode: 'PAINT', processName: 'Pintura', orderIndex: 3 });
    const targets  = [paint, prep, bodywork];

    expect(computeCascadeTargets(targets, 'PREP').map(t => t.processCode)).toEqual(['PAINT']);
  });
});
