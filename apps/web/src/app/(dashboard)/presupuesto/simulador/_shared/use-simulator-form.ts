'use client';

import { useEffect, useRef, useState } from 'react';
import { randomId } from '@/lib/utils';
import { useBudgetSimulatorPiezas, useBudgetSimulatorEstimate } from '@/hooks/use-budget-simulator';
import { useVehicleLookup } from '@/hooks/use-vehicle-lookup';
import type { DamageLevel, SimulatorEstimateResult } from '@/lib/api';

export interface SimulatorItem {
  id: string;
  pieza: string;
  damageLevel: DamageLevel;
  qty: number;
}

// Chapas y chasis siempre incluyen letras. Un valor solo numérico suele ser
// un número de OT o de cliente ingresado por error en este campo (mismo
// criterio que en Agenda → Nuevo Ingreso).
function looksLikePlateOrChassis(value: string): boolean {
  return /[A-Z]/i.test(value);
}

export function newSimulatorItem(): SimulatorItem {
  return { id: randomId(), pieza: '', damageLevel: 'Leve', qty: 1 };
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
  const [items, setItems]       = useState<SimulatorItem[]>([newSimulatorItem()]);
  const [estimate, setEstimate] = useState<SimulatorEstimateResult | null>(null);
  const [error, setError]       = useState('');

  const { lookup, isLooking, vehicleData } = useVehicleLookup();

  const { data: piezasData } = useBudgetSimulatorPiezas();
  const estimateMutation     = useBudgetSimulatorEstimate();

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

  // Debounced auto-estimate
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const allFilled = items.every(i => i.pieza !== '');
    if (!allFilled) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await estimateMutation.mutateAsync(
          items.map(i => ({ pieza: i.pieza, damageLevel: i.damageLevel, qty: i.qty }))
        );
        setEstimate(result);
        setError('');
      } catch (err: any) {
        setError(err.message ?? 'Error al estimar');
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  function updateItem(id: string, patch: Partial<Omit<SimulatorItem, 'id'>>) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
    setEstimate(null);
  }

  function removeItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id));
    setEstimate(null);
  }

  function addItem() {
    setItems(prev => [...prev, newSimulatorItem()]);
  }

  function handleWhatsApp() {
    if (!estimate) return;
    const lines = estimate.lines.map(l => {
      const procs = l.breakdown.map(b => `  • ${b.descripcion}: ${b.horas}h`).join('\n');
      return `*${l.pieza}* (${l.damageLevel}) — ${l.totalHoras}h\n${procs}`;
    }).join('\n\n');

    const msg = [
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
    estimate, setEstimate,
    error,
    isEstimating: estimateMutation.isPending,

    handleWhatsApp,
  };
}
