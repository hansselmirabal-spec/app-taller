'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  useTrackingBoard, useStartProcess, useCompleteProcess,
  usePauseProcess, useUnblockProcess, useSetExitDate,
  useSetResource, useClearResource,
} from '@/hooks/use-tracking';
import { useWorkshopId } from '@/context/workshop-context';
import { useWorkshops } from '@/hooks/use-workshops';
import { useQueryClient } from '@tanstack/react-query';
import { createBodyshopEntry, releaseTechNoStart } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { TrackingCard, TrackingColumn, TrackingProcessSummary } from '@/lib/api';
import { InfoButton } from '@/components/ui/info-button';
import { useRequirePermission } from '@/hooks/use-require-permission';
import {
  AlertTriangle, RefreshCw, Car, Clock, TrendingDown,
  TrendingUp, Minus, Play, CheckCircle2, ChevronLeft, ChevronRight,
  PauseCircle, X, PlayCircle, CheckCheck, Loader2, Circle,
  CalendarDays, Pencil, Check, Package, PackageX, Plus, UserX,
} from 'lucide-react';

// ── Helpers ────────────────────────────────────────────────────────────────────

const SEMAPHORE = {
  green:  { border: 'border-l-emerald-500', bg: 'bg-emerald-50',  badge: 'bg-emerald-100 text-emerald-700' },
  normal: { border: 'border-l-slate-300',   bg: 'bg-white',       badge: 'bg-slate-100 text-slate-600'    },
  red:    { border: 'border-l-red-500',     bg: 'bg-red-50',      badge: 'bg-red-100 text-red-700'        },
  orange: { border: 'border-l-orange-500',  bg: 'bg-orange-50',   badge: 'bg-orange-100 text-orange-700'  },
} as const;

const PAUSE_REASONS = [
  'Falta de repuesto',
  'Esperando aprobación cliente',
  'Esperando autorización seguro',
  'Problema técnico imprevisto',
  'Técnico no disponible',
  'Otro',
];

function fmtTime(d: Date) {
  return d.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
}

function fmtDateTime(d: Date) {
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return fmtTime(d);
  return d.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit' }) + ' ' + fmtTime(d);
}

// Formatea YYYY-MM-DD → "Mar 13/05"
const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
function fmtDateLabel(dateStr: string): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dayName = DAYS_SHORT[date.getDay()];
  return `${dayName} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

function diffBusinessDays(fromStr: string, toStr: string): number {
  const [fy, fm, fd] = fromStr.split('-').map(Number);
  const [ty, tm, td] = toStr.split('-').map(Number);
  const from = new Date(fy, fm - 1, fd);
  const to   = new Date(ty, tm - 1, td);
  let count = 0;
  const dir = to >= from ? 1 : -1;
  const cur = new Date(from);
  while (cur.toDateString() !== to.toDateString()) {
    cur.setDate(cur.getDate() + dir);
    if (cur.getDay() !== 0) count += dir;
  }
  return count;
}

interface TimelineEntry extends TrackingProcessSummary {
  estStart: Date;
  estEnd: Date;
  elapsedHours: number | null;
}

function buildTimeline(allProcesses: TrackingProcessSummary[]): TimelineEntry[] {
  const procs = allProcesses
    .filter(p => p.processCode !== 'AGENDA')
    .sort((a, b) => a.orderIndex - b.orderIndex);

  // Cursor inicial: si algún proceso ya arrancó úsalo, si no usa ahora
  const firstStarted = procs.find(p => p.startedAt);
  let cursor = firstStarted?.startedAt ? new Date(firstStarted.startedAt) : new Date();

  return procs.map(p => {
    const estStart = p.startedAt ? new Date(p.startedAt) : new Date(cursor);
    const estEnd   = p.completedAt
      ? new Date(p.completedAt)
      : new Date(estStart.getTime() + p.plannedHours * 3_600_000);

    cursor = new Date(estEnd);

    const elapsedHours = (p.status === 'in_progress' && p.startedAt)
      ? (Date.now() - new Date(p.startedAt).getTime()) / 3_600_000
      : null;

    return { ...p, estStart, estEnd, elapsedHours };
  });
}

// ── Horario laboral ────────────────────────────────────────────────────────────

const HOURS_PER_DAY  = 8;
const DAY_START_HOUR = 8; // 8 am

/**
 * Calcula la fecha/hora de fin dado un inicio y una cantidad de horas,
 * respetando días laborables (lun-sáb) y 8h por día.
 *
 * Regla: día 1 hace min(horas, 8h) desde startDateTime.
 *        Los días siguientes empiezan a las 8am y hacen min(restante, 8h).
 * Ejemplo: 10h desde lunes 9am → lunes 9am→5pm (8h) + martes 8am→10am (2h) = martes 10am ✓
 */
function calcFinishDateTime(startDateTime: Date, totalHours: number): Date {
  if (totalHours <= 0) return new Date(startDateTime);
  let remaining = totalHours;
  let current   = new Date(startDateTime);

  // Día 1: desde la hora real de inicio
  const day1 = Math.min(remaining, HOURS_PER_DAY);
  remaining -= day1;
  current    = new Date(current.getTime() + day1 * 3_600_000);

  // Días siguientes: arrancan a las DAY_START_HOUR
  while (remaining > 0) {
    current.setDate(current.getDate() + 1);
    while (current.getDay() === 0) current.setDate(current.getDate() + 1); // omite domingo
    current.setHours(DAY_START_HOUR, 0, 0, 0);
    const dayWork  = Math.min(remaining, HOURS_PER_DAY);
    remaining     -= dayWork;
    current        = new Date(current.getTime() + dayWork * 3_600_000);
  }
  return current;
}

function workingDaysNeeded(hours: number): number {
  return Math.max(1, Math.ceil(hours / HOURS_PER_DAY));
}

/** Bloque de horario laboral para cards de chapería */
function BodyshopScheduleBlock({ card }: { card: TrackingCard }) {
  if (card.plannedTotalHours <= 0) return null;

  // Hora de inicio real del trabajo (primer proceso no-AGENDA con startedAt)
  const workStartStr = card.allProcesses
    .filter(p => p.processCode !== 'AGENDA')
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .find(p => p.startedAt)?.startedAt ?? null;
  const workStart = workStartStr ? new Date(workStartStr) : null;

  // Fin planificado desde el inicio real
  const planFinish = workStart ? calcFinishDateTime(workStart, card.plannedTotalHours) : null;

  // Horas ejecutadas = completadas (medidas) + en curso (transcurridas)
  const executedHours = card.allProcesses
    .filter(p => p.processCode !== 'AGENDA')
    .reduce((sum, p) => {
      if (p.status === 'completed' && p.realHours !== null) return sum + p.realHours;
      if (p.status === 'in_progress' && p.startedAt)
        return sum + (Date.now() - new Date(p.startedAt).getTime()) / 3_600_000;
      return sum;
    }, 0);

  const realHours      = card.realTotalHours;               // solo procesos terminados
  const remainingHours = Math.max(0, card.plannedTotalHours - executedHours);
  const workDays       = workingDaysNeeded(card.plannedTotalHours);
  const allDone        = card.allProcesses
    .filter(p => p.processCode !== 'AGENDA')
    .every(p => p.status === 'completed' || p.status === 'skipped');

  // Fin estimado actualizado desde ahora con las horas que faltan
  const nowFinish = !allDone && remainingHours > 0
    ? calcFinishDateTime(new Date(), remainingHours)
    : null;

  const isLate = nowFinish && planFinish && nowFinish > planFinish;

  return (
    <div className="rounded-lg bg-slate-50/80 border border-slate-100 px-2.5 py-2 space-y-1.5 text-[10px]">

      {/* Inicio → Fin planificado */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-slate-400 font-medium shrink-0">Horario plan</span>
        <span className="text-slate-600 text-right">
          {workStart
            ? <>{fmtDateTime(workStart)} <span className="text-slate-300 mx-0.5">→</span> {planFinish ? fmtDateTime(planFinish) : '—'}</>
            : <span className="italic text-slate-400">inicio pendiente</span>
          }
        </span>
      </div>

      {/* Duración y días laborables */}
      <div className="flex items-center justify-between">
        <span className="text-slate-400">Duración plan</span>
        <span className="font-semibold text-slate-700">
          {card.plannedTotalHours}h · {workDays} día{workDays !== 1 ? 's' : ''} lab.
        </span>
      </div>

      {/* Horas reales / ejecutadas / faltan */}
      <div className="flex items-center gap-2 flex-wrap pt-0.5 border-t border-slate-100">
        <span className="text-slate-500">
          Real <span className="font-bold text-slate-700">{realHours.toFixed(1)}h</span>
        </span>
        <span className="text-slate-300">·</span>
        <span className="text-slate-500">
          Ejec <span className="font-bold text-slate-700">{Math.min(executedHours, card.plannedTotalHours + 20).toFixed(1)}h</span>
        </span>
        {!allDone && remainingHours > 0 && (
          <>
            <span className="text-slate-300">·</span>
            <span className="text-slate-500">
              Faltan <span className={`font-bold ${isLate ? 'text-red-600' : 'text-slate-700'}`}>
                {remainingHours.toFixed(1)}h
              </span>
            </span>
          </>
        )}
      </div>

      {/* Fin estimado recalculado desde ahora */}
      {nowFinish && (
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Fin est. actualizado</span>
          <span className={`font-semibold ${isLate ? 'text-red-600' : 'text-emerald-600'}`}>
            {fmtDateTime(nowFinish)}
          </span>
        </div>
      )}

      {allDone && (
        <div className="flex items-center gap-1 text-emerald-600 font-medium pt-0.5 border-t border-slate-100">
          <CheckCheck className="h-3 w-3" />
          <span>Trabajo completado · Real {realHours.toFixed(1)}h</span>
        </div>
      )}
    </div>
  );
}

/** Bloque de estado y horario para cards de mecánica */
function MechanicScheduleBlock({ card }: { card: TrackingCard }) {
  const agendaProc = card.allProcesses.find(p => p.processCode === 'AGENDA');
  const mechProc   = card.allProcesses.find(p => p.processCode === 'MECHANIC');

  if (!mechProc) return null;

  const agendaStart   = agendaProc?.startedAt ? new Date(agendaProc.startedAt) : null;
  const agendaElapsed = agendaStart ? (Date.now() - agendaStart.getTime()) / 3_600_000 : null;
  const agendaDone    = agendaProc?.status === 'completed';
  const agendaOverdue = !agendaDone && agendaElapsed !== null && agendaElapsed > 0.5;

  const mechStart   = mechProc.startedAt ? new Date(mechProc.startedAt) : null;
  const mechDone    = mechProc.status === 'completed';
  const mechBlocked = mechProc.status === 'blocked';
  const mechPending = mechProc.status === 'pending' && !mechBlocked;

  const planFinish = mechStart ? calcFinishDateTime(mechStart, mechProc.plannedHours) : null;
  const elapsedHours = mechStart && mechProc.status === 'in_progress'
    ? (Date.now() - mechStart.getTime()) / 3_600_000
    : null;
  const realHours      = mechProc.realHours;
  const remainingHours = elapsedHours !== null
    ? Math.max(0, mechProc.plannedHours - elapsedHours)
    : mechPending ? mechProc.plannedHours : 0;
  const nowFinish = !mechDone && mechStart && elapsedHours !== null && remainingHours > 0
    ? calcFinishDateTime(new Date(), remainingHours)
    : null;
  const isLate = nowFinish && planFinish && nowFinish > planFinish;

  return (
    <div className="rounded-lg bg-slate-50/80 border border-slate-100 px-2.5 py-2 space-y-1.5 text-[10px]">

      {/* Recepción (AGENDA) */}
      {agendaProc && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {agendaDone
              ? <CheckCheck className="h-3 w-3 text-emerald-500 flex-shrink-0" />
              : <Loader2 className="h-3 w-3 text-blue-500 animate-spin flex-shrink-0" />}
            <span className={`font-medium ${agendaDone ? 'text-emerald-600' : agendaOverdue ? 'text-orange-600' : 'text-blue-600'}`}>
              Recepción
            </span>
          </div>
          <span className={agendaDone ? 'text-emerald-600' : agendaOverdue ? 'text-orange-600 font-semibold' : 'text-slate-500'}>
            {agendaDone
              ? 'Lista'
              : agendaElapsed !== null
              ? `${Math.round(agendaElapsed * 60)} min / 30 min`
              : 'En espera'}
          </span>
        </div>
      )}

      {/* Trabajo mecánico — pendiente */}
      {mechPending && (
        <div className="flex items-center justify-between gap-2 pt-0.5 border-t border-slate-100">
          <span className="text-slate-400">Trabajo mecánico</span>
          <span className="text-slate-400 italic">
            {agendaDone ? 'Pendiente de inicio' : 'Esperando recepción'} · {mechProc.plannedHours}h plan
          </span>
        </div>
      )}

      {/* Trabajo mecánico — en progreso */}
      {mechStart && !mechDone && !mechBlocked && (
        <>
          <div className="flex items-center justify-between gap-2 pt-0.5 border-t border-slate-100">
            <span className="text-slate-400 font-medium shrink-0">Horario plan</span>
            <span className="text-slate-600 text-right">
              {fmtDateTime(mechStart)}
              <span className="text-slate-300 mx-0.5">→</span>
              {planFinish ? fmtDateTime(planFinish) : '—'}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-500">Plan <span className="font-bold text-slate-700">{mechProc.plannedHours}h</span></span>
            {elapsedHours !== null && (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-slate-500">
                  Ejec <span className={`font-bold ${elapsedHours > mechProc.plannedHours ? 'text-red-600' : 'text-slate-700'}`}>
                    {elapsedHours.toFixed(1)}h
                  </span>
                </span>
                {remainingHours > 0 && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-500">
                      Faltan <span className={`font-bold ${isLate ? 'text-red-600' : 'text-slate-700'}`}>
                        {remainingHours.toFixed(1)}h
                      </span>
                    </span>
                  </>
                )}
              </>
            )}
          </div>
          {nowFinish && (
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Fin est. actualizado</span>
              <span className={`font-semibold ${isLate ? 'text-red-600' : 'text-emerald-600'}`}>
                {fmtDateTime(nowFinish)}
              </span>
            </div>
          )}
        </>
      )}

      {/* Trabajo mecánico — pausado */}
      {mechBlocked && (
        <div className="space-y-1 pt-0.5 border-t border-slate-100">
          <div className="flex items-center gap-1">
            <PauseCircle className="h-3 w-3 text-orange-500 flex-shrink-0" />
            <span className="text-orange-600 font-medium">En pausa</span>
            {mechStart && (
              <span className="text-slate-400 ml-auto">desde {fmtDateTime(mechStart)}</span>
            )}
          </div>
          {card.currentProcess?.blockedReason && (
            <p className="text-orange-700 bg-orange-50 rounded px-2 py-1">
              {card.currentProcess.blockedReason}
            </p>
          )}
        </div>
      )}

      {/* Trabajo mecánico — completado */}
      {mechDone && (
        <div className="flex items-center gap-1 text-emerald-600 font-medium pt-0.5 border-t border-slate-100">
          <CheckCheck className="h-3 w-3" />
          <span>Trabajo completado · Real {realHours !== null ? `${realHours.toFixed(1)}h` : '—'}</span>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function DeviationBadge({ hours }: { hours: number }) {
  if (Math.abs(hours) < 0.1) return null;
  const positive = hours > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
      positive ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
    }`}>
      {positive ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      {positive ? '+' : ''}{hours.toFixed(1)}h
    </span>
  );
}

function ProcessStatusIcon({ status }: { status: string }) {
  if (status === 'completed')   return <CheckCheck className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />;
  if (status === 'in_progress') return <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin flex-shrink-0" />;
  if (status === 'blocked')     return <PauseCircle className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />;
  return <Circle className="h-3.5 w-3.5 text-slate-300 flex-shrink-0" />;
}

// ── Modal nueva entrada desde Kanban (F4.2) ────────────────────────────────────

const ENTRY_PROCESS_CATALOG = [
  { code: 'BODYWORK',      name: 'Chapería',      color: 'bg-blue-100 text-blue-700'    },
  { code: 'PREP',          name: 'Preparación',   color: 'bg-violet-100 text-violet-700' },
  { code: 'PAINT',         name: 'Pintura',       color: 'bg-orange-100 text-orange-700' },
  { code: 'POLISH',        name: 'Pulido',        color: 'bg-yellow-100 text-yellow-700' },
  { code: 'MECHANIC',      name: 'Mecánica',      color: 'bg-emerald-100 text-emerald-700' },
  { code: 'FINAL_CONTROL', name: 'Control Final', color: 'bg-slate-100 text-slate-700'  },
] as const;

const LEGACY_PROCESS_CODES = new Set(['BODYWORK', 'PREP', 'PAINT']);

function NewEntryModal({
  date, workshopId, onClose, onCreated,
}: {
  date: string;
  workshopId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [plate, setPlate]               = useState('');
  const [customerName, setCustomerName] = useState('');
  const [timeStart, setTimeStart]       = useState('08:00');
  const [processHours, setProcessHours] = useState<Record<string, number>>({});
  const [notes, setNotes]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');

  const totalHours = Object.values(processHours).reduce((s, h) => s + h, 0);

  function toggleProcess(code: string) {
    setProcessHours(prev => {
      if (prev[code] !== undefined) {
        const next = { ...prev };
        delete next[code];
        return next;
      }
      return { ...prev, [code]: 4 };
    });
  }

  function setHours(code: string, val: string) {
    const h = parseFloat(val);
    if (!isNaN(h) && h >= 0) setProcessHours(prev => ({ ...prev, [code]: h }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!plate.trim())        { setError('La patente es obligatoria'); return; }
    if (!customerName.trim()) { setError('El nombre del cliente es obligatorio'); return; }
    if (totalHours === 0)     { setError('Seleccioná al menos un proceso con horas'); return; }
    setError('');
    setLoading(true);
    try {
      const bodyworkHours = processHours['BODYWORK'] ?? 0;
      const prepHours     = processHours['PREP']     ?? 0;
      const paintHours    = processHours['PAINT']    ?? 0;
      const extraProcesses = ENTRY_PROCESS_CATALOG
        .filter(p => !LEGACY_PROCESS_CODES.has(p.code) && (processHours[p.code] ?? 0) > 0)
        .map(p => ({ code: p.code, name: p.name, hours: processHours[p.code]! }));

      await createBodyshopEntry(workshopId, {
        workshopId,
        date,
        workTypeId: null,
        customerName: customerName.trim(),
        plate: plate.toUpperCase().trim(),
        status: 'in_progress',
        bodyworkHours,
        prepHours,
        paintHours,
        extraProcesses: extraProcesses.length > 0 ? extraProcesses : undefined,
        stayDays: 1,
        channel: 'direct',
        timeStart: timeStart || null,
        notes: notes.trim() || undefined,
      } as any);
      onCreated();
    } catch (err: any) {
      setError(err.message ?? 'Error al crear la entrada');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Car className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-semibold text-slate-900">Ingreso rápido al taller</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Patente + Hora */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Patente *</label>
              <input
                type="text"
                value={plate}
                onChange={e => setPlate(e.target.value.toUpperCase())}
                placeholder="ABC 123"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium uppercase outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Hora ingreso</label>
              <input
                type="time"
                value={timeStart}
                onChange={e => setTimeStart(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          {/* Cliente */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Cliente *</label>
            <input
              type="text"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="Nombre del cliente"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* Procesos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-600">Procesos *</label>
              {totalHours > 0 && (
                <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  {totalHours.toFixed(1)}h total
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              {ENTRY_PROCESS_CATALOG.map(proc => {
                const active = processHours[proc.code] !== undefined;
                return (
                  <div key={proc.code} className={`flex items-center gap-3 rounded-lg px-3 py-2 border transition-colors ${active ? 'border-blue-200 bg-blue-50/40' : 'border-slate-100 bg-slate-50/40'}`}>
                    <button
                      type="button"
                      onClick={() => toggleProcess(proc.code)}
                      className={`w-4 h-4 rounded border-2 flex-shrink-0 transition-colors ${active ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}
                    >
                      {active && <svg className="w-full h-full text-white" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </button>
                    <span className={`flex-1 text-sm font-medium ${active ? 'text-slate-800' : 'text-slate-400'}`}>
                      {proc.name}
                    </span>
                    {active && (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0.5}
                          step={0.5}
                          value={processHours[proc.code]}
                          onChange={e => setHours(proc.code, e.target.value)}
                          onClick={e => e.stopPropagation()}
                          className="w-16 text-center text-sm rounded-lg border border-slate-200 px-2 py-1 outline-none focus:ring-2 focus:ring-blue-300"
                        />
                        <span className="text-xs text-slate-400">h</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notas</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Observaciones..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Acciones */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || totalHours === 0}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Creando...</> : 'Ingresar auto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modal de pausa ─────────────────────────────────────────────────────────────

function PauseModal({
  processName, onConfirm, onClose, isLoading,
}: {
  processName: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
  isLoading: boolean;
}) {
  const [selected, setSelected] = useState('');
  const [custom, setCustom]     = useState('');
  const effectiveReason = selected === 'Otro' ? custom.trim() : selected;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Pausar proceso</h2>
            <p className="text-xs text-slate-500 mt-0.5">{processName}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-600">Motivo de la pausa</p>
          <div className="space-y-1.5">
            {PAUSE_REASONS.map(r => (
              <label key={r} className="flex items-center gap-2.5 cursor-pointer">
                <input type="radio" name="pause-reason" value={r}
                  checked={selected === r} onChange={() => setSelected(r)}
                  className="accent-orange-500" />
                <span className={`text-xs ${selected === r ? 'text-slate-900 font-medium' : 'text-slate-600'}`}>{r}</span>
              </label>
            ))}
          </div>
          {selected === 'Otro' && (
            <input type="text" placeholder="Descripción del motivo..."
              value={custom} onChange={e => setCustom(e.target.value)} autoFocus
              className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-orange-400 mt-1" />
          )}
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 text-xs font-medium py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button type="button" disabled={!effectiveReason || isLoading} onClick={() => onConfirm(effectiveReason)}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 transition-colors">
            <PauseCircle className="h-3.5 w-3.5" />
            {isLoading ? 'Pausando...' : 'Pausar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sección de fecha de salida ─────────────────────────────────────────────────

function ExitDateSection({
  card,
  onSave,
  isSaving,
}: {
  card: TrackingCard;
  onSave: (date: string | null) => void;
  isSaving: boolean;
}) {
  const [editing, setEditing]   = useState(false);
  const [value, setValue]       = useState(card.exitDate ?? card.suggestedExitDate ?? '');
  const [todayVal, setTodayVal] = useState('');
  useEffect(() => { setTodayVal(formatDate(new Date())); }, []);

  const promised   = card.exitDate;
  const suggested  = card.suggestedExitDate;
  const today      = todayVal || formatDate(new Date());

  // Días restantes desde hoy hasta la fecha prometida / sugerida
  const targetDate = promised ?? suggested;
  const daysLeft   = targetDate ? diffBusinessDays(today, targetDate) : null;

  function handleSave() {
    onSave(value || null);
    setEditing(false);
  }
  function handleClear() {
    onSave(null);
    setValue(suggested ?? '');
    setEditing(false);
  }

  const daysColor = daysLeft === null ? '' : daysLeft < 0 ? 'text-red-600' : daysLeft === 0 ? 'text-orange-600' : 'text-emerald-600';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-slate-400" />
          <span className="text-xs font-semibold text-slate-700">Fecha de entrega</span>
        </div>
        {!editing && (
          <button type="button" onClick={() => { setValue(promised ?? suggested ?? ''); setEditing(true); }}
            className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-600 transition-colors">
            <Pencil className="h-3 w-3" />
            {promised ? 'Editar' : 'Establecer'}
          </button>
        )}
      </div>

      {/* Sugerida (calculada) */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">Sugerida <span className="text-[10px] text-slate-400">(colchón + horas)</span></span>
        <span className="font-medium text-slate-700">{suggested ? fmtDateLabel(suggested) : '—'}</span>
      </div>

      {/* Prometida (manual) */}
      {!editing ? (
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Prometida al cliente</span>
          {promised ? (
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold ${
                promised === suggested ? 'text-slate-700' : 'text-indigo-700'
              }`}>{fmtDateLabel(promised)}</span>
              {daysLeft !== null && (
                <span className={`text-[11px] font-semibold ${daysColor}`}>
                  {daysLeft === 0 ? 'Hoy' : daysLeft > 0 ? `en ${daysLeft}d` : `${Math.abs(daysLeft)}d atraso`}
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 italic">No establecida</span>
              {suggested && daysLeft !== null && (
                <span className={`text-[11px] font-semibold ${daysColor}`}>
                  {daysLeft === 0 ? 'Hoy' : daysLeft > 0 ? `en ${daysLeft}d` : `${Math.abs(daysLeft)}d atraso`}
                </span>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={value}
              min={today}
              onChange={e => setValue(e.target.value)}
              className="flex-1 text-sm font-medium rounded-lg border border-slate-200 px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-400"
              autoFocus
            />
            <button type="button" disabled={!value || isSaving} onClick={handleSave}
              className="p-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              <Check className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => setEditing(false)}
              className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {promised && (
            <button type="button" onClick={handleClear}
              className="text-[11px] text-red-500 hover:text-red-700 transition-colors">
              Quitar fecha prometida (usar sugerida)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Modal de detalle ───────────────────────────────────────────────────────────

function CardDetailModal({
  card, onClose, onStart, onComplete, onPause, onUnblock,
  loadingLogId, pausingLogId, unblockingLogId,
  onSaveExitDate, isSavingExitDate,
  onSetResource, onClearResource, isResourcePending,
}: {
  card: TrackingCard;
  onClose: () => void;
  onStart:    (logId: string) => void;
  onComplete: (logId: string) => void;
  onPause:    (logId: string, processName: string) => void;
  onUnblock:  (logId: string) => void;
  loadingLogId:    string | null;
  pausingLogId:    string | null;
  unblockingLogId: string | null;
  onSaveExitDate: (date: string | null) => void;
  isSavingExitDate: boolean;
  onSetResource:  (note: string) => void;
  onClearResource: () => void;
  isResourcePending: boolean;
}) {
  const [resourceNote, setResourceNote] = useState('');
  const [showResourceForm, setShowResourceForm] = useState(false);

  const cp       = card.currentProcess;
  const isBlocked = cp?.status === 'blocked';
  const isAgenda  = cp?.processCode === 'AGENDA';
  const timeline  = buildTimeline(card.allProcesses);
  const estimatedEnd = timeline.length > 0 ? timeline[timeline.length - 1].estEnd : null;
  const s = card.waitingForResource
    ? { border: 'border-l-yellow-500', bg: 'bg-yellow-50' }
    : isBlocked
    ? { border: 'border-l-slate-400', bg: 'bg-slate-50' }
    : isAgenda
    ? { border: 'border-l-blue-400',  bg: 'bg-blue-50/40' }
    : SEMAPHORE[card.semaphore];

  const isActing = !!loadingLogId || !!pausingLogId || !!unblockingLogId;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col"
           style={{ maxHeight: 'min(90vh, 700px)' }}>

        {/* ── Header ── */}
        <div className={`flex-shrink-0 p-5 border-b border-slate-100 rounded-t-2xl border-l-4 ${s.border} ${s.bg}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xl font-bold text-slate-900 tracking-wider">{card.plate}</span>
                {card.sourceType === 'bodyshop'
                  ? <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">Chapería</span>
                  : <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">Mecánica</span>
                }
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${SEMAPHORE[card.semaphore].badge}`}>
                  {card.semaphore === 'green' ? 'Adelantado' : card.semaphore === 'red' ? 'Atrasado' : card.semaphore === 'orange' ? 'Desviación' : 'Normal'}
                </span>
              </div>
              <p className="text-sm text-slate-600 mt-0.5">{card.customerName}</p>
              {card.vehicleType && <p className="text-xs text-slate-400 mt-0.5">{card.vehicleType}</p>}
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {card.techName && (
                  <span className="text-xs bg-white/80 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-md">
                    {card.techName}
                  </span>
                )}
                {card.serviceOrType && (
                  <span className="text-xs bg-white/80 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-md">
                    {card.serviceOrType}
                  </span>
                )}
              </div>
            </div>
            <button type="button" onClick={onClose}
              className="flex-shrink-0 p-1.5 rounded-lg hover:bg-black/10 transition-colors">
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </div>
        </div>

        {/* ── Timeline ── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Tiempos de trabajo
          </p>

          {timeline.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-4">Sin procesos registrados</p>
          )}

          {timeline.map(p => {
            const isCurrent = cp?.processCode === p.processCode;
            const statusColors = {
              completed:   'border-emerald-200 bg-emerald-50/60',
              in_progress: 'border-blue-200 bg-blue-50/60',
              blocked:     'border-orange-200 bg-orange-50/60',
              pending:     'border-slate-200 bg-slate-50/50',
            }[p.status] ?? 'border-slate-200 bg-slate-50/50';

            const statusLabel = {
              completed:   'Completado',
              in_progress: 'En curso',
              blocked:     'Pausado',
              pending:     'Pendiente',
            }[p.status] ?? p.status;

            const statusBadge = {
              completed:   'bg-emerald-100 text-emerald-700',
              in_progress: 'bg-blue-100 text-blue-700',
              blocked:     'bg-orange-100 text-orange-700',
              pending:     'bg-slate-100 text-slate-500',
            }[p.status] ?? 'bg-slate-100 text-slate-500';

            return (
              <div key={p.logId} className={`rounded-xl border p-3.5 ${statusColors} ${isCurrent ? 'ring-2 ring-blue-300 ring-offset-1' : ''}`}>
                {/* Fila título */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ProcessStatusIcon status={p.status} />
                    <span className="text-sm font-semibold text-slate-800">{p.processName}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {p.deviation !== null && Math.abs(p.deviation) >= 0.1 && (
                      <DeviationBadge hours={p.deviation} />
                    )}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusBadge}`}>
                      {statusLabel}
                    </span>
                  </div>
                </div>

                {/* Grid de tiempos */}
                <div className="space-y-2">
                  {/* Plan */}
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-[10px] font-semibold uppercase text-slate-400 w-8 flex-shrink-0">Plan</span>
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <Clock className="h-3 w-3 text-slate-400" />
                      <span className="font-medium">{p.plannedHours}h</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-500 ml-auto">
                      <span>{fmtDateTime(p.estStart)}</span>
                      <span className="text-slate-300 mx-0.5">→</span>
                      <span>{fmtDateTime(p.estEnd)}</span>
                      {p.status === 'pending' && (
                        <span className="text-[10px] text-slate-400 ml-1">(est.)</span>
                      )}
                    </div>
                  </div>

                  {/* Real (si inició) */}
                  {p.startedAt && (
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-[10px] font-semibold uppercase text-slate-400 w-8 flex-shrink-0">Real</span>
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-slate-400" />
                        <span className={`font-medium ${
                          p.elapsedHours !== null && p.elapsedHours > p.plannedHours
                            ? 'text-red-600'
                            : 'text-slate-600'
                        }`}>
                          {p.realHours !== null
                            ? `${p.realHours}h`
                            : p.elapsedHours !== null
                            ? `${p.elapsedHours.toFixed(1)}h`
                            : '—'}
                          {p.elapsedHours !== null && p.status === 'in_progress' && (
                            <span className="text-[10px] text-blue-500 ml-1">corriendo</span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-slate-500 ml-auto">
                        <span>{new Date(p.startedAt).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="text-slate-300 mx-0.5">→</span>
                        {p.completedAt ? (
                          <span>{new Date(p.completedAt).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}</span>
                        ) : (
                          <span className="text-blue-400 text-[11px]">en progreso...</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Tiempo acumulado en pausa (F4.3) */}
                  {p.pausedDurationMinutes > 0 && (
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-[10px] font-semibold uppercase text-slate-400 w-8 flex-shrink-0">Pausa</span>
                      <div className="flex items-center gap-1.5 text-orange-600">
                        <PauseCircle className="h-3 w-3" />
                        <span className="font-medium">
                          {p.pausedDurationMinutes >= 60
                            ? `${Math.floor(p.pausedDurationMinutes / 60)}h ${Math.round(p.pausedDurationMinutes % 60)}m`
                            : `${Math.round(p.pausedDurationMinutes)}m`}
                        </span>
                        <span className="text-[10px] text-slate-400">acumulado</span>
                      </div>
                    </div>
                  )}

                  {/* Motivo de bloqueo */}
                  {p.status === 'blocked' && card.currentProcess?.blockedReason && (
                    <p className="text-[10px] text-orange-700 bg-orange-100 rounded px-2 py-1 mt-1">
                      Motivo: {card.currentProcess.blockedReason}
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          {/* ── Fecha de entrega ── */}
          <ExitDateSection
            card={card}
            onSave={onSaveExitDate}
            isSaving={isSavingExitDate}
          />

          {/* ── Resumen total ── */}
          {(() => {
            const workStartStr = card.allProcesses
              .filter(p => p.processCode !== 'AGENDA')
              .sort((a, b) => a.orderIndex - b.orderIndex)
              .find(p => p.startedAt)?.startedAt ?? null;
            const workStart = workStartStr ? new Date(workStartStr) : null;
            const laboralFinish = workStart
              ? calcFinishDateTime(workStart, card.plannedTotalHours)
              : null;
            const executedH = card.allProcesses
              .filter(p => p.processCode !== 'AGENDA')
              .reduce((s, p) => {
                if (p.status === 'completed' && p.realHours !== null) return s + p.realHours;
                if (p.status === 'in_progress' && p.startedAt)
                  return s + (Date.now() - new Date(p.startedAt).getTime()) / 3_600_000;
                return s;
              }, 0);
            const remainingH = Math.max(0, card.plannedTotalHours - executedH);
            const nowFinish  = remainingH > 0 ? calcFinishDateTime(new Date(), remainingH) : null;
            const days       = workingDaysNeeded(card.plannedTotalHours);

            return (
              <div className="mt-1 p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-3">
                {/* Fila 1: plan / real / ejecutado */}
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-[10px] uppercase font-medium text-slate-400">Plan total</p>
                    <p className="text-base font-bold text-slate-700 mt-0.5">{card.plannedTotalHours}h</p>
                    <p className="text-[10px] text-slate-400">{days} día{days !== 1 ? 's' : ''} lab.</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-medium text-slate-400">Real</p>
                    <p className="text-base font-bold text-slate-700 mt-0.5">{card.realTotalHours.toFixed(1)}h</p>
                    <p className="text-[10px] text-slate-400">completado</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-medium text-slate-400">Ejecutado</p>
                    <p className="text-base font-bold text-slate-700 mt-0.5">{executedH.toFixed(1)}h</p>
                    <p className="text-[10px] text-slate-400">incl. en curso</p>
                  </div>
                </div>

                {/* Fila 2: inicio → fin planificado */}
                {workStart && laboralFinish && (
                  <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-2.5">
                    <span className="text-slate-500 font-medium">Horario plan</span>
                    <span className="text-slate-700 font-semibold">
                      {fmtDateTime(workStart)}
                      <span className="text-slate-300 mx-1.5">→</span>
                      {fmtDateTime(laboralFinish)}
                    </span>
                  </div>
                )}

                {/* Fila 3: fin estimado actualizado */}
                {nowFinish && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">
                      Fin est. actualizado
                      <span className="ml-1 text-[10px] text-slate-400">({remainingH.toFixed(1)}h restantes)</span>
                    </span>
                    <span className={`font-bold text-sm ${
                      laboralFinish && nowFinish > laboralFinish ? 'text-red-600' : 'text-emerald-600'
                    }`}>{fmtDateTime(nowFinish)}</span>
                  </div>
                )}

                {/* Alertas */}
                {Math.abs(card.deviationTotal) >= 0.1 && (
                  <div className="flex items-center justify-center gap-1.5 border-t border-slate-100 pt-2">
                    <DeviationBadge hours={card.deviationTotal} />
                    <span className="text-[10px] text-slate-400">desviación acumulada</span>
                  </div>
                )}
                {card.overdueHours > 0 && (
                  <div className="flex items-center justify-center gap-1 text-xs text-red-600">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>{card.overdueHours.toFixed(1)}h de atraso en proceso actual</span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* ── Acciones ── */}
        {/* ── Panel recurso (solo chapería) ── */}
        {card.sourceType === 'bodyshop' && card.status !== 'cancelled' && (
          <div className="flex-shrink-0 px-4 py-3 border-t border-slate-100">
            {card.waitingForResource ? (
              <div className="space-y-2">
                <div className="flex items-start gap-2 rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2">
                  <Package className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-yellow-800">Esperando recurso</p>
                    {card.resourceNote && <p className="text-xs text-yellow-700 mt-0.5">{card.resourceNote}</p>}
                    {card.resourceBlockedAt && (
                      <p className="text-[10px] text-yellow-600 mt-0.5">
                        Desde: {new Date(card.resourceBlockedAt).toLocaleString('es-PY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                </div>
                <button type="button" disabled={isResourcePending} onClick={onClearResource}
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                  <PackageX className="h-3.5 w-3.5" />
                  {isResourcePending ? 'Liberando...' : 'Recurso disponible — liberar'}
                </button>
              </div>
            ) : showResourceForm ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={resourceNote}
                  onChange={e => setResourceNote(e.target.value)}
                  placeholder="¿Qué falta? ej: Masilla XY, Repuesto Z..."
                  className="w-full text-xs rounded-lg border border-yellow-300 px-3 py-2 outline-none focus:ring-2 focus:ring-yellow-400 bg-yellow-50"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowResourceForm(false)}
                    className="flex-1 text-xs font-medium py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                    Cancelar
                  </button>
                  <button type="button"
                    disabled={!resourceNote.trim() || isResourcePending}
                    onClick={() => { onSetResource(resourceNote.trim()); setShowResourceForm(false); }}
                    className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold py-1.5 rounded-lg bg-yellow-500 text-white hover:bg-yellow-600 disabled:opacity-50 transition-colors">
                    <Package className="h-3.5 w-3.5" />
                    Bloquear recurso
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setShowResourceForm(true)}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg border border-yellow-300 text-yellow-700 hover:bg-yellow-50 transition-colors">
                <Package className="h-3.5 w-3.5" />
                Marcar espera de recurso
              </button>
            )}
          </div>
        )}

        {cp && (
          <div className="flex-shrink-0 p-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
            <div className="flex gap-2">
              {isBlocked ? (
                <button type="button" disabled={!!unblockingLogId} onClick={() => onUnblock(cp.logId)}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5 rounded-xl bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors">
                  <PlayCircle className="h-3.5 w-3.5" />
                  {unblockingLogId ? 'Reanudando...' : 'Reanudar proceso'}
                </button>
              ) : isAgenda ? (
                <button type="button" disabled={!!loadingLogId} onClick={() => onComplete(cp.logId)}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  <Play className="h-3.5 w-3.5" />
                  {loadingLogId ? 'Iniciando...' : 'Iniciar trabajo'}
                </button>
              ) : (
                <>
                  {cp.status === 'pending' && (
                    <button type="button" disabled={!!loadingLogId} onClick={() => onStart(cp.logId)}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                      <Play className="h-3.5 w-3.5" />
                      {loadingLogId ? 'Iniciando...' : `Iniciar ${cp.processName}`}
                    </button>
                  )}
                  {cp.status === 'in_progress' && (
                    <button type="button" disabled={!!loadingLogId} onClick={() => onComplete(cp.logId)}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {loadingLogId ? 'Completando...' : `Completar ${cp.processName}`}
                    </button>
                  )}
                  {(cp.status === 'in_progress' || cp.status === 'pending') && (
                    <button type="button" disabled={!!pausingLogId} onClick={() => onPause(cp.logId, cp.processName)}
                      className="flex items-center justify-center gap-1 text-xs font-semibold px-3.5 py-2.5 rounded-xl bg-orange-100 text-orange-700 hover:bg-orange-200 disabled:opacity-50 transition-colors"
                      title="Pausar proceso">
                      <PauseCircle className="h-4 w-4" />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Card ───────────────────────────────────────────────────────────────────────

function KanbanCard({
  card, onCardClick, onStart, onComplete, onPause, onUnblock, onReleaseTech,
  isStarting, isCompleting, isPausing, isUnblocking, isReleasingTech, todayStr,
}: {
  card: TrackingCard;
  onCardClick: (cardId: string) => void;
  onStart:    (logId: string, technicianId?: string, technicianName?: string) => void;
  onComplete: (logId: string) => void;
  onPause:    (logId: string, processName: string) => void;
  onUnblock:  (logId: string) => void;
  onReleaseTech: (sourceId: string) => void;
  isStarting:      boolean;
  isCompleting:    boolean;
  isPausing:       boolean;
  isUnblocking:    boolean;
  isReleasingTech: boolean;
  todayStr:        string;
}) {
  const isCancelled       = card.status === 'cancelled';
  const isWaitingResource = !isCancelled && card.waitingForResource;
  const cp = card.currentProcess;
  const isBlocked = cp?.status === 'blocked';
  const isAgenda  = cp?.processCode === 'AGENDA';

  // Días sin avance (en columna AGENDA con entryDate vieja)
  const stuckDays = isAgenda && card.entryDate && todayStr
    ? Math.max(0, Math.floor(
        (new Date(todayStr).getTime() - new Date(card.entryDate + 'T12:00:00').getTime()) / 86_400_000
      ))
    : 0;

  // Entrega vencida: la fecha prometida (o sugerida) ya pasó
  const exitRef = card.exitDate ?? card.suggestedExitDate ?? null;
  const isOverdue = !isCancelled && !!exitRef && !!todayStr && exitRef < todayStr;

  // Alerta de no-inicio: asesor agendó con horario, tolerancia 30min, técnico no arrancó
  const noStartMinutesLate = (() => {
    if (card.sourceType !== 'bodyshop') return 0;
    if (!card.advisorTime || isCancelled) return 0;
    if (card.noStartAt) return 0; // ya fue liberado, no mostrar alerta
    const anyStarted = card.allProcesses.some(
      p => p.processCode !== 'AGENDA' && p.startedAt != null
    );
    if (anyStarted) return 0;
    const [hh, mm] = card.advisorTime.split(':').map(Number);
    if (isNaN(hh)) return 0;
    const scheduledMs = hh * 3_600_000 + mm * 60_000 + 30 * 60_000; // +30min tolerancia
    const nowMs = new Date().getHours() * 3_600_000 + new Date().getMinutes() * 60_000;
    return Math.max(0, Math.floor((nowMs - scheduledMs) / 60_000));
  })();
  const isNoStartAlert = noStartMinutesLate > 0;

  const s = isCancelled
    ? { border: 'border-l-slate-300', bg: 'bg-slate-50/60', badge: 'bg-slate-100 text-slate-400' }
    : isWaitingResource
    ? { border: 'border-l-yellow-500', bg: 'bg-yellow-50', badge: 'bg-yellow-100 text-yellow-800' }
    : isBlocked
    ? { border: 'border-l-slate-400', bg: 'bg-slate-50', badge: 'bg-slate-200 text-slate-600' }
    : isAgenda
    ? { border: 'border-l-blue-400', bg: 'bg-blue-50/40', badge: 'bg-blue-100 text-blue-700' }
    : SEMAPHORE[card.semaphore];

  const isStartable   = !isCancelled && cp?.status === 'pending';
  const isCompletable = !isCancelled && cp?.status === 'in_progress' && !isAgenda;
  const isPausable    = !isCancelled && (cp?.status === 'in_progress' || cp?.status === 'pending') && !isAgenda;

  const elapsedHours = cp?.startedAt && cp.status === 'in_progress'
    ? (Date.now() - new Date(cp.startedAt).getTime()) / 3_600_000
    : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onCardClick(card.id)}
      onKeyDown={e => e.key === 'Enter' && onCardClick(card.id)}
      className={`rounded-xl border border-l-4 ${s.border} ${s.bg} border-slate-200 p-3.5 space-y-2.5 shadow-sm cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all ${isCancelled ? 'opacity-70' : ''}`}
    >
      {/* Vehículo + cliente */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Car className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
            <span className={`font-bold text-sm tracking-wide ${isCancelled ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
              {card.plate}
            </span>
            {card.sourceType === 'bodyshop'
              ? <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium">Chap.</span>
              : <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-medium">Mec.</span>
            }
            {isCancelled && (
              <span className="text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full font-medium">Cancelada</span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5 truncate">{card.customerName}</p>
          {card.vehicleType && <p className="text-[10px] text-slate-400 truncate">{card.vehicleType}</p>}
        </div>
        {!isCancelled && <DeviationBadge hours={card.deviationTotal} />}
      </div>

      {/* Técnico + tipo */}
      <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-500">
        {card.techName && <span className="bg-slate-100 rounded px-1.5 py-0.5">{card.techName}</span>}
        {card.serviceOrType && <span className="bg-slate-100 rounded px-1.5 py-0.5 truncate max-w-[120px]">{card.serviceOrType}</span>}
      </div>

      {/* Badge: sin avance en AGENDA (P1) */}
      {isAgenda && stuckDays >= 1 && (
        <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 bg-amber-50 border border-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
          <span className="text-[11px] font-bold text-amber-700">
            Sin avance · {stuckDays}d en Agendado
          </span>
        </div>
      )}

      {/* Badge: entrega vencida (P4) */}
      {isOverdue && (
        <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 bg-red-50 border border-red-300">
          <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
          <span className="text-[11px] font-bold text-red-600">
            Entrega vencida · {exitRef}
          </span>
        </div>
      )}

      {/* Badge: técnico no inició (tolerancia vencida) */}
      {isNoStartAlert && (
        <div
          className="space-y-1.5"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 bg-amber-50 border border-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
            <span className="text-[11px] font-bold text-amber-700">
              Técnico no inició · hace {noStartMinutesLate}min
            </span>
          </div>
          <button
            type="button"
            disabled={isReleasingTech}
            onClick={() => onReleaseTech(card.sourceId)}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white transition-colors"
          >
            {isReleasingTech
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <UserX className="h-3.5 w-3.5" />
            }
            <span className="text-[11px] font-bold">Liberar técnico</span>
          </button>
        </div>
      )}

      {/* Badge: ya liberado por no inicio */}
      {card.noStartAt && (
        <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 bg-slate-100 border border-slate-300">
          <UserX className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
          <span className="text-[11px] font-medium text-slate-600">
            Cupo liberado · {card.noStartHoursLost != null ? `${card.noStartHoursLost}h registradas` : 'sin asignar'}
          </span>
        </div>
      )}

      {/* Banner recurso pendiente */}
      {isWaitingResource && (
        <div className="flex items-start gap-2 rounded-lg bg-yellow-100 border border-yellow-300 px-2.5 py-2">
          <Package className="h-3.5 w-3.5 text-yellow-700 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-yellow-800">Esperando recurso</p>
            {card.resourceNote && (
              <p className="text-[10px] text-yellow-700 truncate">{card.resourceNote}</p>
            )}
          </div>
        </div>
      )}

      {/* Proceso actual (no mostrar para canceladas) */}
      {cp && !isCancelled && (
        <div className={`rounded-lg px-3 py-2 space-y-1 border ${
          isBlocked ? 'bg-slate-100 border-slate-200'
          : isAgenda ? 'bg-blue-50 border-blue-200'
          : 'bg-white/70 border-slate-100'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-semibold ${isAgenda ? 'text-blue-700' : 'text-slate-600'}`}>
              {isAgenda ? 'En espera de inicio' : cp.processName}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              isAgenda               ? 'bg-blue-100 text-blue-700'
              : cp.status === 'in_progress' ? 'bg-blue-100 text-blue-700'
              : cp.status === 'blocked'     ? 'bg-orange-100 text-orange-700'
              : 'bg-slate-100 text-slate-500'
            }`}>
              {isAgenda ? 'Agendado' : cp.status === 'in_progress' ? 'En curso' : cp.status === 'blocked' ? 'Pausado' : 'Pendiente'}
            </span>
          </div>

          {isBlocked && cp.blockedReason && (
            <p className="text-[10px] text-orange-700 bg-orange-50 rounded px-2 py-1">
              Motivo: {cp.blockedReason}
            </p>
          )}

          {!isBlocked && !isAgenda && (
            <div className="flex items-center gap-3 text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Plan: {cp.plannedHours}h
              </span>
              {elapsedHours !== null && (
                <span className={`flex items-center gap-1 font-medium ${
                  elapsedHours > cp.plannedHours ? 'text-red-600' : 'text-slate-600'
                }`}>
                  <Minus className="h-3 w-3" />
                  Real: {elapsedHours.toFixed(1)}h
                </span>
              )}
            </div>
          )}

          {!isBlocked && !isAgenda && cp.startedAt && (
            <p className="text-[10px] text-slate-400">
              Inicio: {new Date(cp.startedAt).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}
              {' '}→ est. fin: {new Date(new Date(cp.startedAt).getTime() + cp.plannedHours * 3_600_000)
                .toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}

          {isAgenda && cp.startedAt && (
            <p className="text-[10px] text-blue-500">
              Agendado: {new Date(cp.startedAt).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
      )}

      {/* Banner paralelos bloqueantes */}
      {card.parallelBlocking && !isCancelled && (
        <div className="flex items-center gap-1.5 rounded-lg px-3 py-2 bg-purple-50 border border-purple-200">
          <AlertTriangle className="h-3.5 w-3.5 text-purple-600 flex-shrink-0" />
          <span className="text-[11px] font-semibold text-purple-700">Paralelos pendientes</span>
        </div>
      )}

      {/* Badge "Terminado" cuando no hay proceso activo (solo activas) */}
      {!cp && !isCancelled && !card.parallelBlocking && card.allProcesses.length > 0 && (
        <div className="flex items-center gap-1.5 rounded-lg px-3 py-2 bg-emerald-50 border border-emerald-200">
          <CheckCheck className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
          <span className="text-[11px] font-semibold text-emerald-700">Trabajo terminado</span>
        </div>
      )}

      {/* Bloque horario laboral (solo activas) */}
      {!isCancelled && (
        card.sourceType === 'bodyshop'
          ? <BodyshopScheduleBlock card={card} />
          : <MechanicScheduleBlock card={card} />
      )}

      {/* Pipeline — solo procesos madre */}
      {card.motherProcesses?.filter(p => p.processCode !== 'AGENDA').length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {card.motherProcesses
            .filter(p => p.processCode !== 'AGENDA')
            .map(p => (
              <span key={p.logId} className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                p.status === 'completed'   ? 'bg-emerald-100 text-emerald-600 line-through opacity-60'
                : p.status === 'in_progress' ? 'bg-blue-100 text-blue-700 font-semibold'
                : p.status === 'blocked'     ? 'bg-orange-100 text-orange-600 font-semibold'
                : 'bg-slate-100 text-slate-400'
              }`}>
                {p.processName}
              </span>
            ))}
        </div>
      )}

      {/* Procesos paralelos con controles */}
      {!isCancelled && card.parallelProcesses?.length > 0 && (
        <div className="space-y-1 border-t border-dashed border-purple-200 pt-2" onClick={e => e.stopPropagation()}>
          <p className="text-[10px] font-semibold text-purple-600 uppercase tracking-wide">Paralelos</p>
          {card.parallelProcesses.map(p => {
            const isDone      = p.status === 'completed' || p.status === 'skipped';
            const isRunning   = p.status === 'in_progress';
            const isPaused    = p.status === 'blocked';
            const isPending   = p.status === 'pending';
            return (
              <div key={p.logId} className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 ${
                isDone    ? 'bg-emerald-50 border border-emerald-100'
                : isRunning ? 'bg-blue-50 border border-blue-200'
                : isPaused  ? 'bg-orange-50 border border-orange-200'
                : 'bg-slate-50 border border-slate-200'
              }`}>
                <span className={`flex-1 text-[10px] font-medium truncate ${isDone ? 'line-through opacity-50 text-slate-500' : 'text-slate-700'}`}>
                  {p.processName}
                </span>
                {p.technicianName && !isDone && (
                  <span className="text-[9px] text-slate-400 truncate max-w-[60px]">{p.technicianName}</span>
                )}
                {!isDone && (
                  <div className="flex gap-1 flex-shrink-0">
                    {(isPending || isPaused) && (
                      <button type="button"
                        onClick={() => onStart(p.logId)}
                        className="p-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                        title={isPaused ? 'Reanudar' : 'Iniciar'}>
                        <Play className="h-2.5 w-2.5" />
                      </button>
                    )}
                    {isRunning && (
                      <button type="button"
                        onClick={() => onPause(p.logId, p.processName)}
                        className="p-1 rounded-md bg-orange-400 text-white hover:bg-orange-500 transition-colors"
                        title="Pausar">
                        <PauseCircle className="h-2.5 w-2.5" />
                      </button>
                    )}
                    {(isRunning || isPaused) && (
                      <button type="button"
                        onClick={() => onComplete(p.logId)}
                        className="p-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                        title="Finalizar">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                )}
                {isDone && <CheckCheck className="h-3 w-3 text-emerald-500 flex-shrink-0" />}
              </div>
            );
          })}
        </div>
      )}

      {/* Badge fecha de salida */}
      {(card.exitDate || card.suggestedExitDate) && (
        <div className="flex items-center gap-1.5 text-[10px]">
          <CalendarDays className="h-3 w-3 text-slate-400" />
          {card.exitDate ? (
            <span className="text-indigo-700 font-semibold">{fmtDateLabel(card.exitDate)}</span>
          ) : (
            <span className="text-slate-400">est. {fmtDateLabel(card.suggestedExitDate!)}</span>
          )}
        </div>
      )}

      {/* Acciones — stopPropagation para no abrir el modal (no para canceladas) */}
      {cp && !isCancelled && (
        <div className="flex gap-2 pt-0.5" onClick={e => e.stopPropagation()}>
          {isBlocked ? (
            <button type="button" disabled={isUnblocking} onClick={() => onUnblock(cp.logId)}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg bg-slate-600 text-white hover:bg-slate-700 disabled:opacity-50 transition-colors">
              <PlayCircle className="h-3 w-3" />
              {isUnblocking ? 'Reanudando...' : 'Reanudar'}
            </button>
          ) : isAgenda ? (
            <button type="button" disabled={isCompleting} onClick={() => onComplete(cp.logId)}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
              <Play className="h-3 w-3" />
              {isCompleting ? 'Iniciando...' : 'Iniciar trabajo'}
            </button>
          ) : (
            <>
              {isStartable && (
                <button type="button" disabled={isStarting} onClick={() => onStart(cp.logId)}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  <Play className="h-3 w-3" /> Iniciar
                </button>
              )}
              {isCompletable && (
                <button type="button" disabled={isCompleting} onClick={() => onComplete(cp.logId)}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                  <CheckCircle2 className="h-3 w-3" /> Completar
                </button>
              )}
              {isPausable && (
                <button type="button" disabled={isPausing} onClick={() => onPause(cp.logId, cp.processName)}
                  className="flex items-center justify-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-orange-100 text-orange-700 hover:bg-orange-200 disabled:opacity-50 transition-colors"
                  title="Pausar proceso">
                  <PauseCircle className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          )}
        </div>
      )}

      {card.overdueHours > 0 && !isBlocked && (
        <p className="flex items-center gap-1 text-[10px] text-red-600 font-medium">
          <AlertTriangle className="h-3 w-3" />
          {card.overdueHours.toFixed(1)}h de atraso en {cp?.processName}
        </p>
      )}
    </div>
  );
}

// ── Columna ────────────────────────────────────────────────────────────────────

function KanbanColumn({
  column, onCardClick, onStart, onComplete, onPause, onUnblock, onReleaseTech,
  loadingLogId, pausingLogId, unblockingLogId, releasingCardId, todayStr,
}: {
  column: TrackingColumn;
  onCardClick: (cardId: string) => void;
  onStart:    (logId: string, technicianId?: string, technicianName?: string) => void;
  onComplete: (logId: string) => void;
  onPause:    (logId: string, processName: string) => void;
  onUnblock:  (logId: string) => void;
  onReleaseTech: (sourceId: string) => void;
  loadingLogId:    string | null;
  pausingLogId:    string | null;
  unblockingLogId: string | null;
  releasingCardId: string | null;
  todayStr:        string;
}) {
  const isCancelledCol = column.processCode === '__CANCELLED__';
  const alertCount = isCancelledCol
    ? 0
    : column.cards.filter(c => c.semaphore === 'red' || c.semaphore === 'orange').length;

  return (
    <div className={`flex-shrink-0 w-72 ${isCancelledCol ? 'opacity-80' : ''}`}>
      <div className={`flex items-center justify-between mb-3 px-1 ${isCancelledCol ? 'border-l-2 border-slate-300 pl-2' : ''}`}>
        <h3 className={`text-sm font-semibold ${isCancelledCol ? 'text-slate-400' : 'text-slate-700'}`}>
          {column.processName}
        </h3>
        <div className="flex items-center gap-1.5">
          {alertCount > 0 && (
            <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold">
              {alertCount} alerta{alertCount !== 1 ? 's' : ''}
            </span>
          )}
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${isCancelledCol ? 'bg-slate-100 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
            {column.cards.length}
          </span>
        </div>
      </div>
      <div className="space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto pr-1">
        {column.cards.map(card => (
          <KanbanCard
            key={card.id}
            card={card}
            onCardClick={onCardClick}
            onStart={onStart}
            onComplete={onComplete}
            onPause={onPause}
            onUnblock={onUnblock}
            onReleaseTech={onReleaseTech}
            isStarting={loadingLogId === card.currentProcess?.logId}
            isCompleting={loadingLogId === card.currentProcess?.logId}
            isPausing={pausingLogId === card.currentProcess?.logId}
            isUnblocking={unblockingLogId === card.currentProcess?.logId}
            isReleasingTech={releasingCardId === card.sourceId}
            todayStr={todayStr}
          />
        ))}
        {column.cards.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center">
            <p className="text-xs text-slate-400">
              {isCancelledCol ? 'Sin cancelaciones hoy' : 'Sin citas en este proceso'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function TrackingKanbanPage() {
  useRequirePermission('seguimiento');
  const workshopId = useWorkshopId();
  const { data: workshops = [] } = useWorkshops();
  const [date, setDate]                     = useState(formatDate(new Date()));
  const [todayStr, setTodayStr]             = useState<string>('');
  useEffect(() => { setTodayStr(formatDate(new Date())); }, []);
  const [loadingLogId, setLoadingLogId]     = useState<string | null>(null);
  const [pausingLogId, setPausingLogId]     = useState<string | null>(null);
  const [unblockingLogId, setUnblockingLogId] = useState<string | null>(null);
  const [pauseModal, setPauseModal]         = useState<{ logId: string; processName: string } | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [filterTech, setFilterTech]         = useState('');
  const [filterSemaphore, setFilterSemaphore] = useState('');
  const [showNewEntry, setShowNewEntry]     = useState(false);

  const qc = useQueryClient();
  const { data: board, isLoading, isError, refetch } = useTrackingBoard(date, workshopId ?? undefined);

  const startMutation    = useStartProcess();
  const completeMutation = useCompleteProcess();
  const pauseMutation    = usePauseProcess();
  const unblockMutation  = useUnblockProcess();
  const exitDateMutation = useSetExitDate();
  const setResourceMutation   = useSetResource();
  const clearResourceMutation = useClearResource();

  // Card seleccionada: lookup en vivo desde board (se actualiza tras mutations)
  const selectedCard = selectedCardId
    ? board?.columns.flatMap(c => c.cards).find(c => c.id === selectedCardId) ?? null
    : null;

  const workshopName = workshops.find(w => w.id === workshopId)?.name ?? '';

  function prevDay() {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    setDate(formatDate(d));
  }
  function nextDay() {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    setDate(formatDate(d));
  }

  async function handleStart(logId: string, technicianId?: string, technicianName?: string) {
    setLoadingLogId(logId);
    try { await startMutation.mutateAsync({ logId, technicianId, technicianName }); }
    finally { setLoadingLogId(null); }
  }

  async function handleComplete(logId: string) {
    setLoadingLogId(logId);
    try { await completeMutation.mutateAsync({ logId }); }
    finally { setLoadingLogId(null); }
  }

  function handlePauseOpen(logId: string, processName: string) {
    setPauseModal({ logId, processName });
  }

  async function handlePauseConfirm(reason: string) {
    if (!pauseModal) return;
    setPausingLogId(pauseModal.logId);
    try {
      await pauseMutation.mutateAsync({ logId: pauseModal.logId, reason });
      setPauseModal(null);
    } finally {
      setPausingLogId(null);
    }
  }

  async function handleUnblock(logId: string) {
    setUnblockingLogId(logId);
    try { await unblockMutation.mutateAsync(logId); }
    finally { setUnblockingLogId(null); }
  }

  const [releasingCardId, setReleasingCardId] = useState<string | null>(null);

  async function handleReleaseTech(sourceId: string) {
    setReleasingCardId(sourceId);
    try {
      await releaseTechNoStart(sourceId);
      qc.invalidateQueries({ queryKey: ['tracking-board'] });
    } finally {
      setReleasingCardId(null);
    }
  }

  async function handleSaveExitDate(date: string | null) {
    if (!selectedCard) return;
    await exitDateMutation.mutateAsync({
      sourceType: selectedCard.sourceType,
      sourceId:   selectedCard.sourceId,
      date,
    });
  }

  const totalCards = board?.columns.reduce((s, c) => s + c.cards.length, 0) ?? 0;
  const alertCount = board?.alertCount ?? 0;

  // Técnicos únicos del board para el filtro
  const allTechs = [...new Set(
    board?.columns.flatMap(c => c.cards.map(card => card.techName)).filter(Boolean) ?? []
  )] as string[];

  // Columnas filtradas (no toca __CANCELLED__)
  const filteredColumns = board?.columns.map(col => ({
    ...col,
    cards: col.processCode === '__CANCELLED__' ? col.cards : col.cards.filter(card => {
      if (filterTech && card.techName !== filterTech) return false;
      if (filterSemaphore && card.semaphore !== filterSemaphore) return false;
      return true;
    }),
  })) ?? [];

  return (
    <div className="h-screen flex flex-col bg-slate-50">

      {/* Modal ingreso rápido (F4.2) */}
      {showNewEntry && workshopId && (
        <NewEntryModal
          date={date}
          workshopId={workshopId}
          onClose={() => setShowNewEntry(false)}
          onCreated={() => {
            setShowNewEntry(false);
            qc.invalidateQueries({ queryKey: ['tracking-board'] });
          }}
        />
      )}

      {/* Modal de pausa (z-50, sobre el modal de detalle) */}
      {pauseModal && (
        <PauseModal
          processName={pauseModal.processName}
          onConfirm={handlePauseConfirm}
          onClose={() => setPauseModal(null)}
          isLoading={pauseMutation.isPending}
        />
      )}

      {/* Modal de detalle de card (z-40) */}
      {selectedCard && (
        <CardDetailModal
          card={selectedCard}
          onClose={() => setSelectedCardId(null)}
          onStart={handleStart}
          onComplete={handleComplete}
          onPause={handlePauseOpen}
          onUnblock={handleUnblock}
          loadingLogId={loadingLogId}
          pausingLogId={pausingLogId}
          unblockingLogId={unblockingLogId}
          onSaveExitDate={handleSaveExitDate}
          isSavingExitDate={exitDateMutation.isPending}
          onSetResource={note => setResourceMutation.mutate({ entryId: selectedCard.sourceId, note })}
          onClearResource={() => clearResourceMutation.mutate(selectedCard.sourceId)}
          isResourcePending={setResourceMutation.isPending || clearResourceMutation.isPending}
        />
      )}

      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold text-slate-900">Seguimiento Operativo</h1>
            <InfoButton helpKey="kanban" />
            {workshopName && (
              <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                {workshopName}
              </span>
            )}
            {alertCount > 0 && (
              <span className="flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">
                <AlertTriangle className="h-3 w-3" />
                {alertCount} alerta{alertCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              <button type="button" onClick={prevDay} className="p-1 rounded hover:bg-white transition-colors">
                <ChevronLeft className="h-4 w-4 text-slate-600" />
              </button>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="text-xs font-medium text-slate-700 bg-transparent border-none outline-none px-1" />
              <button type="button" onClick={nextDay} className="p-1 rounded hover:bg-white transition-colors">
                <ChevronRight className="h-4 w-4 text-slate-600" />
              </button>
            </div>
            <button type="button" onClick={() => refetch()}
              className="p-2 rounded-lg hover:bg-slate-100 transition-colors" title="Actualizar">
              <RefreshCw className={`h-4 w-4 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setShowNewEntry(true)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              title="Ingresar auto al taller"
            >
              <Plus className="h-4 w-4" />
              Ingreso rápido
            </button>
          </div>
        </div>

        {board && (
          <div className="flex items-center justify-between mt-2 gap-4">
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span>{totalCards} citas activas</span>
              {filteredColumns.map(col => (
                <span key={col.processCode} className="flex items-center gap-1">
                  <span className="font-medium text-slate-700">{col.processName}</span>
                  <span className="bg-slate-100 px-1.5 rounded-full">{col.cards.length}</span>
                </span>
              ))}
            </div>

            {/* Filtros F4.1 */}
            <div className="flex items-center gap-2">
              {/* Filtro por técnico */}
              {allTechs.length > 0 && (
                <select
                  value={filterTech}
                  onChange={e => setFilterTech(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-blue-400 text-slate-600 bg-white"
                >
                  <option value="">Todos los técnicos</option>
                  {allTechs.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              )}

              {/* Filtro por semáforo */}
              <select
                value={filterSemaphore}
                onChange={e => setFilterSemaphore(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-blue-400 text-slate-600 bg-white"
              >
                <option value="">Todos los estados</option>
                <option value="green">En tiempo</option>
                <option value="normal">Normal</option>
                <option value="orange">Por vencer</option>
                <option value="red">Atrasado</option>
              </select>

              {/* Limpiar filtros */}
              {(filterTech || filterSemaphore) && (
                <button
                  type="button"
                  onClick={() => { setFilterTech(''); setFilterSemaphore(''); }}
                  className="text-xs text-slate-400 hover:text-slate-600 px-1.5 py-1 rounded hover:bg-slate-100 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto px-6 py-4">
        {isLoading && (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="h-6 w-6 text-slate-400 animate-spin" />
          </div>
        )}
        {isError && (
          <div className="flex items-center justify-center h-64 gap-2 text-red-500">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-sm">Error al cargar el tablero</span>
          </div>
        )}
        {board && !isLoading && (
          board.columns.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-2 text-slate-400">
              <Car className="h-10 w-10 opacity-30" />
              <p className="text-sm">No hay citas activas para esta fecha</p>
            </div>
          ) : (
            <div className="flex gap-5 min-w-max pb-4">
              {filteredColumns.map(col => (
                <KanbanColumn
                  key={col.processCode}
                  column={col}
                  onCardClick={setSelectedCardId}
                  onStart={handleStart}
                  onComplete={handleComplete}
                  onPause={handlePauseOpen}
                  onUnblock={handleUnblock}
                  onReleaseTech={handleReleaseTech}
                  loadingLogId={loadingLogId}
                  pausingLogId={pausingLogId}
                  unblockingLogId={unblockingLogId}
                  releasingCardId={releasingCardId}
                  todayStr={todayStr}
                />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
