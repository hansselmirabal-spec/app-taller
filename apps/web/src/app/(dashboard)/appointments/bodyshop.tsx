'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronLeft, ChevronRight, Plus, Car, AlertTriangle, CalendarDays,
  X, Clock, Hash, Phone, User2, Wrench, CheckCircle2, Edit2, BarChart3,
} from 'lucide-react';
import BodyshopReport from './bodyshop-report';
import { format, addDays, subDays, parseISO, startOfWeek, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { useBodyshopDayCapacity, useCancelBodyshopEntry, useBodyshopEntriesKanban, useAssignBodyshopTechnician, useAssignBodyshopProcessTechnician, usePatchBodyshopEntryHours, useBodyshopWeekCapacity } from '@/hooks/use-bodyshop';
import { useModulePermission } from '@/hooks/use-module-permission';
import { useTechnicians } from '@/hooks/use-technicians';
import { useDailyCapacity } from '@/hooks/use-capacity';
import { formatDate, sumBodyshopHours, sumBodyshopHoursWithExtras } from '@/lib/utils';
import { getWeekDays, entriesOnDay } from '@/lib/bodyshop-calendar';
import { ActivitiesPanel } from '@/components/kanban/activities-panel';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import type { BodyshopEntry, CapacityStatus, Technician } from '@/types';
import { InfoButton } from '@/components/ui/info-button';
import { MotivationalLoader } from '@/components/ui/motivational-loader';

const statusStyles: Record<CapacityStatus, string> = {
  OK:         'bg-emerald-50 border-emerald-200 text-emerald-700',
  RISK:       'bg-amber-50 border-amber-200 text-amber-700',
  OVERLOADED: 'bg-red-100 border-red-300 text-red-800',
};

const statusLabel: Record<CapacityStatus, string> = {
  OK: 'OK', RISK: 'Riesgo', OVERLOADED: 'Sobrecargado',
};

const statusBarClass: Record<CapacityStatus, string> = {
  OK: 'bg-emerald-400', RISK: 'bg-amber-400', OVERLOADED: 'bg-red-500',
};

const entryStatusStyles: Record<string, string> = {
  scheduled:   'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  done:        'bg-emerald-100 text-emerald-700',
  cancelled:   'bg-slate-100 text-slate-400 line-through',
};

const entryStatusLabel: Record<string, string> = {
  scheduled: 'Agendado', in_progress: 'En proceso', done: 'Listo', cancelled: 'Cancelado',
};

const channelLabel: Record<string, string> = {
  walk_in: 'Walk-in', phone: 'Teléfono', online: 'Online', insurance: 'Seguro',
};

const severityStyle: Record<string, string> = {
  LIGHT:    'bg-emerald-50 text-emerald-700',
  MEDIUM:   'bg-amber-50 text-amber-700',
  HEAVY:    'bg-orange-50 text-orange-700',
  MULTIPLE: 'bg-red-50 text-red-700',
};

const processConfig = {
  BODYWORK: { label: 'Chapería',    badge: 'bg-blue-100 text-blue-700',   pill: 'bg-blue-50 text-blue-700' },
  PREP:     { label: 'Preparación', badge: 'bg-violet-100 text-violet-700', pill: 'bg-violet-50 text-violet-700' },
  PAINT:    { label: 'Pintura',     badge: 'bg-orange-100 text-orange-700', pill: 'bg-orange-50 text-orange-700' },
} as const;

type MainTab = 'agenda' | 'report';

export default function BodyshopAppointmentsPage() {
  const { canEdit } = useModulePermission('appointments');
  const router = useRouter();
  const [date, setDate]       = useState(formatDate(new Date()));
  const [tab,  setTab]        = useState<MainTab>('agenda');
  const [capView, setCapView] = useState<'day' | 'week'>('day');

  const { data: dayCap, isLoading } = useBodyshopDayCapacity(date);
  const cancel = useCancelBodyshopEntry();

  const weekDaysForCap = getWeekDays(date);
  const weekFrom = formatDate(weekDaysForCap[0]);
  const weekTo   = formatDate(weekDaysForCap[6]);
  const { data: weekCapForStrip } = useBodyshopWeekCapacity(weekFrom, weekTo);

  // Dedupe defensivo por id antes de filtrar.
  // Evita el warning "two children with the same key" si por algún motivo
  // (cache stale de react-query, optimistic updates, joins múltiples) llega un duplicado.
  const uniqueEntries = (() => {
    const seen = new Set<string>();
    return (dayCap?.entries ?? []).filter(e => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
  })();
  const activeEntries    = uniqueEntries.filter(e => e.status !== 'cancelled');
  const cancelledEntries = uniqueEntries.filter(e => e.status === 'cancelled');

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900">Agenda Carrocería</h1>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">BODYSHOP</span>
              <InfoButton helpKey="appointments" />
            </div>
            {/* Tab switcher */}
            <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs font-semibold">
              <button
                onClick={() => setTab('agenda')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${tab === 'agenda' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <CalendarDays className="h-3.5 w-3.5" /> Agenda
              </button>
              <button
                onClick={() => setTab('report')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${tab === 'report' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <BarChart3 className="h-3.5 w-3.5" /> Reporte
              </button>
            </div>
          </div>
          {tab === 'agenda' && (
            <div className="flex items-center gap-2 mt-1">
              <button onClick={() => setDate(formatDate(subDays(parseISO(date), 1)))} className="p-0.5 rounded hover:bg-slate-100">
                <ChevronLeft className="h-4 w-4 text-slate-400" />
              </button>
              <span className="text-xs font-medium text-slate-600 capitalize">
                {format(parseISO(date + 'T12:00:00'), "EEEE, d 'de' MMMM yyyy", { locale: es })}
              </span>
              <button onClick={() => setDate(formatDate(addDays(parseISO(date), 1)))} className="p-0.5 rounded hover:bg-slate-100">
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
              <button onClick={() => setDate(formatDate(new Date()))} className="text-xs text-blue-600 font-medium hover:underline ml-1">
                Hoy
              </button>
            </div>
          )}
        </div>
        {canEdit && (
          <button
            onClick={() => router.push(`/appointments/new?date=${date}`)}
            className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" /> Nuevo Ingreso
          </button>
        )}
      </div>

      {/* Report tab */}
      {tab === 'report' && (
        <div className="flex-1 overflow-y-auto">
          <BodyshopReport />
        </div>
      )}

      <div className={`flex-1 overflow-y-auto p-6 space-y-5 ${tab !== 'agenda' ? 'hidden' : ''}`}>
        {isLoading ? (
          <MotivationalLoader className="h-64" />
        ) : (
          <>
            {/* Capacity header + toggle */}
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Capacidad {capView === 'day'
                  ? format(parseISO(date + 'T12:00:00'), "d 'de' MMMM", { locale: es })
                  : `semana del ${format(weekDaysForCap[0], "d MMM", { locale: es })} al ${format(weekDaysForCap[6], "d MMM", { locale: es })}`
                }
              </p>
              <div className="flex bg-slate-100 rounded-lg p-0.5">
                {(['day', 'week'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setCapView(v)}
                    className={`text-xs px-3 py-1 rounded-md font-semibold transition-all ${
                      capView === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {v === 'day' ? 'Hoy' : 'Semana'}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Vista HOY: 4 tarjetas ── */}
            {capView === 'day' && dayCap && (
              <div className="grid grid-cols-4 gap-3">
                {(['BODYWORK', 'PREP', 'PAINT'] as const).map(key => {
                  const proc = dayCap.byProcess[key];
                  const cfg  = processConfig[key];
                  return (
                    <div key={key} className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${cfg.badge}`}>{cfg.label}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${statusStyles[proc.status]}`}>
                          {statusLabel[proc.status]}
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-slate-900">{Math.round(proc.occupancyRate * 100)}%</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {proc.availableHours.toFixed(1)}h libres / {proc.commercializableHours.toFixed(1)}h tot.
                      </p>
                      <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${statusBarClass[proc.status]}`}
                          style={{ width: `${Math.min(proc.occupancyRate * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {/* Global */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Global</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${statusStyles[dayCap.globalStatus]}`}>
                      {statusLabel[dayCap.globalStatus]}
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-slate-900">{Math.round(dayCap.globalOccupancyRate * 100)}%</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {activeEntries.length} trabajo{activeEntries.length !== 1 ? 's' : ''} activo{activeEntries.length !== 1 ? 's' : ''}
                  </p>
                  <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${statusBarClass[dayCap.globalStatus]}`}
                      style={{ width: `${Math.min(dayCap.globalOccupancyRate * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── Vista SEMANA: grilla de 7 días ── */}
            {capView === 'week' && (
              <div className="grid grid-cols-7 gap-2">
                {weekDaysForCap.map(day => {
                  const ds       = formatDate(day);
                  const dc       = weekCapForStrip?.[ds];
                  const isToday  = ds === formatDate(new Date());
                  const isSel    = ds === date;
                  return (
                    <button
                      key={ds}
                      onClick={() => setDate(ds)}
                      className={`text-left bg-white rounded-xl border shadow-sm px-3 py-2.5 transition-all hover:border-orange-300 hover:shadow-md ${
                        isToday ? 'border-orange-400 ring-1 ring-orange-300' :
                        isSel   ? 'border-orange-200 bg-orange-50' :
                        'border-slate-200'
                      }`}
                    >
                      {/* Cabecera día */}
                      <div className="text-center mb-2.5">
                        <p className="text-[9px] uppercase tracking-wider font-medium text-slate-400">
                          {format(day, 'EEE', { locale: es })}
                        </p>
                        <p className={`text-base font-bold leading-tight ${isToday ? 'text-orange-600' : 'text-slate-800'}`}>
                          {format(day, 'd')}
                        </p>
                      </div>

                      {dc ? (
                        <div className="space-y-2">
                          {([
                            { key: 'BODYWORK' as const, label: 'Chap.',  bar: 'bg-blue-400'   },
                            { key: 'PREP'     as const, label: 'Prep.',  bar: 'bg-violet-400' },
                            { key: 'PAINT'    as const, label: 'Pint.',  bar: 'bg-orange-400' },
                          ]).map(({ key, label, bar }) => {
                            const proc = dc.byProcess[key];
                            const pct  = Math.min(proc.occupancyRate * 100, 100);
                            const txt  =
                              proc.status === 'OK'         ? 'text-emerald-600' :
                              proc.status === 'RISK'       ? 'text-amber-600'   :
                              'text-red-600';
                            return (
                              <div key={key}>
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="text-[9px] text-slate-400 font-medium">{label}</span>
                                  <span className={`text-[9px] font-bold ${txt}`}>
                                    {Math.round(proc.occupancyRate * 100)}%
                                  </span>
                                </div>
                                <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                          {/* Badge global */}
                          <div className={`mt-1 text-center text-[9px] font-bold px-1 py-0.5 rounded-md border ${statusStyles[dc.globalStatus]}`}>
                            {Math.round(dc.globalOccupancyRate * 100)}% global
                          </div>
                        </div>
                      ) : (
                        <p className="text-center text-[9px] text-slate-200 mt-4">—</p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Calendar panel — primero */}
            <BodyshopCalendar selectedDate={date} onSelectDate={setDate} />

            {/* Entries */}
            <div className="space-y-2">
              {activeEntries.length === 0 && cancelledEntries.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-slate-200 flex flex-col items-center justify-center py-16 text-slate-400">
                  <Car className="h-10 w-10 mb-3 opacity-20" />
                  <p className="text-sm font-medium">Sin ingresos para este día</p>
                  {canEdit && (
                    <button
                      onClick={() => router.push(`/appointments/new?date=${date}`)}
                      className="mt-4 text-sm text-orange-600 hover:underline font-semibold"
                    >
                      + Registrar primer ingreso
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {activeEntries.map(entry => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      selectedDate={date}
                      onCancel={canEdit ? () => cancel.mutate(entry.id) : undefined}
                    />
                  ))}
                  {cancelledEntries.map(entry => (
                    <EntryCard key={entry.id} entry={entry} selectedDate={date} cancelled />
                  ))}
                </>
              )}
            </div>

          </>
        )}
      </div>
    </div>
  );
}

function EntryCard({
  entry,
  selectedDate,
  onCancel,
  cancelled = false,
}: {
  entry: BodyshopEntry;
  selectedDate: string;
  onCancel?: () => void;
  cancelled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const totalHours = sumBodyshopHoursWithExtras(entry);
  const isInShop = entry.date < selectedDate && entry.status === 'scheduled';
  const badgeLabel = isInShop ? 'En taller' : entryStatusLabel[entry.status];
  const badgeClass = isInShop ? 'bg-orange-100 text-orange-700' : entryStatusStyles[entry.status];

  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-opacity ${cancelled ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-4 px-5 py-3.5">
        {/* Left color bar from work type */}
        <div
          className="w-1 self-stretch rounded-full flex-shrink-0 min-h-[48px]"
          style={{ backgroundColor: entry.workType?.color ?? '#94a3b8' }}
        />

        {/* Customer + plate + work type */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-slate-900 truncate">{entry.customerName}</p>
            <span className="text-xs font-mono font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
              {entry.plate}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs font-semibold" style={{ color: entry.workType?.color ?? '#94a3b8' }}>
              {entry.workType?.name}
            </span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${severityStyle[entry.workType?.severity ?? 'medium']}`}>
              {entry.workType?.severity}
            </span>
            <span className="text-[10px] text-slate-400">{channelLabel[entry.channel]}</span>
          </div>
        </div>

        {/* Hours per process */}
        <div className="flex items-center gap-2">
          <HoursPill hours={entry.bodyworkHours} label="Chap." className={processConfig.BODYWORK.pill} />
          <HoursPill hours={entry.prepHours}     label="Prep." className={processConfig.PREP.pill} />
          <HoursPill hours={entry.paintHours}    label="Pint." className={processConfig.PAINT.pill} />
          <div className="text-center border-l border-slate-200 pl-3 ml-1">
            <p className="text-sm font-bold text-slate-900">{totalHours}h</p>
            <p className="text-[10px] text-slate-400">total</p>
          </div>
        </div>

        {/* Stay days */}
        <div className="text-center min-w-[40px]">
          <p className="text-sm font-bold text-slate-900">{entry.stayDays}d</p>
          <p className="text-[10px] text-slate-400">estadía</p>
        </div>

        {/* Status badge */}
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${badgeClass}`}>
          {badgeLabel}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setExpanded(e => !e)}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 text-xs transition-colors"
            title={expanded ? 'Colapsar' : 'Expandir'}
          >
            {expanded ? '▲' : '▼'}
          </button>
          {!cancelled && onCancel && entry.status === 'scheduled' && (
            <button
              onClick={onCancel}
              className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"
              title="Cancelar ingreso"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-5 py-3 bg-slate-50 text-xs text-slate-600 space-y-1.5">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span>
              <strong>Ingreso:</strong>{' '}
              {format(parseISO(entry.date + 'T12:00:00'), "EEEE d 'de' MMMM yyyy", { locale: es })}
            </span>
            <span><strong>Estadía estimada:</strong> {entry.stayDays} día{entry.stayDays !== 1 ? 's' : ''}</span>
            <span><strong>Canal:</strong> {channelLabel[entry.channel]}</span>
          </div>
          {entry.notes && <p><strong>Notas:</strong> {entry.notes}</p>}
          <div className="flex gap-4 mt-0.5">
            <span className="text-blue-600"><strong>Chapería:</strong> {entry.bodyworkHours}h</span>
            <span className="text-violet-600"><strong>Preparación:</strong> {entry.prepHours}h</span>
            <span className="text-orange-600"><strong>Pintura:</strong> {entry.paintHours}h</span>
          </div>
          {entry.status === 'in_progress' && (
            <div className="flex items-center gap-1.5 text-amber-600 mt-1">
              <AlertTriangle className="h-3 w-3" />
              <span>Trabajo en progreso — vehículo en taller</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HoursPill({ hours, label, className }: { hours: number; label: string; className: string }) {
  return (
    <div className={`text-center px-2 py-1 rounded-lg ${className}`}>
      <p className="text-xs font-bold">{hours}h</p>
      <p className="text-[10px] leading-tight">{label}</p>
    </div>
  );
}

// ─── EntryPopup ───────────────────────────────────────────────────────────────

const PROCESS_CFG = [
  { key: 'bodywork' as const, label: 'Chapería',    color: '#3b82f6', field: 'bodyworkHours' as const },
  { key: 'prep'     as const, label: 'Preparación', color: '#8b5cf6', field: 'prepHours'     as const },
  { key: 'paint'    as const, label: 'Pintura',     color: '#f97316', field: 'paintHours'    as const },
];

function TechnicianAssigner({
  entry,
  totalHours,
  compact = false,
}: {
  entry: BodyshopEntry;
  totalHours: number;
  compact?: boolean;
}) {
  const [editing, setEditing]     = useState(false);
  const assign                    = useAssignBodyshopTechnician();
  const { data: technicians = [] } = useTechnicians();
  const { data: capacity = [] }   = useDailyCapacity(entry.date);

  // Current assigned tech (refresh from mutation result if available)
  const current = entry.technician ?? null;

  // Todos los técnicos activos son candidatos.
  // Si hay datos de capacidad y el técnico no trabaja ese día, se excluye.
  // Si no hay datos de capacidad, igual se muestra (no bloquear por falta de datos).
  const candidates = technicians.filter(tech => {
    const cap = capacity.find(c => c.technicianId === tech.id);
    if (cap && !cap.isWorkingDay) return false;
    return true;
  });

  function sameSpecialty(tech: typeof technicians[0]): boolean {
    if (!current?.specialty) return true;
    return tech.specialty === current.specialty;
  }

  // Sort: same specialty first, then by name
  const sorted = [...candidates].sort((a, b) => {
    const sa = sameSpecialty(a) ? 0 : 1;
    const sb = sameSpecialty(b) ? 0 : 1;
    return sa - sb || a.name.localeCompare(b.name);
  });

  function pick(techId: string) {
    assign.mutate({ entryId: entry.id, technicianId: techId });
    setEditing(false);
  }

  function unassign() {
    assign.mutate({ entryId: entry.id, technicianId: null });
    setEditing(false);
  }

  return (
    <div>
      {!compact && (
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
          <User2 className="h-3.5 w-3.5" /> Técnico asignado
        </p>
      )}

      {/* Current tech */}
      {!editing ? (
        <div className={`flex items-center gap-2 ${compact ? '' : 'px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50'}`}>
          {current ? (
            <>
              <div
                className={`rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 ${compact ? 'h-5 w-5 text-[9px]' : 'h-8 w-8 text-xs'}`}
                style={{ background: '#3b82f6' }}
              >
                {current.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-semibold text-slate-800 truncate ${compact ? 'text-xs' : 'text-sm'}`}>
                  {current.name}
                </p>
                {!compact && (
                  <p className="text-[10px] text-slate-400">
                    {current.specialty ?? 'Sin especialidad'}
                    {(() => {
                      const cap = capacity.find(c => c.technicianId === current.id);
                      return cap ? ` · ${cap.availableHours.toFixed(1)}h disp.` : '';
                    })()}
                  </p>
                )}
              </div>
              <button
                onClick={() => setEditing(true)}
                className={`flex items-center gap-0.5 text-blue-600 hover:text-blue-700 font-medium transition-colors flex-shrink-0 ${compact ? 'text-[10px]' : 'text-xs'}`}
              >
                <Edit2 className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} /> Cambiar
              </button>
            </>
          ) : (
            <>
              {!compact && (
                <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                  <User2 className="h-4 w-4 text-slate-400" />
                </div>
              )}
              <p className={`flex-1 text-slate-400 italic ${compact ? 'text-[10px]' : 'text-sm'}`}>
                Sin técnico asignado
              </p>
              <button
                onClick={() => setEditing(true)}
                className={`flex items-center gap-0.5 text-blue-600 hover:text-blue-700 font-medium transition-colors flex-shrink-0 ${compact ? 'text-[10px]' : 'text-xs'}`}
              >
                <Edit2 className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} /> Cambiar
              </button>
            </>
          )}
        </div>
      ) : (
        /* Picker */
        <div className="border border-blue-200 rounded-xl overflow-hidden bg-white">
          <div className="px-3 py-2 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
            <p className="text-xs font-semibold text-blue-700">
              Técnicos disponibles — {entry.date}
            </p>
            <button onClick={() => setEditing(false)} className="text-blue-400 hover:text-blue-600">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {sorted.length === 0 && (
            <div className="px-3 py-4 text-center">
              <AlertTriangle className="h-5 w-5 text-amber-400 mx-auto mb-1" />
              <p className="text-xs text-slate-500">Sin técnicos disponibles para esta fecha</p>
            </div>
          )}

          <div className="max-h-52 overflow-y-auto divide-y divide-slate-100">
            {sorted.map(tech => {
              const cap        = capacity.find(c => c.technicianId === tech.id);
              const isMatch    = sameSpecialty(tech);
              const isCurrent  = tech.id === current?.id;

              return (
                <button
                  key={tech.id}
                  onClick={() => pick(tech.id)}
                  disabled={assign.isPending || isCurrent}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors
                    ${isCurrent ? 'bg-blue-50 cursor-default' : 'hover:bg-slate-50'}
                  `}
                >
                  {/* Avatar */}
                  <div
                    className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                    style={{ background: isMatch ? '#3b82f6' : '#94a3b8' }}
                  >
                    {tech.name.charAt(0)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">{tech.name}</p>
                    <p className="text-[10px] text-slate-400">
                      {tech.specialty ?? 'Sin especialidad'}
                      {cap ? ` · ${cap.availableHours.toFixed(1)}h libres` : ''}
                    </p>
                  </div>

                  {/* Status icons */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {!isMatch && (
                      <span className="flex items-center gap-0.5 text-[9px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-medium">
                        <AlertTriangle className="h-2.5 w-2.5" /> Esp. diferente
                      </span>
                    )}
                    {isCurrent && (
                      <CheckCircle2 className="h-4 w-4 text-blue-500" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Unassign option */}
          {current && (
            <div className="border-t border-slate-100 px-3 py-2">
              <button
                onClick={unassign}
                className="text-xs text-red-500 hover:text-red-600 font-medium transition-colors"
              >
                Quitar técnico asignado
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ProcessTechRow ───────────────────────────────────────────────────────────
// Muestra el técnico asignado a un proceso específico con opción de cambiar.

const PROCESS_PROCESS_KEY: Record<string, 'BODYWORK' | 'PREP' | 'PAINT'> = {
  Chapería: 'BODYWORK', Preparación: 'PREP', Pintura: 'PAINT',
};

function ProcessTechRow({
  entry,
  processKey,
  processLabel,
  processColor,
  hours,
  compact = false,
}: {
  entry: BodyshopEntry;
  processKey: 'BODYWORK' | 'PREP' | 'PAINT';
  processLabel: string;
  processColor: string;
  hours: number;
  compact?: boolean;
}) {
  const [open, setOpen]             = useState(false);
  const assign                      = useAssignBodyshopProcessTechnician();
  const { data: allTechs = [] }     = useTechnicians();
  const { data: capacityList = [] } = useDailyCapacity(entry.date);

  // Técnico actualmente asignado a este proceso
  const current = entry.processTechs?.[processKey]?.technician ?? null;

  // Horas disponibles de un técnico dado (según capacidad del día)
  function availHours(techId: string): number {
    return capacityList.find(c => c.technicianId === techId)?.availableHours ?? 0;
  }

  // Color según horas disponibles vs horas requeridas
  function availColor(avail: number): string {
    if (avail <= 0)      return 'text-red-600';
    if (avail < hours)   return 'text-amber-600';
    return 'text-emerald-600';
  }

  // Candidatos: misma especialidad, solo activos
  const candidates = allTechs.filter(t => {
    const spec = t.specialty?.toLowerCase() ?? '';
    if (processKey === 'BODYWORK') return spec.includes('chap');
    if (processKey === 'PREP')     return spec.includes('prep');
    if (processKey === 'PAINT')    return spec.includes('pint') || spec.includes('paint');
    return true;
  });

  // Ordenar: primero los que tienen suficientes horas, luego por horas desc
  const sorted = [...candidates].sort((a, b) => {
    const ha = availHours(a.id);
    const hb = availHours(b.id);
    const okA = ha >= hours ? 1 : 0;
    const okB = hb >= hours ? 1 : 0;
    return okB - okA || hb - ha;
  });

  function pick(tech: Technician | null) {
    assign.mutate({ entryId: entry.id, process: processKey, technicianId: tech?.id ?? null });
    setOpen(false);
  }

  // ── Vista compacta (day card inline) ───────────────────────────────────────
  if (compact) {
    const avail = current ? availHours(current.id) : 0;
    return (
      <div className="relative flex items-center gap-1.5 min-w-0">
        {current ? (
          <>
            <div className="h-4 w-4 rounded-full flex items-center justify-center font-bold text-white text-[8px] flex-shrink-0"
              style={{ background: processColor }}>
              {current.name.charAt(0)}
            </div>
            <span className="text-[10px] text-slate-700 font-medium truncate">{current.name.split(' ')[0]}</span>
            <span className={`text-[9px] font-semibold flex-shrink-0 ${availColor(avail)}`}>
              {avail > 0 ? `${avail.toFixed(1)}h libres` : '0h libres'}
            </span>
            <button onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
              className="text-slate-300 hover:text-blue-500 transition-colors flex-shrink-0 ml-auto">
              <Edit2 className="h-2.5 w-2.5" />
            </button>
          </>
        ) : (
          <button onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
            className="text-[10px] text-slate-400 italic hover:text-blue-500 transition-colors flex items-center gap-1">
            <User2 className="h-3 w-3" /> Sin asignar · <span className="text-blue-500 not-italic font-medium">Cambiar</span>
          </button>
        )}

        {open && (
          <div className="absolute z-30 top-6 left-0 bg-white rounded-xl border border-slate-200 shadow-xl w-52 overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wide">{processLabel}</span>
              <button onClick={() => setOpen(false)}><X className="h-3 w-3 text-slate-400" /></button>
            </div>
            {sorted.length === 0 ? (
              <p className="text-[10px] text-slate-400 px-3 py-3 text-center">Sin técnicos disponibles</p>
            ) : sorted.map(t => {
              const av   = availHours(t.id);
              const isCur = t.id === current?.id;
              return (
                <button key={t.id} onClick={() => pick(t)}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-0 ${isCur ? 'bg-blue-50' : ''}`}>
                  <div className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                    style={{ background: processColor }}>{t.name.charAt(0)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold text-slate-800 truncate">{t.name.split(' ')[0]}</p>
                    <p className={`text-[9px] font-semibold ${availColor(av)}`}>
                      {av > 0 ? `${av.toFixed(1)}h libres` : '0h libres'}
                    </p>
                  </div>
                  {isCur && <span className="text-[9px] font-bold text-blue-500 flex-shrink-0">✓</span>}
                </button>
              );
            })}
            {current && (
              <button onClick={() => pick(null)}
                className="w-full text-left px-3 py-2 text-[10px] text-red-500 hover:bg-red-50 border-t border-slate-100 font-medium">
                Quitar asignación
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Vista full (popup) ──────────────────────────────────────────────────────
  const avail = current ? availHours(current.id) : 0;

  return (
    <div className="relative">
      <div className="flex items-center gap-2.5">
        {current ? (
          <>
            <div className="h-8 w-8 rounded-full flex items-center justify-center font-bold text-white text-sm flex-shrink-0"
              style={{ background: processColor }}>
              {current.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{current.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-slate-400">{current.specialty}</span>
                <span className="text-[10px] text-slate-300">·</span>
                <span className={`text-[10px] font-bold ${availColor(avail)}`}>
                  {avail > 0 ? `${avail.toFixed(1)}h libres` : '0h libres'}
                </span>
                <span className="text-[10px] text-slate-300">·</span>
                <span className="text-[10px] text-slate-500">{hours}h en este trabajo</span>
              </div>
            </div>
            <button onClick={() => setOpen(v => !v)}
              className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1 flex-shrink-0 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">
              <Edit2 className="h-3 w-3" /> Cambiar
            </button>
          </>
        ) : (
          <>
            <div className="h-8 w-8 rounded-full bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center flex-shrink-0">
              <User2 className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-slate-400 italic">Sin técnico asignado</p>
              <p className="text-[10px] text-slate-400">{hours}h pendientes de asignar</p>
            </div>
            <button onClick={() => setOpen(v => !v)}
              className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1 flex-shrink-0 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">
              <Edit2 className="h-3 w-3" /> Cambiar
            </button>
          </>
        )}
      </div>

      {open && (
        <div className="mt-2 rounded-xl border border-slate-200 overflow-hidden bg-white shadow-md">
          <div className="px-3 py-2.5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <div>
              <p className="text-xs font-bold text-slate-700">Técnicos — {processLabel}</p>
              <p className="text-[10px] text-slate-400">Este trabajo requiere {hours}h</p>
            </div>
            <button onClick={() => setOpen(false)}><X className="h-3.5 w-3.5 text-slate-400" /></button>
          </div>
          {sorted.length === 0 ? (
            <p className="text-xs text-slate-400 px-4 py-4 text-center">Sin técnicos con especialidad en {processLabel}</p>
          ) : sorted.map(t => {
            const av    = availHours(t.id);
            const isCur = t.id === current?.id;
            const ok    = av >= hours;
            return (
              <button key={t.id} onClick={() => pick(t)}
                className={`w-full text-left px-3 py-3 flex items-center gap-3 hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-0 ${isCur ? 'bg-blue-50' : ''}`}>
                <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ background: processColor }}>{t.name.charAt(0)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-900">{t.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-slate-400">{t.specialty}</span>
                    <span className="text-[10px] text-slate-300">·</span>
                    <span className={`text-[10px] font-bold ${availColor(av)}`}>
                      {av > 0 ? `${av.toFixed(1)}h libres` : '0h libres'}
                    </span>
                  </div>
                  {/* Mini barra de disponibilidad */}
                  <div className="mt-1.5 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (av / (av + hours)) * 100)}%`,
                        background: ok ? '#22c55e' : av > 0 ? '#f59e0b' : '#ef4444',
                      }} />
                  </div>
                </div>
                {isCur && (
                  <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded flex-shrink-0">Actual</span>
                )}
              </button>
            );
          })}
          {current && (
            <button onClick={() => pick(null)}
              className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-50 border-t border-slate-200 font-medium">
              Quitar asignación
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function EntryPopup({
  entry,
  onClose,
}: {
  entry: BodyshopEntry;
  onClose: () => void;
}) {
  const { data: technicians = [] } = useTechnicians();
  const patchHours = usePatchBodyshopEntryHours();
  const totalHours = sumBodyshopHoursWithExtras(entry);

  // Estado del panel de ajuste de horas. Se guarda como STRING mientras se tipea
  // (no como número parseado en cada tecla) — guardar el número ya parseado de
  // vuelta en un input controlado le hace perder al usuario el punto/coma decimal
  // recién tipeado (18.2 → se ve "18", la próxima tecla da "182"). Se convierte a
  // número recién al guardar.
  const [adjusting, setAdjusting]     = useState(false);
  const [adjBW, setAdjBW]             = useState(String(entry.bodyworkHours));
  const [adjPrep, setAdjPrep]         = useState(String(entry.prepHours));
  const [adjPaint, setAdjPaint]       = useState(String(entry.paintHours));
  const [adjStay, setAdjStay]         = useState(entry.stayDays);
  const [adjErr, setAdjErr]           = useState('');

  // Sync adjust state when entry prop updates (cache refetch post-save)
  useEffect(() => {
    if (!adjusting) {
      setAdjBW(String(entry.bodyworkHours));
      setAdjPrep(String(entry.prepHours));
      setAdjPaint(String(entry.paintHours));
      setAdjStay(entry.stayDays);
    }
  }, [entry.bodyworkHours, entry.prepHours, entry.paintHours, entry.stayDays, adjusting]);

  async function handleAdjustHours() {
    setAdjErr('');
    try {
      await patchHours.mutateAsync({
        id: entry.id,
        bodyworkHours: Number(adjBW.replace(',', '.')) || 0,
        prepHours:     Number(adjPrep.replace(',', '.')) || 0,
        paintHours:    Number(adjPaint.replace(',', '.')) || 0,
        stayDays:      Number(adjStay),
      });
      setAdjusting(false);
    } catch (err: unknown) {
      setAdjErr(err instanceof Error ? err.message : 'Error al guardar');
    }
  }
  const entryDate  = parseISO(entry.date + 'T12:00:00');
  const exitDate   = addDays(entryDate, entry.stayDays - 1);
  const today      = new Date();
  const daysIn     = entry.status === 'in_progress'
    ? differenceInDays(today, entryDate)
    : null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[88vh] flex flex-col p-0 overflow-hidden gap-0">

        {/* ── Header ─────────────────────────────────────── */}
        <div
          className="px-6 pt-5 pb-4 flex items-start justify-between flex-shrink-0"
          style={{ borderBottom: `3px solid ${entry.workType?.color ?? '#94a3b8'}` }}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-slate-900 truncate">
                {entry.customerName}
              </h2>
              <span className="font-mono text-sm text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                {entry.plate}
              </span>
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: (entry.workType?.color ?? '#94a3b8') + '20', color: entry.workType?.color ?? '#94a3b8' }}
              >
                {entry.workType?.name}
              </span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${entryStatusStyles[entry.status]}`}>
                {entryStatusLabel[entry.status]}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-500 flex-wrap">
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                Ingreso: {format(entryDate, "d MMM yyyy", { locale: es })}
              </span>
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                Salida est.: {format(exitDate, "d MMM yyyy", { locale: es })}
              </span>
              {daysIn !== null && (
                <span className="flex items-center gap-1 text-amber-600 font-medium">
                  <Clock className="h-3 w-3" />
                  {daysIn} día{daysIn !== 1 ? 's' : ''} en taller
                </span>
              )}
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {channelLabel[entry.channel]}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-3 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0">

          {/* Left: details */}
          <div className="w-[55%] border-r border-slate-100 px-6 py-4 overflow-y-auto space-y-5">

            {/* Process hours + técnico por proceso */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5" /> Procesos y técnicos
              </p>
              <div className="space-y-3">
                {PROCESS_CFG.map(({ label, color, field }) => {
                  const h   = entry[field];
                  if (h === 0) return null;
                  const pct = totalHours > 0 ? (h / totalHours) * 100 : 0;
                  const pk  = PROCESS_PROCESS_KEY[label] ?? 'BODYWORK';
                  return (
                    <div key={field} className="bg-slate-50 rounded-xl p-3 space-y-2">
                      {/* Barra + horas */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold w-20 flex-shrink-0" style={{ color }}>{label}</span>
                        <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                        </div>
                        <span className="text-xs font-bold text-slate-700 w-8 text-right flex-shrink-0">{h}h</span>
                      </div>
                      {/* Técnico del proceso */}
                      <ProcessTechRow
                        entry={entry}
                        processKey={pk}
                        processLabel={label}
                        processColor={color}
                        hours={h}
                      />
                    </div>
                  );
                })}
                <div className="flex justify-between pt-1 border-t border-slate-100 text-xs font-semibold text-slate-700">
                  <span>Total</span>
                  <span>{totalHours}h · {entry.stayDays}d estadía</span>
                </div>

                {/* Botón ajustar horas */}
                {!adjusting && (
                  <button
                    onClick={() => { setAdjBW(String(entry.bodyworkHours)); setAdjPrep(String(entry.prepHours)); setAdjPaint(String(entry.paintHours)); setAdjStay(entry.stayDays); setAdjErr(''); setAdjusting(true); }}
                    className="w-full mt-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-amber-700 border border-amber-200 bg-amber-50 hover:bg-amber-100 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    <Clock className="h-3.5 w-3.5" /> Ajustar horas
                  </button>
                )}

                {/* Panel ajuste de horas */}
                {adjusting && (
                  <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2.5">
                    <p className="text-xs font-bold text-amber-800">Ajustar horas reales</p>
                    {[
                      { label: 'Chapería', val: adjBW,   set: setAdjBW   },
                      { label: 'Prep.',    val: adjPrep,  set: setAdjPrep },
                      { label: 'Pintura',  val: adjPaint, set: setAdjPaint },
                    ].map(({ label, val, set }) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className="text-xs text-slate-600 w-16 flex-shrink-0">{label}</span>
                        <input
                          type="text" inputMode="decimal" value={val}
                          onChange={e => { if (/^[0-9]*[.,]?[0-9]*$/.test(e.target.value)) set(e.target.value); }}
                          className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
                        />
                        <span className="text-xs text-slate-400">h</span>
                      </div>
                    ))}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-600 w-16 flex-shrink-0">Estadía</span>
                      <input
                        type="text" inputMode="numeric" value={adjStay}
                        onChange={e => setAdjStay(parseInt(e.target.value) || 1)}
                        className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                      <span className="text-xs text-slate-400">días</span>
                    </div>
                    {adjErr && <p className="text-xs text-red-600">{adjErr}</p>}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => setAdjusting(false)}
                        className="flex-1 text-xs font-semibold text-slate-500 border border-slate-200 rounded-lg py-1.5 hover:bg-slate-100 transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleAdjustHours}
                        disabled={patchHours.isPending}
                        className="flex-1 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg py-1.5 transition-colors disabled:opacity-50"
                      >
                        {patchHours.isPending ? 'Guardando...' : 'Confirmar'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Severity + work type meta */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Hash className="h-3.5 w-3.5" /> Detalles
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { label: 'Severidad', val: entry.workType?.severity ?? '—' },
                  { label: 'Canal',     val: channelLabel[entry.channel] },
                  { label: 'Estadía',   val: `${entry.stayDays} día${entry.stayDays !== 1 ? 's' : ''}` },
                  { label: 'Total hrs', val: `${totalHours}h` },
                ].map(r => (
                  <div key={r.label} className="bg-slate-50 rounded-lg px-3 py-2">
                    <p className="text-slate-400 text-[10px] font-medium mb-0.5">{r.label}</p>
                    <p className="text-slate-800 font-semibold">{r.val}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            {entry.notes && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                <p className="text-xs font-semibold text-amber-700 mb-1">Notas</p>
                <p className="text-sm text-amber-800 leading-snug">{entry.notes}</p>
              </div>
            )}

            {/* (técnicos ya mostrados inline por proceso arriba) */}
          </div>

          {/* Right: activities */}
          <div className="flex flex-col flex-1 px-5 py-4 min-h-0 bg-slate-50/50">
            <ActivitiesPanel
              cardId={entry.id}
              users={technicians.map(t => t.name)}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── BodyshopCalendar ─────────────────────────────────────────────────────────

function BodyshopCalendar({
  selectedDate,
  onSelectDate,
}: {
  selectedDate: string;
  onSelectDate: (d: string) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openId = searchParams.get('openId');
  const [view,       setView]       = useState<'week' | 'day'>('week');
  const [weekAnchor, setWeekAnchor] = useState(selectedDate);
  const [popupId,    setPopupId]    = useState<string | null>(null);

  const weekDays = getWeekDays(weekAnchor);
  const from     = formatDate(weekDays[0]);
  const to       = formatDate(weekDays[6]);

  const { data: rawEntries = [] } = useBodyshopEntriesKanban(from, to);
  const { data: weekCap }         = useBodyshopWeekCapacity(from, to);
  // Dedupe defensivo: ver comentario en BodyshopAppointmentsPage arriba.
  const entries = (() => {
    const seen = new Set<string>();
    return rawEntries.filter(e => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
  })();
  const popup = popupId ? (entries.find(e => e.id === popupId) ?? null) : null;

  // Soporta deep-link desde el buscador: /appointments?openId=Y abre el popup del ingreso.
  useEffect(() => {
    if (!openId || entries.length === 0) return;
    const found = entries.find(e => e.id === openId);
    if (found && popupId !== openId) {
      setPopupId(openId);
      // Limpia el openId de la URL para que recargar no vuelva a dispararlo.
      const params = new URLSearchParams(searchParams.toString());
      params.delete('openId');
      router.replace(`/appointments${params.toString() ? '?' + params.toString() : ''}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, entries]);

  const todayStr = formatDate(new Date());

  function prevWeek() {
    setWeekAnchor(formatDate(addDays(parseISO(weekAnchor + 'T12:00:00'), -7)));
  }
  function nextWeek() {
    setWeekAnchor(formatDate(addDays(parseISO(weekAnchor + 'T12:00:00'), 7)));
  }
  function goToday() {
    setWeekAnchor(todayStr);
    onSelectDate(todayStr);
  }

  // Day view: entries active on selected day
  const dayEntries = entriesOnDay(entries, parseISO(selectedDate + 'T12:00:00'));

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

      {/* ── Panel header ──────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100">
        <CalendarDays className="h-4 w-4 text-orange-500 flex-shrink-0" />
        <span className="text-sm font-semibold text-slate-800 flex-1">
          Calendario
          {view === 'week' && (
            <span className="ml-2 text-xs font-normal text-slate-400 capitalize">
              {format(weekDays[0], "d 'de' MMM", { locale: es })} –{' '}
              {format(weekDays[6], "d 'de' MMM yyyy", { locale: es })}
            </span>
          )}
        </span>

        {/* Week nav */}
        {view === 'week' && (
          <div className="flex items-center gap-1">
            <button onClick={prevWeek}
              className="p-1 rounded hover:bg-slate-100 text-slate-400">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={goToday}
              className="text-xs px-2 py-0.5 rounded-md hover:bg-slate-100 text-slate-500 font-medium">
              Hoy
            </button>
            <button onClick={nextWeek}
              className="p-1 rounded hover:bg-slate-100 text-slate-400">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* View toggle */}
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
          {(['week', 'day'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`text-xs px-3 py-1 rounded-md font-medium transition-all ${
                view === v
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {v === 'week' ? 'Semana' : 'Día'}
            </button>
          ))}
        </div>
      </div>

      {/* ── WEEK VIEW ────────────────────────────────────── */}
      {view === 'week' && (
        <div className="grid grid-cols-7 divide-x divide-slate-100">
          {weekDays.map(day => {
            const dayStr    = formatDate(day);
            const isToday   = dayStr === todayStr;
            const isSelected = dayStr === selectedDate;
            const dayEs     = entriesOnDay(entries, day);
            const dayCap    = weekCap?.[dayStr];

            return (
              <div key={dayStr} className={`flex flex-col min-h-[140px] ${isSelected ? 'bg-orange-50' : ''}`}>
                {/* Day header */}
                <button
                  onClick={() => { onSelectDate(dayStr); setWeekAnchor(dayStr); }}
                  className="flex flex-col items-center py-2 border-b border-slate-100 hover:bg-slate-50 transition-colors w-full"
                >
                  <span className="text-[10px] uppercase tracking-wider font-medium text-slate-400">
                    {format(day, 'EEE', { locale: es })}
                  </span>
                  <span className={`mt-1 text-sm font-bold flex items-center justify-center h-7 w-7 rounded-full transition-colors ${
                    isToday
                      ? 'bg-orange-500 text-white'
                      : isSelected
                      ? 'bg-orange-100 text-orange-700'
                      : 'text-slate-800'
                  }`}>
                    {format(day, 'd')}
                  </span>
                </button>

                {/* Entry chips — sin límite */}
                <div className="flex-1 p-1.5 space-y-1 overflow-y-auto">
                  {dayEs.length === 0 && (
                    <p className="text-[10px] text-slate-200 text-center mt-2">—</p>
                  )}
                  {dayEs.map(e => (
                    <button
                      key={e.id}
                      onClick={() => setPopupId(e.id)}
                      title={`${e.customerName} — ${e.plate}`}
                      className="w-full text-left text-[10px] font-semibold px-1.5 py-0.5 rounded truncate transition-all hover:scale-[1.02] hover:shadow-sm"
                      style={{ background: (e.workType?.color ?? '#94a3b8') + '22', color: e.workType?.color ?? '#94a3b8' }}
                    >
                      {e.plate}
                      {e.processTechs && Object.values(e.processTechs).map((pt, i) =>
                        pt?.technician ? (
                          <span key={i} className="font-normal opacity-70 ml-1">
                            · {pt.technician.name.split(' ')[0]}
                          </span>
                        ) : null
                      )}
                    </button>
                  ))}
                </div>

                {/* Bottom: count + capacity */}
                <div className="px-1.5 pb-1.5 pt-1 border-t border-slate-100 space-y-1">
                  <div className="flex items-center justify-between">
                    {dayEs.length > 0 ? (
                      <span className="text-[9px] font-bold text-slate-400">{dayEs.length} veh.</span>
                    ) : (
                      <span />
                    )}
                    {dayCap && (
                      <span className={`text-[9px] font-bold ${
                        dayCap.globalStatus === 'OK'         ? 'text-emerald-600' :
                        dayCap.globalStatus === 'RISK'       ? 'text-amber-600'   :
                        'text-red-600'
                      }`}>
                        {Math.round(dayCap.globalOccupancyRate * 100)}%
                      </span>
                    )}
                  </div>
                  {dayCap && (
                    <>
                      {/* Global bar */}
                      <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${statusBarClass[dayCap.globalStatus]}`}
                          style={{ width: `${Math.min(dayCap.globalOccupancyRate * 100, 100)}%` }}
                        />
                      </div>
                      {/* Process micro bars */}
                      <div className="flex gap-0.5">
                        {([
                          { key: 'BODYWORK', bg: 'bg-blue-400'   },
                          { key: 'PREP',     bg: 'bg-violet-400' },
                          { key: 'PAINT',    bg: 'bg-orange-400' },
                        ] as const).map(({ key, bg }) => {
                          const proc = dayCap.byProcess[key];
                          return (
                            <div key={key} className="flex-1 h-0.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${bg}`}
                                style={{ width: `${Math.min(proc.occupancyRate * 100, 100)}%` }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── DAY VIEW ─────────────────────────────────────── */}
      {view === 'day' && (
        <div className="px-5 py-4">
          {/* Day nav */}
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => onSelectDate(formatDate(subDays(parseISO(selectedDate + 'T12:00:00'), 1)))}
              className="p-1 rounded hover:bg-slate-100 text-slate-400"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold text-slate-700 capitalize flex-1 text-center">
              {format(parseISO(selectedDate + 'T12:00:00'), "EEEE, d 'de' MMMM", { locale: es })}
            </span>
            <button
              onClick={() => onSelectDate(formatDate(addDays(parseISO(selectedDate + 'T12:00:00'), 1)))}
              className="p-1 rounded hover:bg-slate-100 text-slate-400"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Capacity strip for selected day */}
          {weekCap?.[selectedDate] && (
            <div className="mb-4 grid grid-cols-3 gap-2">
              {([
                { key: 'BODYWORK', label: 'Chapería',    badge: 'bg-blue-100 text-blue-700',    bar: 'bg-blue-400'   },
                { key: 'PREP',     label: 'Preparación', badge: 'bg-violet-100 text-violet-700', bar: 'bg-violet-400' },
                { key: 'PAINT',    label: 'Pintura',     badge: 'bg-orange-100 text-orange-700', bar: 'bg-orange-400' },
              ] as const).map(({ key, label, badge, bar }) => {
                const proc = weekCap[selectedDate].byProcess[key];
                return (
                  <div key={key} className="bg-slate-50 rounded-lg border border-slate-100 px-2.5 py-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badge}`}>{label}</span>
                      <span className="text-[10px] font-bold text-slate-600">
                        {Math.round(proc.occupancyRate * 100)}%
                      </span>
                    </div>
                    <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${bar}`}
                        style={{ width: `${Math.min(proc.occupancyRate * 100, 100)}%` }} />
                    </div>
                    <p className="text-[9px] text-slate-400 mt-1">
                      {proc.availableHours.toFixed(1)}h libres / {proc.commercializableHours.toFixed(1)}h tot.
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {dayEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-300">
              <Car className="h-8 w-8 mb-2" />
              <p className="text-xs italic">Sin vehículos en taller este día</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dayEntries.map(e => {
                const totalHours = sumBodyshopHours(e);
                const startDate  = parseISO(e.date + 'T12:00:00');
                const endDate    = addDays(startDate, e.stayDays - 1);
                const processes  = [
                  { label: 'Chapería', hours: e.bodyworkHours, color: '#3b82f6', pk: 'BODYWORK' as const },
                  { label: 'Prep.',    hours: e.prepHours,     color: '#8b5cf6', pk: 'PREP'     as const },
                  { label: 'Pintura',  hours: e.paintHours,    color: '#f97316', pk: 'PAINT'    as const },
                ];

                return (
                  <div key={e.id}
                    className="border border-slate-200 rounded-xl overflow-hidden cursor-pointer hover:border-slate-300 hover:shadow-sm transition-all"
                    onClick={() => setPopupId(e.id)}
                  >
                    {/* Top color bar */}
                    <div className="h-1 w-full" style={{ background: e.workType?.color ?? '#94a3b8' }} />

                    <div className="px-4 py-3">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <p className="text-sm font-bold text-slate-900">{e.customerName}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-xs font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              {e.plate}
                            </span>
                            <span className="text-xs font-semibold" style={{ color: e.workType?.color ?? '#94a3b8' }}>
                              {e.workType?.name}
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${entryStatusStyles[e.status]}`}>
                            {entryStatusLabel[e.status]}
                          </span>
                          <p className="text-[10px] text-slate-400 mt-1">
                            {format(startDate, "d MMM", { locale: es })} –{' '}
                            {format(endDate, "d MMM", { locale: es })}
                          </p>
                        </div>
                      </div>

                      {/* Process bars + técnico por proceso */}
                      <div className="space-y-2" onClick={ev => ev.stopPropagation()}>
                        {processes.map(p => {
                          if (p.hours === 0) return null;
                          const pct  = totalHours > 0 ? (p.hours / totalHours) * 100 : 0;
                          const tech = e.processTechs?.[p.pk]?.technician;
                          return (
                            <div key={p.label}>
                              {/* Barra */}
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] font-semibold w-14 flex-shrink-0" style={{ color: p.color }}>
                                  {p.label}
                                </span>
                                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: p.color }} />
                                </div>
                                <span className="text-[10px] font-bold text-slate-600 w-7 text-right flex-shrink-0">
                                  {p.hours}h
                                </span>
                              </div>
                              {/* Técnico */}
                              <div className="relative ml-14">
                                <ProcessTechRow
                                  entry={e}
                                  processKey={p.pk}
                                  processLabel={p.label}
                                  processColor={p.color}
                                  hours={p.hours}
                                  compact
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100 text-xs text-slate-500">
                        <span>{channelLabel[e.channel]}</span>
                        <span className="font-semibold text-slate-700">
                          {e.stayDays}d estadía · {totalHours}h total
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Entry popup */}
      {popup && (
        <EntryPopup entry={popup} onClose={() => setPopupId(null)} />
      )}
    </div>
  );
}
