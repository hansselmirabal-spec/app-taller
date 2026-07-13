'use client';
import { useState, useMemo, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { LayoutItem as RGLLayout } from 'react-grid-layout';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  Activity, TrendingUp, CheckCircle2, Target,
  ArrowUpRight, ArrowDownRight, AlertTriangle,
  Plus, Settings2, Trash2, X, GripVertical,
  BarChart3, PieChart as PieIcon, Table2, TrendingDown,
  Users, ChevronLeft, ChevronRight,
  AlignLeft, Hash, Pencil, Check, Gauge,
} from 'lucide-react';
import Link from 'next/link';
import {
  format, subDays, parseISO, eachDayOfInterval, differenceInDays,
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
  { ssr: false },
);

// ─── Constantes ───────────────────────────────────────────────────────────────
const STORAGE_KEY    = 'mechanic_reporteria_v4';
const MAX_PAGES      = 3;
const MAX_WIDGETS    = 10;
const COLS           = 12;
const ROW_HEIGHT     = 62;
const HOURS_PER_DAY  = 10;

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Agendado', in_progress: 'En proceso', done: 'Listo', cancelled: 'Cancelado',
};
const STATUS_COLORS: Record<string, string> = {
  scheduled: '#3b82f6', in_progress: '#f59e0b', done: '#22c55e', cancelled: '#ef4444',
};

const COLOR_SWATCHES = [
  '#3b82f6', '#22c55e', '#ef4444', '#f59e0b',
  '#8b5cf6', '#f97316', '#ec4899', '#14b8a6',
  '#64748b', '#0ea5e9', '#dc2626', '#16a34a',
];

// ─── Tipos ────────────────────────────────────────────────────────────────────
type WidgetType =
  | 'kpi_turnos' | 'kpi_ocupacion' | 'kpi_completados' | 'kpi_throughput' | 'kpi_throughput_horas'
  | 'trend_diaria' | 'barras_tech' | 'mix_servicio' | 'estado_donut'
  | 'tabla_turnos' | 'tabla_carga_tech';

type ChartVariant = 'line' | 'area' | 'bar' | 'bar_h' | 'stacked' | 'donut' | 'table' | 'kpi';

interface GridPos { x: number; y: number; w: number; h: number }
interface Widget { id: string; type: WidgetType; title: string; color: string; layout: GridPos; chartType?: ChartVariant }
interface Page   { id: string; name: string; widgets: Widget[] }

const CHART_TYPE_DEF: Record<ChartVariant, { label: string; icon: React.ReactNode }> = {
  line:    { label: 'Líneas',   icon: <TrendingUp   className="h-4 w-4" /> },
  area:    { label: 'Área',     icon: <Activity     className="h-4 w-4" /> },
  bar:     { label: 'Barras',   icon: <BarChart3    className="h-4 w-4" /> },
  bar_h:   { label: 'Barras H', icon: <AlignLeft    className="h-4 w-4" /> },
  stacked: { label: 'Apilado',  icon: <TrendingDown className="h-4 w-4" /> },
  donut:   { label: 'Dona',     icon: <PieIcon      className="h-4 w-4" /> },
  table:   { label: 'Tabla',    icon: <Table2       className="h-4 w-4" /> },
  kpi:     { label: 'Número',   icon: <Hash         className="h-4 w-4" /> },
};

const WIDGET_DEFAULTS: Record<WidgetType, ChartVariant> = {
  kpi_turnos:           'kpi',
  kpi_ocupacion:        'kpi',
  kpi_completados:      'kpi',
  kpi_throughput:       'kpi',
  kpi_throughput_horas: 'kpi',
  trend_diaria:         'line',
  barras_tech:          'bar_h',
  mix_servicio:         'bar_h',
  estado_donut:         'donut',
  tabla_turnos:         'table',
  tabla_carga_tech:     'table',
};

const WIDGET_COMPATIBLE: Record<WidgetType, ChartVariant[]> = {
  kpi_turnos:           ['kpi', 'bar', 'line', 'area', 'donut'],
  kpi_ocupacion:        ['kpi', 'line', 'area', 'bar'],
  kpi_completados:      ['kpi', 'bar', 'line'],
  kpi_throughput:       ['kpi', 'bar'],
  kpi_throughput_horas: ['kpi', 'bar'],
  trend_diaria:         ['line', 'area', 'bar', 'stacked', 'table'],
  barras_tech:          ['bar_h', 'bar', 'donut', 'table'],
  mix_servicio:         ['bar_h', 'bar', 'donut', 'table'],
  estado_donut:         ['donut', 'bar', 'bar_h', 'table'],
  tabla_turnos:         ['table'],
  tabla_carga_tech:     ['table'],
};

const CATALOG: Array<{ type: WidgetType; label: string; defaultTitle: string; defaultLayout: GridPos; defaultColor: string; icon: React.ReactNode }> = [
  { type: 'kpi_turnos',       label: 'KPI Turnos Totales',       defaultTitle: 'Turnos Totales',          defaultLayout: { x:0, y:0, w:3, h:2 }, defaultColor: '#3b82f6', icon: <Activity     className="h-4 w-4" /> },
  { type: 'kpi_ocupacion',    label: 'KPI Ocupación',            defaultTitle: 'Tasa de Ocupación',       defaultLayout: { x:0, y:0, w:3, h:2 }, defaultColor: '#22c55e', icon: <TrendingUp   className="h-4 w-4" /> },
  { type: 'kpi_completados',  label: 'KPI Completados',          defaultTitle: 'Turnos Completados',      defaultLayout: { x:0, y:0, w:3, h:2 }, defaultColor: '#22c55e', icon: <CheckCircle2 className="h-4 w-4" /> },
  { type: 'kpi_throughput',       label: 'KPI Throughput',          defaultTitle: 'Throughput Diario',       defaultLayout: { x:0, y:0, w:3, h:2 }, defaultColor: '#8b5cf6', icon: <Target       className="h-4 w-4" /> },
  { type: 'kpi_throughput_horas', label: 'KPI Throughput (horas)',  defaultTitle: 'Horas Despachadas',       defaultLayout: { x:0, y:0, w:3, h:2 }, defaultColor: '#0ea5e9', icon: <Activity     className="h-4 w-4" /> },
  { type: 'trend_diaria',     label: 'Tendencia Diaria',         defaultTitle: 'Tendencia de Turnos',     defaultLayout: { x:0, y:0, w:6, h:4 }, defaultColor: '#3b82f6', icon: <TrendingUp   className="h-4 w-4" /> },
  { type: 'barras_tech',      label: 'Productividad Técnicos',   defaultTitle: 'Completados por Técnico', defaultLayout: { x:0, y:0, w:6, h:4 }, defaultColor: '#22c55e', icon: <Users        className="h-4 w-4" /> },
  { type: 'mix_servicio',     label: 'Mix por Tipo de Servicio', defaultTitle: 'Mix de Servicios',        defaultLayout: { x:0, y:0, w:7, h:4 }, defaultColor: '#8b5cf6', icon: <BarChart3    className="h-4 w-4" /> },
  { type: 'estado_donut',     label: 'Mix por Estado',           defaultTitle: 'Distribución de Estado',  defaultLayout: { x:0, y:0, w:5, h:4 }, defaultColor: '#f59e0b', icon: <PieIcon      className="h-4 w-4" /> },
  { type: 'tabla_turnos',     label: 'Historial de Turnos',      defaultTitle: 'Historial de Turnos',     defaultLayout: { x:0, y:0, w:12,h:5 }, defaultColor: '#64748b', icon: <Table2       className="h-4 w-4" /> },
  { type: 'tabla_carga_tech', label: 'Balance por Técnico',      defaultTitle: 'Balance por Técnico',     defaultLayout: { x:0, y:0, w:12,h:6 }, defaultColor: '#0ea5e9', icon: <Users        className="h-4 w-4" /> },
];

const DEFAULT_WIDGETS: Widget[] = [
  { id: 'm1', type: 'kpi_turnos',       title: 'Turnos Totales',          color: '#3b82f6', layout: { x:0,  y:0, w:3, h:2 } },
  { id: 'm2', type: 'kpi_ocupacion',    title: 'Tasa de Ocupación',       color: '#22c55e', layout: { x:3,  y:0, w:3, h:2 } },
  { id: 'm3', type: 'kpi_completados',  title: 'Turnos Completados',      color: '#22c55e', layout: { x:6,  y:0, w:3, h:2 } },
  { id: 'm4', type: 'kpi_throughput',   title: 'Throughput Diario',       color: '#8b5cf6', layout: { x:9,  y:0, w:3, h:2 } },
  { id: 'm5', type: 'trend_diaria',     title: 'Tendencia de Turnos',     color: '#3b82f6', layout: { x:0,  y:2, w:6, h:4 } },
  { id: 'm6', type: 'barras_tech',      title: 'Completados por Técnico', color: '#22c55e', layout: { x:6,  y:2, w:6, h:4 } },
  { id: 'm7', type: 'mix_servicio',     title: 'Mix de Servicios',        color: '#8b5cf6', layout: { x:0,  y:6, w:7, h:4 } },
  { id: 'm8', type: 'estado_donut',     title: 'Distribución Estado',     color: '#f59e0b', layout: { x:7,  y:6, w:5, h:4 } },
  { id: 'm9', type: 'tabla_turnos',     title: 'Historial de Turnos',     color: '#64748b', layout: { x:0, y:10, w:12,h:5 } },
];

const DEFAULT_PAGES: Page[] = [{ id: 'p1', name: 'Panel 1', widgets: DEFAULT_WIDGETS }];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toMinutes(hhmm: string): number {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m ?? 0);
}
function apptHours(a: Appointment): number {
  const m = toMinutes(a.timeEnd) - toMinutes(a.timeStart);
  return m > 0 ? m / 60 : Number(a.serviceType?.durationHours ?? 0);
}
function workingDays(from: string, to: string): number {
  return eachDayOfInterval({ start: parseISO(from + 'T12:00:00'), end: parseISO(to + 'T12:00:00') })
    .filter(d => d.getDay() !== 0).length;
}
function durationLabel(a: Appointment): string {
  const m = toMinutes(a.timeEnd) - toMinutes(a.timeStart);
  if (m <= 0) return `${Number(a.serviceType?.durationHours ?? 0)}h`;
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r > 0 ? `${h}h ${r}m` : `${h}h`;
}

// ─── Hook de datos ────────────────────────────────────────────────────────────
function useMechanicData(from: string, to: string) {
  const { data: raw = [] }        = useAppointmentsByRange(from, to);
  const { data: techs = [] }      = useTechnicians();
  const { data: services = [] }   = useServiceTypes();
  const activeTechs = techs.filter(t => t.active);

  const active    = useMemo(() => raw.filter(a => a.status !== 'cancelled'), [raw]);
  const done      = useMemo(() => raw.filter(a => a.status === 'done'),      [raw]);
  const wdays     = workingDays(from, to);
  const techCount = activeTechs.length;
  const capHours  = techCount * wdays * HOURS_PER_DAY;

  const usedHours = useMemo(() => active.reduce((s, a) => s + apptHours(a), 0), [active]);
  const occupancy = capHours > 0 ? Math.round((usedHours / capHours) * 100) : 0;
  const throughput = wdays > 0 && techCount > 0 ? parseFloat((done.length / wdays / techCount).toFixed(1)) : 0;

  // Throughput de horas: horas totales de turnos completados / técnicos / día.
  // Refleja COMPLEJIDAD del trabajo (1 reparación grande pesa más que 5 cambios de aceite),
  // a diferencia del throughput por cantidad que cuenta a cada turno como 1.
  const doneHours = useMemo(() => done.reduce((s, a) => s + apptHours(a), 0), [done]);
  const throughputHoras = wdays > 0 && techCount > 0
    ? parseFloat((doneHours / wdays / techCount).toFixed(1))
    : 0;

  const kpiTurnos = useMemo(() => ({
    value: raw.length, active: active.length,
    cancelled: raw.filter(a => a.status === 'cancelled').length,
    done: done.length,
  }), [raw, active, done]);

  // Daily trend (completados/agendados/cancelados)
  const trendDiaria = useMemo(() => {
    const days = eachDayOfInterval({ start: parseISO(from + 'T12:00:00'), end: parseISO(to + 'T12:00:00') });
    return days.map(d => {
      const ds = format(d, 'yyyy-MM-dd');
      const day = raw.filter(a => a.date === ds);
      return {
        date:        format(d, 'd/M', { locale: es }),
        completados: day.filter(a => a.status === 'done').length,
        agendados:   day.filter(a => a.status === 'scheduled').length,
        cancelados:  day.filter(a => a.status === 'cancelled').length,
      };
    });
  }, [raw, from, to]);

  // Productividad por técnico
  const techProductivity = useMemo(() => activeTechs.map(tech => {
    const ta = active.filter(a => a.technicianId === tech.id);
    const completed = ta.filter(a => a.status === 'done').length;
    const hoursDone = parseFloat(
      ta.filter(a => a.status === 'done').reduce((s, a) => s + apptHours(a), 0).toFixed(1),
    );
    const usedH = ta.reduce((s, a) => s + apptHours(a), 0);
    const availH = wdays * HOURS_PER_DAY;
    const occ = availH > 0 ? Math.round((usedH / availH) * 100) : 0;
    return { name: tech.name.split(' ')[0], fullName: tech.name, id: tech.id, completed, hoursDone, occ, usedH };
  }).sort((a, b) => b.completed - a.completed), [activeTechs, active, wdays]);

  // Mix de servicios
  const serviceMix = useMemo(() => {
    const totals: Record<string, { name: string; color: string; count: number; totalHours: number }> = {};
    active.forEach(a => {
      const name = a.serviceType?.name ?? a.serviceTypeId;
      const color = a.serviceType?.color ?? '#64748b';
      if (!totals[name]) totals[name] = { name, color, count: 0, totalHours: 0 };
      totals[name].count++;
      totals[name].totalHours += Number(a.serviceType?.durationHours ?? 0);
    });
    return Object.values(totals).sort((a, b) => b.count - a.count);
  }, [active]);

  // Estado donut
  const statusDonut = useMemo(() => {
    const s = [
      { key: 'done',        label: 'Completados', color: '#22c55e' },
      { key: 'in_progress', label: 'En proceso',  color: '#f59e0b' },
      { key: 'scheduled',   label: 'Agendado',    color: '#3b82f6' },
      { key: 'cancelled',   label: 'Cancelado',   color: '#ef4444' },
    ];
    return s.map(({ key, label, color }) => ({ name: label, color, count: raw.filter(a => a.status === key).length }))
      .filter(d => d.count > 0);
  }, [raw]);

  // Tabla de turnos
  const tableData = useMemo(() =>
    [...raw].sort((a, b) => b.date.localeCompare(a.date) || b.timeStart.localeCompare(a.timeStart)).slice(0, 30),
  [raw]);

  // Balance mensual por técnico (de los datos disponibles)
  const techBalance = useMemo(() => activeTechs.map(tech => {
    const ta = active.filter(a => a.technicianId === tech.id);
    const usedH = ta.reduce((s, a) => s + apptHours(a), 0);
    const completed = ta.filter(a => a.status === 'done').length;
    const targetH = wdays * HOURS_PER_DAY;
    const balance = parseFloat((usedH - targetH).toFixed(1));
    const compliance = targetH > 0 ? Math.round((usedH / targetH) * 100) : 0;
    return { id: tech.id, name: tech.name, usedH: parseFloat(usedH.toFixed(1)), targetH, balance, compliance, completed };
  }).sort((a, b) => b.compliance - a.compliance), [activeTechs, active, wdays]);

  // Datos para variantes de KPI turnos
  const dailyTurnos = useMemo(() => {
    const days = eachDayOfInterval({ start: parseISO(from + 'T12:00:00'), end: parseISO(to + 'T12:00:00') });
    return days.filter(d => d.getDay() !== 0).map(d => ({
      date: format(d, 'd/M', { locale: es }),
      value: raw.filter(a => a.date === format(d, 'yyyy-MM-dd') && a.status !== 'cancelled').length,
    }));
  }, [raw, from, to]);

  const dailyOccupancy = useMemo(() => {
    const days = eachDayOfInterval({ start: parseISO(from + 'T12:00:00'), end: parseISO(to + 'T12:00:00') });
    return days.filter(d => d.getDay() !== 0).map(d => {
      const ds = format(d, 'yyyy-MM-dd');
      const dayActive = raw.filter(a => a.date === ds && a.status !== 'cancelled');
      const dayUsedH = dayActive.reduce((s, a) => s + apptHours(a), 0);
      const dayCapH = techCount * HOURS_PER_DAY;
      return { date: format(d, 'd/M', { locale: es }), value: dayCapH > 0 ? Math.round((dayUsedH / dayCapH) * 100) : 0 };
    });
  }, [raw, from, to, techCount]);

  return {
    kpiTurnos, occupancy, usedHours, capHours, throughput, throughputHoras, doneHours, done,
    trendDiaria, techProductivity, serviceMix, statusDonut, tableData, techBalance,
    dailyTurnos, dailyOccupancy, services,
  };
}

// ─── Componentes de visualización ─────────────────────────────────────────────

function Empty() {
  return <div className="flex items-center justify-center h-full text-xs text-slate-400">Sin datos para el período</div>;
}

function KpiWidget({ title, value, sub, icon, color, delta }: {
  title: string; value: string; sub: string; icon: React.ReactNode; color: string; delta?: number;
}) {
  const isPos = (delta ?? 0) >= 0;
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
          <div className="flex items-center gap-0.5 text-xs font-semibold" style={{ color: isPos ? '#22c55e' : '#ef4444' }}>
            {isPos ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
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

// ─── TrendDiaria — line / area / bar / stacked / table ───────────────────────
type TrendRow = { date: string; completados: number; agendados: number; cancelados: number };

function TrendDiariaWidget({ data, variant = 'line' }: { data: TrendRow[]; variant?: ChartVariant }) {
  if (!data.length) return <Empty />;
  const xInterval = Math.max(0, Math.floor(data.length / 10) - 1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fmt = (v: any, name: any) => [v, STATUS_LABELS[name] ?? name];
  const legend = (v: string) => <span style={{ fontSize: 10, color: '#64748b' }}>{STATUS_LABELS[v] ?? v}</span>;
  const stackId = (variant === 'stacked' || variant === 'bar') ? 'a' : undefined;

  if (variant === 'table') {
    return (
      <div className="overflow-auto h-full">
        <table className="w-full text-xs">
          <thead><tr className="bg-slate-50 border-b border-slate-100 sticky top-0">
            <th className="px-3 py-2 text-left font-semibold text-slate-500">Fecha</th>
            <th className="px-3 py-2 text-right font-semibold text-green-600">Completados</th>
            <th className="px-3 py-2 text-right font-semibold text-blue-600">Agendados</th>
            <th className="px-3 py-2 text-right font-semibold text-red-500">Cancelados</th>
          </tr></thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.date} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-3 py-1.5 text-slate-600">{d.date}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-green-700">{d.completados}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-blue-700">{d.agendados}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-red-500">{d.cancelados}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="px-2 pb-2 h-full">
      <ResponsiveContainer width="100%" height="100%">
        {variant === 'area' ? (
          <AreaChart data={data} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} interval={xInterval} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} formatter={fmt} />
            <Legend verticalAlign="bottom" height={24} formatter={legend} />
            <Area type="monotone" dataKey="completados" stroke="#22c55e" fill="#22c55e" fillOpacity={0.15} strokeWidth={2} dot={false} name="completados" />
            <Area type="monotone" dataKey="agendados"   stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1}  strokeWidth={1.5} dot={false} name="agendados" />
            <Area type="monotone" dataKey="cancelados"  stroke="#ef4444" fill="#ef4444" fillOpacity={0.1}  strokeWidth={1.5} dot={false} strokeDasharray="3 3" name="cancelados" />
          </AreaChart>
        ) : variant === 'bar' || variant === 'stacked' ? (
          <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} interval={xInterval} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} formatter={fmt} />
            <Legend verticalAlign="bottom" height={24} formatter={legend} />
            <Bar dataKey="completados" fill="#22c55e" name="completados" stackId={stackId} />
            <Bar dataKey="agendados"   fill="#3b82f6" name="agendados"   stackId={stackId} />
            <Bar dataKey="cancelados"  fill="#ef4444" name="cancelados"  stackId={stackId} radius={[4,4,0,0]} />
          </BarChart>
        ) : (
          <LineChart data={data} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} interval={xInterval} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} formatter={fmt} />
            <Legend verticalAlign="bottom" height={24} formatter={legend} />
            <Line type="monotone" dataKey="completados" stroke="#22c55e" strokeWidth={2} dot={false} name="completados" />
            <Line type="monotone" dataKey="agendados"   stroke="#3b82f6" strokeWidth={1.5} dot={false} name="agendados" />
            <Line type="monotone" dataKey="cancelados"  stroke="#ef4444" strokeWidth={1.5} dot={false} strokeDasharray="3 3" name="cancelados" />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// ─── MixWidget — bar_h / bar / donut / table ─────────────────────────────────
type MixRow = { name: string; color: string; count: number };

function MixWidget({ data, variant = 'bar_h', valueLabel = 'turnos' }: {
  data: MixRow[]; variant?: ChartVariant; valueLabel?: string;
}) {
  if (!data.length) return <Empty />;
  const total = data.reduce((s, d) => s + d.count, 0);

  if (variant === 'table') {
    return (
      <div className="overflow-auto h-full">
        <table className="w-full text-xs">
          <thead><tr className="bg-slate-50 border-b border-slate-100 sticky top-0">
            <th className="px-3 py-2 text-left font-semibold text-slate-500">Nombre</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-500">{valueLabel}</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-500">%</th>
          </tr></thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.name} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-3 py-1.5 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />{d.name}
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
                formatter={(v: any, _: any, p: any) => [`${v} ${valueLabel}`, p.payload.name]} />
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

  const isH = variant === 'bar_h';
  return (
    <div className="px-2 pb-2 h-full">
      <ResponsiveContainer width="100%" height="100%">
        {isH ? (
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} width={72} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any) => [`${v} ${valueLabel}`]} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {data.map((e, i) => <Cell key={i} fill={e.color} />)}
            </Bar>
          </BarChart>
        ) : (
          <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any) => [`${v} ${valueLabel}`]} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {data.map((e, i) => <Cell key={i} fill={e.color} />)}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// ─── TablaTurnos ─────────────────────────────────────────────────────────────
function TablaTurnos({ data }: { data: Appointment[] }) {
  if (!data.length) return <Empty />;
  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
            <th className="px-3 py-2 text-left font-semibold text-slate-500">Fecha</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-500">Horario</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-500">Cliente</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-500">Chapa</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-500">Servicio</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-500">Técnico</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-500">Dur.</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-500">Estado</th>
          </tr>
        </thead>
        <tbody>
          {data.map((a, i) => {
            const sc = STATUS_COLORS[a.status] ?? '#94a3b8';
            return (
              <tr key={a.id} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${i % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}>
                <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{format(parseISO(a.date + 'T12:00:00'), 'd MMM', { locale: es })}</td>
                <td className="px-3 py-2 tabular-nums text-slate-500 whitespace-nowrap">{a.timeStart}–{a.timeEnd}</td>
                <td className="px-3 py-2 font-semibold text-slate-900 max-w-[120px] truncate">{a.customerName}</td>
                <td className="px-3 py-2">
                  {a.plate
                    ? <span className="font-mono font-bold text-[10px] bg-slate-100 px-1.5 py-0.5 rounded">{a.plate}</span>
                    : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-3 py-2 max-w-[100px] truncate text-slate-600">{a.serviceType?.name ?? '—'}</td>
                <td className="px-3 py-2 text-slate-600">{a.technician?.name?.split(' ')[0] ?? '—'}</td>
                <td className="px-3 py-2 tabular-nums text-slate-500">{durationLabel(a)}</td>
                <td className="px-3 py-2">
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
                    style={{ background: sc + '22', color: sc }}>
                    {STATUS_LABELS[a.status] ?? a.status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── TablaCargaTech ───────────────────────────────────────────────────────────
type TechBalanceRow = { id: string; name: string; usedH: number; targetH: number; balance: number; compliance: number; completed: number };

function ComplianceBadge({ pct }: { pct: number }) {
  const bg = pct >= 90 ? '#22c55e18' : pct >= 60 ? '#f59e0b18' : '#ef444418';
  const fg = pct >= 90 ? '#15803d' : pct >= 60 ? '#b45309' : '#b91c1c';
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: bg, color: fg }}>
      {pct}%
    </span>
  );
}

function TablaCargaTech({ rows }: { rows: TechBalanceRow[] }) {
  const [filterCompliance, setFilterCompliance] = useState<string>('ALL');
  const filtered = rows.filter(r => {
    if (filterCompliance === 'HIGH') return r.compliance >= 90;
    if (filterCompliance === 'MID')  return r.compliance >= 60 && r.compliance < 90;
    if (filterCompliance === 'LOW')  return r.compliance < 60;
    return true;
  });

  if (!rows.length) return <Empty />;
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 flex-shrink-0">
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
          {[{ k: 'ALL', label: 'Todos' }, { k: 'HIGH', label: '≥90%' }, { k: 'MID', label: '60-89%' }, { k: 'LOW', label: '<60%' }].map(({ k, label }) => (
            <button key={k} onClick={() => setFilterCompliance(k)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all ${filterCompliance === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto text-[10px] text-slate-400">{filtered.length} técnico{filtered.length !== 1 ? 's' : ''}</div>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 sticky top-0 z-10">
              <th className="text-left px-3 py-2 font-semibold text-slate-500">Técnico</th>
              <th className="text-right px-3 py-2 font-semibold text-slate-500">Meta</th>
              <th className="text-right px-3 py-2 font-semibold text-slate-500">Usadas</th>
              <th className="text-right px-3 py-2 font-semibold text-slate-500">Balance</th>
              <th className="text-center px-3 py-2 font-semibold text-slate-500">Cumpl.</th>
              <th className="text-center px-3 py-2 font-semibold text-slate-500">Carga</th>
              <th className="text-right px-3 py-2 font-semibold text-slate-500">Compl.</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const loadPct = Math.min(100, r.targetH > 0 ? (r.usedH / r.targetH) * 100 : 0);
              const loadFill = loadPct >= 100 ? '#ef4444' : loadPct >= 75 ? '#f59e0b' : '#22c55e';
              const balPos = r.balance >= 0;
              return (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-2.5 font-semibold text-slate-900">{r.name}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{r.targetH}h</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-900">{r.usedH}h</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={`text-[10px] font-semibold flex items-center justify-end gap-0.5 ${balPos ? 'text-emerald-600' : 'text-red-600'}`}>
                      {balPos ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {Math.abs(r.balance)}h
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center"><ComplianceBadge pct={r.compliance} /></td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5 justify-center">
                      <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${loadPct}%`, background: loadFill }} />
                      </div>
                      <span className="text-[10px] text-slate-500 tabular-nums">{Math.round(loadPct)}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{r.completed}</td>
                </tr>
              );
            })}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wide">Total</td>
                <td className="px-3 py-2 text-right text-xs font-bold tabular-nums">{filtered.reduce((s, r) => s + r.targetH, 0)}h</td>
                <td className="px-3 py-2 text-right text-xs font-bold tabular-nums">{filtered.reduce((s, r) => s + r.usedH, 0).toFixed(1)}h</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ─── WidgetContent ────────────────────────────────────────────────────────────
type WData = ReturnType<typeof useMechanicData>;

function WidgetContent({ widget, wdata }: { widget: Widget; wdata: WData }) {
  const variant = widget.chartType ?? WIDGET_DEFAULTS[widget.type];
  const { kpiTurnos, occupancy, usedHours, capHours, throughput, throughputHoras, doneHours, done,
    trendDiaria, techProductivity, serviceMix, statusDonut, tableData, techBalance,
    dailyTurnos, dailyOccupancy } = wdata;

  switch (widget.type) {
    case 'kpi_turnos': {
      if (variant === 'kpi') {
        return <KpiWidget title={widget.title} value={String(kpiTurnos.active)} sub={`${kpiTurnos.cancelled} cancelados de ${kpiTurnos.value} total`} icon={<Activity className="h-5 w-5" />} color={widget.color} />;
      }
      if (variant === 'donut') {
        return <MixWidget data={statusDonut} variant="donut" valueLabel="turnos" />;
      }
      const barData = dailyTurnos.map(d => ({ ...d, count: d.value, color: widget.color, name: d.date }));
      return variant === 'bar' || variant === 'line' || variant === 'area'
        ? <TrendDiariaWidget data={trendDiaria} variant={variant} />
        : <MixWidget data={barData} variant={variant} />;
    }
    case 'kpi_ocupacion': {
      if (variant === 'kpi') {
        return <KpiWidget title={widget.title} value={`${occupancy}%`} sub={`${usedHours.toFixed(1)}h usadas de ${capHours.toFixed(0)}h disponibles`} icon={<TrendingUp className="h-5 w-5" />} color={widget.color} />;
      }
      const occData = dailyOccupancy.map(d => ({ date: d.date, completados: d.value, agendados: 0, cancelados: 0 }));
      return <TrendDiariaWidget data={occData} variant={variant} />;
    }
    case 'kpi_completados': {
      if (variant === 'kpi') {
        const pct = kpiTurnos.value > 0 ? Math.round((done.length / kpiTurnos.value) * 100) : 0;
        return <KpiWidget title={widget.title} value={String(done.length)} sub={`${pct}% del total (${kpiTurnos.value} turnos)`} icon={<CheckCircle2 className="h-5 w-5" />} color={widget.color} />;
      }
      return <TrendDiariaWidget data={trendDiaria} variant={variant} />;
    }
    case 'kpi_throughput': {
      if (variant === 'kpi') {
        return <KpiWidget title={widget.title} value={String(throughput)} sub="completados / técnico / día" icon={<Target className="h-5 w-5" />} color={widget.color} />;
      }
      const tpData = techProductivity.map(t => ({ name: t.name, count: t.completed, color: widget.color }));
      return <MixWidget data={tpData} variant="bar_h" />;
    }
    case 'kpi_throughput_horas': {
      if (variant === 'kpi') {
        return <KpiWidget
          title={widget.title}
          value={`${throughputHoras}h`}
          sub={`horas / técnico / día · ${doneHours.toFixed(0)}h totales`}
          icon={<Activity className="h-5 w-5" />}
          color={widget.color}
        />;
      }
      const thData = techProductivity.map(t => ({ name: t.name, count: t.hoursDone ?? 0, color: widget.color }));
      return <MixWidget data={thData} variant="bar_h" valueLabel="horas" />;
    }
    case 'trend_diaria':
      return <TrendDiariaWidget data={trendDiaria} variant={variant} />;
    case 'barras_tech':
      return <MixWidget data={techProductivity.map(t => ({ name: t.name, count: t.completed, color: t.occ >= 80 ? '#22c55e' : t.occ >= 60 ? '#f59e0b' : '#ef4444' }))} variant={variant} valueLabel="completados" />;
    case 'mix_servicio':
      return <MixWidget data={serviceMix} variant={variant} valueLabel="turnos" />;
    case 'estado_donut':
      return <MixWidget data={statusDonut} variant={variant} valueLabel="turnos" />;
    case 'tabla_turnos':
      return <TablaTurnos data={tableData} />;
    case 'tabla_carga_tech':
      return <TablaCargaTech rows={techBalance} />;
    default:
      return <Empty />;
  }
}

// ─── WidgetCard ───────────────────────────────────────────────────────────────
function WidgetCard({ widget, editMode, wdata, onRemove, onEdit }: {
  widget: Widget; editMode: boolean; wdata: WData; onRemove: () => void; onEdit: () => void;
}) {
  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden flex flex-col h-full transition-all ${editMode ? 'border-blue-300 shadow-blue-100' : 'border-slate-200'}`}>
      <div className={`flex items-center gap-2 px-3 py-2 border-b border-slate-100 flex-shrink-0 ${editMode ? 'cursor-grab active:cursor-grabbing' : ''}`}>
        {editMode && <GripVertical className="h-3.5 w-3.5 text-slate-300 flex-shrink-0" />}
        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: widget.color }} />
        <span className="text-xs font-semibold text-slate-700 flex-1 truncate">{widget.title}</span>
        {editMode && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button onClick={e => { e.stopPropagation(); onEdit(); }} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700">
              <Pencil className="h-3 w-3" />
            </button>
            <button onClick={e => { e.stopPropagation(); onRemove(); }} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <WidgetContent widget={widget} wdata={wdata} />
      </div>
    </div>
  );
}

// ─── WidgetEditModal ──────────────────────────────────────────────────────────
function WidgetEditModal({ widget, wdata, onSave, onClose }: {
  widget: Widget; wdata: WData; onSave: (patch: Partial<Widget>) => void; onClose: () => void;
}) {
  const [title,     setTitle]     = useState(widget.title);
  const [color,     setColor]     = useState(widget.color);
  const [chartType, setChartType] = useState<ChartVariant>(widget.chartType ?? WIDGET_DEFAULTS[widget.type]);
  const compatible = WIDGET_COMPATIBLE[widget.type] ?? [];
  const preview: Widget = { ...widget, title, color, chartType };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 flex overflow-hidden" style={{ width: 780, maxHeight: '88vh' }}>

        {/* Panel izquierdo */}
        <div className="w-64 flex-shrink-0 border-r border-slate-100 flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Modificar Widget</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">Nombre</label>
              <input value={title} onChange={e => setTitle(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400" />
            </div>
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
            {compatible.length > 1 && (
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">Mostrar como</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {compatible.map(ct => {
                    const def = CHART_TYPE_DEF[ct];
                    const active = chartType === ct;
                    return (
                      <button key={ct} onClick={() => setChartType(ct)}
                        className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl border-2 transition-all ${active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-blue-200 hover:bg-blue-50/60'}`}>
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
            <button onClick={onClose} className="flex-1 px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
              Cancelar
            </button>
            <button onClick={() => { onSave({ title, color, chartType }); onClose(); }}
              className="flex-1 px-3 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              Actualizar
            </button>
          </div>
        </div>

        {/* Preview */}
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
                <WidgetContent widget={preview} wdata={wdata} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── AddModal ─────────────────────────────────────────────────────────────────
function AddModal({ count, onAdd, onClose }: { count: number; onAdd: (w: Widget) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 z-10">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-slate-900">Agregar Widget</h2>
            <p className="text-xs text-slate-500 mt-0.5">Elegí el componente para tu tablero</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {CATALOG.map(item => (
            <button key={item.type}
              disabled={count >= MAX_WIDGETS}
              onClick={() => { onAdd({ id: `m${Date.now()}`, type: item.type, title: item.defaultTitle, color: item.defaultColor, layout: { ...item.defaultLayout, y: 999 }, chartType: WIDGET_DEFAULTS[item.type] }); onClose(); }}
              className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-left transition-all group disabled:opacity-40 disabled:pointer-events-none">
              <div className="h-8 w-8 rounded-lg bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center flex-shrink-0 text-slate-500 group-hover:text-blue-600">{item.icon}</div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 truncate">{item.label}</p>
                <p className="text-xs text-slate-400">{item.type.startsWith('kpi') ? 'Indicador' : item.type.startsWith('tabla') ? 'Tabla' : 'Gráfico'}</p>
              </div>
            </button>
          ))}
        </div>
        {count >= MAX_WIDGETS && <p className="mt-3 text-xs text-center text-amber-600">Máximo {MAX_WIDGETS} widgets por panel</p>}
      </div>
    </div>
  );
}

// ─── Page Principal ───────────────────────────────────────────────────────────
export default function MechanicReporteriaPage() {
  const today = formatDate(new Date());
  const [from, setFrom]           = useState(formatDate(subDays(new Date(), 29)));
  const [to, setTo]               = useState(today);
  const [editMode, setEditMode]   = useState(false);
  const [showAdd, setShowAdd]     = useState(false);
  const [editingWidget, setEditingWidget] = useState<Widget | null>(null);
  const [pages, setPages]         = useState<Page[]>(DEFAULT_PAGES);
  const [activePage, setActivePage] = useState(0);
  const [mounted, setMounted]     = useState(false);
  const [containerWidth, setContainerWidth] = useState(1200);

  const wdata = useMechanicData(from, to);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setPages(JSON.parse(saved) as Page[]);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (mounted) localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
  }, [pages, mounted]);

  useEffect(() => {
    const el = document.getElementById('mechanic-reporteria-grid');
    if (!el) return;
    const ro = new ResizeObserver(e => setContainerWidth(e[0].contentRect.width));
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [mounted]);

  const page = pages[activePage] ?? pages[0];
  if (!page) return null;

  const handleLayoutChange = useCallback((layout: Array<RGLLayout>) => {
    setPages(prev => prev.map((p, i) => i !== activePage ? p : {
      ...p,
      widgets: p.widgets.map(w => {
        const item = layout.find(l => l.i === w.id);
        if (!item) return w;
        return { ...w, layout: { x: item.x, y: item.y, w: item.w, h: item.h } };
      }),
    }));
  }, [activePage]);

  function updateWidget(id: string, patch: Partial<Widget>) {
    setPages(prev => prev.map((p, i) => i !== activePage ? p : { ...p, widgets: p.widgets.map(w => w.id === id ? { ...w, ...patch } : w) }));
  }
  function removeWidget(id: string) {
    setPages(prev => prev.map((p, i) => i !== activePage ? p : { ...p, widgets: p.widgets.filter(w => w.id !== id) }));
  }
  function addWidget(w: Widget) {
    setPages(prev => prev.map((p, i) => i !== activePage ? p : { ...p, widgets: [...p.widgets, w] }));
  }
  function addPage() {
    if (pages.length >= MAX_PAGES) return;
    const newPage: Page = { id: `p${Date.now()}`, name: `Panel ${pages.length + 1}`, widgets: [] };
    setPages(prev => [...prev, newPage]);
    setActivePage(pages.length);
  }
  function deletePage(idx: number) {
    if (pages.length <= 1) return;
    setPages(prev => prev.filter((_, i) => i !== idx));
    setActivePage(Math.max(0, activePage - 1));
  }
  function renamePage(idx: number, name: string) {
    setPages(prev => prev.map((p, i) => i === idx ? { ...p, name } : p));
  }

  const gridItems = page.widgets.map(w => ({ i: w.id, ...w.layout, minW: 2, minH: 2 }));

  if (!mounted) return null;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Reportería Mecánica</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {editMode ? 'Modo edición — arrastrá y redimensioná los widgets'
              : `Período: ${format(parseISO(from + 'T12:00:00'), "d MMM", { locale: es })} — ${format(parseISO(to + 'T12:00:00'), "d MMM yyyy", { locale: es })}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/porteria/productividad"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
            title="Reporte de productividad por técnico"
          >
            <Gauge className="h-3.5 w-3.5" /> Productividad
          </Link>
          {editMode && (
            <>
              <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors">
                <Plus className="h-3.5 w-3.5" /> Agregar widget
              </button>
              <button onClick={() => setPages(prev => prev.map((p, i) => i !== activePage ? p : { ...p, widgets: DEFAULT_WIDGETS.map(w => ({ ...w, id: `m${Date.now()}${Math.random()}` })) }))}
                className="text-xs text-slate-500 hover:text-slate-800 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors">
                Restablecer
              </button>
            </>
          )}
          <button onClick={() => setEditMode(e => !e)}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors ${editMode ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>
            {editMode ? <><Check className="h-3.5 w-3.5" /> Listo</> : <><Settings2 className="h-3.5 w-3.5" /> Editar tablero</>}
          </button>
        </div>
      </div>

      {/* Filtros + páginas */}
      <div className="bg-white border-b border-slate-100 px-6 py-2.5 flex items-center gap-3 flex-shrink-0 flex-wrap">
        {/* Quick ranges */}
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
          {[{ label: 'Hoy', days: 0 }, { label: '7d', days: 6 }, { label: '30d', days: 29 }, { label: '90d', days: 89 }].map(({ label, days }) => {
            const f = formatDate(subDays(new Date(), days));
            const active = from === f && to === today;
            return (
              <button key={label} onClick={() => { setFrom(f); setTo(today); }} className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {label}
              </button>
            );
          })}
        </div>
        <div className="h-4 border-l border-slate-200" />
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">Desde</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
          <label className="text-xs text-slate-500">Hasta</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </div>

        {/* Páginas */}
        <div className="h-4 border-l border-slate-200" />
        <div className="flex items-center gap-1">
          {pages.map((p, i) => (
            <div key={p.id} className="flex items-center">
              {editMode && activePage === i ? (
                <input
                  className="text-xs border border-blue-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 w-24"
                  value={p.name}
                  onChange={e => renamePage(i, e.target.value)}
                />
              ) : (
                <button onClick={() => setActivePage(i)}
                  className={`text-xs font-semibold px-3 py-1 rounded-lg transition-all ${activePage === i ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}>
                  {p.name}
                </button>
              )}
              {editMode && pages.length > 1 && (
                <button onClick={() => deletePage(i)} className="ml-0.5 p-0.5 rounded hover:bg-red-50 text-slate-300 hover:text-red-400">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          {editMode && pages.length < MAX_PAGES && (
            <button onClick={addPage} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">
              <Plus className="h-3 w-3" /> Panel
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        <div id="mechanic-reporteria-grid" className="w-full">
          {containerWidth > 0 && (
            <GridLayout
              layout={gridItems}
              width={containerWidth}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onLayoutChange={handleLayoutChange as any}
              gridConfig={{ cols: COLS, rowHeight: ROW_HEIGHT, margin: [12, 12], containerPadding: [0, 0], maxRows: Infinity }}
              dragConfig={{ enabled: editMode, handle: '.drag-handle', bounded: false, threshold: 3 }}
              resizeConfig={{ enabled: editMode }}
            >
              {page.widgets.map(widget => (
                <div key={widget.id} className="drag-handle">
                  <WidgetCard widget={widget} editMode={editMode} wdata={wdata}
                    onRemove={() => removeWidget(widget.id)}
                    onEdit={() => setEditingWidget(widget)} />
                </div>
              ))}
            </GridLayout>
          )}
          {page.widgets.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <BarChart3 className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">Panel vacío</p>
              <p className="text-xs mt-1">Activá "Editar tablero" y agregá widgets</p>
            </div>
          )}
        </div>
      </div>

      {showAdd && <AddModal count={page.widgets.length} onAdd={addWidget} onClose={() => setShowAdd(false)} />}
      {editingWidget && (
        <WidgetEditModal widget={editingWidget} wdata={wdata}
          onSave={patch => updateWidget(editingWidget.id, patch)}
          onClose={() => setEditingWidget(null)} />
      )}
    </div>
  );
}
