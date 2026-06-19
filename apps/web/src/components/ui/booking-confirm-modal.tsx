'use client';

import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2, X, User, Car, Wrench, Calendar,
  Clock, Phone, CreditCard, MapPin, FileText,
  Paintbrush, ChevronRight, Printer, Hammer,
  AlertCircle, Link2,
} from 'lucide-react';

export interface BookingConfirmData {
  type: 'mechanic' | 'bodyshop';
  workshopName?: string;
  date: string;
  // Client
  customerName: string;
  customerNumber?: string;
  plate: string;
  chassis?: string;
  vehicleType?: string;
  cedula?: string;
  ruc?: string;
  telPrincipal?: string;
  celular?: string;
  telOficina?: string;
  address?: string;
  // Mechanic-specific
  timeStart?: string;
  timeEnd?: string;
  serviceName?: string;
  techName?: string;
  techSpecialty?: string;
  // Bodyshop-specific
  budgetNumber?: string;
  workTypeName?: string;
  stayDays?: number;
  bodyworkHours?: number;
  prepHours?: number;
  paintHours?: number;
  channel?: string;
  // Técnicos por proceso (bodyshop)
  processTechs?: {
    BODYWORK?: string;
    PREP?: string;
    PAINT?: string;
  };
  // Common
  notes?: string;
  // DMS Condor push result
  dmsAdvisorCode?: string;
  dmsAdvisorName?: string;
  dmsSync?: { success: boolean; dmsId?: string; error?: string } | null;
}

interface Props {
  data: BookingConfirmData | null;
  onClose: () => void;
  onViewSchedule: () => void;
  onNewBooking: () => void;
}

const CHANNEL_LABELS: Record<string, string> = {
  phone:    'Teléfono',
  whatsapp: 'WhatsApp',
  web:      'Web',
  walkin:   'Presencial',
  email:    'Email',
};

function Row({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0">
      <Icon className="h-3.5 w-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">{label}</p>
        <p className="text-sm font-medium text-slate-800 break-words">{value}</p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-50 rounded-xl p-4">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">{title}</h3>
      {children}
    </div>
  );
}

export function BookingConfirmModal({ data, onClose, onViewSchedule, onNewBooking }: Props) {
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (!data) return;
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [data, handleKey]);

  if (!data || typeof document === 'undefined') return null;

  const isMechanic = data.type === 'mechanic';

  const modal = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[300] bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal
        aria-label="Turno confirmado"
        className="fixed inset-0 z-[301] flex items-center justify-center p-4 pointer-events-none"
      >
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden pointer-events-auto animate-in zoom-in-95 fade-in duration-200"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 px-6 py-5 text-white flex-shrink-0 print:bg-emerald-600">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-emerald-100 uppercase tracking-wider">
                    {isMechanic ? 'Turno agendado' : 'Ingreso registrado'}
                  </p>
                  <h2 className="text-xl font-black text-white mt-0.5">{data.customerName}</h2>
                  <p className="text-sm text-emerald-100 mt-0.5 font-mono">{data.plate}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white/20 transition-colors flex-shrink-0 print:hidden"
                title="Cerrar (Esc)"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Date / time pill */}
            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1 text-xs font-semibold text-white">
                <Calendar className="h-3 w-3" />
                {new Date(data.date + 'T12:00:00').toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long' })}
              </span>
              {isMechanic && data.timeStart && (
                <span className="inline-flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1 text-xs font-semibold text-white">
                  <Clock className="h-3 w-3" />
                  {data.timeStart}{data.timeEnd ? ` → ${data.timeEnd}` : ''}
                </span>
              )}
              {!isMechanic && data.stayDays && (
                <span className="inline-flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1 text-xs font-semibold text-white">
                  <Clock className="h-3 w-3" />
                  {data.stayDays} día{data.stayDays !== 1 ? 's' : ''} estimados
                </span>
              )}
              {data.workshopName && (
                <span className="inline-flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1 text-xs font-semibold text-white">
                  <Wrench className="h-3 w-3" />
                  {data.workshopName}
                </span>
              )}
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3">

            {/* Datos del cliente */}
            <Section title="Cliente">
              <Row icon={User}       label="Nombre"       value={data.customerName} />
              <Row icon={CreditCard} label="Cédula"       value={data.cedula} />
              <Row icon={CreditCard} label="RUC"          value={data.ruc} />
              <Row icon={Phone}      label="Teléfono"     value={data.telPrincipal || data.celular} />
              <Row icon={Phone}      label="Celular"      value={data.telPrincipal && data.celular ? data.celular : null} />
              <Row icon={Phone}      label="Tel. oficina" value={data.telOficina} />
              <Row icon={MapPin}     label="Dirección"    value={data.address} />
            </Section>

            {/* Datos del vehículo */}
            <Section title="Vehículo">
              <Row icon={Car} label="Chapa (matrícula)" value={data.plate} />
              <Row icon={Car} label="Chasis"            value={data.chassis} />
              <Row icon={Car} label="Modelo"            value={data.vehicleType} />
            </Section>

            {/* Trabajo */}
            {isMechanic ? (
              <Section title="Servicio">
                <Row icon={Wrench}   label="Tipo de servicio" value={data.serviceName} />
                <Row icon={Clock}    label="Horario"          value={data.timeStart && data.timeEnd ? `${data.timeStart} → ${data.timeEnd}` : data.timeStart} />
              </Section>
            ) : (
              <Section title="Trabajo">
                {data.budgetNumber && (
                  <Row icon={FileText} label="N° Presupuesto" value={data.budgetNumber} />
                )}
                <Row icon={Paintbrush} label="Tipo de trabajo" value={data.workTypeName} />
                <Row icon={Clock}      label="Días estimados"  value={data.stayDays ? `${data.stayDays} día${data.stayDays !== 1 ? 's' : ''}` : null} />
                {(data.bodyworkHours || data.prepHours || data.paintHours) && (
                  <div className="pt-2 flex items-center gap-3 flex-wrap text-[11px]">
                    {!!data.bodyworkHours && (
                      <span className="bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-2 py-0.5 font-semibold">
                        Chapería {data.bodyworkHours}h
                      </span>
                    )}
                    {!!data.prepHours && (
                      <span className="bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5 font-semibold">
                        Prep. {data.prepHours}h
                      </span>
                    )}
                    {!!data.paintHours && (
                      <span className="bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2 py-0.5 font-semibold">
                        Pintura {data.paintHours}h
                      </span>
                    )}
                  </div>
                )}
                <Row icon={Phone} label="Canal de ingreso" value={data.channel ? (CHANNEL_LABELS[data.channel] ?? data.channel) : null} />
              </Section>
            )}

            {/* Técnico asignado — mechanic */}
            {isMechanic && (
              data.techName ? (
                <Section title="Técnico asignado">
                  <div className="flex items-center gap-3 py-1">
                    <div className="h-9 w-9 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-indigo-700">
                        {data.techName.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">{data.techName}</p>
                      {data.techSpecialty && (
                        <p className="text-xs text-slate-500">{data.techSpecialty}</p>
                      )}
                    </div>
                  </div>
                </Section>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                  <Wrench className="h-3.5 w-3.5 flex-shrink-0" />
                  Sin mecánico asignado — se puede asignar desde la agenda
                </div>
              )
            )}

            {/* Técnicos por proceso — bodyshop */}
            {!isMechanic && (() => {
              const pt = data.processTechs;
              const rows = [
                { proc: 'BODYWORK', label: 'Chapería',    hours: data.bodyworkHours, name: pt?.BODYWORK, color: 'bg-orange-100 text-orange-700' },
                { proc: 'PREP',     label: 'Preparación', hours: data.prepHours,     name: pt?.PREP,     color: 'bg-blue-100 text-blue-700'   },
                { proc: 'PAINT',    label: 'Pintura',     hours: data.paintHours,    name: pt?.PAINT,    color: 'bg-purple-100 text-purple-700' },
              ].filter(r => (r.hours ?? 0) > 0);

              if (rows.length === 0) return null;

              const allAssigned = rows.every(r => !!r.name);
              return (
                <Section title="Técnicos asignados">
                  {rows.map(r => (
                    <div key={r.proc} className="flex items-center gap-3 py-1.5 border-b border-slate-50 last:border-0">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.color} flex-shrink-0`}>
                        {r.label}
                      </span>
                      {r.name ? (
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-[10px] font-bold text-indigo-700">
                              {r.name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-slate-800 truncate">{r.name}</p>
                        </div>
                      ) : (
                        <p className="text-xs text-amber-600 italic">Sin asignar</p>
                      )}
                    </div>
                  ))}
                  {!allAssigned && (
                    <p className="text-[10px] text-amber-600 pt-1 flex items-center gap-1">
                      <Hammer className="h-3 w-3" />
                      Los procesos sin técnico se pueden asignar desde la agenda
                    </p>
                  )}
                </Section>
              );
            })()}

            {/* Observaciones */}
            {data.notes && (
              <Section title="Observaciones">
                <div className="flex items-start gap-2 pt-1">
                  <FileText className="h-3.5 w-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{data.notes}</p>
                </div>
              </Section>
            )}

            {/* DMS Condor — siempre visible */}
            <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${
              data.dmsSync == null
                ? 'bg-slate-50 border-slate-200'
                : data.dmsSync.success
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-red-50 border-red-200'
            }`}>
              <div className={`h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                data.dmsSync == null
                  ? 'bg-slate-200'
                  : data.dmsSync.success
                    ? 'bg-emerald-500'
                    : 'bg-red-500'
              }`}>
                {data.dmsSync == null
                  ? <Link2 className="h-3.5 w-3.5 text-slate-500" />
                  : data.dmsSync.success
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                    : <AlertCircle className="h-3.5 w-3.5 text-white" />
                }
              </div>
              <div className="min-w-0">
                <p className={`text-xs font-bold uppercase tracking-wide ${
                  data.dmsSync == null ? 'text-slate-500' : data.dmsSync.success ? 'text-emerald-700' : 'text-red-700'
                }`}>
                  DMS Condor — {data.dmsSync == null ? 'sin asesor seleccionado' : data.dmsSync.success ? 'enviado ✓' : 'error al enviar'}
                </p>
                {data.dmsSync == null && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    {data.dmsAdvisorCode
                      ? `Asesor: ${data.dmsAdvisorCode}`
                      : 'No se seleccionó asesor DMS — el turno no se registró en Condor'}
                  </p>
                )}
                {data.dmsSync?.success && (
                  <p className="text-xs text-emerald-600 mt-0.5 font-mono">
                    ID Condor: {data.dmsSync.dmsId}
                    {data.dmsAdvisorName && <span className="font-sans font-normal ml-2 text-emerald-700">· {data.dmsAdvisorName}</span>}
                  </p>
                )}
                {data.dmsSync && !data.dmsSync.success && (
                  <p className="text-xs text-red-600 mt-0.5">
                    {data.dmsSync.error ?? 'Error desconocido'}
                    {data.dmsAdvisorCode && <span className="ml-2 font-mono text-red-500">· asesor: {data.dmsAdvisorCode}</span>}
                  </p>
                )}
              </div>
            </div>

          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 px-5 py-4 flex items-center gap-2 flex-wrap flex-shrink-0 print:hidden">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors font-medium"
              title="Imprimir comprobante"
            >
              <Printer className="h-3.5 w-3.5" /> Imprimir
            </button>
            <div className="flex-1" />
            <button
              onClick={onNewBooking}
              className="text-xs px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors font-medium"
            >
              Agendar otro
            </button>
            <button
              onClick={onViewSchedule}
              className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors font-semibold shadow-sm"
            >
              Ver agenda <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(modal, document.body);
}
