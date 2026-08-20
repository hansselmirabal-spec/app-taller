'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Calculator, Loader2, CheckCircle2, FileDown, MessageCircle } from 'lucide-react';
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
import { formatDate } from '@/lib/utils';
import { useCreateBudgetAppointment, useUpdateBudgetProcesses } from '@/hooks/use-budget-appointments';
import { useSimulatorForm } from './_shared/use-simulator-form';
import { SimulatorForm, EstimateSummaryBar } from './_shared/simulator-form';

export default function SimuladorPresupuestoPage() {
  const router     = useRouter();
  const workshopId = useWorkshopId();

  const {
    plate, setPlate,
    customerName, setCustomerName,
    phone, setPhone,
    budgetNumber, setBudgetNumber,
    notes, setNotes,
    plateSearchError, setPlateSearchError,
    isLooking, vehicleData,
    handlePlateLookup,
    items, updateItem, removeItem, addItem, piezas,
    estimate,
    error,
    isEstimating,
    handleWhatsApp,
  } = useSimulatorForm();

  // Save as presupuesto modal
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [modalDate, setModalDate]         = useState(formatDate(new Date()));
  const [timeStart, setTimeStart]         = useState('09:00');
  const [timeEnd, setTimeEnd]             = useState('09:30');
  const [isSaving, setIsSaving]           = useState(false);
  const [modalError, setModalError]       = useState('');

  const createMutation  = useCreateBudgetAppointment();
  const updateProcesses = useUpdateBudgetProcesses();

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
        const pieces = estimate.lines.map(l => ({
          pieza:       l.pieza,
          damageLevel: l.damageLevel,
          qty:         l.qty,
          breakdown:   l.breakdown,
          totalHoras:  l.totalHoras,
        }));
        if (processes.length > 0) {
          await updateProcesses.mutateAsync({ id: result.id, processes, pieces });
        }
      }

      router.push(`/presupuesto/${result.id}`);
    } catch (err: any) {
      setModalError(err.message ?? 'Error al guardar');
    } finally {
      setIsSaving(false);
    }
  }

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

        {/* KPI bar */}
        <EstimateSummaryBar estimate={estimate} />

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
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Guardar
          </button>
        </div>
      </div>

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
