'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Calculator, Plus, Trash2, Loader2, CheckCircle2, Wrench, FileDown, MessageCircle } from 'lucide-react';
import dynamic from 'next/dynamic';

const BudgetPdfLink = dynamic(
  () => import('@/components/budget/budget-pdf-link').then(m => m.BudgetPdfLink),
  { ssr: false, loading: () => (
    <button disabled className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-300 text-sm font-semibold cursor-not-allowed">
      <FileDown className="h-4 w-4" /> PDF
    </button>
  )},
);
import { useWorkshopId } from '@/context/workshop-context';
import { formatDate, randomId } from '@/lib/utils';
import { useBudgetSimulatorPiezas, useBudgetSimulatorEstimate } from '@/hooks/use-budget-simulator';
import { useCreateBudgetAppointment, useUpdateBudgetProcesses } from '@/hooks/use-budget-appointments';
import { useVehicleLookup } from '@/hooks/use-vehicle-lookup';
import { createBodyshopEntry } from '@/lib/api';
import type { DamageLevel, SimulatorEstimateResult } from '@/lib/api';

interface Item {
  id: string;
  pieza: string;
  damageLevel: DamageLevel;
  qty: number;
}

const DAMAGE_LEVELS: { value: DamageLevel; label: string }[] = [
  { value: 'Leve',        label: 'Leve'         },
  { value: 'Medio',       label: 'Medio'        },
  { value: 'Grave',       label: 'Grave'        },
  { value: 'Sustitucion', label: 'Sustitución'  },
];

function newItem(): Item {
  return { id: randomId(), pieza: '', damageLevel: 'Leve', qty: 1 };
}

export default function SimuladorPresupuestoPage() {
  const router     = useRouter();
  const workshopId = useWorkshopId();

  // Vehicle header
  const [plate, setPlate]               = useState('');
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone]               = useState('');
  const [budgetNumber, setBudgetNumber] = useState('');
  const [notes, setNotes]               = useState('');

  // Items
  const [items, setItems]   = useState<Item[]>([newItem()]);
  const [estimate, setEstimate] = useState<SimulatorEstimateResult | null>(null);
  const [error, setError]   = useState('');

  // Save as presupuesto modal
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [modalDate, setModalDate]         = useState(formatDate(new Date()));
  const [timeStart, setTimeStart]         = useState('09:00');
  const [timeEnd, setTimeEnd]             = useState('09:30');
  const [isSaving, setIsSaving]           = useState(false);
  const [modalError, setModalError]       = useState('');

  // Ingresar al taller modal
  const [showEnterModal, setShowEnterModal] = useState(false);
  const [enterDate, setEnterDate]           = useState(formatDate(new Date()));
  const [isEntering, setIsEntering]         = useState(false);
  const [enterError, setEnterError]         = useState('');

  const { lookup, isLooking, vehicleData } = useVehicleLookup();

  const { data: piezasData } = useBudgetSimulatorPiezas();
  const estimateMutation     = useBudgetSimulatorEstimate();
  const createMutation       = useCreateBudgetAppointment();
  const updateProcesses      = useUpdateBudgetProcesses();

  async function handlePlateLookup() {
    const data = await lookup(plate);
    if (data && !customerName.trim()) {
      setCustomerName(data.customerName);
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

  function updateItem(id: string, patch: Partial<Omit<Item, 'id'>>) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
    setEstimate(null);
  }

  function removeItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id));
    setEstimate(null);
  }

  function addItem() {
    setItems(prev => [...prev, newItem()]);
  }

  async function handleSave() {
    if (!workshopId)          { setModalError('No hay taller seleccionado'); return; }
    if (!plate.trim())        { setModalError('La chapa es obligatoria'); return; }
    if (!customerName.trim()) { setModalError('El nombre del cliente es obligatorio'); return; }
    if (timeEnd <= timeStart)  { setModalError('La hora de fin debe ser posterior al inicio'); return; }

    setModalError('');
    setIsSaving(true);
    try {
      const result = await createMutation.mutateAsync({
        workshopId,
        date: modalDate,
        timeStart,
        timeEnd,
        plate: plate.toUpperCase().trim(),
        customerName: customerName.trim(),
        phone: phone.trim() || null,
        notes: notes.trim() || null,
        budgetNumber: budgetNumber.trim() || null,
      } as any);

      if (estimate) {
        const processes = [
          ...(estimate.bodyworkHours > 0 ? [{ code: 'BODYWORK', name: 'Chapería',    hours: estimate.bodyworkHours }] : []),
          ...(estimate.prepHours    > 0 ? [{ code: 'PREP',     name: 'Preparación', hours: estimate.prepHours    }] : []),
          ...(estimate.paintHours   > 0 ? [{ code: 'PAINT',    name: 'Pintura',     hours: estimate.paintHours   }] : []),
        ];
        if (processes.length > 0) {
          await updateProcesses.mutateAsync({ id: result.id, processes });
        }
      }

      router.push(`/presupuesto/${result.id}`);
    } catch (err: any) {
      setModalError(err.message ?? 'Error al guardar');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleEnterTaller() {
    if (!workshopId || !estimate) return;
    if (!plate.trim())        { setEnterError('La chapa es obligatoria'); return; }
    if (!customerName.trim()) { setEnterError('El nombre del cliente es obligatorio'); return; }

    setEnterError('');
    setIsEntering(true);
    try {
      const entry = await createBodyshopEntry(workshopId, {
        workshopId,
        date:          enterDate,
        plate:         plate.toUpperCase().trim(),
        customerName:  customerName.trim(),
        bodyworkHours: estimate.bodyworkHours,
        prepHours:     estimate.prepHours,
        paintHours:    estimate.paintHours,
        channel:       'direct',
        notes:         notes.trim() || undefined,
        budgetNumber:  budgetNumber.trim() || undefined,
        status:        'scheduled',
      } as any);
      router.push(`/appointments?openId=${entry.id}`);
    } catch (err: any) {
      setEnterError(err.message ?? 'Error al ingresar al taller');
    } finally {
      setIsEntering(false);
    }
  }

  const canEnter = !!(estimate && estimate.totalHoras > 0 && plate.trim() && customerName.trim());
  const isEstimating = estimateMutation.isPending;

  return (
    <div className="h-screen flex flex-col bg-slate-50">

      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <ArrowLeft className="h-4 w-4 text-slate-500" />
            </button>
            <Calculator className="h-5 w-5 text-slate-400" />
            <h1 className="text-base font-semibold text-slate-900">Simulador de Presupuesto</h1>
          </div>
          {estimate && estimate.totalHoras > 0 && (
            <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full">
              {estimate.totalHoras}h total
            </span>
          )}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-4 pb-36 space-y-4">

        {/* Vehicle card */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Vehículo</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Chapa / Patente *
                {vehicleData && (
                  <span className="ml-2 text-emerald-500 font-normal normal-case">{vehicleData.model}</span>
                )}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={plate}
                  onChange={e => { setPlate(e.target.value.toUpperCase()); }}
                  onBlur={handlePlateLookup}
                  placeholder="ABC 123"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium uppercase outline-none focus:ring-2 focus:ring-blue-400 pr-8"
                />
                {isLooking && (
                  <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-slate-400" />
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">N° Presupuesto</label>
              <input
                type="text"
                value={budgetNumber}
                onChange={e => setBudgetNumber(e.target.value)}
                placeholder="Opcional"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nombre del cliente *</label>
            <input
              type="text"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="Juan Pérez"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Teléfono</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="0981 000 000"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notas</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Descripción del daño, información adicional..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />
          </div>
        </div>

        {/* Panels card */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Paneles dañados</p>
            {isEstimating && <Loader2 className="h-4 w-4 animate-spin text-blue-400" />}
          </div>

          <div className="space-y-3">
            {items.map((item, idx) => {
              const lineResult = estimate?.lines?.[idx];
              return (
                <div key={item.id} className="space-y-1.5">
                  {/* Row */}
                  <div className="flex items-center gap-2">
                    {/* Pieza */}
                    <div className="flex-1">
                      <select
                        value={item.pieza}
                        onChange={e => updateItem(item.id, { pieza: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                      >
                        <option value="">Seleccionar pieza...</option>
                        {piezas.map((p: string) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>

                    {/* Daño */}
                    <div className="w-32">
                      <select
                        value={item.damageLevel}
                        onChange={e => updateItem(item.id, { damageLevel: e.target.value as DamageLevel })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                      >
                        {DAMAGE_LEVELS.map(d => (
                          <option key={d.value} value={d.value}>{d.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Qty */}
                    <div className="w-16">
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={item.qty}
                        onChange={e => updateItem(item.id, { qty: Math.max(1, Math.min(10, Number(e.target.value))) })}
                        className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-center outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </div>

                    {/* Delete */}
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* Estimate breakdown for this line */}
                  {lineResult && (
                    <div className="ml-1 flex items-center gap-3 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-1.5">
                      <span>Chapería <span className="font-semibold text-slate-700">{lineResult.bodyworkHours}h</span></span>
                      <span className="text-slate-300">|</span>
                      <span>Prep <span className="font-semibold text-slate-700">{lineResult.prepHours}h</span></span>
                      <span className="text-slate-300">|</span>
                      <span>Pintura <span className="font-semibold text-slate-700">{lineResult.paintHours}h</span></span>
                      <span className="text-slate-300">|</span>
                      <span className="font-semibold text-slate-800">{lineResult.totalHoras}h</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add row */}
          <button
            type="button"
            onClick={addItem}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-slate-300 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Agregar panel
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 text-red-600 rounded-lg px-3 py-2 text-sm">{error}</div>
        )}
      </div>

      {/* Sticky bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200">

        {/* KPI bar */}
        {estimate && (
          <div className="flex items-center justify-around px-4 py-2 border-b border-slate-100 bg-slate-50">
            <div className="text-center">
              <p className="text-xs text-slate-400">Chapería</p>
              <p className="text-sm font-semibold text-slate-700">{estimate.bodyworkHours}h</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-400">Preparación</p>
              <p className="text-sm font-semibold text-slate-700">{estimate.prepHours}h</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-400">Pintura</p>
              <p className="text-sm font-semibold text-slate-700">{estimate.paintHours}h</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-400">Total</p>
              <p className="text-sm font-bold text-slate-900">{estimate.totalHoras}h</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-400">{estimate.moneda ?? 'Gs.'}</p>
              <p className="text-sm font-bold text-emerald-600">
                {estimate.totalMdo.toLocaleString('es-PY')}
              </p>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 px-4 py-3">

          {/* PDF */}
          {estimate ? (
            <BudgetPdfLink
              plate={plate}
              customerName={customerName}
              phone={phone}
              budgetNumber={budgetNumber}
              notes={notes}
              estimate={estimate}
            />
          ) : (
            <button disabled className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-300 text-sm font-semibold cursor-not-allowed">
              <FileDown className="h-4 w-4" /> PDF
            </button>
          )}

          {/* WhatsApp */}
          <button
            type="button"
            disabled={!estimate}
            onClick={handleWhatsApp}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-green-500 text-white text-sm font-semibold hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </button>

          <button
            type="button"
            onClick={() => setShowSaveModal(true)}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
          >
            Guardar
          </button>

          <button
            type="button"
            disabled={!canEnter}
            onClick={() => { setEnterDate(formatDate(new Date())); setEnterError(''); setShowEnterModal(true); }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Wrench className="h-4 w-4" />
            Ingresar al taller
          </button>
        </div>
      </div>

      {/* Ingresar al taller modal */}
      {showEnterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="bg-white rounded-xl border border-slate-200 w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-blue-500" />
              <h2 className="text-base font-semibold text-slate-900">Ingresar al taller</h2>
            </div>

            {estimate && (
              <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-600 space-y-0.5">
                <p className="font-semibold text-slate-800">{plate.toUpperCase()} · {customerName}</p>
                <p>Chapería {estimate.bodyworkHours}h · Prep {estimate.prepHours}h · Pintura {estimate.paintHours}h</p>
                <p className="font-semibold text-emerald-600">{estimate.totalHoras}h · {estimate.totalMdo.toLocaleString('es-PY')} {estimate.moneda}</p>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Fecha de ingreso</label>
              <input
                type="date"
                value={enterDate}
                min={formatDate(new Date())}
                onChange={e => setEnterDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            {enterError && (
              <div className="bg-red-50 text-red-600 rounded-lg px-3 py-2 text-sm">{enterError}</div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowEnterModal(false)}
                disabled={isEntering}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleEnterTaller}
                disabled={isEntering || !enterDate}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {isEntering
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Ingresando...</>
                  : <><Wrench className="h-4 w-4" /> Confirmar</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="bg-white rounded-xl border border-slate-200 w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <h2 className="text-base font-semibold text-slate-900">Guardar presupuesto</h2>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Fecha</label>
              <input
                type="date"
                value={modalDate}
                min={formatDate(new Date())}
                onChange={e => setModalDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Hora inicio</label>
                <input
                  type="time"
                  value={timeStart}
                  onChange={e => setTimeStart(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Hora fin</label>
                <input
                  type="time"
                  value={timeEnd}
                  onChange={e => setTimeEnd(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>

            {modalError && (
              <div className="bg-red-50 text-red-600 rounded-lg px-3 py-2 text-sm">{modalError}</div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => { setShowSaveModal(false); setModalError(''); }}
                disabled={isSaving}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {isSaving ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</>
                ) : (
                  'Guardar'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
