/**
 * Phase 3 (simulador-pieza-manual): integration-level assertions for a
 * 100%-manual (and mixed) budget across its downstream consumers — PDF
 * labels, WhatsApp text, and the save payload.
 *
 * Note on file extension: the tasks artifact names this
 * `simulator-manual-integration.spec.tsx`, implying component rendering.
 * This repo's jest config (`testRegex: '.*\\.spec\\.ts$'`) only picks up
 * `.spec.ts` files and there is no @testing-library/react dependency
 * installed (confirmed: not in package.json) — the established pattern
 * here (see use-simulator-form.spec.ts) is testing pure exported functions
 * instead of rendering.
 *
 * `BudgetPdfDocument` additionally cannot be *imported* at all under this
 * jest config: `budget-pdf.tsx` pulls in `@react-pdf/renderer`, which ships
 * ESM that jest's ts-jest transform (configured to ignore `node_modules`)
 * cannot parse — confirmed by a `SyntaxError: Cannot use import statement
 * outside a module` when this file previously imported it directly. So the
 * PDF-label coverage below reads the source text instead of importing the
 * module, the same static-assertion style as the catalog-mutation guard
 * test (`use-simulator-form-guard.spec.ts`).
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildEstimate, buildWhatsAppMessage, estimateToBudgetPayload, catalogSignature, newSimulatorItem,
} from '../app/(dashboard)/presupuesto/simulador/_shared/use-simulator-form';
import type { SimulatorItem } from '../app/(dashboard)/presupuesto/simulador/_shared/use-simulator-form';
import type { SimulatorEstimateResult, SimulatorLineResult } from '../lib/api';

const BUDGET_PDF_PATH = join(__dirname, '..', 'components', 'budget', 'budget-pdf.tsx');

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

describe('PDF label/color completeness for manual rows', () => {
  it('DAMAGE_LABEL and DAMAGE_COLOR both declare a real "Manual" entry (Record<LineDamageLabel,…> forces this at compile time, verified here at the source level)', () => {
    const source = readFileSync(BUDGET_PDF_PATH, 'utf-8');
    const damageLabelBlock = source.slice(source.indexOf('DAMAGE_LABEL'), source.indexOf('};', source.indexOf('DAMAGE_LABEL')));
    const damageColorBlock = source.slice(source.indexOf('DAMAGE_COLOR'), source.indexOf('};', source.indexOf('DAMAGE_COLOR')));

    expect(damageLabelBlock).toMatch(/Manual:\s*'Manual'/);
    expect(damageColorBlock).toMatch(/Manual:\s*'#[0-9a-fA-F]{6}'/);
  });

  it('a synthesized manual line always has damageLevel "Manual" — the exact key the PDF looks up', () => {
    const items: SimulatorItem[] = [
      { ...newSimulatorItem(), mode: 'manual', pieza: 'Óptica trasera', manualCategory: 'PAINT', manualHours: 2 },
    ];
    const estimate = buildEstimate(items, null, 10000, 'PYG')!;

    expect(estimate.lines[0].damageLevel).toBe('Manual');
  });
});

describe('WhatsApp message for a 100%-manual budget', () => {
  it('contains no "undefined" or "NaN" and lists the manual row with its label and hours', () => {
    const items: SimulatorItem[] = [
      { ...newSimulatorItem(), mode: 'manual', pieza: 'Pieza rara', manualCategory: 'BODYWORK', manualHours: 2 },
    ];
    const estimate = buildEstimate(items, null, 10000, 'PYG')!;

    const msg = buildWhatsAppMessage(estimate, {
      plate: 'aaca898', customerName: 'Juan Pérez', phone: '0981000000', budgetNumber: '', notes: '',
    });

    expect(msg).not.toMatch(/undefined/i);
    expect(msg).not.toMatch(/NaN/);
    expect(msg).toContain('Pieza rara');
    expect(msg).toContain('(Manual)');
  });

  it('mixed catalog + manual budget: no undefined/NaN across both row kinds', () => {
    const items: SimulatorItem[] = [
      { ...newSimulatorItem(), pieza: 'Guardabarros DEL. IZQ.' },
      { ...newSimulatorItem(), mode: 'manual', pieza: 'Pieza rara', manualCategory: 'PREP', manualHours: 1 },
    ];
    const catalogRows = [{ pieza: 'Guardabarros DEL. IZQ.', damageLevel: 'Leve' as const, qty: 1 }];
    const catalogResult = {
      signature: catalogSignature(catalogRows),
      result: {
        lines: [catalogLine('Guardabarros DEL. IZQ.')],
        bodyworkHours: 2, prepHours: 0, paintHours: 0, totalHoras: 2, totalMdo: 20000,
        tarifa: 10000, moneda: 'PYG',
      } as SimulatorEstimateResult,
    };
    const estimate = buildEstimate(items, catalogResult, 10000, 'PYG')!;

    const msg = buildWhatsAppMessage(estimate, {
      plate: 'AACA898', customerName: 'Juan Pérez', phone: '', budgetNumber: '42', notes: '',
    });

    expect(msg).not.toMatch(/undefined/i);
    expect(msg).not.toMatch(/NaN/);
    expect(msg).toContain('Guardabarros DEL. IZQ.');
    expect(msg).toContain('Pieza rara');
  });
});

describe('estimateToBudgetPayload for a manual-only budget', () => {
  it('persists the manual piece with damageLevel "Manual" and no undefined fields', () => {
    const items: SimulatorItem[] = [
      { ...newSimulatorItem(), mode: 'manual', pieza: 'Pieza rara', manualCategory: 'PAINT', manualHours: 1.5, qty: 2 },
    ];
    const estimate = buildEstimate(items, null, 10000, 'PYG')!;

    const { processes, pieces } = estimateToBudgetPayload(estimate);

    expect(pieces).toHaveLength(1);
    expect(pieces[0].damageLevel).toBe('Manual');
    expect(pieces[0].pieza).toBe('Pieza rara');
    expect(pieces[0].totalHoras).toBe(3);
    expect(processes).toEqual([{ code: 'PAINT', name: 'Pintura', hours: 3 }]);
  });
});
