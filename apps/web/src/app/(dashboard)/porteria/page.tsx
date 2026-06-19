'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { Layout as RGLLayout } from 'react-grid-layout';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend,
} from 'recharts';
import {
  Plus, Settings2, Trash2, X, BarChart3, TrendingUp,
  PieChart as PieIcon, Table2, Hash, Pencil, CheckCircle2,
  Filter, GripVertical, ArrowUpRight, ArrowDownRight,
  Activity, Target, Users, TrendingDown,
} from 'lucide-react';
import {
  format, subDays, parseISO, eachDayOfInterval,
  differenceInDays, addDays,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { useAppointmentsByRange } from '@/hooks/use-appointments';
import { useTechnicians } from '@/hooks/use-technicians';
import { useServiceTypes } from '@/hooks/use-service-types';
import { formatDate } from '@/lib/utils';
import type { Appointment } from '@/types';

import 'react-grid-layout/css/styles.css';

// ─── GridLayout (SSR-safe) ───────────────────────────────────────────────────
const GridLayout = dynamic(
  () => import('react-grid-layout').then(m => ({ default: m.GridLayout })),
  { ssr: false }
);

// ─── Constantes ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'reporteria_v3';
const COLS = 12;
const ROW_HEIGHT = 60;

// Jornada laboral: 08:00-18:00 = 10h disponibles por técnico por día
const HOURS_PER_TECH_DAY = 10;
// Horas del día para el heatmap (08 a 17 inclusive = 10 slots)
const HEATMAP_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
const HEATMAP_DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// Paleta semántica (Tableau-inspired)
const COLOR = {
  blue:   '#3b82f6',
  green:  '#22c55e',
  amber:  '#f59e0b',
  red:    '#ef4444',
  violet: '#8b5cf6',
  slate:  '#64748b',
};

const STATUS_COLORS: Record<string, string> = {
  scheduled:   COLOR.blue,
  in_progress: COLOR.amber,
  done:        COLOR.green,
  cancelled:   COLOR.red,
};
const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Agendado', in_progress: 'En proceso', done: 'Listo', cancelled: 'Cancelado',
};
const STATUS_ROW_BG: Record<string, string> = {
  scheduled:   'rgba(59,130,246,0.06)',
  in_progress: 'rgba(245,158,11,0.08)',
  done:        'rgba(34,197,94,0.06)',
  cancelled:   'rgba(239,68,68,0.06)',
};

// ─── Tipos ────────────────────────────────────────────────────────────────────

type WidgetType = 'kpi_occupancy' | 'kpi_completed' | 'kpi_cancellation' | 'kpi_throughput'
  | 'heatmap' | 'bar_tech' | 'donut_service' | 'line_trend' | 'table_recent';

interface GridPos { x: number; y: number; w: number; h: number; }

interface Widget {
  id: string;
  type: WidgetType;
  title: string;
  color: string;
  layout: GridPos;
}

interface KpiResult {
  value: number;
  label: string;
  delta: number;       // % diferencia vs período anterior
  deltaAbs: number;    // valor absoluto anterior
  sparkline: number[]; // 7 puntos de tendencia
  target?: number;     // objetivo (0-100 para %)
  unit?: string;
  isPercent?: boolean;
}

interface TechProductivity {
  name: string;
  completed: number;
  occupancy: number; // 0-100
}

interface HeatmapCell {
  day: number;   // 1=Lun..6=Sáb
  hour: number;  // 8..17
  count: number;
}

// ─── Catálogo de widgets disponibles ─────────────────────────────────────────

const CATALOG: Array<{
  type: WidgetType;
  label: string;
  defaultTitle: string;
  defaultLayout: GridPos;
  defaultColor: string;
  icon: React.ReactNode;
}> = [
  { type:'kpi_occupancy',   label:'Tasa de Ocupación',    defaultTitle:'Tasa de Ocupación',    defaultLayout:{x:0,y:0,w:3,h:2}, defaultColor:COLOR.blue,   icon:<Activity className="h-4 w-4"/> },
  { type:'kpi_completed',   label:'Turnos Completados',   defaultTitle:'Turnos Completados',   defaultLayout:{x:0,y:0,w:3,h:2}, defaultColor:COLOR.green,  icon:<CheckCircle2 className="h-4 w-4"/> },
  { type:'kpi_cancellation',label:'Tasa de Cancelación',  defaultTitle:'Tasa de Cancelación',  defaultLayout:{x:0,y:0,w:3,h:2}, defaultColor:COLOR.red,    icon:<TrendingDown className="h-4 w-4"/> },
  { type:'kpi_throughput',  label:'Throughput Diario',    defaultTitle:'Throughput Diario',    defaultLayout:{x:0,y:0,w:3,h:2}, defaultColor:COLOR.violet, icon:<Target className="h-4 w-4"/> },
  { type:'heatmap',         label:'Heatmap de Demanda',   defaultTitle:'Demanda Horaria',      defaultLayout:{x:0,y:0,w:8,h:5}, defaultColor:COLOR.blue,   icon:<BarChart3 className="h-4 w-4"/> },
  { type:'bar_tech',        label:'Productividad Técnicos',defaultTitle:'Productividad por Técnico',defaultLayout:{x:0,y:0,w:6,h:4},defaultColor:COLOR.blue, icon:<Users className="h-4 w-4"/> },
  { type:'donut_service',   label:'Mix de Servicios',     defaultTitle:'Mix de Servicios',     defaultLayout:{x:0,y:0,w:6,h:4}, defaultColor:COLOR.violet, icon:<PieIcon className="h-4 w-4"/> },
  { type:'line_trend',      label:'Tendencia Diaria',     defaultTitle:'Tendencia Diaria',     defaultLayout:{x:0,y:0,w:12,h:4},defaultColor:COLOR.blue,   icon:<TrendingUp className="h-4 w-4"/> },
  { type:'table_recent',    label:'Últimos Turnos',       defaultTitle:'Últimos Turnos',       defaultLayout:{x:0,y:0,w:12,h:5},defaultColor:COLOR.slate,  icon:<Table2 className="h-4 w-4"/> },
];

// ─── Layout default estilo Salesforce CRM Analytics ──────────────────────────
// Fila 1: 4 KPI cards (3+3+3+3)
// Fila 2: Heatmap (8) + KPI Cancelación grande (4)
// Fila 3: Bar Técnicos (6) + Donut Servicios (6)
// Fila 4: Línea tendencia (12)
// Fila 5: Tabla (12)

const DEFAULT_WIDGETS: Widget[] = [
  { id:'w1', type:'kpi_occupancy',    title:'Tasa de Ocupación',      color:COLOR.blue,   layout:{x:0,  y:0,  w:3,  h:3} },
  { id:'w2', type:'kpi_completed',    title:'Turnos Completados',     color:COLOR.green,  layout:{x:3,  y:0,  w:3,  h:3} },
  { id:'w3', type:'kpi_cancellation', title:'Tasa de Cancelación',    color:COLOR.red,    layout:{x:6,  y:0,  w:3,  h:3} },
  { id:'w4', type:'kpi_throughput',   title:'Throughput Diario',      color:COLOR.violet, layout:{x:9,  y:0,  w:3,  h:3} },
  { id:'w5', type:'heatmap',          title:'Demanda Horaria por Hora y Día', color:COLOR.blue, layout:{x:0, y:3, w:8, h:5} },
  { id:'w6', type:'bar_tech',         title:'Productividad por Técnico', color:COLOR.blue, layout:{x:8, y:3, w:4, h:5} },
  { id:'w7', type:'donut_service',    title:'Mix de Servicios (tiempo)',  color:COLOR.violet, layout:{x:0, y:8, w:5, h:5} },
  { id:'w8', type:'line_trend',       title:'Tendencia de Turnos Diaria', color:COLOR.blue,   layout:{x:5, y:8, w:7, h:5} },
  { id:'w9', type:'table_recent',     title:'Historial de Turnos',        color:COLOR.slate,  layout:{x:0, y:13,w:12,h:6} },
];

// ─── Utilidades de cálculo ────────────────────────────────────────────────────

/**
 * Convierte "HH:MM" a minutos desde medianoche.
 */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Calcula las horas usadas de un appointment (timeEnd - timeStart).
 */
function appointmentHours(a: Appointment): number {
  return (toMinutes(a.timeEnd) - toMinutes(a.timeStart)) / 60;
}

/**
 * Días laborables (no domingo) en un rango.
 */
function workingDaysInRange(from: string, to: string): number {
  const days = eachDayOfInterval({
    start: parseISO(from + 'T12:00:00'),
    end:   parseISO(to   + 'T12:00:00'),
  });
  return days.filter(d => d.getDay() !== 0).length;
}

/**
 * Horas disponibles totales = técnicos activos × días laborables × HOURS_PER_TECH_DAY.
 */
function totalAvailableHours(techCount: number, from: string, to: string): number {
  return techCount * workingDaysInRange(from, to) * HOURS_PER_TECH_DAY;
}

/**
 * Genera los últimos N valores diarios de una métrica para el sparkline.
 * Devuelve array de 7 números.
 */
function buildSparkline(
  appointments: Appointment[],
  to: string,
  techCount: number,
  metric: 'occupancy' | 'completed' | 'cancelled' | 'throughput',
): number[] {
  const points: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = format(subDays(parseISO(to + 'T12:00:00'), i), 'yyyy-MM-dd');
    const dayAppts = appointments.filter(a => a.date === day);

    let val = 0;
    if (metric === 'occupancy') {
      const usedH = dayAppts.filter(a => a.status !== 'cancelled').reduce((s, a) => s + appointmentHours(a), 0);
      const availH = techCount * HOURS_PER_TECH_DAY;
      val = availH > 0 ? Math.round((usedH / availH) * 100) : 0;
    } else if (metric === 'completed') {
      val = dayAppts.filter(a => a.status === 'done').length;
    } else if (metric === 'cancelled') {
      const total = dayAppts.length;
      val = total > 0 ? Math.round((dayAppts.filter(a => a.status === 'cancelled').length / total) * 100) : 0;
    } else if (metric === 'throughput') {
      const done = dayAppts.filter(a => a.status === 'done').length;
      val = techCount > 0 ? parseFloat((done / techCount).toFixed(1)) : 0;
    }
    points.push(val);
  }
  return points;
}

// ─── Hook principal de datos ──────────────────────────────────────────────────

function useReporteriaData(
  from: string,
  to: string,
  filterTechId: string,
  filterServiceId: string,
) {
  // Período actual
  const { data: rawCurrent = [] } = useAppointmentsByRange(from, to);

  // Período anterior (misma duración)
  const periodDays = differenceInDays(
    parseISO(to + 'T12:00:00'),
    parseISO(from + 'T12:00:00'),
  ) + 1;
  const prevTo   = format(subDays(parseISO(from + 'T12:00:00'), 1), 'yyyy-MM-dd');
  const prevFrom = format(subDays(parseISO(from + 'T12:00:00'), periodDays), 'yyyy-MM-dd');
  const { data: rawPrev = [] } = useAppointmentsByRange(prevFrom, prevTo);

  const { data: technicians = [] } = useTechnicians();
  const { data: serviceTypes = [] } = useServiceTypes();

  const activeTechs = technicians.filter(t => t.active);

  // Aplicar filtros al período actual
  const current = useMemo(() => {
    let list = rawCurrent;
    if (filterTechId)    list = list.filter(a => a.technicianId === filterTechId);
    if (filterServiceId) list = list.filter(a => a.serviceTypeId === filterServiceId);
    return list;
  }, [rawCurrent, filterTechId, filterServiceId]);

  // Aplicar filtros al período anterior
  const prev = useMemo(() => {
    let list = rawPrev;
    if (filterTechId)    list = list.filter(a => a.technicianId === filterTechId);
    if (filterServiceId) list = list.filter(a => a.serviceTypeId === filterServiceId);
    return list;
  }, [rawPrev, filterTechId, filterServiceId]);

  const techCount = filterTechId ? 1 : activeTechs.length;

  // ── KPI: Tasa de Ocupación ─────────────────────────────────────────────────
  const kpiOccupancy = useMemo((): KpiResult => {
    const usedH    = current.filter(a => a.status !== 'cancelled').reduce((s,a) => s + appointmentHours(a), 0);
    const availH   = totalAvailableHours(techCount, from, to);
    const value    = availH > 0 ? Math.round((usedH / availH) * 100) : 0;

    const prevUsed = prev.filter(a => a.status !== 'cancelled').reduce((s,a) => s + appointmentHours(a), 0);
    const prevAvail = totalAvailableHours(techCount, prevFrom, prevTo);
    const prevVal  = prevAvail > 0 ? Math.round((prevUsed / prevAvail) * 100) : 0;
    const delta    = prevVal > 0 ? Math.round(((value - prevVal) / prevVal) * 100) : 0;

    return {
      value,
      label: `de ${availH.toFixed(0)}h disponibles`,
      delta,
      deltaAbs: prevVal,
      sparkline: buildSparkline(current, to, techCount, 'occupancy'),
      target: 80,
      isPercent: true,
      unit: '%',
    };
  }, [current, prev, techCount, from, to, prevFrom, prevTo]);

  // ── KPI: Turnos Completados ────────────────────────────────────────────────
  const kpiCompleted = useMemo((): KpiResult => {
    const total    = current.length;
    const done     = current.filter(a => a.status === 'done').length;
    const prevDone = prev.filter(a => a.status === 'done').length;
    const delta    = prevDone > 0 ? Math.round(((done - prevDone) / prevDone) * 100) : 0;
    const pct      = total > 0 ? Math.round((done / total) * 100) : 0;

    return {
      value: done,
      label: `${pct}% del total (${total} turnos)`,
      delta,
      deltaAbs: prevDone,
      sparkline: buildSparkline(current, to, techCount, 'completed'),
    };
  }, [current, prev, techCount, to]);

  // ── KPI: Tasa de Cancelación ───────────────────────────────────────────────
  const kpiCancellation = useMemo((): KpiResult => {
    const total      = current.length;
    const cancelled  = current.filter(a => a.status === 'cancelled').length;
    const value      = total > 0 ? parseFloat(((cancelled / total) * 100).toFixed(1)) : 0;

    const prevTotal   = prev.length;
    const prevCancelled = prev.filter(a => a.status === 'cancelled').length;
    const prevVal    = prevTotal > 0 ? parseFloat(((prevCancelled / prevTotal) * 100).toFixed(1)) : 0;
    // Delta negativo es bueno (menos cancelaciones)
    const delta      = prevVal > 0 ? Math.round(((value - prevVal) / prevVal) * 100) : 0;

    return {
      value,
      label: `${cancelled} cancelados de ${total} total`,
      delta,
      deltaAbs: prevVal,
      sparkline: buildSparkline(current, to, techCount, 'cancelled'),
      target: 10, // objetivo: menos del 10%
      isPercent: true,
      unit: '%',
    };
  }, [current, prev, techCount, to]);

  // ── KPI: Throughput Diario ─────────────────────────────────────────────────
  const kpiThroughput = useMemo((): KpiResult => {
    const workDays   = workingDaysInRange(from, to);
    const done       = current.filter(a => a.status === 'done').length;
    const value      = workDays > 0 && techCount > 0
      ? parseFloat((done / workDays / techCount).toFixed(1))
      : 0;

    const prevWorkDays = workingDaysInRange(prevFrom, prevTo);
    const prevDone   = prev.filter(a => a.status === 'done').length;
    const prevVal    = prevWorkDays > 0 && techCount > 0
      ? parseFloat((prevDone / prevWorkDays / techCount).toFixed(1))
      : 0;
    const delta      = prevVal > 0 ? Math.round(((value - prevVal) / prevVal) * 100) : 0;

    return {
      value,
      label: 'turnos/técnico/día',
      delta,
      deltaAbs: prevVal,
      sparkline: buildSparkline(current, to, techCount, 'throughput'),
    };
  }, [current, prev, techCount, from, to, prevFrom, prevTo]);

  // ── Heatmap de demanda horaria ────────────────────────────────────────────
  const heatmapData = useMemo((): HeatmapCell[] => {
    const matrix: Record<string, number> = {};
    current
      .filter(a => a.status !== 'cancelled')
      .forEach(a => {
        const dow = parseISO(a.date + 'T12:00:00').getDay(); // 0=Dom..6=Sáb
        if (dow === 0) return; // sin domingo
        const dayIdx = dow === 6 ? 6 : dow; // 1=Lun..6=Sáb
        const hour = parseInt(a.timeStart.split(':')[0], 10);
        const key = `${dayIdx}_${hour}`;
        matrix[key] = (matrix[key] ?? 0) + 1;
      });

    const cells: HeatmapCell[] = [];
    for (let d = 1; d <= 6; d++) {
      for (const h of HEATMAP_HOURS) {
        cells.push({ day: d, hour: h, count: matrix[`${d}_${h}`] ?? 0 });
      }
    }
    return cells;
  }, [current]);

  // ── Productividad por técnico ─────────────────────────────────────────────
  const techProductivity = useMemo((): TechProductivity[] => {
    const targetTechs = filterTechId
      ? activeTechs.filter(t => t.id === filterTechId)
      : activeTechs;

    const workDays = workingDaysInRange(from, to);

    return targetTechs
      .map(tech => {
        const techAppts = current.filter(a => a.technicianId === tech.id);
        const completed = techAppts.filter(a => a.status === 'done').length;
        const usedH = techAppts
          .filter(a => a.status !== 'cancelled')
          .reduce((s, a) => s + appointmentHours(a), 0);
        const availH = workDays * HOURS_PER_TECH_DAY;
        const occupancy = availH > 0 ? Math.round((usedH / availH) * 100) : 0;
        return {
          name: tech.name.split(' ')[0],
          completed,
          occupancy,
        };
      })
      .sort((a, b) => b.completed - a.completed);
  }, [current, activeTechs, filterTechId, from, to]);

  // ── Mix de servicios (tiempo total, no conteo) ────────────────────────────
  const serviceMix = useMemo(() => {
    const totals: Record<string, { name: string; totalHours: number; count: number; color: string }> = {};
    current
      .filter(a => a.status !== 'cancelled')
      .forEach(a => {
        const name = a.serviceType?.name ?? a.serviceTypeId;
        const color = a.serviceType?.color ?? COLOR.blue;
        if (!totals[name]) totals[name] = { name, totalHours: 0, count: 0, color };
        totals[name].totalHours += a.serviceType?.durationHours ?? 0;
        totals[name].count += 1;
      });

    const entries = Object.values(totals).sort((a, b) => b.totalHours - a.totalHours);
    const grandTotal = entries.reduce((s, e) => s + e.totalHours, 0);

    return entries.map(e => ({
      ...e,
      pct: grandTotal > 0 ? Math.round((e.totalHours / grandTotal) * 100) : 0,
    }));
  }, [current]);

  // ── Tendencia diaria ──────────────────────────────────────────────────────
  const trendData = useMemo(() => {
    const days = eachDayOfInterval({
      start: parseISO(from + 'T12:00:00'),
      end:   parseISO(to   + 'T12:00:00'),
    });
    return days.map(d => {
      const ds = format(d, 'yyyy-MM-dd');
      const dayAppts = current.filter(a => a.date === ds);
      return {
        date:      format(d, 'd/M', { locale: es }),
        completados: dayAppts.filter(a => a.status === 'done').length,
        agendados:   dayAppts.filter(a => a.status === 'scheduled').length,
        cancelados:  dayAppts.filter(a => a.status === 'cancelled').length,
      };
    });
  }, [current, from, to]);

  // ── Tabla reciente ────────────────────────────────────────────────────────
  const tableData = useMemo(() => {
    return [...current]
      .sort((a, b) => b.date.localeCompare(a.date) || b.timeStart.localeCompare(a.timeStart))
      .slice(0, 20);
  }, [current]);

  return {
    kpiOccupancy,
    kpiCompleted,
    kpiCancellation,
    kpiThroughput,
    heatmapData,
    techProductivity,
    serviceMix,
    trendData,
    tableData,
    technicians: activeTechs,
    serviceTypes,
    avgCompleted: techProductivity.length > 0
      ? Math.round(techProductivity.reduce((s, t) => s + t.completed, 0) / techProductivity.length)
      : 0,
  };
}

// ─── Sparkline (mini LineChart sin ejes, responsive) ─────────────────────────

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const pts = data.map((v, i) => ({ i, v }));
  return (
    <div style={{ width: 80, height: 32, flexShrink: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={pts} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ kpi, color, icon, compact = false }: {
  kpi: KpiResult;
  color: string;
  icon: React.ReactNode;
  compact?: boolean;
}) {
  // Para cancelación: delta negativo es bueno
  const isCancellation = kpi.unit === '%' && kpi.target === 10;
  const isPositiveDelta = isCancellation ? kpi.delta <= 0 : kpi.delta >= 0;
  const deltaColor = isPositiveDelta ? COLOR.green : COLOR.red;

  const displayValue = kpi.isPercent
    ? `${kpi.value}${kpi.unit ?? ''}`
    : String(kpi.value);

  return (
    <div className={`flex flex-col justify-between h-full ${compact ? 'px-4 py-3' : 'px-5 py-4'}`}>
      {/* Icono + delta */}
      <div className="flex items-start justify-between">
        <div
          className="h-8 w-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: color + '18', color }}
        >
          {icon}
        </div>
        {kpi.delta !== 0 && (
          <div className="flex items-center gap-0.5 text-xs font-semibold" style={{ color: deltaColor }}>
            {isPositiveDelta
              ? <ArrowUpRight className="h-3 w-3" />
              : <ArrowDownRight className="h-3 w-3" />
            }
            {Math.abs(kpi.delta)}%
          </div>
        )}
      </div>

      {/* Valor principal */}
      <div>
        <p className={`font-bold text-slate-900 tabular-nums leading-none ${compact ? 'text-3xl' : 'text-4xl'}`}>
          {displayValue}
        </p>
        <p className="text-xs text-slate-500 mt-1 leading-tight">{kpi.label}</p>
      </div>

      {/* Sparkline + barra de target */}
      <div className="flex items-end justify-between gap-2">
        <div className="flex-1">
          {kpi.target != null && (
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-xs text-slate-400">Target</span>
              <span className="text-xs font-semibold" style={{ color }}>
                {kpi.target}{kpi.unit ?? ''}
              </span>
            </div>
          )}
          <div className="h-1 rounded-full" style={{ background: color + '20' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                background: color,
                width: `${Math.min(kpi.isPercent ? kpi.value : Math.min((kpi.value / 10) * 100, 100), 100)}%`,
              }}
            />
          </div>
        </div>
        <Sparkline data={kpi.sparkline} color={color} />
      </div>
    </div>
  );
}

// ─── Heatmap de demanda horaria (CSS Grid puro) ───────────────────────────────

function HeatmapWidget({ data }: { data: HeatmapCell[] }) {
  const maxCount = Math.max(...data.map(c => c.count), 1);

  // Calcula el color de celda: blanco → azul claro → azul oscuro
  function cellColor(count: number): string {
    if (count === 0) return '#f8fafc';
    const intensity = count / maxCount;
    // Interpolar: #dbeafe (azul claro) → #1d4ed8 (azul oscuro)
    const r = Math.round(219 - (219 - 29) * intensity);
    const g = Math.round(234 - (234 - 78) * intensity);
    const b = Math.round(254 - (254 - 216) * intensity);
    return `rgb(${r},${g},${b})`;
  }

  function textColor(count: number): string {
    return count / maxCount > 0.5 ? 'white' : '#475569';
  }

  return (
    <div className="h-full flex flex-col px-3 py-2 overflow-hidden">
      {/* Grid: col labels + data */}
      <div className="flex gap-0.5 mb-0.5 ml-9">
        {HEATMAP_HOURS.map(h => (
          <div key={h} className="flex-1 text-center text-xs text-slate-400 font-medium">
            {h}:00
          </div>
        ))}
      </div>

      <div className="flex-1 flex flex-col gap-0.5">
        {HEATMAP_DAYS.map((dayLabel, idx) => {
          const dayNum = idx + 1; // 1=Lun..6=Sáb
          return (
            <div key={dayLabel} className="flex items-center gap-0.5 flex-1">
              <div className="w-8 flex-shrink-0 text-xs text-slate-500 font-medium text-right pr-1">
                {dayLabel}
              </div>
              {HEATMAP_HOURS.map(h => {
                const cell = data.find(c => c.day === dayNum && c.hour === h);
                const count = cell?.count ?? 0;
                return (
                  <div
                    key={h}
                    className="flex-1 min-h-0 h-full rounded flex items-center justify-center cursor-default transition-transform hover:scale-105"
                    style={{
                      background: cellColor(count),
                      minHeight: '18px',
                    }}
                    title={`${dayLabel} ${h}:00 — ${count} turno${count !== 1 ? 's' : ''}`}
                  >
                    {count > 0 && (
                      <span
                        className="text-xs font-bold leading-none select-none"
                        style={{ color: textColor(count), fontSize: '10px' }}
                      >
                        {count}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Leyenda */}
      <div className="flex items-center gap-1.5 mt-2 justify-end">
        <span className="text-xs text-slate-400">Menor</span>
        {[0, 0.25, 0.5, 0.75, 1].map(intensity => (
          <div
            key={intensity}
            className="h-3 w-5 rounded"
            style={{ background: cellColor(Math.round(intensity * maxCount)) }}
          />
        ))}
        <span className="text-xs text-slate-400">Mayor</span>
      </div>
    </div>
  );
}

// ─── Bar Chart de Productividad por Técnico ───────────────────────────────────

function TechProductivityChart({
  data,
  avgCompleted,
}: {
  data: TechProductivity[];
  avgCompleted: number;
}) {
  if (!data.length) return <Empty />;

  // Verde ≥80% ocupación (óptimo), Ámbar 60-79% (bajo), Rojo <60% (crítico)
  const barColor = (occ: number) => occ >= 80 ? COLOR.green : occ >= 60 ? COLOR.amber : COLOR.red;

  // Datos formateados para recharts horizontal bar
  const chartData = data.map(d => ({
    name: d.name,
    completados: d.completed,
    occupancy: d.occupancy,
    fill: barColor(d.occupancy),
  }));

  return (
    <div className="flex flex-col h-full">
      {/* Leyenda de colores */}
      <div className="flex items-center gap-3 px-4 pt-2 pb-1 flex-shrink-0">
        {[{ color: COLOR.green, label: '≥80% Óptimo' }, { color: COLOR.amber, label: '60-79% Bajo' }, { color: COLOR.red, label: '<60% Crítico' }].map(l => (
          <div key={l.label} className="flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm flex-shrink-0" style={{ background: l.color }} />
            <span className="text-xs text-slate-500">{l.label}</span>
          </div>
        ))}
      </div>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 4, right: 48, left: 8, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 10, fill: '#94a3b8' }}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
          width={56}
        />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any, name: any) => [
            name === 'completados' ? `${value} turnos` : `${value}%`,
            name === 'completados' ? 'Completados' : 'Ocupación',
          ]}
        />
        <ReferenceLine
          x={avgCompleted}
          stroke="#94a3b8"
          strokeDasharray="4 4"
          strokeWidth={1.5}
          label={{ value: 'Prom', position: 'top', fontSize: 10, fill: '#94a3b8' }}
        />
        <Bar dataKey="completados" radius={[0, 4, 4, 0]} name="completados">
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
    </div>
  );
}

// ─── Donut de Mix de Servicios ────────────────────────────────────────────────

function ServiceDonut({
  data,
}: {
  data: Array<{ name: string; totalHours: number; pct: number; color: string; count: number }>;
}) {
  if (!data.length) return <Empty />;

  // Si algún servicio supera 60%, mostrarlo como KPI en su lugar
  const dominant = data.find(d => d.pct > 60);
  if (dominant) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 px-4">
        <div
          className="h-12 w-12 rounded-2xl flex items-center justify-center"
          style={{ background: dominant.color + '18' }}
        >
          <PieIcon className="h-6 w-6" style={{ color: dominant.color }} />
        </div>
        <p className="text-4xl font-bold text-slate-900">{dominant.pct}%</p>
        <p className="text-sm font-semibold text-slate-700 text-center">{dominant.name}</p>
        <p className="text-xs text-slate-500">domina el mix de servicios</p>
        <div className="w-full mt-2 space-y-1.5">
          {data.slice(1, 4).map((d, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                <span className="text-slate-600">{d.name}</span>
              </div>
              <span className="font-semibold text-slate-900">{d.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const totalHours = data.reduce((s, d) => s + d.totalHours, 0);
  return (
    <div className="flex items-center gap-3 h-full px-3 py-2">
      <div className="flex-1 h-full min-w-0 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="totalHours"
              cx="50%"
              cy="50%"
              innerRadius="48%"
              outerRadius="75%"
              paddingAngle={2}
            >
              {data.map((e, i) => <Cell key={i} fill={e.color} />)}
            </Pie>
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
              formatter={(v: any) => [
                typeof v === 'number' ? `${v.toFixed(1)}h` : `${v}h`,
                'Horas totales',
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Total en el centro */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-lg font-bold text-slate-900">{totalHours.toFixed(0)}h</span>
          <span className="text-xs text-slate-400">totales</span>
        </div>
      </div>
      <div className="space-y-2 flex-shrink-0 w-36">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Por servicio</p>
        {data.slice(0, 5).map((d, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
            <span className="text-xs text-slate-600 truncate flex-1">{d.name}</span>
            <span className="text-xs font-bold text-slate-900">{d.pct}%</span>
          </div>
        ))}
        <p className="text-xs text-slate-400 pt-1 border-t border-slate-100">
          Tiempo invertido, no conteo
        </p>
      </div>
    </div>
  );
}

// ─── Line Chart de Tendencia ──────────────────────────────────────────────────

function TrendChart({
  data,
}: {
  data: Array<{ date: string; completados: number; agendados: number; cancelados: number }>;
}) {
  if (!data.length) return <Empty />;

  const avgLine = data.length > 0
    ? Math.round(data.reduce((s, d) => s + d.completados, 0) / data.length)
    : 0;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 16, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: '#94a3b8' }}
          interval={Math.max(0, Math.floor(data.length / 14) - 1)}
        />
        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
          formatter={(v: any, name: any) => [v, name === 'completados' ? 'Completados' : 'Cancelados']} />
        <ReferenceLine
          y={avgLine}
          stroke="#94a3b8"
          strokeDasharray="4 4"
          strokeWidth={1}
          label={{ value: `Prom: ${avgLine}`, position: 'insideTopRight', fontSize: 10, fill: '#94a3b8' }}
        />
        <Line type="monotone" dataKey="completados" stroke={COLOR.green} strokeWidth={2} dot={false} name="Completados" />
        <Line type="monotone" dataKey="cancelados" stroke={COLOR.red} strokeWidth={1.5} dot={false} strokeDasharray="3 3" name="Cancelados" />
        <Legend
          verticalAlign="bottom"
          height={24}
          formatter={(value) => <span style={{ fontSize: 11, color: '#64748b' }}>{value === 'completados' ? 'Completados' : 'Cancelados'}</span>}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Tabla con heat-coloring ──────────────────────────────────────────────────

function AppointmentsTable({ data }: { data: Appointment[] }) {
  if (!data.length) return <Empty />;

  function duration(a: Appointment): string {
    const mins = toMinutes(a.timeEnd) - toMinutes(a.timeStart);
    if (mins < 60) return `${mins}min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50 sticky top-0 z-10">
            <th className="text-left px-3 py-2 font-semibold text-slate-500 whitespace-nowrap">Fecha</th>
            <th className="text-left px-3 py-2 font-semibold text-slate-500 whitespace-nowrap">Horario</th>
            <th className="text-left px-3 py-2 font-semibold text-slate-500">Cliente</th>
            <th className="text-left px-3 py-2 font-semibold text-slate-500">Servicio</th>
            <th className="text-left px-3 py-2 font-semibold text-slate-500">Técnico</th>
            <th className="text-left px-3 py-2 font-semibold text-slate-500 whitespace-nowrap">Duración</th>
            <th className="text-left px-3 py-2 font-semibold text-slate-500">Estado</th>
          </tr>
        </thead>
        <tbody>
          {data.map(a => (
            <tr
              key={a.id}
              className="border-b border-slate-50 transition-colors hover:brightness-95"
              style={{ background: STATUS_ROW_BG[a.status] ?? 'transparent' }}
            >
              <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                {format(parseISO(a.date + 'T12:00:00'), "d MMM", { locale: es })}
              </td>
              <td className="px-3 py-2 text-slate-500 whitespace-nowrap tabular-nums">
                {a.timeStart}–{a.timeEnd}
              </td>
              <td className="px-3 py-2 font-semibold text-slate-900">{a.customerName}</td>
              <td className="px-3 py-2 text-slate-600 max-w-[100px] truncate">
                {a.serviceType?.name}
              </td>
              <td className="px-3 py-2 text-slate-600">{a.technician?.name?.split(' ')[0]}</td>
              <td className="px-3 py-2 tabular-nums text-slate-500">{duration(a)}</td>
              <td className="px-3 py-2">
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap"
                  style={{
                    background: (STATUS_COLORS[a.status] ?? '#94a3b8') + '22',
                    color: STATUS_COLORS[a.status] ?? '#94a3b8',
                  }}
                >
                  {STATUS_LABELS[a.status] ?? a.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Widget Container ─────────────────────────────────────────────────────────

type WidgetData = {
  kpiOccupancy: KpiResult;
  kpiCompleted: KpiResult;
  kpiCancellation: KpiResult;
  kpiThroughput: KpiResult;
  heatmapData: HeatmapCell[];
  techProductivity: TechProductivity[];
  serviceMix: Array<{ name: string; totalHours: number; pct: number; color: string; count: number }>;
  trendData: Array<{ date: string; completados: number; agendados: number; cancelados: number }>;
  tableData: Appointment[];
  avgCompleted: number;
};

function WidgetCard({
  widget,
  editMode,
  wdata,
  onRemove,
  onEdit,
}: {
  widget: Widget;
  editMode: boolean;
  wdata: WidgetData;
  onRemove: () => void;
  onEdit: () => void;
}) {
  function renderBody() {
    switch (widget.type) {
      case 'kpi_occupancy':
        return (
          <KpiCard
            kpi={wdata.kpiOccupancy}
            color={widget.color}
            icon={<Activity className="h-4 w-4" />}
          />
        );
      case 'kpi_completed':
        return (
          <KpiCard
            kpi={wdata.kpiCompleted}
            color={widget.color}
            icon={<CheckCircle2 className="h-4 w-4" />}
          />
        );
      case 'kpi_cancellation':
        return (
          <KpiCard
            kpi={wdata.kpiCancellation}
            color={widget.color}
            icon={<TrendingDown className="h-4 w-4" />}
          />
        );
      case 'kpi_throughput':
        return (
          <KpiCard
            kpi={wdata.kpiThroughput}
            color={widget.color}
            icon={<Target className="h-4 w-4" />}
          />
        );
      case 'heatmap':
        return <HeatmapWidget data={wdata.heatmapData} />;
      case 'bar_tech':
        return (
          <TechProductivityChart
            data={wdata.techProductivity}
            avgCompleted={wdata.avgCompleted}
          />
        );
      case 'donut_service':
        return <ServiceDonut data={wdata.serviceMix} />;
      case 'line_trend':
        return <TrendChart data={wdata.trendData} />;
      case 'table_recent':
        return <AppointmentsTable data={wdata.tableData} />;
      default:
        return <Empty />;
    }
  }

  return (
    <div
      className={`bg-white rounded-xl border shadow-sm overflow-hidden flex flex-col h-full transition-all ${
        editMode ? 'border-blue-300 shadow-blue-100' : 'border-slate-200'
      }`}
    >
      {/* Header */}
      <div
        className={`flex items-center gap-2 px-3 py-2 border-b border-slate-100 flex-shrink-0 ${
          editMode ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
      >
        {editMode && <GripVertical className="h-3.5 w-3.5 text-slate-300 flex-shrink-0" />}
        <span
          className="h-2 w-2 rounded-full flex-shrink-0"
          style={{ background: widget.color }}
        />
        <span className="text-xs font-semibold text-slate-700 flex-1 truncate">{widget.title}</span>
        {editMode && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              onClick={e => { e.stopPropagation(); onEdit(); }}
              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              onClick={e => { e.stopPropagation(); onRemove(); }}
              className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {renderBody()}
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function Empty() {
  return (
    <div className="flex items-center justify-center h-full text-xs text-slate-400">
      Sin datos para el período
    </div>
  );
}

// ─── Modal Agregar Widget ─────────────────────────────────────────────────────

function AddModal({ onAdd, onClose }: { onAdd: (w: Widget) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 z-10">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-slate-900">Agregar Widget</h2>
            <p className="text-xs text-slate-500 mt-0.5">Elegí el componente para tu tablero</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {CATALOG.map(item => (
            <button
              key={item.type}
              onClick={() => {
                onAdd({
                  id: `w${Date.now()}`,
                  type: item.type,
                  title: item.defaultTitle,
                  color: item.defaultColor,
                  layout: { ...item.defaultLayout, y: 999 },
                });
                onClose();
              }}
              className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-left transition-all group"
            >
              <div className="h-8 w-8 rounded-lg bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center flex-shrink-0 text-slate-500 group-hover:text-blue-600">
                {item.icon}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 truncate">{item.label}</p>
                <p className="text-xs text-slate-400">{item.type.startsWith('kpi') ? 'Indicador' : item.type === 'table_recent' ? 'Tabla' : 'Gráfico'}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Modal Editar Widget ──────────────────────────────────────────────────────

function EditModal({
  widget,
  onSave,
  onClose,
}: { widget: Widget; onSave: (w: Widget) => void; onClose: () => void }) {
  const [title, setTitle]   = useState(widget.title);
  const [color, setColor]   = useState(widget.color);
  const COLORS = [
    COLOR.blue, COLOR.violet, COLOR.green, COLOR.amber, COLOR.red, COLOR.slate,
    '#06b6d4', '#ec4899', '#f97316', '#14b8a6',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 z-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-slate-900">Configurar Widget</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Título</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Color</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full transition-transform ${
                    color === c ? 'scale-125 ring-2 ring-offset-1 ring-slate-400' : 'hover:scale-110'
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        </div>
        <button
          onClick={() => { onSave({ ...widget, title, color }); onClose(); }}
          className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
        >
          <CheckCircle2 className="h-4 w-4" /> Aplicar
        </button>
      </div>
    </div>
  );
}

// ─── Page Principal ───────────────────────────────────────────────────────────

export default function ReporteriaPage() {
  const today = formatDate(new Date());
  const [from, setFrom]               = useState(formatDate(subDays(new Date(), 29)));
  const [to, setTo]                   = useState(today);
  const [filterTechId, setFilterTechId]       = useState('');
  const [filterServiceId, setFilterServiceId] = useState('');
  const [editMode, setEditMode]       = useState(false);
  const [showAdd, setShowAdd]         = useState(false);
  const [editingWidget, setEditingWidget]     = useState<Widget | null>(null);
  const [widgets, setWidgets]         = useState<Widget[]>(DEFAULT_WIDGETS);
  const [mounted, setMounted]         = useState(false);
  const [containerWidth, setContainerWidth]   = useState(1200);

  const reportData = useReporteriaData(from, to, filterTechId, filterServiceId);
  const { technicians, serviceTypes } = reportData;

  // Hidratación y persistencia
  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setWidgets(JSON.parse(saved) as Widget[]);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (mounted) localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  }, [widgets, mounted]);

  // Medir ancho del contenedor del grid
  useEffect(() => {
    const el = document.getElementById('reporteria-grid');
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [mounted]);

  // Sincronizar posiciones del grid
  const handleLayoutChange = useCallback((layout: RGLLayout) => {
    setWidgets(prev =>
      prev.map(w => {
        const item = (layout as unknown as Array<{ i: string; x: number; y: number; w: number; h: number }>)
          .find(l => l.i === w.id);
        if (!item) return w;
        return { ...w, layout: { x: item.x, y: item.y, w: item.w, h: item.h } };
      })
    );
  }, []);

  const gridItems = widgets.map(w => ({
    i: w.id,
    ...w.layout,
    minW: 2,
    minH: 2,
  }));

  if (!mounted) return null;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Reportería</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {editMode
              ? 'Modo edición — arrastrá y redimensioná los widgets'
              : `Período: ${format(parseISO(from + 'T12:00:00'), "d MMM", { locale: es })} — ${format(parseISO(to + 'T12:00:00'), "d MMM yyyy", { locale: es })}`
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          {editMode && (
            <>
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Agregar widget
              </button>
              <button
                onClick={() => setWidgets(DEFAULT_WIDGETS)}
                className="text-xs text-slate-500 hover:text-slate-800 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Restablecer
              </button>
            </>
          )}
          <button
            onClick={() => setEditMode(e => !e)}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors ${
              editMode
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {editMode
              ? <><CheckCircle2 className="h-3.5 w-3.5" /> Listo</>
              : <><Settings2 className="h-3.5 w-3.5" /> Editar tablero</>
            }
          </button>
        </div>
      </div>

      {/* ── Filtros ────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-100 px-6 py-2.5 flex items-center gap-3 flex-shrink-0 flex-wrap">
        {/* Atajos rápidos */}
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
          {[
            { label: 'Hoy', days: 0 },
            { label: '7d', days: 6 },
            { label: '30d', days: 29 },
            { label: '90d', days: 89 },
          ].map(({ label, days }) => {
            const shortFrom = formatDate(subDays(new Date(), days));
            const isActive = from === shortFrom && to === today;
            return (
              <button key={label}
                onClick={() => { setFrom(shortFrom); setTo(today); }}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                  isActive ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="h-4 border-l border-slate-200" />
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">Desde</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
          <label className="text-xs text-slate-500">Hasta</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </div>
        <div className="h-4 border-l border-slate-200" />
        <select value={filterTechId} onChange={e => setFilterTechId(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 text-slate-700">
          <option value="">Todos los técnicos</option>
          {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={filterServiceId} onChange={e => setFilterServiceId(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 text-slate-700">
          <option value="">Todos los servicios</option>
          {serviceTypes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {(filterTechId || filterServiceId || from !== formatDate(subDays(new Date(), 29))) && (
          <button
            onClick={() => { setFilterTechId(''); setFilterServiceId(''); setFrom(formatDate(subDays(new Date(), 29))); setTo(today); }}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            Limpiar todo
          </button>
        )}
      </div>

      {/* ── Grid ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6">
        <div id="reporteria-grid" className="w-full">
          {containerWidth > 0 && (
            <GridLayout
              layout={gridItems}
              width={containerWidth}
              onLayoutChange={handleLayoutChange}
              gridConfig={{
                cols: COLS,
                rowHeight: ROW_HEIGHT,
                margin: [12, 12],
                containerPadding: [0, 0],
                maxRows: Infinity,
              }}
              dragConfig={{ enabled: editMode, handle: '.drag-handle', bounded: false, threshold: 3 }}
              resizeConfig={{ enabled: editMode }}
            >
              {widgets.map(widget => (
                <div key={widget.id} className="drag-handle">
                  <WidgetCard
                    widget={widget}
                    editMode={editMode}
                    wdata={reportData}
                    onRemove={() => setWidgets(prev => prev.filter(w => w.id !== widget.id))}
                    onEdit={() => setEditingWidget(widget)}
                  />
                </div>
              ))}
            </GridLayout>
          )}
          {widgets.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <BarChart3 className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">Tablero vacío</p>
              <p className="text-xs mt-1">Activá "Editar tablero" y agregá widgets</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────── */}
      {showAdd && (
        <AddModal
          onAdd={w => setWidgets(p => [...p, w])}
          onClose={() => setShowAdd(false)}
        />
      )}
      {editingWidget && (
        <EditModal
          widget={editingWidget}
          onSave={updated => setWidgets(p => p.map(w => w.id === updated.id ? updated : w))}
          onClose={() => setEditingWidget(null)}
        />
      )}
    </div>
  );
}
