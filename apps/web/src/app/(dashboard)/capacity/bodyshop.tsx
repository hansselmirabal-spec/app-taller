'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Layers, AlertTriangle, ChevronDown, ChevronUp, User, X } from 'lucide-react';
import { addWeeks, subWeeks, startOfWeek, addDays, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useBodyshopWeekCapacity } from '@/hooks/use-bodyshop';
import { useTechnicians } from '@/hooks/use-technicians';
import { formatDate } from '@/lib/utils';
import type { ProcessCapacity, CapacityStatus, Technician, BodyshopTechDayCapacity, BodyshopDayCapacity } from '@/types';

// ─── Constantes ───────────────────────────────────────────────────────────────

const SPECIALTY_TO_PROCESS: Record<string, 'BODYWORK' | 'PREP' | 'PAINT'> = {
  'CARROCERIA': 'BODYWORK',
  'BODYWORK':   'BODYWORK',
  'CHAPERIA':   'BODYWORK',
  'PREPARACION':'PREP',
  'PREP':       'PREP',
  'PINTURA':    'PAINT',
  'PAINT':      'PAINT',
};

const PROCESSES: {
  key: 'BODYWORK' | 'PREP' | 'PAINT';
  label: string;
  color: string;
  accent: string;
  textColor: string;
  badgeBg: string;
  rowBg: string;
  subRowBg: string;
  borderColor: string;
  barColor: string;
}[] = [
  {
    key: 'BODYWORK', label: 'Chapería',
    color: '#3b82f6', accent: 'blue',
    textColor: 'text-blue-700', badgeBg: 'bg-blue-100 text-blue-700',
    rowBg: 'bg-blue-50/40', subRowBg: 'bg-blue-50/20',
    borderColor: 'border-blue-100', barColor: 'bg-blue-500',
  },
  {
    key: 'PREP', label: 'Preparación',
    color: '#8b5cf6', accent: 'violet',
    textColor: 'text-violet-700', badgeBg: 'bg-violet-100 text-violet-700',
    rowBg: 'bg-violet-50/40', subRowBg: 'bg-violet-50/20',
    borderColor: 'border-violet-100', barColor: 'bg-violet-500',
  },
  {
    key: 'PAINT', label: 'Pintura',
    color: '#f97316', accent: 'orange',
    textColor: 'text-orange-700', badgeBg: 'bg-orange-100 text-orange-700',
    rowBg: 'bg-orange-50/40', subRowBg: 'bg-orange-50/20',
    borderColor: 'border-orange-100', barColor: 'bg-orange-500',
  },
];

const PROCESS_MAP = Object.fromEntries(PROCESSES.map(p => [p.key, p])) as Record<'BODYWORK' | 'PREP' | 'PAINT', typeof PROCESSES[0]>;

const STATUS_STYLES: Record<CapacityStatus, string> = {
  OK:         'bg-emerald-50 border-emerald-200 text-emerald-700',
  RISK:       'bg-amber-50  border-amber-200  text-amber-700',
  OVERLOADED: 'bg-red-100   border-red-300    text-red-800',
};

const STATUS_LABEL: Record<CapacityStatus, string> = {
  OK:         'OK',
  RISK:       'Riesgo',
  OVERLOADED: 'Saturado',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function techOccupancyStyle(rate: number): string {
  if (rate >= 1.0) return 'text-red-700 bg-red-50';
  if (rate >= 0.85) return 'text-amber-700 bg-amber-50';
  if (rate > 0) return 'text-emerald-700 bg-emerald-50';
  return 'text-slate-400 bg-slate-50';
}

function occupancyBarColor(rate: number): string {
  if (rate >= 1.0) return 'bg-red-500';
  if (rate >= 0.85) return 'bg-amber-500';
  return 'bg-emerald-500';
}

// ─── Popup de detalle de capacidad ───────────────────────────────────────────

type PopupTarget = {
  dateStr: string;
  processKey: 'BODYWORK' | 'PREP' | 'PAINT' | 'GLOBAL';
  x: number;
  y: number;
  fromBottom: boolean;
};

function CapacityDetailPopup({
  target,
  dayCap,
  onClose,
}: {
  target: PopupTarget;
  dayCap: BodyshopDayCapacity;
  onClose: () => void;
}) {
  const popupRef = useRef<HTMLDivElement>(null);
  const isGlobal = target.processKey === 'GLOBAL';

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Datos para el popup
  const globalPct  = Math.round(dayCap.globalOccupancyRate * 100);
  const totalComm  = dayCap.commercializableTotal;
  const totalOcc   = PROCESSES.reduce((s, p) => s + (dayCap.byProcess[p.key]?.occupiedHours ?? 0), 0);

  // Técnicos ordenados por horas usadas desc
  const sortedTechs = [...dayCap.byTechnician].sort((a, b) => b.usedHours - a.usedHours);

  const processesToShow = isGlobal
    ? PROCESSES
    : PROCESSES.filter(p => p.key === target.processKey);

  const dateLabel = format(new Date(target.dateStr + 'T12:00:00'), "EEEE d MMM", { locale: es });

  return (
    <div
      ref={popupRef}
      className="fixed z-50 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
      style={
        target.fromBottom
          ? { bottom: window.innerHeight - target.y + 6, left: Math.min(target.x, window.innerWidth - 296) }
          : { top: target.y + 6, left: Math.min(target.x, window.innerWidth - 296) }
      }
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 capitalize">{dateLabel}</p>
          <p className="text-xs font-bold text-slate-700">
            {isGlobal ? 'Resumen global' : PROCESS_MAP[target.processKey as 'BODYWORK' | 'PREP' | 'PAINT']?.label}
          </p>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-slate-200 transition-colors">
          <X className="h-3.5 w-3.5 text-slate-400" />
        </button>
      </div>

      {/* Totales globales (solo si GLOBAL) */}
      {isGlobal && (
        <div className="px-4 pt-3 pb-2 border-b border-slate-100">
          <div className="flex items-end justify-between mb-1.5">
            <span className="text-2xl font-black text-slate-900">{globalPct}%</span>
            <span className="text-xs text-slate-400 tabular-nums">{Math.round(totalOcc * 10) / 10}h de {Math.round(totalComm * 10) / 10}h</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${occupancyBarColor(dayCap.globalOccupancyRate)}`}
              style={{ width: `${Math.min(globalPct, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Por proceso */}
      <div className="px-4 py-2 space-y-3">
        {processesToShow.map(proc => {
          const procCap = dayCap.byProcess[proc.key];
          if (!procCap) return null;
          const pct = Math.min(Math.round(procCap.occupancyRate * 100), 100);
          const techsForProc = sortedTechs.filter(t => t.process === proc.key);

          return (
            <div key={proc.key}>
              {/* Proceso header */}
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${proc.badgeBg}`}>
                  {proc.label}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-900">{pct}%</span>
                  <span className="text-[10px] text-slate-400 tabular-nums">
                    {procCap.occupiedHours}h / {procCap.commercializableHours}h
                  </span>
                </div>
              </div>
              {/* Barra de proceso */}
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full ${occupancyBarColor(procCap.occupancyRate)}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>

              {/* Técnicos de este proceso */}
              {techsForProc.length > 0 ? (
                <div className="space-y-1.5">
                  {techsForProc.map(tech => {
                    const usedRate = tech.availableHours > 0 ? tech.usedHours / tech.availableHours : 0;
                    const techPct  = Math.round(usedRate * 100);
                    const freeH    = Math.max(0, tech.availableHours - tech.usedHours);
                    const isAbsent = tech.availableHours === 0 && tech.isWorkingDay;
                    return (
                      <div key={tech.technicianId} className="flex items-center gap-2">
                        <div className="h-5 w-5 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                          <span className="text-[9px] font-bold text-slate-500">
                            {tech.technicianName.charAt(0)}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-[10px] font-semibold text-slate-700 truncate">
                              {tech.technicianName.split(' ')[0]}
                              {tech.absenceType === 'half' || tech.absenceType === 'holiday'
                                ? <span className="ml-1 text-[8px] text-amber-600">½J</span>
                                : null}
                            </span>
                            {isAbsent ? (
                              <span className="text-[9px] text-slate-400">Ausente</span>
                            ) : (
                              <span className={`text-[9px] font-semibold tabular-nums px-1 rounded ${techOccupancyStyle(usedRate)}`}>
                                {tech.usedHours}h · {freeH}h lib.
                              </span>
                            )}
                          </div>
                          {!isAbsent && (
                            <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${occupancyBarColor(usedRate)}`}
                                style={{ width: `${Math.min(techPct, 100)}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[10px] text-slate-400 italic">Sin operarios asignados</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Pie: trabajos en taller */}
      {dayCap.entries.length > 0 && (
        <div className="px-4 py-2 border-t border-slate-100 bg-slate-50">
          <p className="text-[10px] text-slate-500">
            <span className="font-semibold text-slate-700">{dayCap.entries.length}</span> trabajo{dayCap.entries.length !== 1 ? 's' : ''} en taller
            {(dayCap.pendingBudgets ?? 0) > 0 && (
              <> · <span className="font-semibold text-amber-600">{dayCap.pendingBudgets}</span> presupuesto{dayCap.pendingBudgets !== 1 ? 's' : ''} pend.</>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Cell: proceso agregado ───────────────────────────────────────────────────

function ProcessCell({
  proc,
  isToday,
  isSunday,
  onClick,
}: {
  proc: ProcessCapacity | null;
  isToday: boolean;
  isSunday: boolean;
  onClick?: (e: React.MouseEvent) => void;
}) {
  if (isSunday) {
    return (
      <div className="h-[72px] rounded-lg border border-slate-100 bg-slate-50 flex items-center justify-center">
        <span className="text-xs text-slate-300">Dom.</span>
      </div>
    );
  }
  if (!proc) {
    return <div className="h-[72px] rounded-lg border border-slate-100 bg-slate-50" />;
  }

  const pct = Math.min(Math.round(proc.occupancyRate * 100), 100);
  const overflowPct = proc.occupancyRate > 1 ? Math.round((proc.occupancyRate - 1) * 100) : 0;

  return (
    <div
      onClick={onClick}
      className={`h-[72px] rounded-lg border px-2.5 py-1.5 flex flex-col justify-between transition-all ${STATUS_STYLES[proc.status]} ${isToday ? 'ring-1 ring-blue-300' : ''} ${onClick ? 'cursor-pointer hover:brightness-95 hover:shadow-sm' : ''}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wide opacity-80">
          {STATUS_LABEL[proc.status]}
        </span>
        <span className="text-xs font-bold tabular-nums">{pct}%</span>
      </div>
      <div>
        <div className="h-1.5 rounded-full bg-current opacity-15 overflow-hidden">
          <div
            className="h-full rounded-full bg-current opacity-70"
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        {overflowPct > 0 ? (
          <p className="text-[10px] mt-0.5 opacity-70">+{overflowPct}% sobre cap.</p>
        ) : (
          <p className="text-[10px] mt-0.5 opacity-60">{proc.availableHours}h libres</p>
        )}
      </div>
      <p className="text-[10px] opacity-50 tabular-nums">
        {proc.occupiedHours}h / {proc.commercializableHours}h
      </p>
    </div>
  );
}

// ─── Cell: operario individual ────────────────────────────────────────────────

function TechnicianCell({
  techCap,
  isToday,
  isSunday,
  processColor,
}: {
  techCap: BodyshopTechDayCapacity | null;
  isToday: boolean;
  isSunday: boolean;
  processColor: string;
}) {
  if (isSunday) {
    return <div className="h-[52px] rounded-lg border border-slate-100 bg-slate-50/50" />;
  }
  if (!techCap) {
    return <div className="h-[52px] rounded-lg border border-dashed border-slate-200 bg-slate-50/30" />;
  }

  const isAbsent = techCap.availableHours === 0 && techCap.isWorkingDay;
  const isHalfDay = techCap.absenceType === 'half' || techCap.absenceType === 'holiday';
  const freeHours = Math.max(0, techCap.availableHours - techCap.usedHours);
  const usedRate = techCap.availableHours > 0 ? techCap.usedHours / techCap.availableHours : 0;
  const style = techOccupancyStyle(usedRate);

  return (
    <div
      className={`h-[52px] rounded-lg border px-2 py-1.5 flex flex-col justify-between ${
        isAbsent
          ? 'bg-slate-100 border-slate-200'
          : isHalfDay
          ? 'bg-amber-50/60 border-amber-200'
          : `border-slate-200 ${isToday ? 'ring-1 ring-blue-200' : ''} bg-white`
      }`}
    >
      {isAbsent ? (
        <div className="flex items-center justify-center h-full">
          <span className="text-[10px] text-slate-400 font-medium">Ausente</span>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-bold tabular-nums px-1 rounded ${style}`}>
              {Math.round(usedRate * 100)}%
            </span>
            {isHalfDay && (
              <span className="text-[9px] font-semibold text-amber-600 bg-amber-100 px-1 rounded">½J</span>
            )}
            <span className="text-[10px] text-slate-400 tabular-nums">{freeHours}h lib.</span>
          </div>
          <div className="h-1 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(usedRate * 100, 100)}%`,
                background: processColor,
                opacity: usedRate >= 1 ? 1 : 0.7,
              }}
            />
          </div>
          <p className="text-[9px] text-slate-400 tabular-nums">
            {techCap.usedHours}h usadas / {techCap.availableHours}h disp.
          </p>
        </>
      )}
    </div>
  );
}

// ─── Page principal ───────────────────────────────────────────────────────────

export default function BodyshopCapacityPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    BODYWORK: true, PREP: true, PAINT: true,
  });
  const [popup, setPopup] = useState<PopupTarget | null>(null);

  const weekDates = Array.from({ length: 6 }, (_, i) => addDays(weekStart, i));
  const from = formatDate(weekDates[0]);
  const to   = formatDate(weekDates[5]);
  const todayStr = formatDate(new Date());

  const { data: weekCap   = {}, isLoading } = useBodyshopWeekCapacity(from, to);
  const { data: technicians = [] }           = useTechnicians();

  // Mapear técnicos a su proceso según especialidad
  const techsByProcess: Record<'BODYWORK' | 'PREP' | 'PAINT', Technician[]> = {
    BODYWORK: [], PREP: [], PAINT: [],
  };
  for (const tech of technicians) {
    const processKey = SPECIALTY_TO_PROCESS[(tech.specialty ?? '').toUpperCase()];
    if (processKey) techsByProcess[processKey].push(tech);
  }

  // Stats de la semana
  const allDays        = Object.values(weekCap);
  const totalEntries   = allDays.reduce((s, d) => s + d.entries.length, 0);
  const overloadedDays = allDays.filter(d => d.globalStatus === 'OVERLOADED').length;
  const riskDays       = allDays.filter(d => d.globalStatus === 'RISK').length;
  const avgOccupancy   = allDays.length > 0
    ? Math.round(allDays.reduce((s, d) => s + d.globalOccupancyRate, 0) / allDays.length * 100)
    : 0;

  const toggle = (key: string) => setExpanded(p => ({ ...p, [key]: !p[key] }));

  const openPopup = useCallback((
    e: React.MouseEvent,
    dateStr: string,
    processKey: PopupTarget['processKey'],
  ) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const fromBottom = rect.bottom + 320 > window.innerHeight;
    setPopup({ dateStr, processKey, x: rect.left, y: fromBottom ? rect.top : rect.bottom, fromBottom });
  }, []);

  const closePopup = useCallback(() => setPopup(null), []);

  // Cerrar popup al cambiar semana
  useEffect(() => { setPopup(null); }, [weekStart]);

  const COLS = `140px repeat(6, 1fr)`;

  return (
    <div className="flex flex-col h-full bg-slate-50" onClick={closePopup}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900">Capacidad Carrocería</h1>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">BODYSHOP</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <button onClick={e => { e.stopPropagation(); setWeekStart(subWeeks(weekStart, 1)); }} className="p-0.5 rounded hover:bg-slate-100">
                <ChevronLeft className="h-4 w-4 text-slate-400" />
              </button>
              <span className="text-xs font-medium text-slate-600">
                {format(weekDates[0], "d MMM", { locale: es })} — {format(weekDates[5], "d MMM yyyy", { locale: es })}
              </span>
              <button onClick={e => { e.stopPropagation(); setWeekStart(addWeeks(weekStart, 1)); }} className="p-0.5 rounded hover:bg-slate-100">
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
              <button
                onClick={e => { e.stopPropagation(); setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 })); }}
                className="text-xs text-blue-600 font-medium hover:underline ml-1"
              >
                Hoy
              </button>
            </div>
          </div>
          <div className="flex items-center gap-5 text-sm">
            <div className="text-center">
              <p className="font-bold text-slate-900">{totalEntries}</p>
              <p className="text-xs text-slate-500">Trabajos sem.</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-slate-900">{avgOccupancy}%</p>
              <p className="text-xs text-slate-500">Ocup. media</p>
            </div>
            {riskDays > 0 && (
              <div className="flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs font-semibold text-amber-700">{riskDays} días en riesgo</span>
              </div>
            )}
            {overloadedDays > 0 && (
              <div className="flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                <span className="text-xs font-semibold text-red-700">{overloadedDays} días saturados</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Grid ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-6" onClick={closePopup}>
        {isLoading ? (
          <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Cargando...</div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

            {/* ── Encabezado de días ──────────────────────────────────────── */}
            <div className="grid border-b border-slate-200 bg-slate-50" style={{ gridTemplateColumns: COLS }}>
              <div className="px-4 py-3 flex items-center gap-2 border-r border-slate-200">
                <Layers className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Proceso</span>
              </div>
              {weekDates.map(d => {
                const dateStr = formatDate(d);
                const isToday = dateStr === todayStr;
                const dayCap  = weekCap[dateStr];
                return (
                  <div key={dateStr} className={`px-3 py-2 text-center border-r border-slate-200 last:border-r-0 ${isToday ? 'bg-blue-50/40' : ''}`}>
                    <p className={`text-xs font-medium capitalize ${isToday ? 'text-blue-600' : 'text-slate-500'}`}>
                      {format(d, 'EEE', { locale: es })}
                    </p>
                    <p className={`text-base font-bold ${isToday ? 'text-blue-700' : 'text-slate-900'}`}>
                      {format(d, 'd')}
                    </p>
                    {dayCap && (
                      <span className={`inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${STATUS_STYLES[dayCap.globalStatus]}`}>
                        {dayCap.entries.length > 0 ? `${dayCap.entries.length} trab.` : '—'}
                      </span>
                    )}
                    {(dayCap?.pendingBudgets ?? 0) > 0 && (
                      <span className="block mt-0.5 text-[9px] font-semibold text-amber-600">
                        +{dayCap!.pendingBudgets} pres.
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── Filas de procesos + operarios ───────────────────────────── */}
            {PROCESSES.map(proc => {
              const isOpen   = expanded[proc.key];
              const techList = techsByProcess[proc.key];

              return (
                <div key={proc.key} className="border-b border-slate-200 last:border-b-0">

                  {/* Fila proceso (header del grupo) */}
                  <div className={`grid ${proc.rowBg}`} style={{ gridTemplateColumns: COLS }}>
                    {/* Label con toggle */}
                    <div
                      className={`flex items-center justify-between px-3 py-2 border-r ${proc.borderColor} cursor-pointer select-none hover:brightness-95 transition-all`}
                      onClick={e => { e.stopPropagation(); toggle(proc.key); }}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-1 rounded-md ${proc.badgeBg}`}>
                          {proc.label}
                        </span>
                      </div>
                      <button className={`p-0.5 rounded ${proc.textColor}`}>
                        {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                    </div>

                    {/* Celdas del proceso por día */}
                    {weekDates.map(d => {
                      const dateStr = formatDate(d);
                      const isToday = dateStr === todayStr;
                      const isSunday = d.getDay() === 0;
                      const dayCap  = weekCap[dateStr];
                      const procCap = dayCap ? dayCap.byProcess[proc.key] : null;

                      return (
                        <div
                          key={dateStr}
                          className={`px-2 py-2 border-r ${proc.borderColor} last:border-r-0 ${isToday ? 'bg-blue-50/10' : ''}`}
                        >
                          <ProcessCell
                            proc={procCap}
                            isToday={isToday}
                            isSunday={isSunday}
                            onClick={dayCap && !isSunday ? e => openPopup(e, dateStr, proc.key) : undefined}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Sub-filas de operarios (colapsables) */}
                  {isOpen && techList.map((tech, tIdx) => {
                    const isLast = tIdx === techList.length - 1;
                    return (
                      <div
                        key={tech.id}
                        className={`grid ${proc.subRowBg} ${isLast ? '' : `border-b ${proc.borderColor}`}`}
                        style={{ gridTemplateColumns: COLS }}
                      >
                        <div className={`flex items-center gap-2 pl-6 pr-3 py-1.5 border-r ${proc.borderColor}`}>
                          <div className="flex-shrink-0 h-5 w-5 rounded-full bg-slate-200 flex items-center justify-center">
                            <User className="h-3 w-3 text-slate-500" />
                          </div>
                          <p className="text-xs text-slate-600 font-medium truncate leading-tight">
                            {tech.name.split(' ')[0]}
                            <span className="block text-[9px] text-slate-400 font-normal truncate">
                              {tech.name.split(' ').slice(1).join(' ')}
                            </span>
                          </p>
                        </div>
                        {weekDates.map(d => {
                          const dateStr  = formatDate(d);
                          const isToday  = dateStr === todayStr;
                          const isSunday = d.getDay() === 0;
                          const dayCaps  = weekCap[dateStr]?.byTechnician ?? [];
                          const techCap  = dayCaps.find(c => c.technicianId === tech.id) ?? null;
                          return (
                            <div
                              key={dateStr}
                              className={`px-2 py-1.5 border-r ${proc.borderColor} last:border-r-0 ${isToday ? 'bg-blue-50/10' : ''}`}
                            >
                              <TechnicianCell
                                techCap={techCap}
                                isToday={isToday}
                                isSunday={isSunday}
                                processColor={proc.color}
                              />
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}

                  {/* Estado vacío */}
                  {isOpen && techList.length === 0 && (
                    <div className={`grid ${proc.subRowBg}`} style={{ gridTemplateColumns: COLS }}>
                      <div className={`col-span-7 pl-6 py-2 border-t ${proc.borderColor}`}>
                        <p className="text-xs text-slate-400 italic">Sin operarios asignados a este proceso</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* ── Fila global ──────────────────────────────────────────────── */}
            <div className="grid bg-slate-100 border-t border-slate-300" style={{ gridTemplateColumns: COLS }}>
              <div className="px-4 py-2.5 border-r border-slate-300 flex items-center">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Global</span>
              </div>
              {weekDates.map(d => {
                const dateStr  = formatDate(d);
                const dayCap   = weekCap[dateStr];
                const isSunday = d.getDay() === 0;
                return (
                  <div key={dateStr} className="px-2 py-2.5 border-r border-slate-300 last:border-r-0 flex items-center justify-center">
                    {!isSunday && dayCap && (
                      <button
                        onClick={e => openPopup(e, dateStr, 'GLOBAL')}
                        className={`text-xs font-bold px-2.5 py-1 rounded-full border transition-all hover:scale-105 hover:shadow-sm ${STATUS_STYLES[dayCap.globalStatus]}`}
                      >
                        {Math.round(dayCap.globalOccupancyRate * 100)}%
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

          </div>
        )}

        {/* Leyenda */}
        <div className="mt-4 flex items-center gap-5">
          <p className="text-xs text-slate-400 font-medium">Leyenda:</p>
          {[
            { style: STATUS_STYLES.OK,         label: 'Capacidad disponible' },
            { style: STATUS_STYLES.RISK,        label: 'En riesgo (≥85%)' },
            { style: STATUS_STYLES.OVERLOADED,  label: 'Saturado (≥100%)' },
          ].map(({ style, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={`h-3 w-3 rounded border ${style}`} />
              <span className="text-xs text-slate-500">{label}</span>
            </div>
          ))}
          <span className="text-slate-300">·</span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400">½J</span>
            <span className="text-xs text-slate-500">Media jornada</span>
          </div>
          <span className="text-slate-300">·</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-400">Click en celda</span>
            <span className="text-xs text-slate-500">→ ver detalle de técnicos</span>
          </div>
        </div>
      </div>

      {/* ── Popup flotante ───────────────────────────────────────────────── */}
      {popup && weekCap[popup.dateStr] && (
        <CapacityDetailPopup
          target={popup}
          dayCap={weekCap[popup.dateStr]}
          onClose={closePopup}
        />
      )}
    </div>
  );
}
