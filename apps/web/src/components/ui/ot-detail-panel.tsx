'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Hash, Car, User, Building2, CalendarClock, Clock,
  DollarSign, FileText, Wrench, AlertCircle, CheckCircle2,
  Calendar, Loader2, Timer,
} from 'lucide-react';
import type { OtDetail, StatusHistoryEntry } from '@/app/api/ot-detail/[ot]/route';
import { getEstado } from '@/lib/ot-estados';
import { tipoServicioBadgeClass, TIPO_SERVICIO_LABELS } from '@/lib/tipos-servicio';

interface Props {
  otNum: number | null;
  detail: OtDetail | null;
  loading: boolean;
  error: string;
  onClose: () => void;
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-[11px] text-slate-400 w-36 flex-shrink-0 pt-0.5">{label}</span>
      <span className={`text-[12px] text-slate-800 font-medium ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function DateRow({ label, value, warn }: { label: string; value: string | null; warn?: boolean }) {
  if (!value) return null;
  const today = new Date().toISOString().split('T')[0];
  const vencido = warn && value < today;
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-[11px] text-slate-400 w-36 flex-shrink-0 pt-0.5">{label}</span>
      <span className={`text-[12px] font-medium flex items-center gap-1.5 ${vencido ? 'text-red-600' : 'text-slate-800'}`}>
        <Calendar className="h-3 w-3 flex-shrink-0 opacity-60" />
        {value}
        {vencido && <span className="text-[10px] bg-red-100 text-red-700 px-1 rounded font-bold">vencido</span>}
      </span>
    </div>
  );
}

function duracionLabel(dias: number, horas: number, isCurrent: boolean): string {
  if (dias === 0 && horas === 0) return isCurrent ? 'Recién ingresado' : '< 1 hora';
  if (dias === 0) return `${horas}h`;
  if (horas === 0) return `${dias}d`;
  return `${dias}d ${horas}h`;
}

function EstadoTimeline({
  history,
  diasEnEstado,
  diasIngreso,
}: {
  history: StatusHistoryEntry[];
  diasEnEstado: number;
  diasIngreso: number;
}) {
  if (!history.length) return (
    <p className="text-[11px] text-slate-400 py-2 text-center italic">Sin registros en historial DMS</p>
  );
  return (
    <div className="relative">
      {history.map((entry, i) => {
        const isCurrent = entry.hasta === null;
        const isLong = !isCurrent && entry.dias > 7;

        // Para el estado actual usamos diasEnEstado del DMS (más preciso que el timestamp
        // del historial, que puede no reflejar la última re-entrada al mismo estado).
        const dur = isCurrent
          ? diasEnEstado > 0 ? `${diasEnEstado}d` : '< 1d'
          : duracionLabel(entry.dias, entry.horas, false);

        return (
          <div key={i} className="flex gap-2.5 pb-3 last:pb-0 relative">
            {/* Línea vertical */}
            {i < history.length - 1 && (
              <div className="absolute left-[7px] top-4 bottom-0 w-px bg-slate-200" />
            )}
            {/* Dot */}
            <div className={`mt-1 h-3.5 w-3.5 rounded-full flex-shrink-0 ring-2 ring-white ${isCurrent ? 'bg-blue-500' : 'bg-slate-300'}`} />
            {/* Content */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[12px] font-semibold ${isCurrent ? 'text-blue-700' : 'text-slate-700'}`}>
                  {entry.estado}
                  {isCurrent && <span className="ml-1.5 text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">actual</span>}
                </span>
                <span className={`text-[11px] font-bold flex-shrink-0 px-1.5 py-0.5 rounded ${
                  isCurrent ? 'bg-blue-100 text-blue-700' :
                  isLong    ? 'bg-amber-100 text-amber-700' :
                              'bg-slate-100 text-slate-500'
                }`}>
                  {dur}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                {entry.desde}
                {entry.hasta && <span> → {entry.hasta}</span>}
              </div>
            </div>
          </div>
        );
      })}

      {/* Fila Total */}
      <div className="mt-3 pt-2.5 border-t border-slate-200 flex items-center justify-between">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Total en taller</span>
        <span className={`text-[13px] font-black px-2 py-0.5 rounded ${
          diasIngreso > 30 ? 'bg-red-100 text-red-700' :
          diasIngreso > 14 ? 'bg-amber-100 text-amber-700' :
                             'bg-slate-100 text-slate-600'
        }`}>
          {diasIngreso}d
        </span>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-3.5 w-3.5 text-slate-400" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{title}</span>
      </div>
      <div className="bg-white rounded-lg border border-slate-100 px-3 py-1">
        {children}
      </div>
    </div>
  );
}

export function OtDetailPanel({ otNum, detail, loading, error, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const open = otNum !== null;

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [open, handleKey]);

  if (!open || typeof document === 'undefined') return null;

  const estado = detail ? getEstado(detail.estadoOt) : null;
  const tipoCode = detail?.tipoServicio?.trim().toUpperCase() ?? '';
  const tipoLabel = TIPO_SERVICIO_LABELS[tipoCode];

  const panel = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[200] bg-black/30 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal
        aria-label={`Detalle OT ${otNum}`}
        className="fixed right-0 top-0 bottom-0 z-[201] w-full max-w-md bg-slate-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-start justify-between gap-3 flex-shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg font-black text-slate-900">OT #{otNum}</span>
              {estado && (
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${estado.bgColor} ${estado.textColor} ${estado.borderColor}`}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: estado.color }} />
                  {estado.label}
                </span>
              )}
              {tipoCode && (
                <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded border ${tipoServicioBadgeClass(tipoCode)}`}>
                  {tipoCode}
                </span>
              )}
            </div>
            {detail && (
              <p className="text-xs text-slate-500 mt-0.5 truncate">{detail.nombreCliente}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0"
            title="Cerrar (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">

          {loading && (
            <div className="flex items-center justify-center h-40 gap-2 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Cargando desde DMS...</span>
            </div>
          )}

          {!loading && error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {!loading && detail && (
            <>
              {/* Vehículo */}
              <Section icon={Car} title="Vehículo">
                <Row label="Modelo" value={detail.modelo || '—'} />
                <Row label="Chasis (VIN)" value={detail.chasis || '—'} mono />
              </Section>

              {/* Cliente */}
              <Section icon={User} title="Cliente">
                <Row label="Nombre" value={detail.nombreCliente || '—'} />
                <Row label="Código cliente" value={detail.codCliente || null} mono />
              </Section>

              {/* Gestión */}
              <Section icon={Wrench} title="Gestión">
                <Row label="Asesor" value={detail.asesor || '—'} />
                <Row label="Sucursal" value={detail.sucursal || '—'} />
                <Row
                  label="Tipo de servicio"
                  value={tipoCode ? `${tipoCode}${tipoLabel ? ` — ${tipoLabel}` : ''}` : '—'}
                />
                <Row label="Tiempo de entrega" value={detail.tiempoEntrega || null} />
                <Row
                  label="Días en taller"
                  value={
                    <span className={`font-bold ${
                      detail.diasIngreso > 30 ? 'text-red-600' :
                      detail.diasIngreso > 14 ? 'text-amber-600' : 'text-slate-700'
                    }`}>
                      {detail.diasIngreso}d
                    </span>
                  }
                />
              </Section>

              {/* Estados */}
              <Section icon={CheckCircle2} title="Estados">
                <Row label="Estado OT" value={detail.estadoOt || '—'} />
                <Row label="Estado IDIS" value={detail.estadoIdis || null} />
                <Row label="Estado financiero" value={detail.estadoFinanciero || null} />
              </Section>

              {/* Historial de estados */}
              <Section icon={Timer} title="Tiempo en cada estado">
                <div className="py-2">
                  <EstadoTimeline
                    history={detail.statusHistory ?? []}
                    diasEnEstado={detail.diasEnEstado}
                    diasIngreso={detail.diasIngreso}
                  />
                </div>
              </Section>

              {/* Fechas */}
              <Section icon={CalendarClock} title="Fechas">
                <div className="flex items-start gap-2 py-1.5 border-b border-slate-50">
                  <span className="text-[11px] text-slate-400 w-36 flex-shrink-0 pt-0.5">Ingreso</span>
                  <span className="text-[12px] font-medium flex items-center gap-1.5 text-slate-800">
                    <Calendar className="h-3 w-3 flex-shrink-0 opacity-60" />
                    {detail.fechaIngreso ?? '—'}
                    {detail.fechaIngreso && (
                      detail.horaIngreso
                        ? (
                          <span className="inline-flex items-center gap-0.5 text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                            <Clock className="h-2.5 w-2.5" />
                            {detail.horaIngreso}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-300 italic">sin hora</span>
                        )
                    )}
                  </span>
                </div>
                <DateRow label="Compromiso cliente" value={detail.fechaCompromisoCliente} warn />
                <DateRow label="Compromiso taller" value={detail.fechaCompromisoTaller} warn />
                <DateRow label="Compromiso IDIS" value={detail.fechaCompromisoIdis} warn />
                <DateRow label="Fin taller" value={detail.fechaFinTaller} />
                <DateRow label="Renegociación" value={detail.fechaRenegociacion} />
                <DateRow label="Finalizado" value={detail.fechaFinalizado} />
                <DateRow label="Salida" value={detail.fechaSalida} />
                <DateRow label="Factura" value={detail.fechaFactura} />
              </Section>

              {/* Financiero */}
              <Section icon={DollarSign} title="Financiero">
                <Row
                  label="Monto total"
                  value={
                    detail.montoTotal > 0
                      ? new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(detail.montoTotal)
                      : '—'
                  }
                />
              </Section>

              {/* Observaciones */}
              {detail.observaciones && (
                <Section icon={FileText} title="Observaciones">
                  <p className="text-xs text-slate-700 py-2 leading-relaxed whitespace-pre-wrap">{detail.observaciones}</p>
                </Section>
              )}

              {/* Footer DMS */}
              <div className="mt-2 text-[10px] text-slate-300 text-center">
                Fuente: <span className="font-mono">v_maestro_ot_condor</span> · DMS Condor
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );

  return createPortal(panel, document.body);
}
