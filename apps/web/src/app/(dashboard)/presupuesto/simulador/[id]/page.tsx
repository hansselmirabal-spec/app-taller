'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Calculator, Loader2, FileDown, FileX, MessageCircle } from 'lucide-react';
import { randomId } from '@/lib/utils';
import { useBudgetAppointment, useUpdateBudgetProcesses } from '@/hooks/use-budget-appointments';
import type { DamageLevel } from '@/lib/api';
import { useSimulatorForm, estimateToBudgetPayload } from '../_shared/use-simulator-form';
import { SimulatorForm, EstimateSummaryBar } from '../_shared/simulator-form';
import { LazyBudgetPdfLink } from '../_shared/budget-pdf-link-lazy';

/**
 * Edit mode of the Simulator, opened from a scheduled `pending` budget
 * appointment. Prefills from the existing record and PATCHes it on save —
 * never creates a new one. Non-`pending` appointments never render this
 * form: they redirect to the read-only `/presupuesto/[id]` before hydration
 * even starts.
 */
export default function EditarSimuladorPresupuestoPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const { data: appt, isLoading } = useBudgetAppointment(id);
  const updateProcesses = useUpdateBudgetProcesses();

  const {
    plate, setPlate,
    customerName, setCustomerName,
    phone, setPhone,
    budgetNumber, setBudgetNumber,
    notes, setNotes,
    plateSearchError, setPlateSearchError,
    isLooking, vehicleData,
    handlePlateLookup,
    items, setItems, updateItem, removeItem, addItem, piezas,
    estimate,
    error,
    isEstimating,
    handleWhatsApp,
  } = useSimulatorForm();

  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving]   = useState(false);

  // Drives the screen render, set once from the first resolved load — never
  // recomputed from live query data, so a background refetch (focus/
  // invalidate) can't yank the user out of an in-progress edit or strand the
  // screen in limbo if `appt.status` changes under them mid-edit. If the
  // status does change before Guardar, the mutation still fails safely:
  // updateProcesses() re-checks status server-side and surfaces a clear
  // saveError instead of a silent redirect.
  const [screenState, setScreenState] = useState<'loading' | 'notfound' | 'ready'>('loading');
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current || isLoading) return;
    hydratedRef.current = true;

    if (!appt) {
      setScreenState('notfound');
      return;
    }

    // A stale/duplicate tab must never allow editing a non-pending budget —
    // redirect before hydrating or letting the debounced estimate run.
    if (appt.status !== 'pending') {
      router.replace(`/presupuesto/${appt.id}?readonly=1`);
      return;
    }

    setPlate(appt.plate);
    setCustomerName(appt.customerName);
    setPhone(appt.phone ?? '');
    setBudgetNumber(appt.budgetNumber ?? '');
    setNotes(appt.notes ?? '');
    if (appt.pieces && appt.pieces.length > 0) {
      setItems(appt.pieces.map(p => ({
        id:          randomId(),
        pieza:       p.pieza,
        damageLevel: p.damageLevel as DamageLevel,
        qty:         p.qty,
      })));
    }
    // pieces null/empty → keep the hook's default single empty item
    setScreenState('ready');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appt, isLoading]);

  async function handleSave() {
    if (!appt) return;
    if (!plate.trim())        { setSaveError('La chapa es obligatoria'); return; }
    if (!customerName.trim()) { setSaveError('El nombre del cliente es obligatorio'); return; }

    const { processes, pieces } = estimate ? estimateToBudgetPayload(estimate) : { processes: [], pieces: [] };

    // A PATCH with an empty processes array would wipe the previously saved
    // breakdown — block instead of silently erasing it.
    if (processes.length === 0) {
      setSaveError('Cargá al menos un panel con estimación antes de guardar — un guardado vacío borraría el desglose ya guardado.');
      return;
    }

    setSaveError('');
    setIsSaving(true);
    try {
      await updateProcesses.mutateAsync({ id: appt.id, processes, pieces });
      router.push('/presupuesto');
    } catch (err: any) {
      setSaveError(err.message ?? 'Error al guardar');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-slate-500" />
          </button>
          <Calculator className="h-5 w-5 text-slate-400" />
          <h1 className="text-base font-semibold text-slate-900">
            Editar Presupuesto{appt ? ` · ${appt.plate}` : ''}
          </h1>
        </div>
      </div>

      {screenState === 'notfound' ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
          <FileX className="h-10 w-10 opacity-40" />
          <p className="text-sm">Presupuesto no encontrado</p>
          <button
            type="button"
            onClick={() => router.push('/presupuesto')}
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            Volver a Presupuestos
          </button>
        </div>
      ) : screenState === 'loading' ? (
        // Covers: loading, and the transient frame before the non-pending
        // redirect above completes — never render a partial form.
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 text-slate-400 animate-spin" />
        </div>
      ) : (
        <>
          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto p-4 pb-36 space-y-4">
            <SimulatorForm
              plate={plate}
              onPlateChange={value => { setPlate(value); setPlateSearchError(''); }}
              onPlateLookup={handlePlateLookup}
              isLookingUpPlate={isLooking}
              vehicleFound={!!vehicleData}
              vehicleModel={vehicleData?.model}
              plateSearchError={plateSearchError}
              budgetNumber={budgetNumber}
              onBudgetNumberChange={setBudgetNumber}
              customerName={customerName}
              onCustomerNameChange={setCustomerName}
              phone={phone}
              onPhoneChange={setPhone}
              notes={notes}
              onNotesChange={setNotes}
              items={items}
              piezas={piezas}
              estimate={estimate}
              isEstimating={isEstimating}
              onUpdateItem={updateItem}
              onRemoveItem={removeItem}
              onAddItem={addItem}
              error={error}
            />
          </div>

          {/* Sticky bottom */}
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200">
            <EstimateSummaryBar estimate={estimate} />

            <div className="flex gap-2 px-4 py-3">
              {estimate ? (
                <LazyBudgetPdfLink
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
                disabled={isSaving}
                onClick={handleSave}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {isSaving
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</>
                  : 'Guardar cambios'
                }
              </button>
            </div>

            {saveError && (
              <div className="px-4 pb-3">
                <div className="bg-red-50 text-red-600 rounded-lg px-3 py-2 text-sm">{saveError}</div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
