'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { randomId } from '@/lib/utils';
import {
  useBudgetSimulatorPiezas, useBudgetSimulatorEstimate, useBudgetSimulatorConfig,
} from '@/hooks/use-budget-simulator';
import { useVehicleLookup } from '@/hooks/use-vehicle-lookup';
import type { DamageLevel, SimulatorEstimateItem, SimulatorEstimateResult, SimulatorLineResult, SimulatorProcessBreakdown } from '@/lib/api';
import type { BudgetPiece } from '@/types';

export type ManualCategory = 'BODYWORK' | 'PREP' | 'PAINT';

export interface SimulatorItem {
  id: string;
  pieza: string;
  damageLevel: DamageLevel;
  qty: number;
  /** 'catalog' (default) reaches POST /budget-simulator/estimate; 'manual' is synthesized client-side. */
  mode: 'catalog' | 'manual';
  /** Manual mode only — required before the row is counted in the estimate. */
  manualCategory?: ManualCategory;
  /** Manual mode only — must be > 0 before the row is counted in the estimate. */
  manualHours?: number;
}

/** Cached batch-estimate result, keyed by a signature of the catalog rows that produced it. */
export interface CatalogEstimateResult {
  signature: string;
  result: SimulatorEstimateResult;
}

// Chapas y chasis siempre incluyen letras. Un valor solo numérico suele ser
// un número de OT o de cliente ingresado por error en este campo (mismo
// criterio que en Agenda → Nuevo Ingreso).
function looksLikePlateOrChassis(value: string): boolean {
  return /[A-Z]/i.test(value);
}

export function newSimulatorItem(): SimulatorItem {
  return { id: randomId(), pieza: '', damageLevel: 'Leve', qty: 1, mode: 'catalog' };
}

// Redondea a 2 decimales — manualHours × qty en JS puede dar ruido de punto
// flotante (0.3 * 3 === 0.8999999999999999); mismo patrón que round2() en
// lib/bodyshop-analytics.ts.
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isRowReady(item: SimulatorItem): boolean {
  if (item.mode === 'manual') {
    return item.pieza.trim() !== '' && item.manualCategory != null && (item.manualHours ?? 0) > 0;
  }
  return item.pieza !== '';
}

interface SplitItemsResult {
  catalogRows: SimulatorEstimateItem[];
  /** Index of each catalogRows entry in the original `items` array. */
  catalogIdx: number[];
  /** Index of each manual row in the original `items` array. */
  manualIdx: number[];
}

/** Separates catalog rows (destined for the batch estimate call) from manual rows, preserving original indices for the merge-back step. */
export function splitItems(items: SimulatorItem[]): SplitItemsResult {
  const catalogRows: SimulatorEstimateItem[] = [];
  const catalogIdx: number[] = [];
  const manualIdx: number[] = [];

  items.forEach((item, idx) => {
    if (item.mode === 'manual') {
      manualIdx.push(idx);
    } else {
      catalogRows.push({ pieza: item.pieza, damageLevel: item.damageLevel, qty: item.qty });
      catalogIdx.push(idx);
    }
  });

  return { catalogRows, catalogIdx, manualIdx };
}

/** Content-based signature for a set of catalog rows — used to key the cached batch-estimate result and to detect stale/out-of-order responses. */
export function catalogSignature(rows: SimulatorEstimateItem[]): string {
  return JSON.stringify(rows.map(r => [r.pieza, r.damageLevel, r.qty]));
}

const MANUAL_PROCESO_BY_CATEGORY: Record<ManualCategory, string> = {
  BODYWORK: 'Reparar',
  PREP: 'Preparacion',
  PAINT: 'Pintar',
};

// Inverse of MANUAL_PROCESO_BY_CATEGORY — used to rehydrate a saved manual
// piece's category from its persisted breakdown[0].proceso.
const MANUAL_CATEGORY_BY_PROCESO: Record<string, ManualCategory> = {
  Reparar: 'BODYWORK',
  Preparacion: 'PREP',
  Pintar: 'PAINT',
};

/**
 * Rehydrates a persisted BudgetPiece (from an already-saved appointment)
 * back into a SimulatorItem. A piece with `damageLevel === 'Manual'` was
 * synthesized by synthesizeManualLine and is rehydrated as a manual row —
 * `manualHours` is the inverse of `horas = round2(manualHours × qty)`, and
 * `manualCategory` is recovered from the single breakdown entry's `proceso`.
 * Every other piece rehydrates as a catalog row, unchanged from today.
 */
export function pieceToItem(p: BudgetPiece): SimulatorItem {
  const qty = p.qty > 0 ? p.qty : 1;

  if (p.damageLevel === 'Manual') {
    const proceso = p.breakdown?.[0]?.proceso;
    const manualCategory = (proceso ? MANUAL_CATEGORY_BY_PROCESO[proceso] : undefined) ?? 'BODYWORK';
    return {
      id: randomId(),
      pieza: p.pieza,
      damageLevel: 'Leve', // unused in manual mode — kept for the field's required DamageLevel type
      qty,
      mode: 'manual',
      manualCategory,
      manualHours: (p.totalHoras ?? 0) / qty,
    };
  }

  return {
    id: randomId(),
    pieza: p.pieza,
    damageLevel: p.damageLevel as DamageLevel,
    qty,
    mode: 'catalog',
  };
}

/** Synthesizes a manual row into the same SimulatorLineResult shape the backend returns for catalog rows, so every downstream consumer keeps walking one estimate.lines array. */
export function synthesizeManualLine(item: SimulatorItem, tarifa: number): SimulatorLineResult {
  const category = item.manualCategory ?? 'BODYWORK';
  const proceso = MANUAL_PROCESO_BY_CATEGORY[category];
  const horas = round2((item.manualHours ?? 0) * item.qty);
  // Math.round (no round2) — mismo criterio que el backend para montos en
  // Gs. (budget-simulator.service.ts), que no tiene subunidad fraccionaria.
  const totalMdo = Math.round(horas * tarifa);
  const breakdown: SimulatorProcessBreakdown[] = [
    { proceso, horas, descripcion: `${proceso} — ${item.pieza}` },
  ];

  return {
    pieza: item.pieza,
    damageLevel: 'Manual',
    qty: item.qty,
    breakdown,
    bodyworkHours: category === 'BODYWORK' ? horas : 0,
    prepHours: category === 'PREP' ? horas : 0,
    paintHours: category === 'PAINT' ? horas : 0,
    totalHoras: horas,
    totalMdo,
  };
}

/**
 * Derives `estimate` from the union of catalog rows (via the cached batch
 * result) and manual rows (synthesized here), merged back at their original
 * on-screen index. Returns null until every row is ready, or when the
 * cached catalog result is stale relative to the current catalog rows.
 */
export function buildEstimate(
  items: SimulatorItem[],
  catalogResult: CatalogEstimateResult | null,
  tarifa: number,
  moneda: string,
): SimulatorEstimateResult | null {
  if (items.length === 0) return null;
  if (!items.every(isRowReady)) return null;

  const { catalogRows, catalogIdx, manualIdx } = splitItems(items);

  let catalogLines: SimulatorLineResult[] = [];
  if (catalogRows.length > 0) {
    const signature = catalogSignature(catalogRows);
    if (!catalogResult || catalogResult.signature !== signature) return null;
    catalogLines = catalogResult.result.lines;
  }

  const lines: SimulatorLineResult[] = new Array(items.length);
  catalogIdx.forEach((originalIdx, k) => { lines[originalIdx] = catalogLines[k]; });
  manualIdx.forEach(originalIdx => { lines[originalIdx] = synthesizeManualLine(items[originalIdx], tarifa); });

  const sum = (pick: (l: SimulatorLineResult) => number) => round2(lines.reduce((acc, l) => acc + pick(l), 0));
  const totalHoras = sum(l => l.totalHoras);

  return {
    lines,
    bodyworkHours: sum(l => l.bodyworkHours),
    prepHours: sum(l => l.prepHours),
    paintHours: sum(l => l.paintHours),
    totalHoras,
    // Redondeo de la suma, NO suma de redondeos — mismo criterio que el
    // agregado del backend (budget-simulator.service.ts), que calcula
    // Math.round(totalHoras agregado × tarifa) en vez de sumar el totalMdo
    // ya redondeado de cada línea (sumar redondeos diverge del redondeo de
    // la suma, ej. 2 líneas de 0.5h a tarifa 3 → suma de redondeos = 4,
    // redondeo de la suma = 3).
    totalMdo: Math.round(totalHoras * tarifa),
    tarifa,
    moneda,
  };
}

// Shared by create-mode save (simulador/page.tsx) and edit-mode save
// (simulador/[id]/page.tsx) — both PATCH/POST the same processes/pieces
// shape onto a BudgetAppointment, kept in one place so the process
// codes/labels can't drift out of sync between the two save paths.
export function estimateToBudgetPayload(estimate: SimulatorEstimateResult) {
  const processes = [
    ...(estimate.bodyworkHours > 0 ? [{ code: 'BODYWORK', name: 'Chapería',    hours: estimate.bodyworkHours }] : []),
    ...(estimate.prepHours    > 0 ? [{ code: 'PREP',     name: 'Preparación', hours: estimate.prepHours    }] : []),
    ...(estimate.paintHours   > 0 ? [{ code: 'PAINT',    name: 'Pintura',     hours: estimate.paintHours   }] : []),
  ];
  const pieces = estimate.lines.map(l => ({
    pieza:       l.pieza,
    damageLevel: l.damageLevel,
    qty:         l.qty,
    breakdown:   l.breakdown,
    totalHoras:  l.totalHoras,
  }));
  return { processes, pieces };
}

interface WhatsAppHeader {
  plate: string;
  customerName: string;
  phone: string;
  budgetNumber: string;
  notes: string;
}

/**
 * Builds the WhatsApp share text for an estimate — extracted as a pure
 * function so it can be unit-tested without opening a browser window.
 * `line.damageLevel` is a `LineDamageLabel` ('Leve'|'Medio'|'Grave'|
 * 'Sustitucion'|'Manual'), so a manual row renders "(Manual)" here, never
 * `undefined`.
 */
export function buildWhatsAppMessage(estimate: SimulatorEstimateResult, header: WhatsAppHeader): string {
  const { plate, customerName, phone, budgetNumber, notes } = header;
  const lines = estimate.lines.map(l => {
    const procs = l.breakdown.map(b => `  • ${b.descripcion}: ${b.horas}h`).join('\n');
    return `*${l.pieza}* (${l.damageLevel}) — ${l.totalHoras}h\n${procs}`;
  }).join('\n\n');

  return [
    `*Presupuesto de Reparación*`,
    budgetNumber ? `N° ${budgetNumber}` : '',
    ``,
    `*Cliente:* ${customerName || '—'}`,
    `*Patente:* ${plate.toUpperCase() || '—'}`,
    phone ? `*Tel:* ${phone}` : '',
    ``,
    `*Detalle de trabajos:*`,
    lines,
    ``,
    `*Chapería:* ${estimate.bodyworkHours}h  |  *Preparación:* ${estimate.prepHours}h  |  *Pintura:* ${estimate.paintHours}h`,
    `*Total horas:* ${estimate.totalHoras}h`,
    `*Costo mano de obra:* ${estimate.moneda} ${estimate.totalMdo.toLocaleString('es-PY')}`,
    ``,
    notes ? `_${notes}_` : '',
    `_Solo mano de obra · No incluye repuestos · Válido 30 días_`,
  ].filter(Boolean).join('\n');
}

/**
 * Shared vehicle-header + items-list + estimate state and logic used by both
 * the "create" Simulator (`simulador/page.tsx`) and, later, the "edit"
 * Simulator (`simulador/[id]/page.tsx`). Save/enter-taller mutations stay
 * out of this hook — they differ per mode and are owned by each page.
 */
export function useSimulatorForm() {
  // Vehicle header
  const [plate, setPlate]               = useState('');
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone]               = useState('');
  const [budgetNumber, setBudgetNumber] = useState('');
  const [notes, setNotes]               = useState('');
  const [plateSearchError, setPlateSearchError] = useState('');

  // Items
  const [items, setItems] = useState<SimulatorItem[]>([newSimulatorItem()]);
  const [catalogResult, setCatalogResult] = useState<CatalogEstimateResult | null>(null);
  const [error, setError] = useState('');

  const { lookup, isLooking, vehicleData } = useVehicleLookup();

  const { data: piezasData } = useBudgetSimulatorPiezas();
  const estimateMutation     = useBudgetSimulatorEstimate();
  const { data: config }     = useBudgetSimulatorConfig();

  // tarifaMdo/moneda are session-invariant (GET /budget-simulator/config,
  // staleTime: Infinity) — fall back to the last batch-estimate response
  // while the config query is still resolving, and finally to safe defaults
  // so a manual-only budget can always compute totalMdo.
  const tarifa = config?.tarifaMdo ?? catalogResult?.result?.tarifa ?? 0;
  const moneda = config?.moneda ?? catalogResult?.result?.moneda ?? 'PYG';

  // Derived, not stored — every downstream consumer (SummaryBar, per-row
  // breakdown, WhatsApp, estimateToBudgetPayload) keeps reading `estimate`
  // unchanged, but it now reflects manual-only budgets too.
  const estimate = useMemo(
    () => buildEstimate(items, catalogResult, tarifa, moneda),
    [items, catalogResult, tarifa, moneda],
  );

  async function handlePlateLookup() {
    const value = plate.trim().toUpperCase();
    if (!value) return;
    if (!looksLikePlateOrChassis(value)) {
      setPlateSearchError('Eso no parece una chapa ni un chasis (¿será un número de OT o de cliente?). La chapa lleva letras, ej: AACA898.');
      return;
    }
    setPlateSearchError('');
    const data = await lookup(value);
    if (data) {
      // Siempre pisa el nombre con el de la chapa buscada — mismo fix que
      // presupuesto/nueva-cita (reportado por el usuario 2026-08-14).
      setCustomerName(data.customerName);
    } else {
      setPlateSearchError('Vehículo no encontrado en DMS');
    }
  }

  const piezas = (piezasData ?? [])
    .map((p: { pieza: string; grupo: number }) => p.pieza)
    .sort((a: string, b: string) => a.localeCompare(b));

  // Debounced auto-estimate — only catalog rows ever reach the batch call;
  // manual rows are synthesized in `estimate` (see buildEstimate above).
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the signature of the most recently *requested* catalog rows, so
  // an out-of-order response from a superseded request can never overwrite
  // a newer one (closes the race the previous setEstimate(null)-based
  // invalidation left open).
  const latestSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (!items.every(isRowReady)) return;

    const { catalogRows } = splitItems(items);
    if (catalogRows.length === 0) return; // 100% manual budget — no network call at all

    const signature = catalogSignature(catalogRows);
    latestSignatureRef.current = signature;

    // Cache hit: catalog content hasn't actually changed (e.g. only a
    // manual row's fields were edited) — skip the redundant request.
    if (catalogResult?.signature === signature) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await estimateMutation.mutateAsync(catalogRows);
        if (latestSignatureRef.current !== signature) return; // superseded by a newer request
        setCatalogResult({ signature, result });
        setError('');
      } catch (err: any) {
        if (latestSignatureRef.current !== signature) return;
        setError(err.message ?? 'Error al estimar');
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  function updateItem(id: string, patch: Partial<Omit<SimulatorItem, 'id'>>) {
    setItems(prev => prev.map(i => {
      if (i.id !== id) return i;
      // Toggling mode resets pieza so a stale catalog selection can never
      // leak into a manual row (or vice versa) — per design.
      if (patch.mode && patch.mode !== i.mode) return { ...i, ...patch, pieza: '' };
      return { ...i, ...patch };
    }));
  }

  function removeItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id));
  }

  function addItem() {
    setItems(prev => [...prev, newSimulatorItem()]);
  }

  function handleWhatsApp() {
    if (!estimate) return;
    const msg = buildWhatsAppMessage(estimate, { plate, customerName, phone, budgetNumber, notes });
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  }

  return {
    // Vehicle header
    plate, setPlate,
    customerName, setCustomerName,
    phone, setPhone,
    budgetNumber, setBudgetNumber,
    notes, setNotes,
    plateSearchError, setPlateSearchError,
    isLooking, vehicleData,
    handlePlateLookup,

    // Items
    items, setItems,
    updateItem, removeItem, addItem,
    piezas,

    // Estimate
    estimate,
    error,
    isEstimating: estimateMutation.isPending,

    handleWhatsApp,
  };
}
