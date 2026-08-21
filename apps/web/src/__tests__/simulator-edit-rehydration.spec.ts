/**
 * Phase 3 (simulador-pieza-manual): `pieceToItem` — rehydrates a persisted
 * BudgetPiece back into a SimulatorItem when opening a saved budget in edit
 * mode (`simulador/[id]/page.tsx`). Pure function, tested in isolation per
 * the project's established pattern (see use-simulator-form.spec.ts).
 */

import { pieceToItem } from '../app/(dashboard)/presupuesto/simulador/_shared/use-simulator-form';
import type { BudgetPiece } from '../types';

describe('pieceToItem', () => {
  it('rehydrates a catalog piece unchanged (mode: catalog)', () => {
    const piece: BudgetPiece = {
      pieza: 'Guardabarros DEL. IZQ.',
      damageLevel: 'Grave',
      qty: 2,
      breakdown: [{ proceso: 'Reparar', horas: 4, descripcion: 'Reparar — Guardabarros DEL. IZQ.' }],
      totalHoras: 4,
    };

    const item = pieceToItem(piece);

    expect(item.mode).toBe('catalog');
    expect(item.pieza).toBe('Guardabarros DEL. IZQ.');
    expect(item.damageLevel).toBe('Grave');
    expect(item.qty).toBe(2);
    expect(item.manualCategory).toBeUndefined();
    expect(item.manualHours).toBeUndefined();
  });

  it('rehydrates a manual piece to mode:manual, recovering manualHours from totalHoras/qty', () => {
    const piece: BudgetPiece = {
      pieza: 'Pieza rara',
      damageLevel: 'Manual',
      qty: 2,
      breakdown: [{ proceso: 'Pintar', horas: 3, descripcion: 'Pintar — Pieza rara' }],
      totalHoras: 3, // synthesizeManualLine: round2(manualHours × qty) = round2(1.5 × 2)
    };

    const item = pieceToItem(piece);

    expect(item.mode).toBe('manual');
    expect(item.pieza).toBe('Pieza rara');
    expect(item.qty).toBe(2);
    expect(item.manualHours).toBe(1.5);
    expect(item.manualCategory).toBe('PAINT');
  });

  it.each([
    ['Reparar', 'BODYWORK'],
    ['Preparacion', 'PREP'],
    ['Pintar', 'PAINT'],
  ] as const)('maps breakdown proceso %s back to manualCategory %s', (proceso, expectedCategory) => {
    const piece: BudgetPiece = {
      pieza: 'X',
      damageLevel: 'Manual',
      qty: 1,
      breakdown: [{ proceso, horas: 2, descripcion: `${proceso} — X` }],
      totalHoras: 2,
    };

    const item = pieceToItem(piece);

    expect(item.manualCategory).toBe(expectedCategory);
  });

  it('falls back to qty=1 and BODYWORK when qty or breakdown are missing/degenerate', () => {
    const piece: BudgetPiece = {
      pieza: 'Pieza sin breakdown',
      damageLevel: 'Manual',
      qty: 0,
      breakdown: [],
      totalHoras: 2,
    };

    const item = pieceToItem(piece);

    expect(item.qty).toBe(1);
    expect(item.manualHours).toBe(2);
    expect(item.manualCategory).toBe('BODYWORK');
  });
});
