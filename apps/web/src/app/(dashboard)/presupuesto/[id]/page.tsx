'use client';

import { Suspense, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, CheckCircle2, XCircle,
  Loader2, ExternalLink, AlertTriangle, FileText, Calendar, Info,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import {
  useBudgetAppointment,
  useCancelBudgetAppointment,
  useApproveBudgetAppointment,
  useRejectBudgetAppointment,
} from '@/hooks/use-budget-appointments';

const STATUS_CONFIG = {
  pending:   { label: 'Pendiente',  className: 'bg-yellow-100 text-yellow-700' },
  approved:  { label: 'Aprobado',   className: 'bg-emerald-100 text-emerald-700' },
  rejected:  { label: 'Rechazado',  className: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Cancelado',  className: 'bg-slate-100 text-slate-500' },
} as const;

// useSearchParams() opta out del prerender estático salvo que esté envuelto
// en Suspense — mismo patrón que /login (evita missing-suspense-with-csr-bailout
// en `next build`).
export default function PresupuestoDetailPage() {
  return (
    <Suspense fallback={null}>
      <PresupuestoDetailBody />
    </Suspense>
  );
}

function PresupuestoDetailBody() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const isReadonlyNotice = searchParams.get('readonly') === '1';

  const { data: appt, isLoading } = useBudgetAppointment(id);
  const cancelMutation  = useCancelBudgetAppointment();
  const approveMutation = useApproveBudgetAppointment();
  const rejectMutation  = useRejectBudgetAppointment();

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
  const effectiveProcesses = appt.processes ?? [];
  const totalHours = effectiveProcesses.reduce((s, p) => s + p.hours, 0);
  const statusCfg = STATUS_CONFIG[appt.status];

  function openApproveModal() {
    if (effectiveProcesses.length === 0) {
      setError('Cargá al menos un proceso antes de aprobar');
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

          {/* Aviso de solo lectura — llegado desde una pestaña vieja del
              Simulador apuntando a un presupuesto que ya no está pendiente */}
          {isReadonlyNotice && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <p>
                Este presupuesto ya no está pendiente — se abre en modo lectura.
                Solo los pendientes se editan desde el Simulador.
              </p>
            </div>
          )}

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
              {appt.insuranceCompany && (
                <div>
                  <span className="text-slate-400 text-xs">Aseguradora</span>
                  <p className="font-medium text-slate-800">{appt.insuranceCompany}</p>
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

          {/* Detalle por pieza (informativo, viene del Simulador) */}
          {appt.pieces && appt.pieces.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Detalle por pieza
              </h2>
              <div className="space-y-3">
                {appt.pieces.map((piece, idx) => (
                  <div key={`${piece.pieza}-${idx}`} className="border-b border-slate-50 last:border-0 pb-3 last:pb-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-700">
                        {piece.pieza}{piece.qty > 1 ? ` ×${piece.qty}` : ''}
                      </span>
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">
                        {piece.damageLevel}
                      </span>
                      <span className="ml-auto text-xs font-semibold text-slate-600">
                        {piece.totalHoras}h
                      </span>
                    </div>
                    {piece.breakdown.length > 0 && (
                      <div className="mt-1.5 pl-0.5 space-y-0.5">
                        {piece.breakdown.map((b, bIdx) => (
                          <div key={bIdx} className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="flex-1">{b.descripcion || b.proceso}</span>
                            <span className="font-mono">{b.horas}h</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

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
                    <span className="text-sm font-semibold text-slate-700">{p.hours}h</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic py-2">Sin procesos cargados</p>
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
