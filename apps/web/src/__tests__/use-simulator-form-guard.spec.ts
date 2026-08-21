/**
 * Phase 3 (simulador-pieza-manual): non-negotiable guard — a manual piece
 * must never be persisted into `bodyshop_catalog`. Zero calls to
 * `createCatalogItem`/`updateCatalogItem` from any file in the manual-mode
 * save path, and `estimateToBudgetPayload` never emits a catalog-shaped
 * payload for a manual row.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildEstimate, estimateToBudgetPayload, newSimulatorItem,
} from '../app/(dashboard)/presupuesto/simulador/_shared/use-simulator-form';
import type { SimulatorItem } from '../app/(dashboard)/presupuesto/simulador/_shared/use-simulator-form';

const SIMULADOR_DIR = join(__dirname, '..', 'app', '(dashboard)', 'presupuesto', 'simulador');

const GUARDED_FILES = [
  join(SIMULADOR_DIR, '_shared', 'use-simulator-form.ts'),
  join(SIMULADOR_DIR, '_shared', 'simulator-form.tsx'),
  join(SIMULADOR_DIR, 'page.tsx'),
  join(SIMULADOR_DIR, '[id]', 'page.tsx'),
];

describe('manual-mode source files never reference catalog mutation functions', () => {
  it.each(GUARDED_FILES)('%s does not import or call createCatalogItem/updateCatalogItem', (filePath) => {
    const source = readFileSync(filePath, 'utf-8');
    expect(source).not.toMatch(/createCatalogItem/);
    expect(source).not.toMatch(/updateCatalogItem/);
  });
});

describe('manual-only save payload never targets the catalog', () => {
  it('estimateToBudgetPayload output for a manual-only estimate is BudgetAppointment-shaped, never catalog-shaped', () => {
    const items: SimulatorItem[] = [
      { ...newSimulatorItem(), mode: 'manual', pieza: 'Pieza rara', manualCategory: 'BODYWORK', manualHours: 2 },
    ];
    const estimate = buildEstimate(items, null, 10000, 'PYG')!;

    const payload = estimateToBudgetPayload(estimate);

    // Only the two keys a BudgetAppointment PATCH/POST expects — no
    // catalog-shaped fields (e.g. `code`/`horas`/`descripcionFinal`/`active`
    // at the top level, which is what createCatalogItem/updateCatalogItem
    // accept) ever leak into this payload.
    expect(Object.keys(payload).sort()).toEqual(['pieces', 'processes']);
    expect(payload).not.toHaveProperty('active');
    expect(payload).not.toHaveProperty('descripcionFinal');
  });
});
