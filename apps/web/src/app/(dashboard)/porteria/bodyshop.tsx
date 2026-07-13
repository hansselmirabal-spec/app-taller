'use client';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { LayoutItem as RGLLayout } from 'react-grid-layout';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  Car, TrendingUp, AlertTriangle, Clock,
  ArrowUpRight, ArrowDownRight, Activity,
  Plus, Settings2, Trash2, X, GripVertical,
  BarChart3, PieChart as PieIcon, Table2, TrendingDown,
  Users, ChevronLeft, ChevronRight,
  SlidersHorizontal, Hash, AlignLeft, Gauge,
} from 'lucide-react';
import Link from 'next/link';
import { format, subDays, parseISO, eachDayOfInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { useBodyshopWeekCapacity, useMonthlyLoadReport, type TechMonthlyRow } from '@/hooks/use-bodyshop';
import { useWorkTypes } from '@/hooks/use-work-types';
import { formatDate } from '@/lib/utils';
import type { BodyshopDayCapacity, BodyshopEntry } from '@/types';
import { InfoButton } from '@/components/ui/info-button';

import 'react-grid-layout/css/styles.css';

// ─── GridLayout (SSR-safe) ───────────────────────────────────────────────────

const GridLayout = dynamic(
  () => import('react-grid-layout').then(m => ({ default: m.GridLayout })),
  { ssr: false },
);

// ─── Constantes ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'bodyshop_reporteria_v2';
const MAX_PAGES   = 3;
const MAX_WIDGETS = 10;
const COLS        = 12;
const ROW_HEIGHT  = 62;

const CHANNEL_LABELS: Record<string, string> = {
  walk_in: 'Ventanilla', phone: 'Teléfono', online: 'Online', insurance: 'Seguro',
};
const CHANNEL_COLORS: Record<string, string> = {
  walk_in: '#3b82f6', phone: '#8b5cf6', online: '#22c55e', insurance: '#f59e0b',
};
const PROCESS_COLORS: Record<string, string> = {
  BODYWORK: '#3b82f6', PREP: '#8b5cf6', PAINT: '#f97316',
};
const PROCESS_LABELS: Record<string, string> = {
  BODYWORK: 'Chapería', PREP: 'Preparación', PAINT: 'Pintura',
};
const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Agendado', in_progress: 'En Proceso', done: 'Listo', cancelled: 'Cancelado',
};
const STATUS_COLORS: Record<string, string> = {
  scheduled: '#3b82f6', in_progress: '#f59e0b', done: '#22c55e', cancelled: '#ef4444',
};
const SEVERITY_LABELS: Record<string, string> = {
  LIGHT: 'Leve', MEDIUM: 'Medio', HEAVY: 'Grave', MULTIPLE: 'Múltiple',
};
const SEVERITY_COLORS: Record<string, string> = {
  LIGHT: '#22c55e', MEDIUM: '#f59e0b', HEAVY: '#ef4444', MULTIPLE: '#8b5cf6',
};

// ─── Tipos ────────────────────────────────────────────────────────────────────

type WidgetType =
  | 'kpi_ingresos' | 'kpi_ocupacion' | 'kpi_saturacion' | 'kpi_estadia'
  | 'trend_proceso' | 'barras_horas' | 'tipo_trabajo' | 'canal_donut'
  | 'tabla_ingresos' | 'tabla_carga_tecnico';

type ChartVariant = 'line' | 'area' | 'bar' | 'bar_h' | 'stacked' | 'donut' | 'table' | 'kpi';

interface GridPos { x: number; y: number; w: number; h: number; }

interface Widget {
  id: string;
  type: WidgetType;
  title: string;
  color: string;
  layout: GridPos;
  chartType?: ChartVariant;
}

// ─── Chart variant metadata ───────────────────────────────────────────────────

const CHART_TYPE_DEF: Record<ChartVariant, { label: string; icon: React.ReactNode }> = {
  line:    { label: 'Líneas',   icon: <TrendingUp className="h-4 w-4" /> },
  area:    { label: 'Área',     icon: <Activity   className="h-4 w-4" /> },
  bar:     { label: 'Barras',   icon: <BarChart3  className="h-4 w-4" /> },
  bar_h:   { label: 'Barras H', icon: <AlignLeft  className="h-4 w-4" /> },
  stacked: { label: 'Apilado',  icon: <TrendingDown className="h-4 w-4" /> },
  donut:   { label: 'Dona',     icon: <PieIcon    className="h-4 w-4" /> },
  table:   { label: 'Tabla',    icon: <Table2     className="h-4 w-4" /> },
  kpi:     { label: 'Número',   icon: <Hash       className="h-4 w-4" /> },
};

const WIDGET_DEFAULTS: Record<WidgetType, ChartVariant> = {
  kpi_ingresos:        'kpi',
  kpi_ocupacion:       'kpi',
  kpi_saturacion:      'kpi',
  kpi_estadia:         'kpi',
  trend_proceso:       'line',
  barras_horas:        'stacked',
  tipo_trabajo:        'bar_h',
  canal_donut:         'donut',
  tabla_ingresos:      'table',
  tabla_carga_tecnico: 'table',
};

const WIDGET_COMPATIBLE: Record<WidgetType, ChartVariant[]> = {
  kpi_ingresos:        ['kpi', 'bar', 'line', 'area', 'donut'],
  kpi_ocupacion:       ['kpi', 'line', 'area', 'bar'],
  kpi_saturacion:      ['kpi', 'bar', 'line'],
  kpi_estadia:         ['kpi', 'bar'],
  trend_proceso:       ['line', 'area', 'bar', 'stacked', 'table'],
  barras_horas:        ['stacked', 'bar', 'line', 'area', 'table'],
  tipo_trabajo:        ['bar_h', 'bar', 'donut', 'table'],
  canal_donut:         ['donut', 'bar', 'bar_h', 'table'],
  tabla_ingresos:      ['table', 'bar_h'],
  tabla_carga_tecnico: ['table'],
};

const COLOR_SWATCHES = [
  '#f97316', '#3b82f6', '#ef4444', '#22c55e',
  '#8b5cf6', '#f59e0b', '#ec4899', '#14b8a6',
  '#64748b', '#0ea5e9', '#dc2626', '#16a34a',
];

// ─── Catálogo ─────────────────────────────────────────────────────────────────

const CATALOG: Array<{
  type: WidgetType;
  label: string;
  defaultTitle: string;
  defaultLayout: GridPos;
  defaultColor: string;
  icon: React.ReactNode;
}> = [
  { type: 'kpi_ingresos',   label: 'KPI Ingresos Totales',     defaultTitle: 'Ingresos Totales',      defaultLayout: { x:0, y:0, w:3, h:2 }, defaultColor: '#f97316', icon: <Car className="h-4 w-4" /> },
  { type: 'kpi_ocupacion',  label: 'KPI Ocupación Global',      defaultTitle: 'Ocupación Global Prom.',defaultLayout: { x:0, y:0, w:3, h:2 }, defaultColor: '#3b82f6', icon: <Activity className="h-4 w-4" /> },
  { type: 'kpi_saturacion', label: 'KPI Días con Saturación',   defaultTitle: 'Días con Saturación',   defaultLayout: { x:0, y:0, w:3, h:2 }, defaultColor: '#ef4444', icon: <AlertTriangle className="h-4 w-4" /> },
  { type: 'kpi_estadia',    label: 'KPI Estadía Promedio',      defaultTitle: 'Estadía Promedio',      defaultLayout: { x:0, y:0, w:3, h:2 }, defaultColor: '#8b5cf6', icon: <Clock className="h-4 w-4" /> },
  { type: 'trend_proceso',  label: 'Tendencia Ocupación',       defaultTitle: 'Ocupación por Proceso', defaultLayout: { x:0, y:0, w:6, h:4 }, defaultColor: '#3b82f6', icon: <TrendingUp className="h-4 w-4" /> },
  { type: 'barras_horas',   label: 'Horas por Proceso',         defaultTitle: 'Horas Consumidas',      defaultLayout: { x:0, y:0, w:6, h:4 }, defaultColor: '#f97316', icon: <BarChart3 className="h-4 w-4" /> },
  { type: 'tipo_trabajo',   label: 'Mix por Tipo de Trabajo',   defaultTitle: 'Tipo de Trabajo',       defaultLayout: { x:0, y:0, w:7, h:4 }, defaultColor: '#8b5cf6', icon: <BarChart3 className="h-4 w-4" /> },
  { type: 'canal_donut',    label: 'Mix por Canal de Ingreso',  defaultTitle: 'Canal de Ingreso',      defaultLayout: { x:0, y:0, w:5, h:4 }, defaultColor: '#22c55e', icon: <PieIcon className="h-4 w-4" /> },
  { type: 'tabla_ingresos',      label: 'Historial de Ingresos',       defaultTitle: 'Historial de Ingresos',      defaultLayout: { x:0, y:0, w:12,h:5 }, defaultColor: '#64748b', icon: <Table2 className="h-4 w-4" /> },
  { type: 'tabla_carga_tecnico', label: 'Balance Mensual Técnicos',    defaultTitle: 'Balance Mensual por Técnico', defaultLayout: { x:0, y:0, w:12,h:6 }, defaultColor: '#0ea5e9', icon: <Users className="h-4 w-4" /> },
];

interface Page {
  id:      string;
  name:    string;
  widgets: Widget[];
}

const DEFAULT_WIDGETS: Widget[] = [
  { id: 'r1', type: 'kpi_ingresos',   title: 'Ingresos Totales',       color: '#f97316', layout: { x:0,  y:0, w:3, h:2 } },
  { id: 'r2', type: 'kpi_ocupacion',  title: 'Ocupación Global Prom.', color: '#3b82f6', layout: { x:3,  y:0, w:3, h:2 } },
  { id: 'r3', type: 'kpi_saturacion', title: 'Días con Saturación',    color: '#ef4444', layout: { x:6,  y:0, w:3, h:2 } },
  { id: 'r4', type: 'kpi_estadia',    title: 'Estadía Promedio',       color: '#8b5cf6', layout: { x:9,  y:0, w:3, h:2 } },
  { id: 'r5', type: 'trend_proceso',  title: 'Ocupación por Proceso',  color: '#3b82f6', layout: { x:0,  y:2, w:6, h:4 } },
  { id: 'r6', type: 'barras_horas',   title: 'Horas Consumidas',       color: '#f97316', layout: { x:6,  y:2, w:6, h:4 } },
  { id: 'r7', type: 'tipo_trabajo',   title: 'Tipo de Trabajo',        color: '#8b5cf6', layout: { x:0,  y:6, w:7, h:4 } },
  { id: 'r8', type: 'canal_donut',    title: 'Canal de Ingreso',       color: '#22c55e', layout: { x:7,  y:6, w:5, h:4 } },
  { id: 'r9', type: 'tabla_ingresos', title: 'Historial de Ingresos',  color: '#64748b', layout: { x:0, y:10, w:12,h:5 } },
];

const DEFAULT_PAGES: Page[] = [
  { id: 'p1', name: 'Panel 1', widgets: DEFAULT_WIDGETS },
];

// ─── Hook de datos ────────────────────────────────────────────────────────────

function useBodyshopReporteriaData(from: string, to: string) {
  const { data: weekCap = {} } = useBodyshopWeekCapacity(from, to);
  const { data: workTypes = [] } = useWorkTypes();

  const days = useMemo((): Array<{ date: string; cap: BodyshopDayCapacity | null }> => {
    const interval = eachDayOfInterval({
      start: parseISO(from + 'T12:00:00'),
      end:   parseISO(to   + 'T12:00:00'),
    });
    return interval.map(d => {
      const ds = format(d, 'yyyy-MM-dd');
      return { date: ds, cap: (weekCap as Record<string, BodyshopDayCapacity>)[ds] ?? null };
    });
  }, [weekCap, from, to]);

  const allEntries    = useMemo((): BodyshopEntry[] => days.flatMap(d => d.cap?.entries ?? []), [days]);
  const activeEntries = useMemo(() => allEntries.filter(e => e.status !== 'cancelled'), [allEntries]);

  const kpiTotal = useMemo(() => ({
    value:     allEntries.length,
    active:    activeEntries.length,
    cancelled: allEntries.filter(e => e.status === 'cancelled').length,
    done:      allEntries.filter(e => e.status === 'done').length,
  }), [allEntries, activeEntries]);

  const kpiOccupancy = useMemo(() => {
    const daysWithData = days.filter(d => d.cap !== null);
    if (!daysWithData.length) return { avg: 0, max: 0, overloadedDays: 0 };
    const rates = daysWithData.map(d => d.cap!.globalOccupancyRate);
    return {
      avg:           Math.round(rates.reduce((s, r) => s + r, 0) / rates.length),
      max:           Math.round(Math.max(...rates)),
      overloadedDays: daysWithData.filter(d => d.cap!.globalStatus === 'OVERLOADED').length,
    };
  }, [days]);

  const kpiStay = useMemo(() => {
    if (!activeEntries.length) return { avg: 0 };
    return { avg: parseFloat((activeEntries.reduce((s, e) => s + e.stayDays, 0) / activeEntries.length).toFixed(1)) };
  }, [activeEntries]);

  const processTrend = useMemo(() => days.map(d => ({
    date:   format(parseISO(d.date + 'T12:00:00'), 'd/M', { locale: es }),
    bw:     d.cap ? Math.round(d.cap.byProcess.BODYWORK.occupancyRate) : null,
    prep:   d.cap ? Math.round(d.cap.byProcess.PREP.occupancyRate) : null,
    paint:  d.cap ? Math.round(d.cap.byProcess.PAINT.occupancyRate) : null,
    global: d.cap ? Math.round(d.cap.globalOccupancyRate) : null,
  })), [days]);

  const processBarData = useMemo(() => days.map(d => ({
    date:  format(parseISO(d.date + 'T12:00:00'), 'd/M', { locale: es }),
    bw:    d.cap ? Math.round(d.cap.byProcess.BODYWORK.occupiedHours) : 0,
    prep:  d.cap ? Math.round(d.cap.byProcess.PREP.occupiedHours) : 0,
    paint: d.cap ? Math.round(d.cap.byProcess.PAINT.occupiedHours) : 0,
  })), [days]);

  const workTypeMix = useMemo(() => {
    const counts: Record<string, { name: string; color: string; count: number; totalHours: number }> = {};
    activeEntries.forEach(e => {
      const wt = e.workType;
      if (!wt) return;
      if (!counts[wt.id]) counts[wt.id] = { name: wt.name, color: wt.color, count: 0, totalHours: 0 };
      counts[wt.id].count++;
      counts[wt.id].totalHours += wt.bodyworkHours + wt.prepHours + wt.paintHours;
    });
    return Object.values(counts).sort((a, b) => b.count - a.count);
  }, [activeEntries]);

  const channelMix = useMemo(() => {
    const counts: Record<string, number> = { walk_in: 0, phone: 0, online: 0, insurance: 0 };
    allEntries.forEach(e => { if (e.channel in counts) counts[e.channel]++; });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([channel, count]) => ({ channel, label: CHANNEL_LABELS[channel] ?? channel, count, color: CHANNEL_COLORS[channel] ?? '#94a3b8' }))
      .sort((a, b) => b.count - a.count);
  }, [allEntries]);

  const tableData = useMemo(() => [...allEntries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30), [allEntries]);

  // ── Datos extra para variantes de KPI ──────────────────────────────────────

  // Ingresos por día (para bar/line en kpi_ingresos)
  const dailyEntryCounts = useMemo(() => days
    .filter(d => d.cap !== null)
    .map(d => ({
      date:  format(parseISO(d.date + 'T12:00:00'), 'd/M', { locale: es }),
      value: d.cap!.entries.filter(e => e.status !== 'cancelled').length,
    })), [days]);

  // Ocupación global diaria (para line/area en kpi_ocupacion)
  const dailyOccupancy = useMemo(() => days
    .filter(d => d.cap !== null)
    .map(d => ({
      date:  format(parseISO(d.date + 'T12:00:00'), 'd/M', { locale: es }),
      value: Math.round(d.cap!.globalOccupancyRate),
      status: d.cap!.globalStatus,
    })), [days]);

  // Distribución de estadías (para bar en kpi_estadia)
  const stayDistribution = useMemo(() => {
    const dist: Record<number, number> = {};
    activeEntries.forEach(e => { dist[e.stayDays] = (dist[e.stayDays] ?? 0) + 1; });
    return Object.entries(dist)
      .map(([d, count]) => ({ name: `${d}d`, days: Number(d), count }))
      .sort((a, b) => a.days - b.days);
  }, [activeEntries]);

  // Status donut para kpi_ingresos/donut
  const statusDonut = useMemo(() => {
    const s = [
      { key: 'done',        label: 'Finalizados', color: '#22c55e' },
      { key: 'in_progress', label: 'En proceso',  color: '#f59e0b' },
      { key: 'scheduled',   label: 'Agendado',    color: '#3b82f6' },
      { key: 'cancelled',   label: 'Cancelado',   color: '#ef4444' },
    ];
    return s
      .map(({ key, label, color }) => ({ name: label, color, count: allEntries.filter(e => e.status === key).length }))
      .filter(d => d.count > 0);
  }, [allEntries]);

  return {
    kpiTotal, kpiOccupancy, kpiStay, processTrend, workTypeMix, channelMix,
    processBarData, tableData, workTypes,
    dailyEntryCounts, dailyOccupancy, stayDistribution, statusDonut,
  };
}

// ─── Componentes de visualización ─────────────────────────────────────────────

function Empty() {
  return <div className="flex items-center justify-center h-full text-xs text-slate-400">Sin datos para el período</div>;
}

function KpiWidget({ title, value, sub, icon, color, delta }: {
  title: string; value: string; sub: string; icon: React.ReactNode; color: string; delta?: number;
}) {
  const isPositive = (delta ?? 0) >= 0;
  return (
    <div className="px-5 py-4 flex flex-col justify-between h-full">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: color + '20', color }}>
            {icon}
          </div>
          <p className="text-xs font-semibold text-slate-500 leading-tight">{title}</p>
        </div>
        {delta != null && delta !== 0 && (
          <div className="flex items-center gap-0.5 text-xs font-semibold" style={{ color: isPositive ? '#22c55e' : '#ef4444' }}>
            {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(delta)}%
          </div>
        )}
      </div>
      <div className="mt-1">
        <p className="text-5xl font-black tabular-nums leading-none tracking-tight" style={{ color }}>{value}</p>
        <p className="text-xs text-slate-400 mt-1.5">{sub}</p>
      </div>
    </div>
  );
}

// ─── ProcessTrendWidget — soporta line / area / bar / stacked / table ─────────

type TrendRow = { date: string; bw: number | null; prep: number | null; paint: number | null; global: number | null };

function ProcessTrendWidget({ data, variant = 'line', unit = '%' }: {
  data: TrendRow[];
  variant?: ChartVariant;
  unit?: string;
}) {
  if (!data.some(d => d.bw !== null)) return <Empty />;
  const xInterval = Math.max(0, Math.floor(data.length / 10) - 1);
  const legend = (value: string) => {
    const map: Record<string, string> = { bw: 'Chapería', prep: 'Preparación', paint: 'Pintura', global: 'Global' };
    return <span style={{ fontSize: 10, color: '#64748b' }}>{map[value] ?? value}</span>;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fmt = (v: any) => [`${v}${unit}`];

  if (variant === 'table') {
    return (
      <div className="overflow-auto h-full">
        <table className="w-full text-xs">
          <thead><tr className="bg-slate-50 border-b border-slate-100 sticky top-0">
            <th className="px-3 py-2 text-left font-semibold text-slate-500">Fecha</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-500">Chapería</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-500">Preparación</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-500">Pintura</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-500">Global</th>
          </tr></thead>
          <tbody>
            {data.filter(d => d.global !== null).map((d) => (
              <tr key={d.date} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-3 py-1.5 text-slate-600">{d.date}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{d.bw ?? '—'}{d.bw !== null ? unit : ''}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{d.prep ?? '—'}{d.prep !== null ? unit : ''}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{d.paint ?? '—'}{d.paint !== null ? unit : ''}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{d.global ?? '—'}{d.global !== null ? unit : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const stackId = (variant === 'stacked' || variant === 'bar') ? 'a' : undefined;

  return (
    <div className="px-2 pb-2 h-full">
      <ResponsiveContainer width="100%" height="100%">
        {variant === 'line' || variant === 'area' ? (
          variant === 'area' ? (
            <AreaChart data={data} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} interval={xInterval} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} unit={unit} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} formatter={fmt} />
              <Legend verticalAlign="bottom" height={24} formatter={legend} />
              <Area type="monotone" dataKey="bw"    stroke={PROCESS_COLORS.BODYWORK} fill={PROCESS_COLORS.BODYWORK} fillOpacity={0.15} strokeWidth={2} dot={false} connectNulls name="bw" />
              <Area type="monotone" dataKey="prep"  stroke={PROCESS_COLORS.PREP}     fill={PROCESS_COLORS.PREP}     fillOpacity={0.15} strokeWidth={2} dot={false} connectNulls name="prep" />
              <Area type="monotone" dataKey="paint" stroke={PROCESS_COLORS.PAINT}    fill={PROCESS_COLORS.PAINT}    fillOpacity={0.15} strokeWidth={2} dot={false} connectNulls name="paint" />
            </AreaChart>
          ) : (
            <LineChart data={data} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} interval={xInterval} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} unit={unit} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} formatter={fmt} />
              <Legend verticalAlign="bottom" height={24} formatter={legend} />
              <Line type="monotone" dataKey="bw"     stroke={PROCESS_COLORS.BODYWORK} strokeWidth={2} dot={false} connectNulls name="bw" />
              <Line type="monotone" dataKey="prep"   stroke={PROCESS_COLORS.PREP}     strokeWidth={2} dot={false} connectNulls name="prep" />
              <Line type="monotone" dataKey="paint"  stroke={PROCESS_COLORS.PAINT}    strokeWidth={2} dot={false} connectNulls name="paint" />
              <Line type="monotone" dataKey="global" stroke="#64748b" strokeWidth={1.5} dot={false} strokeDasharray="4 4" connectNulls name="global" />
            </LineChart>
          )
        ) : (
          <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} interval={xInterval} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} unit={unit} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} formatter={fmt} />
            <Legend verticalAlign="bottom" height={24} formatter={legend} />
            <Bar dataKey="bw"    fill={PROCESS_COLORS.BODYWORK} name="bw"    stackId={stackId} />
            <Bar dataKey="prep"  fill={PROCESS_COLORS.PREP}     name="prep"  stackId={stackId} />
            <Bar dataKey="paint" fill={PROCESS_COLORS.PAINT}    name="paint" stackId={stackId} radius={[4,4,0,0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// ─── ProcessBarsWidget — soporta stacked / bar / line / area / table ──────────

type BarsRow = { date: string; bw: number; prep: number; paint: number };

function ProcessBarsWidget({ data, variant = 'stacked' }: { data: BarsRow[]; variant?: ChartVariant }) {
  if (!data.some(d => d.bw > 0 || d.prep > 0 || d.paint > 0)) return <Empty />;
  // Recycle ProcessTrendWidget treating bw/prep/paint as nullable for shared rendering
  const mapped: TrendRow[] = data.map(d => ({ ...d, global: null }));
  return <ProcessTrendWidget data={mapped} variant={variant} unit="h" />;
}

// ─── WorkTypeMixWidget — soporta bar_h / bar / donut / table ─────────────────

type MixRow = { name: string; color: string; count: number; totalHours?: number };

function WorkTypeMixWidget({ data, variant = 'bar_h' }: { data: MixRow[]; variant?: ChartVariant }) {
  if (!data.length) return <Empty />;

  if (variant === 'table') {
    const total = data.reduce((s, d) => s + d.count, 0);
    return (
      <div className="overflow-auto h-full">
        <table className="w-full text-xs">
          <thead><tr className="bg-slate-50 border-b border-slate-100 sticky top-0">
            <th className="px-3 py-2 text-left font-semibold text-slate-500">Tipo</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-500">Ingresos</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-500">%</th>
          </tr></thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.name} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-3 py-1.5 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                  {d.name}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{d.count}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{total > 0 ? Math.round((d.count / total) * 100) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (variant === 'donut') {
    const total = data.reduce((s, d) => s + d.count, 0);
    return (
      <div className="flex items-center gap-4 px-4 pb-4 h-full">
        <div className="relative flex-shrink-0" style={{ width: 120, height: 120 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="count" cx="50%" cy="50%" innerRadius="50%" outerRadius="75%" paddingAngle={2}>
                {data.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(v: any, _: any, p: any) => [`${v} ingresos`, p.payload.name]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-lg font-bold text-slate-900">{total}</span>
            <span className="text-xs text-slate-400">total</span>
          </div>
        </div>
        <div className="flex-1 space-y-1.5 overflow-y-auto">
          {data.map((d) => (
            <div key={d.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                <span className="text-xs text-slate-600 truncate max-w-[90px]">{d.name}</span>
              </div>
              <span className="text-xs font-bold text-slate-900">{d.count}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const isHorizontal = variant === 'bar_h';
  return (
    <div className="px-2 pb-2 h-full">
      <ResponsiveContainer width="100%" height="100%">
        {isHorizontal ? (
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} width={80} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any) => [`${v} ingresos`]} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Bar>
          </BarChart>
        ) : (
          <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any) => [`${v} ingresos`]} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// ─── ChannelDonutWidget — soporta donut / bar / bar_h / table ────────────────

function ChannelDonutWidget({ data, variant = 'donut' }: {
  data: Array<{ channel: string; label: string; count: number; color: string }>;
  variant?: ChartVariant;
}) {
  if (!data.length) return <Empty />;
  const total = data.reduce((s, d) => s + d.count, 0);

  if (variant === 'table') {
    return (
      <div className="overflow-auto h-full">
        <table className="w-full text-xs">
          <thead><tr className="bg-slate-50 border-b border-slate-100 sticky top-0">
            <th className="px-3 py-2 text-left font-semibold text-slate-500">Canal</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-500">Ingresos</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-500">%</th>
          </tr></thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-3 py-1.5 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />{d.label}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{d.count}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{total > 0 ? Math.round((d.count / total) * 100) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (variant === 'bar' || variant === 'bar_h') {
    const barData = data.map(d => ({ name: d.label, count: d.count, color: d.color }));
    return <WorkTypeMixWidget data={barData} variant={variant} />;
  }

  // donut (default)
  return (
    <div className="flex items-center gap-4 px-4 pb-4 h-full">
      <div className="relative flex-shrink-0" style={{ width: 120, height: 120 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="count" cx="50%" cy="50%" innerRadius="50%" outerRadius="75%" paddingAngle={2}>
              {data.map((e, i) => <Cell key={i} fill={e.color} />)}
            </Pie>
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any, _: any, props: any) => [`${v} ingresos`, props.payload.label]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-lg font-bold text-slate-900">{total}</span>
          <span className="text-xs text-slate-400">total</span>
        </div>
      </div>
      <div className="flex-1 space-y-2">
        {data.map((d) => (
          <div key={d.label} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
              <span className="text-xs text-slate-600">{d.label}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs font-bold text-slate-900">{d.count}</span>
              <span className="text-xs text-slate-400">{total > 0 ? Math.round((d.count / total) * 100) : 0}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TablaWidget({ data, variant = 'table' }: { data: BodyshopEntry[]; variant?: ChartVariant }) {
  if (!data.length) return <Empty />;

  if (variant === 'bar_h') {
    const counts: Record<string, { name: string; color: string; count: number }> = {};
    data.forEach(e => {
      if (!e.workType || !e.workTypeId) return;
      if (!counts[e.workTypeId]) counts[e.workTypeId] = { name: e.workType.name, color: e.workType.color, count: 0 };
      counts[e.workTypeId].count++;
    });
    return <WorkTypeMixWidget data={Object.values(counts).sort((a, b) => b.count - a.count)} variant="bar_h" />;
  }

  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50 sticky top-0 z-10">
            <th className="text-left px-3 py-2 font-semibold text-slate-500">Fecha</th>
            <th className="text-left px-3 py-2 font-semibold text-slate-500">Cliente</th>
            <th className="text-left px-3 py-2 font-semibold text-slate-500">Patente</th>
            <th className="text-left px-3 py-2 font-semibold text-slate-500">Tipo Trabajo</th>
            <th className="text-left px-3 py-2 font-semibold text-slate-500">Severidad</th>
            <th className="text-center px-3 py-2 font-semibold text-slate-500">Estadía</th>
            <th className="text-left px-3 py-2 font-semibold text-slate-500">Canal</th>
            <th className="text-left px-3 py-2 font-semibold text-slate-500">Estado</th>
          </tr>
        </thead>
        <tbody>
          {data.map(e => (
            <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
              <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                {format(parseISO(e.date + 'T12:00:00'), 'd MMM', { locale: es })}
              </td>
              <td className="px-3 py-2 font-semibold text-slate-900">{e.customerName}</td>
              <td className="px-3 py-2 font-mono text-slate-600">{e.plate}</td>
              <td className="px-3 py-2">
                {e.workType ? (
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: e.workType.color }} />
                    <span className="text-slate-700 truncate max-w-[80px]">{e.workType.name}</span>
                  </div>
                ) : <span className="text-slate-400">-</span>}
              </td>
              <td className="px-3 py-2">
                {e.workType && (
                  <span className="px-1.5 py-0.5 rounded text-xs font-semibold"
                    style={{ background: SEVERITY_COLORS[e.workType.severity] + '22', color: SEVERITY_COLORS[e.workType.severity] }}>
                    {SEVERITY_LABELS[e.workType.severity]}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-center text-slate-600">{e.stayDays}d</td>
              <td className="px-3 py-2 text-slate-500">{CHANNEL_LABELS[e.channel] ?? e.channel}</td>
              <td className="px-3 py-2">
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap"
                  style={{ background: (STATUS_COLORS[e.status] ?? '#94a3b8') + '22', color: STATUS_COLORS[e.status] ?? '#94a3b8' }}>
                  {STATUS_LABELS[e.status] ?? e.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── TechLoadWidget ───────────────────────────────────────────────────────────

const PROCESS_BADGE: Record<string, { label: string; color: string }> = {
  BODYWORK: { label: 'Chapería',    color: '#3b82f6' },
  PREP:     { label: 'Preparación', color: '#8b5cf6' },
  PAINT:    { label: 'Pintura',     color: '#f97316' },
};

function ComplianceBadge({ pct }: { pct: number }) {
  const bg = pct >= 90 ? '#dcfce7' : pct >= 60 ? '#fef9c3' : '#fee2e2';
  const fg = pct >= 90 ? '#16a34a' : pct >= 60 ? '#ca8a04' : '#dc2626';
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold"
      style={{ background: bg, color: fg }}>
      {pct}%
    </span>
  );
}

function BalancePill({ hours }: { hours: number }) {
  const pos = hours >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${pos ? 'text-emerald-600' : 'text-red-600'}`}>
      {pos ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(hours)}h
    </span>
  );
}

function LoadBar({ ratio }: { ratio: number }) {
  const pct  = Math.min(100, ratio * 100);
  const fill = pct >= 100 ? '#ef4444' : pct >= 75 ? '#f59e0b' : '#22c55e';
  return (
    <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: fill }} />
    </div>
  );
}

function TechLoadWidget({
  rows,
  reportYear,
  reportMonth,
  onMonthChange,
}: {
  rows:          TechMonthlyRow[];
  reportYear:    number;
  reportMonth:   number;
  onMonthChange: (year: number, month: number) => void;
}) {
  const [filterProcess,    setFilterProcess]    = useState<string>('ALL');
  const [filterCompliance, setFilterCompliance] = useState<string>('ALL');

  const monthLabel = useMemo(() => {
    const d = new Date(reportYear, reportMonth - 1, 1);
    return format(d, 'MMMM yyyy', { locale: es });
  }, [reportYear, reportMonth]);

  function prevMonth() {
    const d = new Date(reportYear, reportMonth - 2, 1);
    onMonthChange(d.getFullYear(), d.getMonth() + 1);
  }
  function nextMonth() {
    const d = new Date(reportYear, reportMonth, 1);
    const now = new Date();
    if (d <= now) onMonthChange(d.getFullYear(), d.getMonth() + 1);
  }

  const filtered = useMemo(() => rows
    .filter(r => filterProcess === 'ALL' || r.process === filterProcess)
    .filter(r => {
      if (filterCompliance === 'ALL')   return true;
      if (filterCompliance === 'HIGH')  return r.compliancePercent >= 90;
      if (filterCompliance === 'MID')   return r.compliancePercent >= 60 && r.compliancePercent < 90;
      if (filterCompliance === 'LOW')   return r.compliancePercent < 60;
      return true;
    }),
  [rows, filterProcess, filterCompliance]);

  if (!rows.length) return <Empty />;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Barra de controles interna */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 flex-shrink-0 flex-wrap">
        {/* Navegación de mes */}
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="p-0.5 rounded hover:bg-slate-100 transition-colors">
            <ChevronLeft className="h-3.5 w-3.5 text-slate-500" />
          </button>
          <span className="text-xs font-semibold text-slate-700 capitalize w-28 text-center">{monthLabel}</span>
          <button onClick={nextMonth} className="p-0.5 rounded hover:bg-slate-100 transition-colors">
            <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
          </button>
        </div>
        <div className="h-3 border-l border-slate-200" />
        {/* Filtro proceso */}
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
          {['ALL', 'BODYWORK', 'PREP', 'PAINT'].map(p => (
            <button key={p}
              onClick={() => setFilterProcess(p)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all ${filterProcess === p ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {p === 'ALL' ? 'Todos' : (PROCESS_BADGE[p]?.label ?? p)}
            </button>
          ))}
        </div>
        <div className="h-3 border-l border-slate-200" />
        {/* Filtro cumplimiento */}
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
          {[{ k: 'ALL', label: 'Todos' }, { k: 'HIGH', label: '≥90%' }, { k: 'MID', label: '60-89%' }, { k: 'LOW', label: '<60%' }].map(({ k, label }) => (
            <button key={k}
              onClick={() => setFilterCompliance(k)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all ${filterCompliance === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto text-[10px] text-slate-400">{filtered.length} técnico{filtered.length !== 1 ? 's' : ''}</div>
      </div>

      {/* Tabla */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 sticky top-0 z-10">
              <th className="text-left px-3 py-2 font-semibold text-slate-500 whitespace-nowrap">#</th>
              <th className="text-left px-3 py-2 font-semibold text-slate-500 whitespace-nowrap">Técnico</th>
              <th className="text-left px-3 py-2 font-semibold text-slate-500 whitespace-nowrap">Proceso</th>
              <th className="text-right px-3 py-2 font-semibold text-slate-500 whitespace-nowrap">Meta</th>
              <th className="text-right px-3 py-2 font-semibold text-slate-500 whitespace-nowrap">Asignadas</th>
              <th className="text-right px-3 py-2 font-semibold text-slate-500 whitespace-nowrap">Trabajadas</th>
              <th className="text-right px-3 py-2 font-semibold text-slate-500 whitespace-nowrap">Balance</th>
              <th className="text-center px-3 py-2 font-semibold text-slate-500 whitespace-nowrap">Cumpl.</th>
              <th className="text-center px-3 py-2 font-semibold text-slate-500 whitespace-nowrap">Carga</th>
              <th className="text-center px-3 py-2 font-semibold text-slate-500 whitespace-nowrap">D. trabajo</th>
              <th className="text-center px-3 py-2 font-semibold text-slate-500 whitespace-nowrap">D. ausente</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const proc = PROCESS_BADGE[r.process];
              return (
                <tr key={r.technicianId} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-2.5 text-slate-400 font-mono text-[10px]">{r.rankLoadAsc}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                        style={{ background: proc?.color ?? '#94a3b8' }}>
                        {r.technicianName.charAt(0)}
                      </div>
                      <span className="font-semibold text-slate-900 whitespace-nowrap">{r.technicianName}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold"
                      style={{ background: (proc?.color ?? '#94a3b8') + '18', color: proc?.color ?? '#94a3b8' }}>
                      {proc?.label ?? r.process}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-600 tabular-nums">{r.monthlyTarget}h</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-slate-900 tabular-nums">{r.assignedHours}h</td>
                  <td className="px-3 py-2.5 text-right text-slate-600 tabular-nums">{r.workedHours}h</td>
                  <td className="px-3 py-2.5 text-right"><BalancePill hours={r.balanceHours} /></td>
                  <td className="px-3 py-2.5 text-center"><ComplianceBadge pct={r.compliancePercent} /></td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5 justify-center">
                      <LoadBar ratio={r.loadRatio} />
                      <span className="text-[10px] text-slate-500 tabular-nums w-8">{Math.round(r.loadRatio * 100)}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center text-slate-600">{r.workedDays}d</td>
                  <td className="px-3 py-2.5 text-center">
                    {r.absenceDays > 0
                      ? <span className="text-amber-600 font-semibold">{r.absenceDays}d</span>
                      : <span className="text-slate-300">—</span>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td colSpan={4} className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wide">Total</td>
                <td className="px-3 py-2 text-right text-xs font-bold text-slate-900 tabular-nums">
                  {filtered.reduce((s, r) => s + r.assignedHours, 0).toFixed(1)}h
                </td>
                <td className="px-3 py-2 text-right text-xs font-semibold text-slate-700 tabular-nums">
                  {filtered.reduce((s, r) => s + r.workedHours, 0).toFixed(1)}h
                </td>
                <td colSpan={5} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ─── WidgetEditModal ──────────────────────────────────────────────────────────

function WidgetEditModal({
  widget,
  allData,
  onSave,
  onClose,
}: {
  widget:   Widget;
  allData:  WidgetContentProps;
  onSave:   (patch: Partial<Widget>) => void;
  onClose:  () => void;
}) {
  const [title,     setTitle]     = useState(widget.title);
  const [color,     setColor]     = useState(widget.color);
  const [chartType, setChartType] = useState<ChartVariant>(
    widget.chartType ?? WIDGET_DEFAULTS[widget.type],
  );

  const compatible = WIDGET_COMPATIBLE[widget.type] ?? [];
  const preview: Widget = { ...widget, title, color, chartType };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 flex overflow-hidden"
        style={{ width: 780, maxHeight: '88vh' }}>

        {/* ── Panel izquierdo ─────────────────────────────────────────────── */}
        <div className="w-64 flex-shrink-0 border-r border-slate-100 flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Modificar Widget</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
            {/* Nombre */}
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">Nombre</label>
              <input value={title} onChange={e => setTitle(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-orange-400" />
            </div>

            {/* Color */}
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">Color de acento</label>
              <div className="grid grid-cols-6 gap-1.5">
                {COLOR_SWATCHES.map(c => (
                  <button key={c} onClick={() => setColor(c)}
                    className={`h-6 w-6 rounded-full border-2 transition-all ${color === c ? 'border-slate-700 scale-110 shadow-sm' : 'border-white hover:scale-105'}`}
                    style={{ background: c }} />
                ))}
              </div>
            </div>

            {/* Tipo de gráfico */}
            {compatible.length > 1 && (
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">Mostrar como</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {compatible.map(ct => {
                    const def = CHART_TYPE_DEF[ct];
                    const active = chartType === ct;
                    return (
                      <button key={ct} onClick={() => setChartType(ct)}
                        className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl border-2 transition-all ${active ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-500 hover:border-orange-200 hover:bg-orange-50/60'}`}>
                        {def.icon}
                        <span className="text-[9px] font-semibold leading-tight text-center">{def.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-slate-100 flex gap-2">
            <button onClick={onClose}
              className="flex-1 px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
              Cancelar
            </button>
            <button onClick={() => { onSave({ title, color, chartType }); onClose(); }}
              className="flex-1 px-3 py-2 text-xs font-semibold bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors">
              Actualizar
            </button>
          </div>
        </div>

        {/* ── Preview ─────────────────────────────────────────────────────── */}
        <div className="flex-1 bg-slate-50 flex flex-col overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-white">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Vista previa</p>
          </div>
          <div className="flex-1 overflow-hidden p-5">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full flex flex-col">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 flex-shrink-0">
                <div className="h-2 w-2 rounded-full" style={{ background: color }} />
                <span className="text-xs font-semibold text-slate-700">{title}</span>
              </div>
              <div className="flex-1 min-h-0">
                <WidgetContent {...allData} widget={preview} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── WidgetContent ────────────────────────────────────────────────────────────

type ReporteriaData = ReturnType<typeof useBodyshopReporteriaData>;

interface WidgetContentProps {
  widget:          Widget;
  kpiTotal:        ReporteriaData['kpiTotal'];
  kpiOccupancy:    ReporteriaData['kpiOccupancy'];
  kpiStay:         ReporteriaData['kpiStay'];
  processTrend:    ReporteriaData['processTrend'];
  processBarData:  ReporteriaData['processBarData'];
  workTypeMix:     ReporteriaData['workTypeMix'];
  channelMix:      ReporteriaData['channelMix'];
  tableData:       ReporteriaData['tableData'];
  dailyEntryCounts: ReporteriaData['dailyEntryCounts'];
  dailyOccupancy:  ReporteriaData['dailyOccupancy'];
  stayDistribution: ReporteriaData['stayDistribution'];
  statusDonut:     ReporteriaData['statusDonut'];
  monthlyRows:     TechMonthlyRow[];
  reportYear:      number;
  reportMonth:     number;
  onMonthChange:   (year: number, month: number) => void;
}

// ─── Mini sparkline helper (compartida por variantes de KPI) ─────────────────

function SparkChart({ data, variant, color, unit = '' }: {
  data:    Array<{ date: string; value: number }>;
  variant: ChartVariant;
  color:   string;
  unit?:   string;
}) {
  if (!data.length) return <Empty />;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fmt = (v: any) => [`${v}${unit}`];
  return (
    <div className="px-2 pb-2 h-full">
      <ResponsiveContainer width="100%" height="100%">
        {variant === 'area' ? (
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} interval={Math.max(0, Math.floor(data.length / 8) - 1)} />
            <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} formatter={fmt} />
            <Area type="monotone" dataKey="value" stroke={color} fill={color} fillOpacity={0.15} strokeWidth={2} dot={false} name="value" />
          </AreaChart>
        ) : variant === 'line' ? (
          <LineChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} interval={Math.max(0, Math.floor(data.length / 8) - 1)} />
            <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} formatter={fmt} />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} name="value" />
          </LineChart>
        ) : (
          <BarChart data={data} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} interval={Math.max(0, Math.floor(data.length / 8) - 1)} />
            <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} formatter={fmt} />
            <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} name="value" />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// ─── WidgetContent ────────────────────────────────────────────────────────────

function WidgetContent(props: WidgetContentProps) {
  const {
    widget, kpiTotal, kpiOccupancy, kpiStay,
    processTrend, processBarData, workTypeMix, channelMix, tableData,
    dailyEntryCounts, dailyOccupancy, stayDistribution, statusDonut,
    monthlyRows, reportYear, reportMonth, onMonthChange,
  } = props;
  const v = widget.chartType ?? WIDGET_DEFAULTS[widget.type];

  switch (widget.type) {

    // ── KPI Ingresos ────────────────────────────────────────────────────────
    case 'kpi_ingresos':
      if (v === 'donut') return <WorkTypeMixWidget data={statusDonut} variant="donut" />;
      if (v !== 'kpi')   return <SparkChart data={dailyEntryCounts} variant={v} color={widget.color} unit=" veh." />;
      return <KpiWidget title="Ingresos Totales" value={String(kpiTotal.value)}
        sub={`${kpiTotal.active} activos · ${kpiTotal.done} finalizados`}
        icon={<Car className="h-4 w-4" />} color={widget.color} />;

    // ── KPI Ocupación ───────────────────────────────────────────────────────
    case 'kpi_ocupacion':
      if (v !== 'kpi') return <SparkChart data={dailyOccupancy} variant={v} color={widget.color} unit="%" />;
      return <KpiWidget title="Ocupación Global Prom." value={`${kpiOccupancy.avg}%`}
        sub={`Máximo ${kpiOccupancy.max}% en el período`}
        icon={<Activity className="h-4 w-4" />} color={widget.color} />;

    // ── KPI Saturación ──────────────────────────────────────────────────────
    case 'kpi_saturacion':
      if (v !== 'kpi') {
        const satData = dailyOccupancy.map(d => ({
          date: d.date,
          value: d.value,
          fill: d.status === 'OVERLOADED' ? '#ef4444' : d.status === 'RISK' ? '#f59e0b' : '#22c55e',
        }));
        return (
          <div className="px-2 pb-2 h-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={satData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} interval={Math.max(0, Math.floor(satData.length / 8) - 1)} />
                <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} unit="%" />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(val: any) => [`${val}%`, 'Ocupación']} />
                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                  {satData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      }
      return <KpiWidget title="Días con Saturación" value={String(kpiOccupancy.overloadedDays)}
        sub="Días con algún proceso al 100%"
        icon={<AlertTriangle className="h-4 w-4" />} color={kpiOccupancy.overloadedDays > 0 ? '#ef4444' : '#22c55e'} />;

    // ── KPI Estadía ─────────────────────────────────────────────────────────
    case 'kpi_estadia':
      if (v !== 'kpi') return <SparkChart data={stayDistribution.map(d => ({ date: d.name, value: d.count }))} variant={v} color={widget.color} unit=" veh." />;
      return <KpiWidget title="Estadía Promedio" value={`${kpiStay.avg}d`}
        sub="Días promedio por vehículo"
        icon={<Clock className="h-4 w-4" />} color={widget.color} />;

    // ── Gráficos ────────────────────────────────────────────────────────────
    case 'trend_proceso':
      return <ProcessTrendWidget data={processTrend} variant={v} />;
    case 'barras_horas':
      return <ProcessBarsWidget data={processBarData} variant={v} />;
    case 'tipo_trabajo':
      return <WorkTypeMixWidget data={workTypeMix} variant={v} />;
    case 'canal_donut':
      return <ChannelDonutWidget data={channelMix} variant={v} />;
    case 'tabla_ingresos':
      return <TablaWidget data={tableData} variant={v} />;
    case 'tabla_carga_tecnico':
      return <TechLoadWidget rows={monthlyRows} reportYear={reportYear} reportMonth={reportMonth} onMonthChange={onMonthChange} />;
    default:
      return null;
  }
}

// ─── Page Principal ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const GL: any = GridLayout;

export default function BodyshopReporteriaPage() {
  const today = formatDate(new Date());
  const [from, setFrom] = useState(formatDate(subDays(new Date(), 29)));
  const [to, setTo]     = useState(today);
  const [mounted, setMounted]         = useState(false);
  const [editMode, setEditMode]       = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [editingWidget, setEditingWidget] = useState<Widget | null>(null);

  const now = new Date();
  const [reportYear,  setReportYear]  = useState(now.getFullYear());
  const [reportMonth, setReportMonth] = useState(now.getMonth() + 1);
  const { data: monthlyRows = [] } = useMonthlyLoadReport(reportYear, reportMonth);
  function handleMonthChange(year: number, month: number) {
    setReportYear(year); setReportMonth(month);
  }

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(1200);

  // ── Páginas ──────────────────────────────────────────────────────────────────
  const [pages, setPages] = useState<Page[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_PAGES;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_PAGES;
      const parsed = JSON.parse(raw);
      // Valida que sea un array de páginas con estructura correcta
      if (!Array.isArray(parsed) || !parsed[0]?.widgets) return DEFAULT_PAGES;
      // Asegura que cada página tenga widgets como array
      return parsed.map((p: Page) => ({ ...p, widgets: Array.isArray(p.widgets) ? p.widgets : [] }));
    } catch { return DEFAULT_PAGES; }
  });
  const [activePageId, setActivePageId] = useState<string>(() => pages[0]?.id ?? 'p1');
  const [renamingPageId, setRenamingPageId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const EMPTY_PAGE: Page = { id: '', name: '', widgets: [] };
  const activePage    = pages.find(p => p.id === activePageId) ?? pages[0] ?? EMPTY_PAGE;
  const activeWidgets = activePage.widgets;

  function setActiveWidgets(fn: (prev: Widget[]) => Widget[]) {
    setPages(prev => prev.map(p =>
      p.id === activePageId ? { ...p, widgets: fn(p.widgets ?? []) } : p,
    ));
  }

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      for (const e of entries) setContainerW(e.contentRect.width);
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pages)); } catch { /* noop */ }
  }, [pages]);

  // ── Page operations ───────────────────────────────────────────────────────
  function addPage() {
    if (pages.length >= MAX_PAGES) return;
    const id   = `p${Date.now()}`;
    const name = `Panel ${pages.length + 1}`;
    setPages(prev => [...prev, { id, name, widgets: [] }]);
    setActivePageId(id);
  }

  function deletePage(id: string) {
    if (pages.length <= 1) return;
    setPages(prev => {
      const next = prev.filter(p => p.id !== id);
      if (activePageId === id) setActivePageId(next[0].id);
      return next;
    });
  }

  function startRename(page: Page) {
    setRenamingPageId(page.id);
    setRenameValue(page.name);
  }

  function commitRename() {
    if (!renamingPageId) return;
    const name = renameValue.trim() || 'Panel';
    setPages(prev => prev.map(p => p.id === renamingPageId ? { ...p, name } : p));
    setRenamingPageId(null);
  }

  // ── Widget operations ─────────────────────────────────────────────────────
  const rglLayouts: RGLLayout[] = activeWidgets.map(w => ({
    i: w.id, x: w.layout.x, y: w.layout.y, w: w.layout.w, h: w.layout.h,
    minW: 3, minH: 2,
  }));

  const onLayoutChange = useCallback((layout: RGLLayout[]) => {
    setActiveWidgets(prev => prev.map(w => {
      const l = layout.find(x => x.i === w.id);
      return l ? { ...w, layout: { x: l.x, y: l.y, w: l.w, h: l.h } } : w;
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePageId]);

  function addWidget(type: WidgetType) {
    if (activeWidgets.length >= MAX_WIDGETS) return;
    const def = CATALOG.find(c => c.type === type);
    if (!def) return;
    const id = `r${Date.now()}`;
    setActiveWidgets(prev => [...prev, { id, type, title: def.defaultTitle, color: def.defaultColor, layout: def.defaultLayout }]);
    setShowCatalog(false);
  }

  function removeWidget(id: string) {
    setActiveWidgets(prev => prev.filter(w => w.id !== id));
  }

  function updateWidget(id: string, patch: Partial<Widget>) {
    setActiveWidgets(prev => prev.map(w => w.id === id ? { ...w, ...patch } : w));
  }

  function resetWidgets() {
    setActiveWidgets(() => DEFAULT_WIDGETS);
  }

  const data = useBodyshopReporteriaData(from, to);
  const atMax = activeWidgets.length >= MAX_WIDGETS;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-900">Reportería</h1>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">BODYSHOP</span>
            <InfoButton helpKey="reportes" />
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {format(parseISO(from + 'T12:00:00'), 'd MMM', { locale: es })} — {format(parseISO(to + 'T12:00:00'), 'd MMM yyyy', { locale: es })}
          </p>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2">
          <Link
            href="/porteria/productividad"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
            title="Reporte de productividad por técnico"
          >
            <Gauge className="h-3.5 w-3.5" /> Productividad
          </Link>
          {editMode && (
            <>
              <button onClick={() => setShowCatalog(true)} disabled={atMax}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${atMax ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-orange-500 text-white hover:bg-orange-600'}`}>
                <Plus className="h-3.5 w-3.5" /> Agregar
              </button>
              <button onClick={resetWidgets}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                Restablecer
              </button>
            </>
          )}
          <button
            onClick={() => setEditMode(o => !o)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${editMode ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            <Settings2 className="h-3.5 w-3.5" />
            {editMode ? 'Listo' : 'Configurar'}
          </button>
        </div>
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-100 px-6 py-2.5 flex items-center gap-3 flex-shrink-0 flex-wrap">
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
          {[{ label: '7d', days: 6 }, { label: '30d', days: 29 }, { label: '90d', days: 89 }].map(({ label, days }) => {
            const shortFrom = formatDate(subDays(new Date(), days));
            const isActive = from === shortFrom && to === today;
            return (
              <button key={label} onClick={() => { setFrom(shortFrom); setTo(today); }}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${isActive ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {label}
              </button>
            );
          })}
        </div>
        <div className="h-4 border-l border-slate-200" />
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">Desde</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-400" />
          <label className="text-xs text-slate-500">Hasta</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-400" />
        </div>
      </div>

      {/* ── Tabs de paneles ──────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-4 flex items-end gap-1 flex-shrink-0">
        {pages.map(page => {
          const isActive = page.id === activePageId;
          const isRenaming = renamingPageId === page.id;
          const count = (page.widgets ?? []).length;
          return (
            <div key={page.id}
              className={`group relative flex items-center gap-1.5 px-3 pt-2.5 pb-2 border-b-2 transition-all cursor-pointer select-none ${isActive ? 'border-orange-500 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
              onClick={() => { if (!isRenaming) setActivePageId(page.id); }}
            >
              {isRenaming ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingPageId(null); }}
                  onClick={e => e.stopPropagation()}
                  className="text-xs font-semibold w-24 border-b border-orange-400 bg-transparent outline-none text-slate-900"
                />
              ) : (
                <span
                  className="text-xs font-semibold leading-none"
                  onDoubleClick={e => { e.stopPropagation(); startRename(page); }}
                >
                  {page.name}
                </span>
              )}
              {/* Contador widgets */}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${isActive ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-400'} ${count >= MAX_WIDGETS ? 'bg-red-100 text-red-500' : ''}`}>
                {count}/{MAX_WIDGETS}
              </span>
              {/* Botón eliminar — solo si hay más de 1 página */}
              {pages.length > 1 && (
                <button
                  onClick={e => { e.stopPropagation(); deletePage(page.id); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 text-slate-300 hover:text-red-500"
                  title="Eliminar panel">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}

        {/* Agregar panel */}
        {pages.length < MAX_PAGES && (
          <button onClick={addPage}
            className="flex items-center gap-1 px-3 py-2 mb-0.5 text-xs font-semibold text-slate-400 hover:text-orange-500 transition-colors rounded-lg hover:bg-orange-50">
            <Plus className="h-3.5 w-3.5" />
            Nuevo panel
          </button>
        )}
      </div>

      {/* ── Grid ────────────────────────────────────────────────────────── */}
      <div ref={containerRef} className="flex-1 overflow-y-auto p-4">
        {mounted && (
          <GL
            key={activePageId}
            layout={rglLayouts as any}
            cols={COLS}
            rowHeight={ROW_HEIGHT}
            width={containerW - 32}
            isDraggable={editMode}
            isResizable={editMode}
            onLayoutChange={onLayoutChange as any}
            draggableHandle=".drag-handle"
            margin={[12, 12]}
          >
            {activeWidgets.map(w => (
              <div key={w.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                <div className={`flex items-center gap-2 px-3 py-2 border-b border-slate-100 flex-shrink-0 ${editMode ? 'cursor-grab active:cursor-grabbing bg-slate-50' : ''}`}>
                  {editMode && <GripVertical className="drag-handle h-3.5 w-3.5 text-slate-400 flex-shrink-0 cursor-grab" />}
                  <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: w.color }} />
                  <span className="text-xs font-semibold text-slate-700 flex-1 truncate">{w.title}</span>
                  <button onClick={() => setEditingWidget(w)}
                    className="text-slate-300 hover:text-orange-500 transition-colors flex-shrink-0 ml-auto"
                    title="Configurar widget">
                    <SlidersHorizontal className="h-3 w-3" />
                  </button>
                  {editMode && (
                    <button onClick={() => removeWidget(w.id)} className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex-1 overflow-hidden min-h-0">
                  <WidgetContent
                    {...data}
                    widget={w}
                    monthlyRows={monthlyRows}
                    reportYear={reportYear}
                    reportMonth={reportMonth}
                    onMonthChange={handleMonthChange}
                  />
                </div>
              </div>
            ))}
          </GL>
        )}
        {/* Placeholder cuando el panel está vacío */}
        {mounted && activeWidgets.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <BarChart3 className="h-10 w-10 mb-3 text-slate-300" />
            <p className="text-sm font-semibold">Panel vacío</p>
            <p className="text-xs mt-1">Activá <strong>Configurar</strong> y luego <strong>Agregar</strong> para sumar widgets.</p>
          </div>
        )}
      </div>

      {/* ── Catálogo modal ──────────────────────────────────────────────── */}
      {showCatalog && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={() => setShowCatalog(false)} />
          <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl border border-slate-200 w-[440px] max-h-[70vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <p className="text-sm font-bold text-slate-900">Agregar widget</p>
                <p className="text-xs text-slate-400 mt-0.5">{activePage.name} · {activeWidgets.length}/{MAX_WIDGETS} widgets</p>
              </div>
              <button onClick={() => setShowCatalog(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-2.5">
              {CATALOG.map(item => (
                <button key={item.type} onClick={() => addWidget(item.type)} disabled={atMax}
                  className={`flex items-center gap-3 px-3 py-3 rounded-xl border transition-all text-left group ${atMax ? 'opacity-40 cursor-not-allowed border-slate-100' : 'border-slate-200 hover:border-orange-300 hover:bg-orange-50'}`}>
                  <div className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: item.defaultColor + '18', color: item.defaultColor }}>
                    {item.icon}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-800 group-hover:text-orange-700">{item.label}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Widget edit modal ───────────────────────────────────────────── */}
      {editingWidget && (
        <WidgetEditModal
          widget={editingWidget}
          allData={{ widget: editingWidget, ...data, monthlyRows, reportYear, reportMonth, onMonthChange: handleMonthChange }}
          onSave={patch => updateWidget(editingWidget.id, patch)}
          onClose={() => setEditingWidget(null)}
        />
      )}
    </div>
  );
}
