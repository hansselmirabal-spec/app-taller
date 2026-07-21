'use client';
import { useState, useEffect, useRef } from 'react';
import { addDays, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useBodyshopSchedule, useBodyshopWeekCapacity } from '@/hooks/use-bodyshop';
import { useTechnicians } from '@/hooks/use-technicians';
import { useWorkshopId } from '@/context/workshop-context';
import { formatDate, sumBodyshopHours } from '@/lib/utils';
import { AlertTriangle, CheckCircle2, Clock, LayoutList, Users, X } from 'lucide-react';
import type { BodyshopScheduleEntry, BodyshopProcessWindow, BodyshopScheduleKpis } from '@/hooks/use-bodyshop';
import type { Technician } from '@/types';

// ─── Constantes ───────────────────────────────────────────────────────────────

const PROCESSES: {
  key: 'BODYWORK' | 'PREP' | 'PAINT';
  label: string;
  abbrev: string;
  specialty: string[];           // especialidades que mapean a este proceso
  cellBg: string;
  cellText: string;
  headerBg: string;
  badgeBg: string;
  barColor: string;
}[] = [
  {
    key: 'BODYWORK', label: 'Chapería', abbrev: 'Chap.',
    specialty: ['CARROCERIA', 'BODYWORK', 'CHAPERIA'],
    cellBg: 'bg-blue-100', cellText: 'text-blue-800',
    headerBg: 'bg-blue-50 border-blue-200',
    badgeBg: 'bg-blue-100 text-blue-700', barColor: 'bg-blue-500',
  },
  {
    key: 'PREP', label: 'Preparación', abbrev: 'Prep.',
    specialty: ['PREPARACION', 'PREP'],
    cellBg: 'bg-violet-100', cellText: 'text-violet-800',
    headerBg: 'bg-violet-50 border-violet-200',
    badgeBg: 'bg-violet-100 text-violet-700', barColor: 'bg-violet-500',
  },
  {
    key: 'PAINT', label: 'Pintura', abbrev: 'Pint.',
    specialty: ['PINTURA', 'PAINT'],
    cellBg: 'bg-orange-100', cellText: 'text-orange-800',
    headerBg: 'bg-orange-50 border-orange-200',
    badgeBg: 'bg-orange-100 text-orange-700', barColor: 'bg-orange-500',
  },
];

const PROC_MAP = Object.fromEntries(PROCESSES.map(p => [p.key, p])) as Record<'BODYWORK' | 'PREP' | 'PAINT', typeof PROCESSES[0]>;

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  scheduled:   { label: 'Agendado',   cls: 'bg-blue-50 text-blue-700 border border-blue-200' },
  in_progress: { label: 'En proceso', cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
  done:        { label: 'Listo',      cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  cancelled:   { label: 'Cancelado',  cls: 'bg-slate-50 text-slate-500 border border-slate-200' },
};

// ─── KPI Banner — popover de detalle por filtro ───────────────────────────────

type FilterKey = 'all' | 'onSchedule' | 'delayed' | 'exitToday';

function EntryPopoverRow({ entry }: { entry: BodyshopScheduleEntry }) {
  const statusInfo = STATUS_LABELS[entry.status] ?? { label: entry.status, cls: 'bg-slate-50 text-slate-500 border border-slate-200' };
  const totalH = sumBodyshopHours(entry);
  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-slate-800 tracking-wide text-xs">{entry.plate}</span>
          {entry.isDelayed && (
            <span className="flex items-center gap-0.5 text-[9px] font-bold text-red-700 bg-red-100 px-1 py-0.5 rounded">
              <AlertTriangle className="h-2.5 w-2.5" />
              {entry.delayDays}d
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-500 truncate max-w-[160px] mt-0.5">{entry.customerName}</p>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusInfo.cls}`}>
          {statusInfo.label}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
        <span className="text-[11px] font-semibold text-slate-700">
          {entry.bodyworkHours > 0 && <span className="text-blue-600">{entry.bodyworkHours}h</span>}
          {entry.bodyworkHours > 0 && (entry.prepHours > 0 || entry.paintHours > 0) && <span className="text-slate-300 mx-0.5">+</span>}
          {entry.prepHours > 0 && <span className="text-violet-600">{entry.prepHours}h</span>}
          {entry.prepHours > 0 && entry.paintHours > 0 && <span className="text-slate-300 mx-0.5">+</span>}
          {entry.paintHours > 0 && <span className="text-orange-600">{entry.paintHours}h</span>}
        </span>
        <p className="text-[10px] text-slate-400 mt-0.5">{totalH}h total</p>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        {entry.plannedExitDate
          ? <span className={`text-[11px] font-medium ${entry.isDelayed ? 'text-red-600' : 'text-slate-600'}`}>{entry.plannedExitDate}</span>
          : <span className="text-[11px] text-slate-300">—</span>
        }
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        {entry.currentTrackingCode
          ? <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-medium">{entry.currentTrackingCode}</span>
          : <span className="text-[11px] text-slate-300">—</span>
        }
      </td>
    </tr>
  );
}

function KpiBanner({ kpis, entries }: { kpis: BodyshopScheduleKpis; entries: BodyshopScheduleEntry[] }) {
  const [activeFilter, setActiveFilter] = useState<FilterKey | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [todayStr, setTodayStr] = useState('');
  useEffect(() => { setTodayStr(formatDate(new Date())); }, []);

  useEffect(() => {
    if (!activeFilter) return;
    function onOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setActiveFilter(null);
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setActiveFilter(null); }
    document.addEventListener('mousedown', onOut);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onOut); document.removeEventListener('keydown', onEsc); };
  }, [activeFilter]);

  const activeEntries = entries.filter(e => e.status !== 'done' && e.status !== 'cancelled');

  const filtered: Record<FilterKey, BodyshopScheduleEntry[]> = {
    all:        activeEntries,
    onSchedule: activeEntries.filter(e => !e.isDelayed),
    delayed:    entries.filter(e => e.isDelayed),
    exitToday:  activeEntries.filter(e => e.plannedExitDate === todayStr || e.estimatedFinishDate === todayStr),
  };

  const titles: Record<FilterKey, string> = {
    all:        `En taller — ${filtered.all.length} vehículos activos`,
    onSchedule: `Al día — ${filtered.onSchedule.length} vehículos en tiempo`,
    delayed:    `Retrasadas — ${filtered.delayed.length} vehículos con demora`,
    exitToday:  `Salen hoy — ${filtered.exitToday.length} vehículos`,
  };

  function toggle(key: FilterKey) { setActiveFilter(p => p === key ? null : key); }

  const btnBase = 'flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

  return (
    <div ref={ref} className="relative">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-white rounded-xl border border-slate-200 shadow-sm text-xs">

        {/* En taller */}
        <button type="button" onClick={() => toggle('all')}
          className={`${btnBase} ${activeFilter === 'all' ? 'bg-slate-200 ring-1 ring-slate-400' : 'bg-slate-100 hover:bg-slate-200'}`}>
          <span className="text-slate-500 font-medium">En taller</span>
          <span className="font-bold text-slate-800 tabular-nums">{kpis.totalInShop}</span>
        </button>

        {/* Al día */}
        <button type="button" onClick={() => toggle('onSchedule')}
          className={`${btnBase} ${
            activeFilter === 'onSchedule' ? 'bg-emerald-100 ring-1 ring-emerald-400'
            : kpis.onSchedule > 0 ? 'bg-emerald-50 border border-emerald-100 hover:bg-emerald-100' : 'bg-slate-50 hover:bg-slate-100'
          }`}>
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-slate-600 font-medium">Al día</span>
          <span className={`font-bold tabular-nums ${kpis.onSchedule > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>{kpis.onSchedule}</span>
        </button>

        {/* Retrasadas */}
        <button type="button" onClick={() => toggle('delayed')}
          className={`${btnBase} ${
            activeFilter === 'delayed' ? 'bg-red-100 ring-1 ring-red-400'
            : kpis.delayed > 0 ? 'bg-red-50 border border-red-100 hover:bg-red-100' : 'bg-slate-50 hover:bg-slate-100'
          }`}>
          <AlertTriangle className={`h-3.5 w-3.5 ${kpis.delayed > 0 ? 'text-red-500' : 'text-slate-300'}`} />
          <span className="text-slate-600 font-medium">Retrasadas</span>
          <span className={`font-bold tabular-nums ${kpis.delayed > 0 ? 'text-red-700' : 'text-slate-400'}`}>{kpis.delayed}</span>
        </button>

        {/* Salen hoy */}
        <button type="button" onClick={() => toggle('exitToday')}
          className={`${btnBase} ${
            activeFilter === 'exitToday' ? 'bg-blue-100 ring-1 ring-blue-400'
            : kpis.exitToday > 0 ? 'bg-blue-50 border border-blue-100 hover:bg-blue-100' : 'bg-slate-50 hover:bg-slate-100'
          }`}>
          <Clock className={`h-3.5 w-3.5 ${kpis.exitToday > 0 ? 'text-blue-500' : 'text-slate-300'}`} />
          <span className="text-slate-600 font-medium">Salen hoy</span>
          <span className={`font-bold tabular-nums ${kpis.exitToday > 0 ? 'text-blue-700' : 'text-slate-400'}`}>{kpis.exitToday}</span>
        </button>

        {/* Total semana (no clickeable) */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50">
          <span className="text-slate-500 font-medium">Total semana</span>
          <span className="font-bold text-slate-800 tabular-nums">{kpis.totalHoursWeek}h</span>
        </div>

        {kpis.delayed > 0 && (
          <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-amber-800 font-medium">
              {kpis.delayed} agenda{kpis.delayed !== 1 ? 's' : ''} ocupando cupo extra — acumulado activo
            </span>
          </div>
        )}
      </div>

      {/* ── Popover ── */}
      {activeFilter && (
        <div className="absolute top-full left-0 mt-2 z-50 w-[600px] max-w-[calc(100vw-3rem)] bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-50 to-white border-b border-slate-200">
            <div className="flex items-center gap-2">
              {activeFilter === 'delayed' && <AlertTriangle className="h-4 w-4 text-red-500" />}
              {activeFilter === 'onSchedule' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              {activeFilter === 'exitToday' && <Clock className="h-4 w-4 text-blue-500" />}
              <span className="text-sm font-bold text-slate-800">{titles[activeFilter]}</span>
            </div>
            <button type="button" onClick={() => setActiveFilter(null)}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          {filtered[activeFilter].length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              Sin vehículos para este filtro
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-white sticky top-0 z-10 border-b border-slate-100">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-slate-500">Vehículo · Cliente</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-500">Estado</th>
                    <th className="text-right px-3 py-2 font-semibold text-slate-500">Horas</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-500">Salida est.</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-500">Proceso</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered[activeFilter].map(entry => (
                    <EntryPopoverRow key={entry.id} entry={entry} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer */}
          <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400">
            {filtered[activeFilter].length} registro{filtered[activeFilter].length !== 1 ? 's' : ''} · Click afuera o ESC para cerrar
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWindowForDay(entry: BodyshopScheduleEntry, dayIndex: number): BodyshopProcessWindow | null {
  for (const w of entry.processWindows) {
    if (dayIndex >= w.startDay && dayIndex <= w.endDay) return w;
  }
  return null;
}

function techProcessKey(specialty: string | null | undefined): 'BODYWORK' | 'PREP' | 'PAINT' | null {
  const s = (specialty ?? '').toUpperCase();
  for (const p of PROCESSES) {
    if (p.specialty.includes(s)) return p.key;
  }
  return null;
}

function occupancyBarStyle(rate: number): string {
  if (rate >= 1.0) return 'bg-red-500';
  if (rate >= 0.8) return 'bg-amber-500';
  return 'bg-emerald-500';
}

// ─── Vista: por vehículo (Gantt de entries) ───────────────────────────────────

function EntryGantt({
  entries, weekDates,
  weekCap,
}: {
  entries: BodyshopScheduleEntry[];
  weekDates: Date[];
  weekCap: Record<string, any>;
}) {
  const todayStr = formatDate(new Date());

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="w-52 min-w-[200px] px-3 py-2 text-left font-semibold text-slate-600 border-r border-slate-200">
              Vehículo / Cliente
            </th>
            {weekDates.map(d => {
              const dStr = formatDate(d);
              return (
                <th key={dStr} className={`text-center px-1 py-2 font-semibold min-w-[100px] ${dStr === todayStr ? 'bg-blue-50 text-blue-700' : 'text-slate-600'}`}>
                  <span className="capitalize">{format(d, 'EEE d MMM', { locale: es })}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 && (
            <tr><td colSpan={7} className="py-10 text-center text-slate-400">No hay vehículos en el taller esta semana.</td></tr>
          )}

          {entries.map((entry, rowIdx) => {
            const entryDate  = new Date(entry.date + 'T12:00:00');
            const statusInfo = STATUS_LABELS[entry.status] ?? { label: entry.status, cls: 'bg-slate-50 text-slate-500 border border-slate-200' };
            const isDelayed  = entry.isDelayed;
            const delayDays  = entry.delayDays ?? 0;
            return (
              <tr key={entry.id} className={`border-b border-slate-100 ${isDelayed ? 'bg-red-50/30' : rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                <td className={`px-3 py-2 border-r align-top ${isDelayed ? 'border-red-200' : 'border-slate-200'}`}>
                  <div className="flex items-start justify-between gap-1">
                    <p className="font-bold text-slate-800 tracking-wide">{entry.plate}</p>
                    {isDelayed && (
                      <span className="flex-shrink-0 flex items-center gap-0.5 text-[9px] font-bold text-red-700 bg-red-100 px-1 py-0.5 rounded">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {delayDays > 0 ? `${delayDays}d` : '!'}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-500 text-[11px] truncate max-w-[176px]">{entry.customerName}</p>
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded ${statusInfo.cls}`}>
                      {statusInfo.label}
                    </span>
                    {entry.plannedExitDate && (
                      <span className={`inline-block text-[9px] px-1 py-0.5 rounded ${isDelayed ? 'text-red-600 bg-red-50' : 'text-slate-400'}`}>
                        Sale: {entry.plannedExitDate}
                      </span>
                    )}
                  </div>
                </td>
                {weekDates.map(d => {
                  const dStr    = formatDate(d);
                  const dayIdx  = Math.round((new Date(dStr + 'T12:00:00').getTime() - entryDate.getTime()) / 86_400_000);
                  const inShop  = dayIdx >= 0 && dayIdx < entry.stayDays;

                  if (!inShop) {
                    return (
                      <td key={dStr} className={`px-1 py-1.5 ${dayIdx >= entry.stayDays ? 'bg-slate-50' : 'bg-white'}`}
                        style={dayIdx >= entry.stayDays ? {
                          backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(148,163,184,0.15) 4px, rgba(148,163,184,0.15) 8px)',
                        } : undefined}
                      />
                    );
                  }

                  const win = getWindowForDay(entry, dayIdx);
                  if (!win) return <td key={dStr} className="px-1 py-1.5 bg-slate-50" />;

                  const proc    = PROC_MAP[win.process];
                  const dailyH  = win.days > 0 ? Math.round((win.hours / win.days) * 10) / 10 : 0;
                  const techAssigned = entry.processTechs?.[win.process];
                  const isToday_ = dStr === todayStr;

                  return (
                    <td key={dStr} className={`px-1 py-1.5 align-middle ${isToday_ ? 'ring-1 ring-inset ring-blue-200' : ''}`}>
                      <div className={`rounded-md px-1.5 py-1.5 ${proc.cellBg} ${proc.cellText} leading-tight space-y-0.5`}>
                        <p className="font-semibold text-[11px]">{proc.abbrev} · {dailyH}h</p>
                        {techAssigned && (
                          <p className="text-[10px] opacity-70 truncate">{techAssigned.technicianName.split(' ')[0]}</p>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}

          {/* ── Resumen de ocupación ────────────────────────────────────────── */}
          <tr><td colSpan={7} className="h-px bg-slate-200" /></tr>
          {PROCESSES.map(proc => (
            <tr key={proc.key} className="border-b border-slate-100 last:border-0">
              <td className="px-3 py-1.5 border-r border-slate-200">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${proc.badgeBg}`}>{proc.label}</span>
                <span className="ml-1 text-[10px] text-slate-400">% ocupación</span>
              </td>
              {weekDates.map(d => {
                const dStr    = formatDate(d);
                const procCap = (weekCap as any)[dStr]?.byProcess?.[proc.key];
                const rate    = procCap?.occupancyRate ?? 0;
                const pct     = Math.round(rate * 100);
                const occ     = procCap?.occupiedHours ?? 0;
                const total   = procCap?.commercializableHours ?? 0;
                return (
                  <td key={dStr} className="px-1 py-1.5 align-middle">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className={`text-[11px] font-bold tabular-nums ${pct >= 100 ? 'text-red-700' : pct >= 80 ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {total > 0 ? `${pct}%` : '—'}
                      </span>
                      {total > 0 && (
                        <>
                          <div className="w-full max-w-[64px] h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${occupancyBarStyle(rate)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                          <span className="text-[9px] text-slate-400 tabular-nums">{Math.round(occ * 10) / 10}h/{Math.round(total * 10) / 10}h</span>
                        </>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Vista: por técnico ───────────────────────────────────────────────────────

function TechGantt({
  entries, weekDates, technicians, weekCap,
}: {
  entries: BodyshopScheduleEntry[];
  weekDates: Date[];
  technicians: Technician[];
  weekCap: Record<string, any>;
}) {
  const todayStr = formatDate(new Date());

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="w-48 min-w-[180px] px-3 py-2 text-left font-semibold text-slate-600 border-r border-slate-200">
              Técnico
            </th>
            {weekDates.map(d => {
              const dStr = formatDate(d);
              return (
                <th key={dStr} className={`text-center px-1 py-2 font-semibold min-w-[110px] ${dStr === todayStr ? 'bg-blue-50 text-blue-700' : 'text-slate-600'}`}>
                  <span className="capitalize">{format(d, 'EEE d MMM', { locale: es })}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {PROCESSES.map((proc, pIdx) => {
            // Técnicos de este proceso
            const procTechs = technicians.filter(t => techProcessKey(t.specialty) === proc.key && t.active !== false);

            return [
              // ── Header del grupo de proceso ──────────────────────────────────
              <tr key={`header-${proc.key}`} className={`border-b ${proc.headerBg}`}>
                <td colSpan={7} className={`px-4 py-1.5 font-bold text-[11px] uppercase tracking-wider border-b ${proc.headerBg}`}>
                  <span className={`px-2 py-0.5 rounded ${proc.badgeBg}`}>{proc.label}</span>
                  <span className="ml-2 text-slate-400 font-normal normal-case tracking-normal">
                    {procTechs.length} técnico{procTechs.length !== 1 ? 's' : ''}
                  </span>
                </td>
              </tr>,

              // ── Fila por técnico ─────────────────────────────────────────────
              ...(procTechs.length === 0
                ? [
                    <tr key={`empty-${proc.key}`} className="border-b border-slate-100">
                      <td colSpan={7} className="px-6 py-2 text-slate-400 italic text-[11px]">
                        Sin técnicos asignados a {proc.label}
                      </td>
                    </tr>,
                  ]
                : procTechs.map((tech, tIdx) => {
                    const isLast = tIdx === procTechs.length - 1 && pIdx === PROCESSES.length - 1;
                    return (
                      <tr key={tech.id} className={`${isLast ? '' : 'border-b border-slate-100'}`}>
                        {/* Nombre del técnico */}
                        <td className="px-3 py-2 border-r border-slate-200 align-middle">
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                              <span className="text-[10px] font-bold text-slate-600">
                                {tech.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-800 truncate">{tech.name.split(' ')[0]}</p>
                              <p className="text-[10px] text-slate-400 truncate">{tech.name.split(' ').slice(1).join(' ')}</p>
                            </div>
                          </div>
                        </td>

                        {/* Celdas por día */}
                        {weekDates.map(d => {
                          const dStr    = formatDate(d);
                          const isSun   = d.getDay() === 0;
                          const isToday_= dStr === todayStr;

                          // Ausencia desde weekCap
                          const techCap = (weekCap as any)[dStr]?.byTechnician?.find(
                            (t: any) => t.technicianId === tech.id,
                          );
                          const isAbsent = techCap?.availableHours === 0 && techCap?.isWorkingDay;

                          if (isSun) {
                            return (
                              <td key={dStr} className="px-1 py-1.5 bg-slate-50 text-center">
                                <span className="text-[10px] text-slate-300">Dom.</span>
                              </td>
                            );
                          }

                          if (isAbsent) {
                            return (
                              <td key={dStr} className="px-1 py-1.5 bg-slate-100 text-center align-middle">
                                <span className="text-[10px] text-slate-400 font-medium">Ausente</span>
                              </td>
                            );
                          }

                          // Buscar en qué agenda(s) trabaja este técnico este día
                          const assignments: { entry: BodyshopScheduleEntry; win: BodyshopProcessWindow; dailyH: number }[] = [];
                          for (const entry of entries) {
                            const assigned = entry.processTechs?.[proc.key];
                            if (!assigned || assigned.technicianId !== tech.id) continue;
                            const entryDate = new Date(entry.date + 'T12:00:00');
                            const dayIdx    = Math.round((new Date(dStr + 'T12:00:00').getTime() - entryDate.getTime()) / 86_400_000);
                            const win       = getWindowForDay(entry, dayIdx);
                            if (!win || win.process !== proc.key) continue;
                            const dailyH = win.days > 0 ? Math.round((win.hours / win.days) * 10) / 10 : 0;
                            assignments.push({ entry, win, dailyH });
                          }

                          if (assignments.length === 0) {
                            return (
                              <td key={dStr} className={`px-1 py-1.5 ${isToday_ ? 'ring-1 ring-inset ring-blue-200' : ''}`}>
                                <div className="rounded-md px-2 py-1.5 bg-slate-50 border border-dashed border-slate-200 text-center">
                                  <span className="text-[10px] text-slate-400">Libre</span>
                                </div>
                              </td>
                            );
                          }

                          return (
                            <td key={dStr} className={`px-1 py-1.5 align-middle ${isToday_ ? 'ring-1 ring-inset ring-blue-200' : ''}`}>
                              <div className="space-y-0.5">
                                {assignments.map(({ entry, dailyH }) => (
                                  <div key={entry.id} className={`rounded-md px-1.5 py-1 leading-tight ${entry.isDelayed ? 'bg-red-100 text-red-800 ring-1 ring-red-300' : `${proc.cellBg} ${proc.cellText}`}`}>
                                    <div className="flex items-center justify-between gap-1">
                                      <p className="font-bold text-[11px] tracking-wide">{entry.plate}</p>
                                      {entry.isDelayed && (
                                        <span className="flex items-center gap-0.5 text-[9px] font-bold text-red-700">
                                          <AlertTriangle className="h-2.5 w-2.5" />
                                          {(entry.delayDays ?? 0) > 0 ? `${entry.delayDays}d` : '!'}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[10px] opacity-70 truncate max-w-[90px]">{entry.customerName.split(' ')[0]}</p>
                                    <p className="text-[10px] opacity-80 font-medium">{dailyH}h</p>
                                  </div>
                                ))}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })),
            ];
          })}

          {/* ── Resumen de ocupación ────────────────────────────────────────── */}
          <tr><td colSpan={7} className="h-px bg-slate-200" /></tr>
          {PROCESSES.map(proc => (
            <tr key={`summary-${proc.key}`} className="border-b border-slate-100 last:border-0">
              <td className="px-3 py-1.5 border-r border-slate-200">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${proc.badgeBg}`}>{proc.label}</span>
                <span className="ml-1 text-[10px] text-slate-400">% cap.</span>
              </td>
              {weekDates.map(d => {
                const dStr    = formatDate(d);
                const procCap = (weekCap as any)[dStr]?.byProcess?.[proc.key];
                const rate    = procCap?.occupancyRate ?? 0;
                const pct     = Math.round(rate * 100);
                const occ     = procCap?.occupiedHours ?? 0;
                const total   = procCap?.commercializableHours ?? 0;
                return (
                  <td key={dStr} className="px-1 py-1.5 align-middle text-center">
                    <span className={`text-[11px] font-bold tabular-nums ${pct >= 100 ? 'text-red-700' : pct >= 80 ? 'text-amber-700' : total > 0 ? 'text-emerald-700' : 'text-slate-300'}`}>
                      {total > 0 ? `${pct}%` : '—'}
                    </span>
                    {total > 0 && (
                      <p className="text-[9px] text-slate-400 tabular-nums">{Math.round(occ * 10) / 10}h/{Math.round(total * 10) / 10}h</p>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function BodyshopSchedulePage({ weekStart }: { weekStart: Date }) {
  const [viewMode, setViewMode] = useState<'entry' | 'tech'>('tech');

  const workshopId = useWorkshopId();
  const weekDates  = Array.from({ length: 6 }, (_, i) => addDays(weekStart, i));
  const from = formatDate(weekDates[0]);
  const to   = formatDate(weekDates[5]);

  const { data: schedule, isLoading, isError } = useBodyshopSchedule(workshopId, from, to);
  const { data: weekCap = {} }                 = useBodyshopWeekCapacity(from, to);
  const { data: technicians = [] }             = useTechnicians();

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Cargando agenda...</div>;
  }
  if (isError || !schedule) {
    return <div className="flex items-center justify-center py-20 text-red-500 text-sm">Error al cargar la agenda.</div>;
  }

  const { entries, kpis } = schedule;

  return (
    <div className="space-y-3">
      {/* KPI Banner */}
      {kpis && <KpiBanner kpis={kpis} entries={entries} />}

      {/* Toggle de vista */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 font-medium">Vista:</span>
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
          <button
            onClick={() => setViewMode('tech')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'tech' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Por técnico
          </button>
          <button
            onClick={() => setViewMode('entry')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'entry' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <LayoutList className="h-3.5 w-3.5" />
            Por vehículo
          </button>
        </div>
        <span className="text-[11px] text-slate-400">
          {entries.length} vehículo{entries.length !== 1 ? 's' : ''} en taller esta semana
        </span>
      </div>

      {viewMode === 'tech'
        ? <TechGantt  entries={entries} weekDates={weekDates} technicians={technicians} weekCap={weekCap} />
        : <EntryGantt entries={entries} weekDates={weekDates} weekCap={weekCap} />
      }
    </div>
  );
}
