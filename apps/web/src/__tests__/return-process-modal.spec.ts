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
});
