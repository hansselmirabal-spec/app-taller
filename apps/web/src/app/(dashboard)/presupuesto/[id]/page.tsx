'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, CheckCircle2, XCircle, Plus, Trash2,
  Loader2, ExternalLink, AlertTriangle, FileText, Calendar,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import {
  useBudgetAppointment,
  useUpdateBudgetProcesses,
  useCancelBudgetAppointment,
  useApproveBudgetAppointment,
  useRejectBudgetAppointment,
} from '@/hooks/use-budget-appointments';
import type { BudgetProcess } from '@/types';

const PROCESS_CATALOG: { code: string; name: string }[] = [
  { code: 'BODYWORK',      name: 'Chapería'     },
  { code: 'PREP',          name: 'Preparación'  },
  { code: 'PAINT',         name: 'Pintura'      },
  { code: 'POLISH',        name: 'Pulido'       },
  { code: 'MECHANIC',      name: 'Mecánica'     },
  { code: 'FINAL_CONTROL', name: 'Control Final'},
];

const STATUS_CONFIG = {
  pending:   { label: 'Pendiente',  className: 'bg-yellow-100 text-yellow-700' },
  approved:  { label: 'Aprobado',   className: 'bg-emerald-100 text-emerald-700' },
  rejected:  { label: 'Rechazado',  className: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Cancelado',  className: 'bg-slate-100 text-slate-500' },
} as const;

export default function PresupuestoDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const { data: appt, isLoading } = useBudgetAppointment(id);
  const updateProcesses = useUpdateBudgetProcesses();
  const cancelMutation  = useCancelBudgetAppointment();
  const approveMutation = useApproveBudgetAppointment();
  const rejectMutation  = useRejectBudgetAppointment();

  const [processes, setProcesses] = useState<BudgetProcess[] | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newHours, setNewHours] = useState('');
  const [error, setError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [repairStartDate, setRepairStartDate] = useState(() => formatDate(new Date()));

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 text-slate-400 animate-spin" />
      </div>
    );
  }
  if (!appt) {
    return (
      <div className="h-screen flex items-center justify-center text-slate-400">
        Presupuesto no encontrado
      </div>
    );
  }

  const isEditable = appt.status === 'pending';
  const effectiveProcesses = processes ?? appt.processes ?? [];
  const totalHours = effectiveProcesses.reduce((s, p) => s + p.hours, 0);
  const statusCfg = STATUS_CONFIG[appt.status];

  function addProcess() {
    if (!newCode || !newHours) return;
    const hours = parseFloat(newHours);
    if (isNaN(hours) || hours <= 0) return;
    const catalog = PROCESS_CATALOG.find(p => p.code === newCode);
    if (!catalog) return;
    const updated = [...effectiveProcesses.filter(p => p.code !== newCode), { code: newCode, name: catalog.name, hours }];
    setProcesses(updated);
    setIsDirty(true);
    setNewCode('');
    setNewHours('');
  }

  function removeProcess(code: string) {
    const updated = effectiveProcesses.filter(p => p.code !== code);
    setProcesses(updated);
    setIsDirty(true);
  }

  function updateHours(code: string, val: string) {
    const hours = parseFloat(val);
    if (isNaN(hours) || hours <= 0) return;
    const updated = effectiveProcesses.map(p => p.code === code ? { ...p, hours } : p);
    setProcesses(updated);
    setIsDirty(true);
  }

  async function saveProcesses() {
    setError('');
    try {
      await updateProcesses.mutateAsync({ id: appt!.id, processes: effectiveProcesses });
      setIsDirty(false);
      setProcesses(null);
    } catch (err: any) {
      setError(err.message ?? 'Error al guardar los procesos');
    }
  }

  function openApproveModal() {
    if (effectiveProcesses.length === 0) {
      setError('Cargá al menos un proceso antes de aprobar');
      return;
    }
    if (isDirty) {
      setError('Guardá los cambios de procesos antes de aprobar');
      return;
    }
    setError('');
    setRepairStartDate(formatDate(new Date()));
    setShowApproveModal(true);
  }

  async function handleApprove() {
    setError('');
    try {
      const result = await approveMutation.mutateAsync({ id: appt!.id, repairStartDate });
      router.push(`/appointments?openId=${result.entryId}`);
    } catch (err: any) {
      setError(err.message ?? 'Error al aprobar el presupuesto');
      setShowApproveModal(false);
    }
  }

  async function handleCancel() {
    setError('');
    try {
      await cancelMutation.mutateAsync(appt!.id);
      setConfirmCancel(false);
    } catch (err: any) {
      setError(err.message ?? 'Error al cancelar');
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) return;
    setError('');
    try {
      await rejectMutation.mutateAsync({ id: appt!.id, reason: rejectReason.trim() });
      setShowRejectForm(false);
      setRejectReason('');
    } catch (err: any) {
      setError(err.message ?? 'Error al rechazar');
    }
  }

  const usedCodes = new Set(effectiveProcesses.map(p => p.code));
  const availableProcesses = PROCESS_CATALOG.filter(p => !usedCodes.has(p.code));

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
            <FileText className="h-5 w-5 text-slate-400" />
            <span className="text-base font-bold text-slate-900 tracking-wider">{appt.plate}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${statusCfg.className}`}>
              {statusCfg.label}
            </span>
          </div>
          {appt.linkedEntryId && (
            <button
              type="button"
              onClick={() => router.push(`/appointments?openId=${appt.linkedEntryId}`)}
              className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Ver en taller
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-5">

          {/* Info básica */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Datos del turno</h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <span className="text-slate-400 text-xs">Cliente</span>
                <p className="font-medium text-slate-800">{appt.customerName}</p>
              </div>
              <div>
                <span className="text-slate-400 text-xs">Fecha y hora</span>
                <p className="font-medium text-slate-800">{appt.date} · {appt.timeStart}–{appt.timeEnd}</p>
              </div>
              {appt.phone && (
                <div>
                  <span className="text-slate-400 text-xs">Teléfono</span>
                  <p className="font-medium text-slate-800">{appt.phone}</p>
                </div>
              )}
              {appt.budgetNumber && (
                <div>
                  <span className="text-slate-400 text-xs">N° Presupuesto</span>
                  <p className="font-medium text-slate-800">{appt.budgetNumber}</p>
                </div>
              )}
              {appt.perito && (
                <div>
                  <span className="text-slate-400 text-xs">Perito</span>
                  <p className="font-medium text-slate-800">{appt.perito.name}</p>
                </div>
              )}
              {appt.notes && (
                <div className="col-span-2">
                  <span className="text-slate-400 text-xs">Notas</span>
                  <p className="text-slate-700">{appt.notes}</p>
                </div>
              )}
              {appt.rejectionReason && (
                <div className="col-span-2">
                  <span className="text-slate-400 text-xs">Motivo de rechazo</span>
                  <p className="text-red-700 font-medium">{appt.rejectionReason}</p>
                </div>
              )}
            </div>
          </div>

          {/* Procesos */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Horas por proceso
              </h2>
              {totalHours > 0 && (
                <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full">
                  Total: {totalHours.toFixed(1)}h
                </span>
              )}
            </div>

            {/* Lista de procesos */}
            {effectiveProcesses.length > 0 ? (
              <div className="space-y-2">
                {effectiveProcesses.map(p => (
                  <div key={p.code} className="flex items-center gap-3 py-1.5 border-b border-slate-50 last:border-0">
                    <span className="flex-1 text-sm font-medium text-slate-700">{p.name}</span>
                    {isEditable ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          defaultValue={p.hours}
                          min={0.5}
                          step={0.5}
                          onBlur={e => updateHours(p.code, e.target.value)}
                          className="w-20 text-center text-sm rounded-lg border border-slate-200 px-2 py-1 outline-none focus:ring-2 focus:ring-blue-300"
                        />
                        <span className="text-xs text-slate-400">h</span>
                        <button
                          type="button"
                          onClick={() => removeProcess(p.code)}
                          className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-sm font-semibold text-slate-700">{p.hours}h</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic py-2">Sin procesos cargados</p>
            )}

            {/* Agregar proceso */}
            {isEditable && availableProcesses.length > 0 && (
              <div className="flex items-end gap-2 pt-2 border-t border-slate-100">
                <div className="flex-1">
                  <label className="block text-xs text-slate-500 mb-1">Proceso</label>
                  <select
                    value={newCode}
                    onChange={e => setNewCode(e.target.value)}
                    className="w-full text-sm rounded-lg border border-slate-200 px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-300"
                  >
                    <option value="">Seleccionar...</option>
                    {availableProcesses.map(p => (
                      <option key={p.code} value={p.code}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="w-24">
                  <label className="block text-xs text-slate-500 mb-1">Horas</label>
                  <input
                    type="number"
                    value={newHours}
                    onChange={e => setNewHours(e.target.value)}
                    min={0.5}
                    step={0.5}
                    placeholder="0"
                    className="w-full text-sm text-center rounded-lg border border-slate-200 px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </div>
                <button
                  type="button"
                  onClick={addProcess}
                  disabled={!newCode || !newHours}
                  className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-40 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Agregar
                </button>
              </div>
            )}

            {/* Guardar procesos */}
            {isEditable && isDirty && (
              <button
                type="button"
                disabled={updateProcesses.isPending}
                onClick={saveProcesses}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition-colors"
              >
                {updateProcesses.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Guardar cambios
              </button>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Acciones */}
          {isEditable && (
            <div className="space-y-3">
              {/* Formulario de rechazo */}
              {showRejectForm && (
                <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="text-xs font-semibold text-red-700">Motivo del rechazo</p>
                  <textarea
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    rows={2}
                    placeholder="Ej: Precio no aceptado por el cliente..."
                    className="w-full text-sm rounded-lg border border-red-200 px-3 py-2 outline-none focus:ring-2 focus:ring-red-300 resize-none bg-white"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setShowRejectForm(false)}
                      className="flex-1 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
                      Cancelar
                    </button>
                    <button type="button" onClick={handleReject}
                      disabled={!rejectReason.trim() || rejectMutation.isPending}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                      {rejectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                      Confirmar rechazo
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                {confirmCancel ? (
                  <>
                    <p className="flex-1 text-xs text-slate-600 self-center">¿Confirmar cancelación?</p>
                    <button type="button" onClick={() => setConfirmCancel(false)}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
                      No
                    </button>
                    <button type="button" onClick={handleCancel} disabled={cancelMutation.isPending}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                      {cancelMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                      Sí, cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => setConfirmCancel(true)}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                      <XCircle className="h-4 w-4" />
                      Cancelar
                    </button>
                    <button type="button" onClick={() => setShowRejectForm(v => !v)}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
                      <XCircle className="h-4 w-4" />
                      Rechazar
                    </button>
                    <button type="button" onClick={openApproveModal}
                      disabled={approveMutation.isPending || effectiveProcesses.length === 0}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                      <CheckCircle2 className="h-4 w-4" /> Aprobar e ingresar al taller
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de aprobación con fecha de ingreso */}
      {showApproveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 mx-4 space-y-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-emerald-600" />
              <h3 className="text-base font-bold text-slate-900">Fecha de ingreso al taller</h3>
            </div>
            <p className="text-sm text-slate-500">
              Elegí cuándo entra el vehículo al taller para que la capacidad se compute correctamente.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Fecha de inicio de reparación</label>
              <input
                type="date"
                value={repairStartDate}
                onChange={e => setRepairStartDate(e.target.value)}
                min={formatDate(new Date())}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowApproveModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={approveMutation.isPending || !repairStartDate}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {approveMutation.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Aprobando...</>
                  : <><CheckCircle2 className="h-4 w-4" /> Confirmar</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
