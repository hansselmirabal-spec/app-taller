'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { LayoutItem as RGLLayout } from 'react-grid-layout';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from 'recharts';
import {
  TrendingUp, Car, AlertTriangle, CheckCircle2, Plus, Trash2,
  Settings2, GripVertical, X, Layers, Clock, BarChart3,
  Activity, Flame, Zap, CalendarDays, ChevronLeft, ChevronRight,
} from 'lucide-react';
import {
  format, addDays, startOfWeek, endOfWeek, parseISO, subDays,
  startOfMonth, endOfMonth, addMonths, subMonths, eachDayOfInterval,
  addWeeks, subWeeks,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { useBodyshopDayCapacity, useBodyshopWeekCapacity, useBodyshopEntriesKanban } from '@/hooks/use-bodyshop';
import { formatDate } from '@/lib/utils';
import type { CapacityStatus, BodyshopWeekCapacity } from '@/types';

import { InfoButton } from '@/components/ui/info-button';
import 'react-grid-layout/css/styles.css';

const GridLayout = dynamic(
  () => import('react-grid-layout').then(m => ({ default: m.GridLayout })),
  { ssr: false },
);

// ─── Widget types ─────────────────────────────────────────────────────────────

type WidgetType =
  | 'kpi_ingresos' | 'kpi_ocupacion' | 'kpi_semana' | 'kpi_proceso'
  | 'barras_proceso' | 'alertas' | 'trend_semanal' | 'ingresos_tipo'
  | 'lista_hoy' | 'reporte_horas' | 'heatmap_semana' | 'distribucion_pie';

interface DWidget {
  id: string;
  type: WidgetType;
  title: string;
  color: string;
  layout: { x: number; y: number; w: number; h: number };
}

const DEFAULT_WIDGETS: DWidget[] = [
  { id: 'b1', type: 'kpi_ingresos',   title: 'Ingresos Hoy',          color: '#f97316', layout: { x: 0,  y: 0, w: 3, h: 2 } },
  { id: 'b2', type: 'kpi_ocupacion',  title: 'Ocupación Global',       color: '#22c55e', layout: { x: 3,  y: 0, w: 3, h: 2 } },
  { id: 'b3', type: 'kpi_semana',     title: 'Ingresos Semana',        color: '#3b82f6', layout: { x: 6,  y: 0, w: 3, h: 2 } },
  { id: 'b4', type: 'kpi_proceso',    title: 'Proceso Top',            color: '#8b5cf6', layout: { x: 9,  y: 0, w: 3, h: 2 } },
  { id: 'b5', type: 'barras_proceso', title: 'Capacidad por Proceso',  color: '#3b82f6', layout: { x: 0,  y: 2, w: 7, h: 4 } },
  { id: 'b6', type: 'alertas',        title: 'Alertas',                color: '#ef4444', layout: { x: 7,  y: 2, w: 5, h: 4 } },
  { id: 'b7', type: 'trend_semanal',  title: 'Tendencia Semanal',      color: '#3b82f6', layout: { x: 0,  y: 6, w: 7, h: 4 } },
  { id: 'b8', type: 'ingresos_tipo',  title: 'Ingresos por Tipo',      color: '#f97316', layout: { x: 7,  y: 6, w: 5, h: 4 } },
  { id: 'b9', type: 'reporte_horas',  title: 'Reporte de Horas',       color: '#8b5cf6', layout: { x: 0, y: 10, w: 12, h: 6 } },
];

const CATALOG: Array<{ type: WidgetType; label: string; icon: React.ReactNode }> = [
  { type: 'kpi_ingresos',    label: 'KPI Ingresos Hoy',      icon: <Car className="h-4 w-4" /> },
  { type: 'kpi_ocupacion',   label: 'KPI Ocupación Global',  icon: <Activity className="h-4 w-4" /> },
  { type: 'kpi_semana',      label: 'KPI Ingresos Semana',   icon: <CalendarDays className="h-4 w-4" /> },
  { type: 'kpi_proceso',     label: 'KPI Proceso Top',       icon: <Zap className="h-4 w-4" /> },
  { type: 'barras_proceso',  label: 'Capacidad por Proceso', icon: <BarChart3 className="h-4 w-4" /> },
  { type: 'alertas',         label: 'Alertas Activas',       icon: <AlertTriangle className="h-4 w-4" /> },
  { type: 'trend_semanal',   label: 'Tendencia Semanal',     icon: <TrendingUp className="h-4 w-4" /> },
  { type: 'ingresos_tipo',   label: 'Ingresos por Tipo',     icon: <BarChart3 className="h-4 w-4" /> },
  { type: 'lista_hoy',       label: 'Lista Ingresos Hoy',    icon: <Layers className="h-4 w-4" /> },
  { type: 'reporte_horas',   label: 'Reporte de Horas',      icon: <Clock className="h-4 w-4" /> },
  { type: 'heatmap_semana',  label: 'Heatmap Semana',        icon: <Flame className="h-4 w-4" /> },
  { type: 'distribucion_pie',label: 'Distribución Procesos', icon: <Activity className="h-4 w-4" /> },
];

const STORAGE_KEY = 'bodyshop_dashboard_widgets_v1';
const COLS       = 12;
const ROW_HEIGHT = 62;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<CapacityStatus, string> = {
  OK:         'bg-emerald-50 text-emerald-700 border-emerald-200',
  RISK:       'bg-amber-50 text-amber-700 border-amber-200',
  OVERLOADED: 'bg-red-100 text-red-800 border-red-300',
};
const STATUS_LABEL: Record<CapacityStatus, string> = {
  OK: 'OK', RISK: 'Riesgo', OVERLOADED: 'Sobrecargado',
};

function pct(v: number, t: number) { return t ? Math.min(100, (v / t) * 100) : 0; }

function pctColor(p: number) {
  if (p >= 90) return { bar: 'bg-red-500',   text: 'text-red-700'   };
  if (p >= 70) return { bar: 'bg-amber-400', text: 'text-amber-700' };
  if (p >= 40) return { bar: 'bg-blue-500',  text: 'text-blue-700'  };
  return         { bar: 'bg-slate-300',  text: 'text-slate-500' };
}

function aggregateCap(weekCap: BodyshopWeekCapacity | undefined) {
  const t = { BODYWORK: { cap: 0, used: 0 }, PREP: { cap: 0, used: 0 }, PAINT: { cap: 0, used: 0 } };
  if (!weekCap) return t;
  for (const d of Object.values(weekCap)) {
    for (const k of ['BODYWORK', 'PREP', 'PAINT'] as const) {
      t[k].cap  += d.byProcess[k].commercializableHours;
      t[k].used += d.byProcess[k].occupiedHours;
    }
  }
  return t;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className="flex flex-col h-full px-4 py-3 justify-between">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500 leading-tight">{label}</p>
        <div className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: color + '18' }}>
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      <div>
        <p className="text-3xl font-bold text-slate-900 tabular-nums">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Widget renderer ──────────────────────────────────────────────────────────

function WidgetContent({
  widget, anchorDate, dayCap, weekCap, periodDates, entries, period, periodLabel,
}: {
  widget: DWidget;
  anchorDate: string;
  period: 'day' | 'week' | 'month' | 'custom';
  periodLabel: string;
  dayCap: ReturnType<typeof useBodyshopDayCapacity>['data'];
  weekCap: BodyshopWeekCapacity | undefined;
  periodDates: Date[];
  entries: ReturnType<typeof useBodyshopEntriesKanban>['data'];
}) {
  const isSunday     = new Date(anchorDate + 'T12:00:00').getDay() === 0 && period === 'day';
  const todayEntries = dayCap?.entries.filter(e => e.status !== 'cancelled') ?? [];
  const weekActive   = (entries ?? []).filter(e => e.status !== 'cancelled');
  const monthActive  = weekActive;

  const topProcess = dayCap ? (['BODYWORK', 'PREP', 'PAINT'] as const).reduce(
    (top, k) => dayCap.byProcess[k].occupancyRate > dayCap.byProcess[top].occupancyRate ? k : top,
    'BODYWORK' as 'BODYWORK' | 'PREP' | 'PAINT',
  ) : null;
  const topLabels = { BODYWORK: 'Chapería', PREP: 'Preparación', PAINT: 'Pintura' };

  const weekTrend = periodDates.map(d => {
    const ds  = formatDate(d);
    const cap = weekCap?.[ds];
    const sun = d.getDay() === 0;
    return {
      date:  format(d, periodDates.length > 14 ? 'd/M' : 'EEE d', { locale: es }),
      bw:    sun || !cap ? null : Math.round(cap.byProcess.BODYWORK.occupancyRate * 100),
      prep:  sun || !cap ? null : Math.round(cap.byProcess.PREP.occupancyRate * 100),
      paint: sun || !cap ? null : Math.round(cap.byProcess.PAINT.occupancyRate * 100),
    };
  });

  const byWorkType = useMemo(() => {
    const map: Record<string, { name: string; color: string; count: number }> = {};
    weekActive.forEach(e => {
      if (!e.workTypeId || !e.workType) return;
      if (!map[e.workTypeId]) map[e.workTypeId] = { name: e.workType.name, color: e.workType.color, count: 0 };
      map[e.workTypeId].count++;
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [weekActive]);

  const capTotals = useMemo(() => aggregateCap(weekCap), [weekCap]);

  const alerts = useMemo(() => {
    const list: { id: string; text: string; level: 'critical' | 'warning' }[] = [];
    if (!dayCap || isSunday) return list;
    (['BODYWORK', 'PREP', 'PAINT'] as const).forEach(k => {
      const proc = dayCap.byProcess[k];
      const lbl  = topLabels[k];
      if (proc.status === 'OVERLOADED') list.push({ id: k + '_ov', text: `${lbl} sobrecargada (${Math.round(proc.occupancyRate * 100)}%)`, level: 'critical' });
      else if (proc.status === 'RISK')  list.push({ id: k + '_ri', text: `${lbl} en riesgo (${Math.round(proc.occupancyRate * 100)}%)`,    level: 'warning' });
    });
    return list;
  }, [dayCap, isSunday]);

  // Reporte de horas — usa monthActive
  const reportEntries = monthActive.slice(0, 50);
  const monthCap      = aggregateCap(weekCap); // aproximado con semana actual

  switch (widget.type) {

    // ── KPIs ──────────────────────────────────────────────────────────────────
    case 'kpi_ingresos':
      return <KpiCard icon={<Car className="h-5 w-5" />} label={`Ingresos — ${periodLabel}`} color={widget.color}
        value={isSunday ? '—' : String(period === 'day' ? todayEntries.length : weekActive.length)}
        sub={isSunday ? 'Domingo' : period === 'day'
          ? `${todayEntries.filter(e => e.status === 'in_progress').length} en proceso`
          : `${weekActive.filter(e => e.status === 'done').length} completados`} />;

    case 'kpi_ocupacion':
      return <KpiCard icon={<TrendingUp className="h-5 w-5" />} label={`Ocupación global — ${periodLabel}`} color={widget.color}
        value={isSunday || !dayCap ? '—' : `${Math.round(dayCap.globalOccupancyRate * 100)}%`}
        sub={dayCap && !isSunday ? STATUS_LABEL[dayCap.globalStatus] : ''} />;

    case 'kpi_semana':
      return <KpiCard icon={<CalendarDays className="h-5 w-5" />} label={`Ingresos — ${periodLabel}`} color={widget.color}
        value={String(weekActive.length)}
        sub={`${weekActive.filter(e => e.status === 'done').length} completados`} />;

    case 'kpi_proceso':
      return <KpiCard icon={<Zap className="h-5 w-5" />} label="Proceso más cargado" color={widget.color}
        value={topProcess && dayCap && !isSunday ? `${Math.round(dayCap.byProcess[topProcess].occupancyRate * 100)}%` : '—'}
        sub={topProcess && !isSunday ? topLabels[topProcess] : ''} />;

    // ── Barras proceso ────────────────────────────────────────────────────────
    case 'barras_proceso':
      return (
        <div className="px-4 py-3 h-full flex flex-col">
          <p className="text-xs font-semibold text-slate-700 mb-3">Capacidad por proceso — {periodLabel}</p>
          {isSunday ? (
            <p className="text-xs text-slate-400 text-center py-4">Domingo — taller cerrado</p>
          ) : dayCap ? (
            <div className="space-y-3 flex-1">
              {([
                { key: 'BODYWORK', label: 'Chapería',    bar: '#3b82f6' },
                { key: 'PREP',     label: 'Preparación', bar: '#8b5cf6' },
                { key: 'PAINT',    label: 'Pintura',     bar: '#f97316' },
              ] as const).map(({ key, label, bar }) => {
                const proc = dayCap.byProcess[key];
                const p    = Math.min(proc.occupancyRate * 100, 100);
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-700">{label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500">{proc.occupiedHours.toFixed(1)}h / {proc.commercializableHours.toFixed(1)}h</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${STATUS_STYLES[proc.status]}`}>
                          {Math.round(proc.occupancyRate * 100)}%
                        </span>
                      </div>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${p}%`, background: bar }} />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">{proc.availableHours.toFixed(1)}h disponibles</p>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-xs text-slate-400 text-center py-4">Sin datos</p>}
        </div>
      );

    // ── Alertas ───────────────────────────────────────────────────────────────
    case 'alertas':
      return (
        <div className="h-full flex flex-col overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2 flex-shrink-0">
            <AlertTriangle className="h-3.5 w-3.5 text-slate-400" />
            <p className="text-xs font-semibold text-slate-700">Alertas activas</p>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 py-6">
                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                <p className="text-xs font-medium text-emerald-600">Sin alertas hoy</p>
              </div>
            ) : alerts.map(a => (
              <div key={a.id} className="flex items-start gap-2.5 px-4 py-2.5">
                <div className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${a.level === 'critical' ? 'bg-red-500' : 'bg-amber-400'}`} />
                <p className="text-xs text-slate-600">{a.text}</p>
              </div>
            ))}
          </div>
        </div>
      );

    // ── Tendencia semanal ─────────────────────────────────────────────────────
    case 'trend_semanal':
      return (
        <div className="px-4 py-3 h-full flex flex-col">
          <p className="text-xs font-semibold text-slate-700 mb-2">Ocupación por proceso — {periodLabel} (%)</p>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weekTrend} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} domain={[0, 100]} unit="%" />
                <Tooltip formatter={(v: any) => v !== null ? [`${v}%`] : ['—']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="bw"    stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} name="Chapería" />
                <Line type="monotone" dataKey="prep"  stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} name="Preparación" />
                <Line type="monotone" dataKey="paint" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} name="Pintura" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      );

    // ── Ingresos por tipo ─────────────────────────────────────────────────────
    case 'ingresos_tipo':
      return (
        <div className="px-4 py-3 h-full flex flex-col">
          <p className="text-xs font-semibold text-slate-700 mb-2">Ingresos por tipo — {periodLabel}</p>
          {byWorkType.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">Sin ingresos</p>
          ) : (
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byWorkType} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} width={90} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <Bar dataKey="count" name="Ingresos" radius={[0, 4, 4, 0]}>
                    {byWorkType.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      );

    // ── Lista hoy ─────────────────────────────────────────────────────────────
    case 'lista_hoy':
      return (
        <div className="h-full flex flex-col overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 flex-shrink-0">
            <p className="text-xs font-semibold text-slate-700">Ingresos activos hoy</p>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
            {todayEntries.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">{isSunday ? 'Domingo' : 'Sin ingresos'}</p>
            ) : todayEntries.map(e => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: e.workType?.color ?? '#94a3b8' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-900 truncate">{e.customerName}</p>
                  <p className="text-[10px] text-slate-400 truncate">{e.workType?.name} · {e.plate}</p>
                </div>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: e.status === 'done' ? '#dcfce7' : e.status === 'in_progress' ? '#fef3c7' : '#dbeafe',
                           color:      e.status === 'done' ? '#166534' : e.status === 'in_progress' ? '#92400e' : '#1e40af' }}>
                  {e.status === 'done' ? 'Listo' : e.status === 'in_progress' ? 'En proceso' : 'Agendado'}
                </span>
              </div>
            ))}
          </div>
        </div>
      );

    // ── Reporte de horas ──────────────────────────────────────────────────────
    case 'reporte_horas':
      return (
        <div className="h-full flex flex-col overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2 flex-shrink-0">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <p className="text-xs font-semibold text-slate-700">Distribución de horas por trabajo — {periodLabel}</p>
            <div className="ml-auto flex items-center gap-4 text-[10px] text-slate-500">
              <span><span className="font-bold text-blue-600">{capTotals.BODYWORK.cap.toFixed(0)}h</span> cap. chap.</span>
              <span><span className="font-bold text-violet-600">{capTotals.PREP.cap.toFixed(0)}h</span> cap. prep.</span>
              <span><span className="font-bold text-orange-600">{capTotals.PAINT.cap.toFixed(0)}h</span> cap. pint.</span>
            </div>
          </div>
          {reportEntries.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs text-slate-400">Sin trabajos en el período</p>
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase text-[10px] tracking-wide">Chapa</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase text-[10px] tracking-wide">Cliente</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase text-[10px] tracking-wide">Tipo</th>
                    <th className="px-3 py-2 font-semibold text-blue-600 uppercase text-[10px] tracking-wide text-right">Chapería</th>
                    <th className="px-3 py-2 font-semibold text-violet-600 uppercase text-[10px] tracking-wide text-right">Prep.</th>
                    <th className="px-3 py-2 font-semibold text-orange-600 uppercase text-[10px] tracking-wide text-right">Pintura</th>
                    <th className="px-3 py-2 font-semibold text-slate-500 uppercase text-[10px] tracking-wide text-right">Total</th>
                    <th className="px-3 py-2 font-semibold text-slate-500 uppercase text-[10px] tracking-wide text-right">% cap.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {reportEntries.map((e, idx) => {
                    const total   = e.bodyworkHours + e.prepHours + e.paintHours;
                    const capSum  = capTotals.BODYWORK.cap + capTotals.PREP.cap + capTotals.PAINT.cap;
                    const p       = pct(total, capSum);
                    const bwPct   = pct(e.bodyworkHours, capTotals.BODYWORK.cap);
                    const prPct   = pct(e.prepHours,     capTotals.PREP.cap);
                    const paPct   = pct(e.paintHours,    capTotals.PAINT.cap);
                    const gc      = pctColor(p);
                    return (
                      <tr key={e.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                        <td className="px-3 py-2">
                          <span className="font-mono font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">{e.plate}</span>
                        </td>
                        <td className="px-3 py-2 max-w-[140px]">
                          <p className="font-medium text-slate-800 truncate">{e.customerName}</p>
                        </td>
                        <td className="px-3 py-2">
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold"
                            style={{ background: (e.workType?.color ?? '#94a3b8') + '22', color: e.workType?.color ?? '#94a3b8' }}>
                            {e.workType?.name}
                          </span>
                        </td>
                        {/* Chapería */}
                        <td className="px-3 py-2">
                          {e.bodyworkHours > 0 ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="font-semibold text-slate-800">{e.bodyworkHours}h</span>
                              <div className="flex items-center gap-1">
                                <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${bwPct}%` }} />
                                </div>
                                <span className="text-[9px] text-blue-600 font-bold">{bwPct.toFixed(0)}%</span>
                              </div>
                            </div>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        {/* Prep */}
                        <td className="px-3 py-2">
                          {e.prepHours > 0 ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="font-semibold text-slate-800">{e.prepHours}h</span>
                              <div className="flex items-center gap-1">
                                <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-violet-500 rounded-full" style={{ width: `${prPct}%` }} />
                                </div>
                                <span className="text-[9px] text-violet-600 font-bold">{prPct.toFixed(0)}%</span>
                              </div>
                            </div>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        {/* Pintura */}
                        <td className="px-3 py-2">
                          {e.paintHours > 0 ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="font-semibold text-slate-800">{e.paintHours}h</span>
                              <div className="flex items-center gap-1">
                                <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-orange-500 rounded-full" style={{ width: `${paPct}%` }} />
                                </div>
                                <span className="text-[9px] text-orange-600 font-bold">{paPct.toFixed(0)}%</span>
                              </div>
                            </div>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-slate-800">{total}h</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col items-end gap-0.5">
                            <span className={`text-[9px] font-bold ${gc.text}`}>{p.toFixed(1)}%</span>
                            <div className="w-14 h-1 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${gc.bar}`} style={{ width: `${p}%` }} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {/* Totals */}
                  <tr className="bg-slate-100 border-t-2 border-slate-200 font-bold">
                    <td colSpan={3} className="px-3 py-2 text-[10px] text-slate-600 uppercase tracking-wide">Totales</td>
                    <td className="px-3 py-2 text-right text-blue-700">
                      {reportEntries.reduce((s, e) => s + e.bodyworkHours, 0)}h
                      <span className="ml-1 text-[9px]">({pct(reportEntries.reduce((s,e)=>s+e.bodyworkHours,0), capTotals.BODYWORK.cap).toFixed(0)}%)</span>
                    </td>
                    <td className="px-3 py-2 text-right text-violet-700">
                      {reportEntries.reduce((s, e) => s + e.prepHours, 0)}h
                      <span className="ml-1 text-[9px]">({pct(reportEntries.reduce((s,e)=>s+e.prepHours,0), capTotals.PREP.cap).toFixed(0)}%)</span>
                    </td>
                    <td className="px-3 py-2 text-right text-orange-700">
                      {reportEntries.reduce((s, e) => s + e.paintHours, 0)}h
                      <span className="ml-1 text-[9px]">({pct(reportEntries.reduce((s,e)=>s+e.paintHours,0), capTotals.PAINT.cap).toFixed(0)}%)</span>
                    </td>
                    <td className="px-3 py-2 text-right text-slate-900">
                      {reportEntries.reduce((s, e) => s + e.bodyworkHours + e.prepHours + e.paintHours, 0)}h
                    </td>
                    <td className="px-3 py-2 text-right">
                      {(() => {
                        const tot = reportEntries.reduce((s,e)=>s+e.bodyworkHours+e.prepHours+e.paintHours,0);
                        const cap = capTotals.BODYWORK.cap+capTotals.PREP.cap+capTotals.PAINT.cap;
                        const c   = pctColor(pct(tot,cap));
                        return <span className={`text-[9px] font-bold ${c.text}`}>{pct(tot,cap).toFixed(1)}%</span>;
                      })()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      );

    // ── Heatmap semana ────────────────────────────────────────────────────────
    case 'heatmap_semana':
      return (
        <div className="px-4 py-3 h-full flex flex-col">
          <p className="text-xs font-semibold text-slate-700 mb-3">Carga por proceso — semana</p>
          <div className="flex-1 flex flex-col justify-around gap-2">
            {([
              { key: 'BODYWORK', label: 'Chapería',    color: '#3b82f6' },
              { key: 'PREP',     label: 'Preparación', color: '#8b5cf6' },
              { key: 'PAINT',    label: 'Pintura',     color: '#f97316' },
            ] as const).map(({ key, label, color }) => (
              <div key={key}>
                <div className="flex items-center gap-1 mb-1">
                  <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: color }} />
                  <span className="text-[10px] font-semibold text-slate-600">{label}</span>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {periodDates.slice(0, 7).map(d => {
                    const ds  = formatDate(d);
                    const cap = weekCap?.[ds]?.byProcess[key];
                    const p   = cap ? Math.round(cap.occupancyRate * 100) : 0;
                    const sun = d.getDay() === 0;
                    return (
                      <div
                        key={ds}
                        title={sun ? 'Domingo' : cap ? `${format(d,'EEE d',{locale:es})}: ${p}%` : 'Sin datos'}
                        className="rounded text-center py-1"
                        style={{ background: sun || !cap ? '#f1f5f9' : `${color}${Math.round(p * 2.55).toString(16).padStart(2,'0')}` }}
                      >
                        <p className="text-[8px] font-bold" style={{ color: p > 50 ? '#fff' : '#64748b' }}>
                          {sun ? '—' : cap ? `${p}%` : '?'}
                        </p>
                        <p className="text-[7px]" style={{ color: p > 50 ? '#e2e8f0' : '#94a3b8' }}>
                          {format(d, 'EEE', { locale: es })}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      );

    // ── Distribución pie ──────────────────────────────────────────────────────
    case 'distribucion_pie': {
      const pieData = [
        { name: 'Chapería',    value: capTotals.BODYWORK.used, color: '#3b82f6' },
        { name: 'Preparación', value: capTotals.PREP.used,     color: '#8b5cf6' },
        { name: 'Pintura',     value: capTotals.PAINT.used,    color: '#f97316' },
      ].filter(d => d.value > 0);
      return (
        <div className="px-4 py-3 h-full flex flex-col">
          <p className="text-xs font-semibold text-slate-700 mb-2">Distribución horas por proceso — semana</p>
          {pieData.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">Sin datos</p>
          ) : (
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius="40%" outerRadius="65%"
                    dataKey="value" nameKey="name" label={({ name, percent }: any) => `${name} ${((percent ?? 0)*100).toFixed(0)}%`}
                    labelLine={false}>
                    {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => [`${v.toFixed(1)}h`]} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      );
    }

    default:
      return <div className="flex items-center justify-center h-full text-xs text-slate-400">Widget</div>;
  }
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

type Period = 'day' | 'week' | 'month' | 'custom';

export default function BodyshopDashboard() {
  const today = formatDate(new Date());

  // ── Period state ────────────────────────────────────────────────────────────
  const [period,      setPeriod]      = useState<Period>('day');
  const [anchor,      setAnchor]      = useState<Date>(new Date());
  const [customFrom,  setCustomFrom]  = useState(today);
  const [customTo,    setCustomTo]    = useState(today);

  // Compute from/to/periodDates based on period + anchor
  const { from, to, periodDates, periodLabel } = useMemo(() => {
    if (period === 'day') {
      const d = formatDate(anchor);
      return { from: d, to: d, periodDates: [anchor], periodLabel: format(anchor, "EEE d 'de' MMM", { locale: es }) };
    }
    if (period === 'week') {
      const ws = startOfWeek(anchor, { weekStartsOn: 1 });
      const we = endOfWeek(anchor, { weekStartsOn: 1 });
      const dates = eachDayOfInterval({ start: ws, end: we });
      return {
        from: formatDate(ws), to: formatDate(we), periodDates: dates,
        periodLabel: `${format(ws, 'd MMM', { locale: es })} – ${format(we, 'd MMM', { locale: es })}`,
      };
    }
    if (period === 'month') {
      const ms = startOfMonth(anchor);
      const me = endOfMonth(anchor);
      const dates = eachDayOfInterval({ start: ms, end: me });
      return {
        from: formatDate(ms), to: formatDate(me), periodDates: dates,
        periodLabel: format(anchor, 'MMMM yyyy', { locale: es }),
      };
    }
    // custom
    const f = parseISO(customFrom + 'T12:00:00');
    const t = parseISO(customTo   + 'T12:00:00');
    const dates = eachDayOfInterval({ start: f, end: t > f ? t : f });
    return {
      from: customFrom, to: customTo, periodDates: dates,
      periodLabel: `${format(f, 'd MMM', { locale: es })} – ${format(t > f ? t : f, 'd MMM', { locale: es })}`,
    };
  }, [period, anchor, customFrom, customTo]);

  function navPrev() {
    if (period === 'day')   setAnchor(d => subDays(d, 1));
    if (period === 'week')  setAnchor(d => subWeeks(d, 1));
    if (period === 'month') setAnchor(d => subMonths(d, 1));
  }
  function navNext() {
    if (period === 'day')   setAnchor(d => addDays(d, 1));
    if (period === 'week')  setAnchor(d => addWeeks(d, 1));
    if (period === 'month') setAnchor(d => addMonths(d, 1));
  }

  // ── Data hooks ───────────────────────────────────────────────────────────────
  const { data: dayCap,  isLoading: l1 } = useBodyshopDayCapacity(from);
  const { data: weekCap, isLoading: l2 } = useBodyshopWeekCapacity(from, to);
  const { data: entries, isLoading: l3 } = useBodyshopEntriesKanban(from, to);

  const loading = l1 || l2 || l3;

  // ── Widget state ─────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW,  setContainerW]  = useState(1200);

  const [widgets, setWidgets] = useState<DWidget[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_WIDGETS;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_WIDGETS;
    } catch { return DEFAULT_WIDGETS; }
  });

  const [showCatalog, setShowCatalog] = useState(false);
  const [editMode,    setEditMode]    = useState(false);
  const [mounted,     setMounted]     = useState(false);

  useEffect(() => {
    setMounted(true);
    const obs = new ResizeObserver(entries => {
      for (const e of entries) setContainerW(e.contentRect.width);
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  function save(next: DWidget[]) {
    setWidgets(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  }

  function onLayoutChange(layouts: RGLLayout[]) {
    save(widgets.map(w => {
      const l = (layouts as any[]).find(x => x.i === w.id);
      return l ? { ...w, layout: { x: l.x, y: l.y, w: l.w, h: l.h } } : w;
    }));
  }

  function addWidget(type: WidgetType) {
    const cat = CATALOG.find(c => c.type === type)!;
    const id  = `b${Date.now()}`;
    const newW: DWidget = {
      id, type, title: cat.label, color: '#3b82f6',
      layout: { x: 0, y: 999, w: 6, h: 4 },
    };
    save([...widgets, newW]);
    setShowCatalog(false);
  }

  function removeWidget(id: string) {
    save(widgets.filter(w => w.id !== id));
  }

  function reset() {
    save(DEFAULT_WIDGETS);
    setEditMode(false);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const GL: any = GridLayout;

  const rglLayouts = widgets.map(w => ({
    i: w.id, ...w.layout,
    minW: 3, minH: 2,
    isDraggable: editMode,
    isResizable: editMode,
  }));

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-900">Panel de Control</h1>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">BODYSHOP</span>
            <InfoButton helpKey="dashboard" />
          </div>
          <p className="text-xs text-slate-500 mt-0.5 capitalize">{periodLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          {editMode && (
            <>
              <button
                onClick={() => setShowCatalog(true)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Agregar widget
              </button>
              <button
                onClick={reset}
                className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                Restablecer
              </button>
            </>
          )}
          <button
            onClick={() => setEditMode(e => !e)}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors
              ${editMode ? 'bg-orange-600 text-white border-orange-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            <Settings2 className="h-3.5 w-3.5" />
            {editMode ? 'Listo' : 'Configurar'}
          </button>
        </div>
      </div>

      {/* ── Period selector bar ─────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-100 px-6 py-2.5 flex items-center gap-3 flex-shrink-0 flex-wrap">
        {/* Segment */}
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
          {(['day', 'week', 'month', 'custom'] as Period[]).map(p => (
            <button key={p} onClick={() => { setPeriod(p); if (p !== 'custom') setAnchor(new Date()); }}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${period === p ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {p === 'day' ? 'Día' : p === 'week' ? 'Semana' : p === 'month' ? 'Mes' : 'Custom'}
            </button>
          ))}
        </div>

        {/* Navigation (not for custom) */}
        {period !== 'custom' && (
          <div className="flex items-center gap-1">
            <button onClick={navPrev} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-semibold text-slate-700 min-w-[120px] text-center capitalize">{periodLabel}</span>
            <button onClick={navNext} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button onClick={() => setAnchor(new Date())}
              className="ml-1 text-xs text-orange-600 hover:text-orange-800 font-medium px-2 py-0.5 rounded hover:bg-orange-50 transition-colors">
              Hoy
            </button>
          </div>
        )}

        {/* Custom date pickers */}
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">Desde</label>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-400" />
            <label className="text-xs text-slate-500">Hasta</label>
            <input type="date" value={customTo} min={customFrom} onChange={e => setCustomTo(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-400" />
          </div>
        )}
      </div>

      <div ref={containerRef} className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Cargando...</div>
        ) : mounted && (
          <GL
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
              {widgets.map(w => (
                <div key={w.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                  {/* Widget header (always visible, drag handle in edit mode) */}
                  <div
                    className={`flex items-center gap-2 px-3 py-2 border-b border-slate-100 flex-shrink-0 ${editMode ? 'cursor-grab active:cursor-grabbing bg-slate-50' : ''}`}
                  >
                    {editMode && <GripVertical className="drag-handle h-3.5 w-3.5 text-slate-400 flex-shrink-0 cursor-grab" />}
                    <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: w.color }} />
                    <span className="text-xs font-semibold text-slate-700 flex-1 truncate">{w.title}</span>
                    {editMode && (
                      <button onClick={() => removeWidget(w.id)} className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {/* Content */}
                  <div className="flex-1 overflow-hidden min-h-0">
                    <WidgetContent
                      widget={w}
                      anchorDate={from}
                      period={period}
                      periodLabel={periodLabel}
                      dayCap={dayCap}
                      weekCap={weekCap}
                      periodDates={periodDates}
                      entries={entries ?? []}
                    />
                  </div>
                </div>
              ))}
            </GL>
        )}
      </div>

      {/* Catalog modal */}
      {showCatalog && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={() => setShowCatalog(false)} />
          <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl border border-slate-200 w-[440px] max-h-[70vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <p className="text-sm font-bold text-slate-900">Agregar widget</p>
              <button onClick={() => setShowCatalog(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 grid grid-cols-2 gap-2">
              {CATALOG.map(c => {
                const active = widgets.some(w => w.type === c.type);
                return (
                  <button
                    key={c.type}
                    onClick={() => !active && addWidget(c.type)}
                    disabled={active}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all
                      ${active ? 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'
                               : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50 cursor-pointer'}`}
                  >
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${active ? 'bg-slate-100 text-slate-400' : 'bg-blue-50 text-blue-600'}`}>
                      {c.icon}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-800">{c.label}</p>
                      {active && <p className="text-[9px] text-slate-400">Ya agregado</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
