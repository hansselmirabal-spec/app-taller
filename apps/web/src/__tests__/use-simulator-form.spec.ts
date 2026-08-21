/**
 * Phase 2 (simulador-pieza-manual): pure derivation functions that back the
 * "estimate" state of the Budget Simulator hook — `splitItems`,
 * `synthesizeManualLine`, and `buildEstimate`. These are unit-tested in
 * isolation (no React rendering, no mocks) because they are pure functions,
 * per the design's data-flow contract in
 * openspec/changes/simulador-pieza-manual/design.md.
 */

import {
  buildEstimate,
  catalogSignature,
  newSimulatorItem,
  splitItems,
  synthesizeManualLine,
  type SimulatorItem,
} from '../app/(dashboard)/presupuesto/simulador/_shared/use-simulator-form';
import type { SimulatorEstimateResult, SimulatorLineResult } from '../lib/api';

function catalogLine(pieza: string): SimulatorLineResult {
  return {
    pieza,
    damageLevel: 'Leve',
    qty: 1,
    breakdown: [{ proceso: 'Reparar', horas: 2, descripcion: `Reparar — ${pieza}` }],
    bodyworkHours: 2,
    prepHours: 0,
    paintHours: 0,
    totalHoras: 2,
    totalMdo: 20000,
  };
}

describe('splitItems', () => {
  it('separates manual rows from catalog rows and keeps their original indices', () => {
    const items: SimulatorItem[] = [
      { ...newSimulatorItem(), pieza: 'Guardabarros DEL. IZQ.' },
      { ...newSimulatorItem(), mode: 'manual', pieza: 'Pieza rara', manualCategory: 'PAINT', manualHours: 3 },
      { ...newSimulatorItem(), pieza: 'Capot' },
    ];

    const { catalogRows, catalogIdx, manualIdx } = splitItems(items);

    expect(catalogRows).toEqual([
      { pieza: 'Guardabarros DEL. IZQ.', damageLevel: 'Leve', qty: 1 },
      { pieza: 'Capot', damageLevel: 'Leve', qty: 1 },
    ]);
    expect(catalogIdx).toEqual([0, 2]);
    expect(manualIdx).toEqual([1]);
  });

  it('returns an empty catalogRows array for a 100% manual item list (no /estimate payload)', () => {
    const items: SimulatorItem[] = [
      { ...newSimulatorItem(), mode: 'manual', pieza: 'A', manualCategory: 'BODYWORK', manualHours: 1 },
      { ...newSimulatorItem(), mode: 'manual', pieza: 'B', manualCategory: 'PREP', manualHours: 2 },
    ];

    const { catalogRows, catalogIdx, manualIdx } = splitItems(items);

    expect(catalogRows).toEqual([]);
    expect(catalogIdx).toEqual([]);
    expect(manualIdx).toEqual([0, 1]);
  });
});

describe('synthesizeManualLine', () => {
  it('computes totalHoras = manualHours × qty and totalMdo = totalHoras × tarifa, with one breakdown entry', () => {
    const item: SimulatorItem = {
      ...newSimulatorItem(), mode: 'manual', pieza: 'Óptica trasera',
      manualCategory: 'PAINT', manualHours: 1.5, qty: 2,
    };

    const line = synthesizeManualLine(item, 100000);

    expect(line.damageLevel).toBe('Manual');
    expect(line.totalHoras).toBe(3);
    expect(line.paintHours).toBe(3);
    expect(line.bodyworkHours).toBe(0);
    expect(line.prepHours).toBe(0);
    expect(line.totalMdo).toBe(300000);
    expect(line.breakdown).toEqual([
      { proceso: 'Pintar', horas: 3, descripcion: 'Pintar — Óptica trasera' },
    ]);
  });

  it('rounds to 2 decimals (BODYWORK category) instead of leaking floating-point noise', () => {
    const item: SimulatorItem = {
      ...newSimulatorItem(), mode: 'manual', pieza: 'Paragolpe DEL.',
      manualCategory: 'BODYWORK', manualHours: 0.3, qty: 3,
    };

    const line = synthesizeManualLine(item, 50000);

    // 0.3 * 3 === 0.8999999999999999 in raw floating point — must round to 0.9
    expect(line.totalHoras).toBe(0.9);
    expect(line.bodyworkHours).toBe(0.9);
    expect(line.paintHours).toBe(0);
    expect(line.prepHours).toBe(0);
    expect(line.breakdown[0].proceso).toBe('Reparar');
    expect(line.totalMdo).toBe(45000);
  });
});

describe('buildEstimate', () => {
  it('merges catalog and manual lines, preserving the original on-screen row order', () => {
    const items: SimulatorItem[] = [
      { ...newSimulatorItem(), pieza: 'Guardabarros DEL. IZQ.' },
      { ...newSimulatorItem(), mode: 'manual', pieza: 'Pieza rara', manualCategory: 'BODYWORK', manualHours: 2 },
      { ...newSimulatorItem(), pieza: 'Capot' },
    ];
    const catalogRows = [
      { pieza: 'Guardabarros DEL. IZQ.', damageLevel: 'Leve' as const, qty: 1 },
      { pieza: 'Capot', damageLevel: 'Leve' as const, qty: 1 },
    ];
    const catalogResult = {
      signature: catalogSignature(catalogRows),
      result: {
        lines: [catalogLine('Guardabarros DEL. IZQ.'), catalogLine('Capot')],
        bodyworkHours: 4, prepHours: 0, paintHours: 0, totalHoras: 4, totalMdo: 40000,
        tarifa: 10000, moneda: 'PYG',
      } as SimulatorEstimateResult,
    };

    const estimate = buildEstimate(items, catalogResult, 10000, 'PYG');

    expect(estimate).not.toBeNull();
    expect(estimate!.lines.map(l => l.pieza)).toEqual(['Guardabarros DEL. IZQ.', 'Pieza rara', 'Capot']);
    expect(estimate!.lines[1].damageLevel).toBe('Manual');
    expect(estimate!.bodyworkHours).toBe(4 + 2); // 2 catalog lines (2h each) + 1 manual line (2h)
    expect(estimate!.totalHoras).toBe(4 + 2);    // catalog aggregate (4h) + manual line (2h)
  });

  it('computes a 100%-manual budget without any catalogResult (no /estimate call needed)', () => {
    const items: SimulatorItem[] = [
      { ...newSimulatorItem(), mode: 'manual', pieza: 'Pieza rara', manualCategory: 'PREP', manualHours: 2 },
    ];

    const estimate = buildEstimate(items, null, 10000, 'PYG');

    expect(estimate).not.toBeNull();
    expect(estimate!.lines).toHaveLength(1);
    expect(estimate!.lines[0].damageLevel).toBe('Manual');
    expect(estimate!.prepHours).toBe(2);
    expect(estimate!.totalMdo).toBe(20000);
  });

  it('returns null when the stored catalogResult signature does not match the current catalog rows (stale/race-safe)', () => {
    const items: SimulatorItem[] = [
      { ...newSimulatorItem(), pieza: 'Guardabarros DEL. IZQ.' },
    ];
    const staleCatalogResult = {
      signature: catalogSignature([{ pieza: 'Otra pieza', damageLevel: 'Leve' as const, qty: 1 }]),
      result: {
        lines: [catalogLine('Otra pieza')],
        bodyworkHours: 2, prepHours: 0, paintHours: 0, totalHoras: 2, totalMdo: 20000,
        tarifa: 10000, moneda: 'PYG',
      } as SimulatorEstimateResult,
    };

    const estimate = buildEstimate(items, staleCatalogResult, 10000, 'PYG');

    expect(estimate).toBeNull();
  });

  it('returns null while a manual row is missing its category (incomplete row is never forwarded)', () => {
    const items: SimulatorItem[] = [
      { ...newSimulatorItem(), mode: 'manual', pieza: 'Pieza rara', manualHours: 2 }, // no manualCategory
    ];

    const estimate = buildEstimate(items, null, 10000, 'PYG');

    expect(estimate).toBeNull();
  });
});
