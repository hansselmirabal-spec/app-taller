'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { LayoutItem as RGLLayout, Layout as RGLLayoutArr } from 'react-grid-layout';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
  PieChart, Pie, Legend,
} from 'recharts';
import {
  TrendingUp, Users, Clock, AlertTriangle, ChevronRight,
  Activity, Zap, Settings2, CheckCircle2, Plus, Trash2,
  Pencil, GripVertical, X, CalendarDays, CalendarRange,
  Hash, BarChart3, Star, XCircle, Flame,
} from 'lucide-react';
import {
  format, addDays, startOfWeek, endOfWeek, parseISO,
  eachDayOfInterval, isToday, isSameWeek,
  startOfMonth, endOfMonth, eachWeekOfInterval, subDays,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { useTechnicians } from '@/hooks/use-technicians';
import { useDailyCapacity, useWeekCapacity } from '@/hooks/use-capacity';
import { useAppointmentsByDate, useAppointmentsByRange } from '@/hooks/use-appointments';
import { useServiceTypes } from '@/hooks/use-service-types';
import { formatDate } from '@/lib/utils';
import type { Appointment, TechnicianCapacity } from '@/types';

import 'react-grid-layout/css/styles.css';

const GridLayout = dynamic(
  () => import('react-grid-layout').then(m => ({ default: m.GridLayout })),
  { ssr: false }
);

type PeriodMode = 'today' | 'week' | 'month' | 'custom';
type WidgetType = 'kpi_util' | 'kpi_turnos' | 'kpi_techs' | 'kpi_horas'
  | 'bandas' | 'alertas' | 'turnos_list' | 'semana_bar' | 'ocupacion_line' | 'timeline_hoy' | 'tiempo_periodo'
  | 'ranking_servicios' | 'cancelaciones' | 'heatmap_demanda' | 'top_clientes';

interface DWidget {
  id: string; type: WidgetType; title: string; color: string;
  layout: { x: number; y: number; w: number; h: number };
}

const DEFAULT_WIDGETS: DWidget[] = [
  { id:'d1', type:'kpi_util',     title:'Utilización',          color:'#3b82f6', layout:{ x:0, y:0, w:3, h:2 } },
  { id:'d2', type:'kpi_turnos',   title:'Turnos del Período',   color:'#8b5cf6', layout:{ x:3, y:0, w:3, h:2 } },
  { id:'d3', type:'kpi_techs',    title:'Técnicos Disponibles', color:'#22c55e', layout:{ x:6, y:0, w:3, h:2 } },
  { id:'d4', type:'kpi_horas',    title:'Horas en Uso',         color:'#f59e0b', layout:{ x:9, y:0, w:3, h:2 } },
  { id:'d5', type:'timeline_hoy', title:'Timeline de Hoy',      color:'#3b82f6', layout:{ x:0, y:2, w:7, h:4 } },
  { id:'d6', type:'bandas',       title:'Carga por Técnico',    color:'#22c55e', layout:{ x:7, y:2, w:5, h:4 } },
  { id:'d7', type:'alertas',      title:'Alertas',              color:'#ef4444', layout:{ x:0, y:6, w:4, h:4 } },
  { id:'d8', type:'turnos_list',  title:'Agenda del Período',   color:'#64748b', layout:{ x:4, y:6, w:8, h:5 } },
];

const CATALOG: Array<{ type: WidgetType; label: string; icon: React.ReactNode }> = [
  { type:'kpi_util',          label:'KPI Utilización',      icon:<Activity className="h-4 w-4"/> },
  { type:'kpi_turnos',        label:'KPI Turnos',           icon:<Hash className="h-4 w-4"/> },
  { type:'kpi_techs',         label:'KPI Técnicos',         icon:<Users className="h-4 w-4"/> },
  { type:'kpi_horas',         label:'KPI Horas en Uso',     icon:<Clock className="h-4 w-4"/> },
  { type:'semana_bar',        label:'Turnos por Día',       icon:<BarChart3 className="h-4 w-4"/> },
  { type:'timeline_hoy',      label:'Timeline de Hoy',      icon:<CalendarRange className="h-4 w-4"/> },
  { type:'tiempo_periodo',    label:'Horas Semana / Mes',   icon:<Clock className="h-4 w-4"/> },
  { type:'bandas',            label:'Carga por Técnico',    icon:<Zap className="h-4 w-4"/> },
  { type:'alertas',           label:'Alertas Críticas',     icon:<AlertTriangle className="h-4 w-4"/> },
  { type:'turnos_list',       label:'Agenda del Período',   icon:<CalendarDays className="h-4 w-4"/> },
  { type:'ocupacion_line',    label:'Ocupación Semanal',    icon:<TrendingUp className="h-4 w-4"/> },
  { type:'ranking_servicios', label:'Ranking de Servicios', icon:<Star className="h-4 w-4"/> },
  { type:'cancelaciones',     label:'Tasa de Cancelación',  icon:<XCircle className="h-4 w-4"/> },
  { type:'heatmap_demanda',   label:'Heatmap de Demanda',   icon:<Flame className="h-4 w-4"/> },
  { type:'top_clientes',      label:'Top Clientes',         icon:<Users className="h-4 w-4"/> },
];

const STORAGE_KEY = 'dashboard_widgets_v2';
const COLS = 12;
const ROW_HEIGHT = 62;

// ─── Período ──────────────────────────────────────────────────────────────────

function getWeekRange(referenceDate: string) {
  const d = parseISO(referenceDate + 'T12:00:00');
  return {
    from: format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    to:   format(endOfWeek(d,   { weekStartsOn: 1 }), 'yyyy-MM-dd'),
  };
}

// ─── Hook de datos ────────────────────────────────────────────────────────────

function useDashboardData(mode: PeriodMode, customFrom: string, customTo: string, weekRef: string) {
  const today = formatDate(new Date());
  const { from, to } = mode === 'today'
    ? { from: today, to: today }
    : mode === 'week'
    ? getWeekRange(weekRef)
    : mode === 'month'
    ? { from: format(startOfMonth(new Date()), 'yyyy-MM-dd'), to: format(endOfMonth(new Date()), 'yyyy-MM-dd') }
    : { from: customFrom, to: customTo };

  const { data: appointments = [] } = useAppointmentsByRange(from, to);
  const { data: todayAppts = [] }   = useAppointmentsByDate(today);
  const { data: technicians = [] }  = useTechnicians();
  const { data: dailyCap = [] }     = useDailyCapacity(today);
  const { data: weekCap = {} }      = useWeekCapacity(from, to);
  const { data: serviceTypes = [] } = useServiceTypes();

  const days = useMemo(() => {
    try {
      return eachDayOfInterval({
        start: parseISO(from + 'T12:00:00'),
        end:   parseISO(to   + 'T12:00:00'),
      }).filter(d => d.getDay() !== 0);
    } catch { return []; }
  }, [from, to]);

  const periodCap = useMemo(() => {
    let totalAvail = 0, totalUsed = 0;
    Object.values(weekCap).forEach(dayCapArr => {
      dayCapArr.forEach(c => { totalAvail += c.availableHours; totalUsed += c.usedHours; });
    });
    return { totalAvail, totalUsed };
  }, [weekCap]);

  const utilization = periodCap.totalAvail > 0
    ? Math.round((periodCap.totalUsed / periodCap.totalAvail) * 100) : 0;

  const disponibles = dailyCap.filter(c => (c.availableHours - c.usedHours) >= 1 && c.isWorkingDay).length;

  const barData = days.map(d => {
    const ds = format(d, 'yyyy-MM-dd');
    const label = format(d, 'EEE d', { locale: es });
    return {
      date: label,
      done:       appointments.filter(a => a.date === ds && a.status === 'done').length,
      scheduled:  appointments.filter(a => a.date === ds && a.status === 'scheduled').length,
      inProgress: appointments.filter(a => a.date === ds && a.status === 'in_progress').length,
      total:      appointments.filter(a => a.date === ds && a.status !== 'cancelled').length,
    };
  });

  const techLoad = technicians.map(tech => {
    let avail = 0, used = 0;
    Object.values(weekCap).forEach(dayArr => {
      const c = dayArr.find(x => x.technicianId === tech.id);
      if (c) { avail += c.availableHours; used += c.usedHours; }
    });
    const pct = avail > 0 ? Math.round((used / avail) * 100) : 0;
    return { name: tech.name.split(' ')[0], pct, used, avail };
  }).sort((a, b) => b.pct - a.pct);

  const ocupacionLine = days.map(d => {
    const ds = format(d, 'yyyy-MM-dd');
    const label = format(d, 'EEE d', { locale: es });
    const caps: TechnicianCapacity[] = weekCap[ds] ?? [];
    const avail = caps.reduce((s, c) => s + c.availableHours, 0);
    const used  = caps.reduce((s, c) => s + c.usedHours, 0);
    return { date: label, pct: avail > 0 ? Math.round((used / avail) * 100) : 0 };
  });

  const alertas = useMemo(() => {
    const list: { id: string; tipo: string; desc: string; level: 'critical' | 'warning' }[] = [];
    dailyCap.forEach(c => {
      const pct = c.availableHours > 0 ? (c.usedHours / c.availableHours) * 100 : 0;
      if (pct >= 90) list.push({ id: c.technicianId + '_ov', tipo: 'Sobrecarga', desc: `${c.technicianName} al ${Math.round(pct)}% de capacidad hoy`, level: 'critical' });
      if (c.absenceType === 'full') list.push({ id: c.technicianId + '_ab', tipo: 'Ausencia', desc: `${c.technicianName} no trabaja hoy`, level: 'warning' });
      if (c.absenceType === 'half') list.push({ id: c.technicianId + '_ha', tipo: 'Media jornada', desc: `${c.technicianName} trabaja medio día`, level: 'warning' });
    });
    const cancelToday = todayAppts.filter(a => a.status === 'cancelled').length;
    if (cancelToday > 0) list.push({ id: 'cancel', tipo: 'Cancelaciones', desc: `${cancelToday} turno${cancelToday > 1 ? 's' : ''} cancelado${cancelToday > 1 ? 's' : ''} hoy`, level: 'warning' });
    return list;
  }, [dailyCap, todayAppts]);

  // Ranking servicios
  const rankingServicios = useMemo(() => {
    const map: Record<string, { name: string; color: string; count: number; hours: number }> = {};
    appointments.filter(a => a.status !== 'cancelled').forEach(a => {
      const key = a.serviceTypeId;
      if (!map[key]) map[key] = { name: a.serviceType.name, color: a.serviceType.color, count: 0, hours: 0 };
      map[key].count++;
      map[key].hours += a.serviceType.durationHours;
    });
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 6);
  }, [appointments]);

  // Top clientes
  const topClientes = useMemo(() => {
    const map: Record<string, number> = {};
    appointments.filter(a => a.status !== 'cancelled').forEach(a => {
      map[a.customerName] = (map[a.customerName] ?? 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }));
  }, [appointments]);

  return {
    from, to,
    appointments, todayAppts, technicians, dailyCap, serviceTypes,
    utilization, disponibles,
    totalHours: periodCap.totalAvail, usedHours: periodCap.totalUsed,
    barData, techLoad, ocupacionLine, alertas, rankingServicios, topClientes,
  };
}

// ─── Widget components ────────────────────────────────────────────────────────

function KpiCard({ title, value, sub, color, icon }: { title: string; value: string | number; sub: string; color: string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-between h-full px-4 py-4">
      <div className="flex items-start justify-between">
        <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: color + '18' }}>
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      <div>
        <p className="text-3xl font-bold text-slate-900 tabular-nums mt-2">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
      </div>
      <div className="h-1 rounded-full mt-2" style={{ background: color + '25' }}>
        <div className="h-full rounded-full" style={{ background: color, width: '65%' }} />
      </div>
    </div>
  );
}

function BandasWidget({ data }: { data: { name: string; pct: number; used: number; avail: number }[] }) {
  return (
    <div className="px-4 py-3 space-y-3 overflow-auto h-full">
      {data.map(t => {
        const color = t.pct >= 80 ? '#ef4444' : t.pct >= 50 ? '#f59e0b' : '#22c55e';
        return (
          <div key={t.name}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-700">{t.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">{t.used.toFixed(0)}h / {t.avail.toFixed(0)}h</span>
                <span className="text-xs font-bold" style={{ color }}>{t.pct}%</span>
              </div>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(t.pct, 100)}%`, background: color }} />
            </div>
          </div>
        );
      })}
      {data.length === 0 && <p className="text-xs text-slate-400 text-center py-4">Sin datos de capacidad</p>}
    </div>
  );
}

function AlertasWidget({ data }: { data: { id: string; tipo: string; desc: string; level: 'critical' | 'warning' }[] }) {
  return (
    <div className="divide-y divide-slate-100 overflow-auto h-full">
      {data.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400">
          <CheckCircle2 className="h-6 w-6 text-emerald-400" />
          <p className="text-xs font-medium text-emerald-600">Sin alertas activas</p>
        </div>
      )}
      {data.map(a => (
        <div key={a.id} className="flex items-start gap-3 px-4 py-3">
          <div className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${a.level === 'critical' ? 'bg-red-500' : 'bg-amber-400'}`} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-900">{a.tipo}</p>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{a.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function TurnosListWidget({ appointments }: { appointments: Appointment[] }) {
  const STATUS_COLOR: Record<string, string> = { scheduled: '#3b82f6', in_progress: '#f59e0b', done: '#22c55e', cancelled: '#ef4444' };
  const STATUS_LABEL: Record<string, string> = { scheduled: 'Agendado', in_progress: 'En proceso', done: 'Listo', cancelled: 'Cancelado' };
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const FILTERS = [
    { key: 'scheduled',   label: 'Agendado',   color: '#3b82f6' },
    { key: 'in_progress', label: 'En proceso', color: '#f59e0b' },
    { key: 'done',        label: 'Listo',      color: '#22c55e' },
    { key: 'cancelled',   label: 'Cancelado',  color: '#ef4444' },
  ];
  const counts = appointments.reduce<Record<string, number>>((acc, a) => { acc[a.status] = (acc[a.status] ?? 0) + 1; return acc; }, {});
  const filtered = selected.size === 0 ? appointments : appointments.filter(a => selected.has(a.status));

  return (
    <div className="flex flex-col overflow-hidden h-full">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-100 flex-shrink-0 flex-wrap">
        {FILTERS.map(f => {
          const active = selected.has(f.key);
          return (
            <button key={f.key} onClick={() => setSelected(prev => { const n = new Set(prev); n.has(f.key) ? n.delete(f.key) : n.add(f.key); return n; })}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold transition-all border"
              style={active ? { background: f.color + '18', color: f.color, borderColor: f.color } : { background: 'transparent', color: '#94a3b8', borderColor: '#e2e8f0' }}>
              {f.label}
              <span className="tabular-nums rounded-full px-1" style={{ background: active ? f.color + '25' : '#f1f5f9', color: active ? f.color : '#94a3b8' }}>{counts[f.key] ?? 0}</span>
            </button>
          );
        })}
        {selected.size > 0 && <button onClick={() => setSelected(new Set())} className="text-[10px] text-slate-400 hover:text-slate-600 underline ml-1">limpiar</button>}
        <span className="ml-auto text-[10px] text-slate-400 tabular-nums">{filtered.length} turnos</span>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 sticky top-0">
              <th className="text-left px-3 py-2 font-medium text-slate-500">Hora</th>
              <th className="text-left px-3 py-2 font-medium text-slate-500">Cliente</th>
              <th className="text-left px-3 py-2 font-medium text-slate-500">Servicio</th>
              <th className="text-left px-3 py-2 font-medium text-slate-500">Técnico</th>
              <th className="text-left px-3 py-2 font-medium text-slate-500">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 50).map(a => (
              <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                style={{ background: (STATUS_COLOR[a.status] ?? '#94a3b8') + '08' }}>
                <td className="px-3 py-2 font-bold text-slate-700 whitespace-nowrap">{a.date} {a.timeStart}</td>
                <td className="px-3 py-2 font-medium text-slate-900">{a.customerName}</td>
                <td className="px-3 py-2 text-slate-600 truncate max-w-[100px]">{a.serviceType?.name}</td>
                <td className="px-3 py-2 text-slate-600">{a.technician?.name?.split(' ')[0]}</td>
                <td className="px-3 py-2">
                  <span className="px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap"
                    style={{ background: (STATUS_COLOR[a.status] ?? '#94a3b8') + '20', color: STATUS_COLOR[a.status] ?? '#94a3b8' }}>
                    {STATUS_LABEL[a.status] ?? a.status}
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">Sin turnos</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SemanaBarWidget({ data }: { data: { date: string; done: number; scheduled: number; inProgress: number }[] }) {
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} />
        <Bar dataKey="done"       stackId="a" fill="#22c55e" name="Listo" />
        <Bar dataKey="inProgress" stackId="a" fill="#f59e0b" name="En proceso" />
        <Bar dataKey="scheduled"  stackId="a" fill="#3b82f6" radius={[4,4,0,0]} name="Agendado" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function OcupacionLineWidget({ data }: { data: { date: string; pct: number }[] }) {
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} domain={[0, 100]} unit="%" />
        <Tooltip formatter={(v: any) => [`${v}%`, 'Ocupación']} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} />
        <ReferenceLine y={80} stroke="#22c55e" strokeDasharray="4 4" />
        <Line type="monotone" dataKey="pct" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} name="Ocupación" />
      </LineChart>
    </ResponsiveContainer>
  );
}

function TimelineHoyWidget({ appointments, technicians }: { appointments: Appointment[]; technicians: any[] }) {
  const HOUR_START = 8, HOUR_END = 18;
  const TOTAL_MINS = (HOUR_END - HOUR_START) * 60;
  const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return (h - HOUR_START) * 60 + m;
  };
  const toPct = (min: number) => `${(min / TOTAL_MINS) * 100}%`;

  // Línea de hora actual — se calcula sólo en el cliente para evitar hydration mismatch
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); }, []);
  const nowMin  = now ? (now.getHours() - HOUR_START) * 60 + now.getMinutes() : -1;
  const showNow = now !== null && nowMin >= 0 && nowMin <= TOTAL_MINS;

  const STATUS_COLOR: Record<string, { bg: string; border: string; text: string }> = {
    done:        { bg: '#dcfce7', border: '#22c55e', text: '#15803d' },
    in_progress: { bg: '#fef9c3', border: '#eab308', text: '#854d0e' },
    scheduled:   { bg: '#dbeafe', border: '#3b82f6', text: '#1d4ed8' },
  };

  if (technicians.length === 0) return <Empty />;

  return (
    <div className="flex flex-col h-full px-4 py-3 overflow-auto">
      {/* Eje de horas — encabezado */}
      <div className="flex mb-2 pl-24 pr-1">
        {HOURS.map(h => (
          <div
            key={h}
            className="flex-1 text-center"
            style={{ minWidth: 0 }}
          >
            <span className={`text-[10px] font-medium ${h === now?.getHours() && showNow ? 'text-red-500 font-bold' : 'text-slate-400'}`}>
              {h}h
            </span>
          </div>
        ))}
      </div>

      {/* Filas por técnico */}
      <div className="flex-1 space-y-2 relative">
        {technicians.map(tech => {
          const techAppts = appointments.filter(
            a => a.technicianId === tech.id && a.status !== 'cancelled',
          );

          return (
            <div key={tech.id} className="flex items-center gap-2 group">
              {/* Nombre técnico */}
              <div className="w-20 flex-shrink-0 text-right pr-2">
                <span className="text-xs font-semibold text-slate-700 leading-none block truncate">
                  {tech.name.split(' ')[0]}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  {techAppts.length} turno{techAppts.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Barra de timeline */}
              <div className="flex-1 relative h-10 rounded-lg overflow-visible" style={{ background: '#f1f5f9' }}>
                {/* Grid de horas — líneas verticales */}
                {HOURS.slice(0, -1).map(h => (
                  <div
                    key={h}
                    className="absolute top-0 bottom-0 w-px"
                    style={{
                      left: toPct((h - HOUR_START) * 60),
                      background: h % 2 === 0 ? '#cbd5e1' : '#e2e8f0',
                    }}
                  />
                ))}

                {/* Turnos */}
                {techAppts.map(a => {
                  const start = Math.max(toMin(a.timeStart), 0);
                  const end   = Math.min(toMin(a.timeEnd), TOTAL_MINS);
                  const widthPct = ((end - start) / TOTAL_MINS) * 100;
                  const cfg = STATUS_COLOR[a.status] ?? STATUS_COLOR.scheduled;
                  const isWide = widthPct > 8;

                  return (
                    <div
                      key={a.id}
                      className="absolute top-1 bottom-1 rounded-md flex items-center overflow-hidden cursor-default transition-all hover:top-0 hover:bottom-0 hover:z-10 hover:shadow-md"
                      style={{
                        left: toPct(start),
                        width: `${Math.max(widthPct, 1.5)}%`,
                        background: cfg.bg,
                        borderLeft: `3px solid ${cfg.border}`,
                      }}
                      title={`${a.customerName} · ${a.serviceType.name} · ${a.timeStart}–${a.timeEnd}`}
                    >
                      {isWide && (
                        <div className="px-1.5 overflow-hidden leading-none">
                          <p className="text-[10px] font-bold truncate" style={{ color: cfg.text }}>
                            {a.customerName.split(' ')[0]}
                          </p>
                          {widthPct > 14 && (
                            <p className="text-[9px] truncate" style={{ color: cfg.border }}>
                              {a.timeStart}–{a.timeEnd}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Línea de hora actual */}
                {showNow && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 z-20 pointer-events-none"
                    style={{ left: toPct(nowMin), background: '#ef4444' }}
                  />
                )}
              </div>
            </div>
          );
        })}

        {/* Línea de hora actual — visible en toda la altura */}
        {showNow && (
          <div
            className="absolute top-0 bottom-0 pointer-events-none z-10"
            style={{ left: `calc(${(nowMin / TOTAL_MINS) * 100}% + 5.25rem + 0.5rem)` }}
          >
            {/* Label "ahora" */}
            <div
              className="absolute -top-6 -translate-x-1/2 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap"
            >
              ahora
            </div>
          </div>
        )}
      </div>

      {/* Leyenda */}
      <div className="flex items-center gap-4 mt-3 pt-2 border-t border-slate-100">
        {[
          { label: 'Programado', ...STATUS_COLOR.scheduled },
          { label: 'En proceso', ...STATUS_COLOR.in_progress },
          { label: 'Terminado',  ...STATUS_COLOR.done },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className="h-2.5 w-4 rounded-sm" style={{ background: s.bg, borderLeft: `3px solid ${s.border}` }} />
            <span className="text-[10px] text-slate-500 font-medium">{s.label}</span>
          </div>
        ))}
        {showNow && (
          <div className="flex items-center gap-1.5 ml-auto">
            <div className="h-3 w-0.5 bg-red-500 rounded-full" />
            <span className="text-[10px] text-red-500 font-medium">
              {now.getHours().toString().padStart(2,'0')}:{now.getMinutes().toString().padStart(2,'0')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function RankingServiciosWidget({ data }: { data: { name: string; color: string; count: number; hours: number }[] }) {
  if (!data.length) return <Empty />;
  const max = Math.max(...data.map(d => d.count));
  return (
    <div className="px-4 py-3 space-y-2.5 overflow-auto h-full">
      {data.map((item, i) => (
        <div key={item.name}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 w-4">{i + 1}</span>
              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: item.color }} />
              <span className="text-xs font-semibold text-slate-800 truncate max-w-[120px]">{item.name}</span>
            </div>
            <span className="text-xs font-bold text-slate-700">{item.count} turno{item.count !== 1 ? 's' : ''}</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden ml-6">
            <div className="h-full rounded-full" style={{ width: `${(item.count / max) * 100}%`, background: item.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function CancelacionesWidget({ appointments }: { appointments: Appointment[] }) {
  const total     = appointments.length;
  const cancelled = appointments.filter(a => a.status === 'cancelled').length;
  const pct = total > 0 ? Math.round((cancelled / total) * 100) : 0;
  const color = pct > 15 ? '#ef4444' : pct > 8 ? '#f59e0b' : '#22c55e';

  return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <div className="relative h-24 w-24">
        <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f1f5f9" strokeWidth="3" />
          <circle cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth="3"
            strokeDasharray={`${pct} ${100 - pct}`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold" style={{ color }}>{pct}%</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-slate-900">{cancelled} cancelaciones</p>
        <p className="text-xs text-slate-500">de {total} turnos totales</p>
      </div>
    </div>
  );
}

function HeatmapDemandaWidget({ appointments }: { appointments: Appointment[] }) {
  const DAYS = ['Lun','Mar','Mié','Jue','Vie','Sáb'];
  const HOURS = [8,9,10,11,12,13,14,15,16,17];
  const grid = useMemo(() => {
    const map: Record<string, number> = {};
    appointments.filter(a => a.status !== 'cancelled').forEach(a => {
      const d = parseISO(a.date + 'T12:00:00');
      const dow = d.getDay(); // 0=Sun..6=Sat
      if (dow === 0) return;
      const h = parseInt(a.timeStart.split(':')[0]);
      const key = `${dow}_${h}`;
      map[key] = (map[key] ?? 0) + 1;
    });
    return map;
  }, [appointments]);
  const maxVal = Math.max(1, ...Object.values(grid));

  return (
    <div className="px-3 py-2 overflow-auto h-full">
      <div className="inline-block min-w-full">
        <div className="flex gap-1 mb-1 pl-8">
          {DAYS.map(d => <div key={d} className="w-8 text-center text-[9px] text-slate-400 font-medium">{d}</div>)}
        </div>
        {HOURS.map(h => (
          <div key={h} className="flex gap-1 mb-1 items-center">
            <div className="w-7 text-right text-[9px] text-slate-400 pr-1">{h}h</div>
            {[1,2,3,4,5,6].map(dow => {
              const count = grid[`${dow}_${h}`] ?? 0;
              const opacity = count > 0 ? 0.2 + (count / maxVal) * 0.75 : 0.06;
              return (
                <div key={dow} className="w-8 h-5 rounded-sm flex items-center justify-center" style={{ background: `rgba(59,130,246,${opacity})` }} title={`${count} turno${count !== 1 ? 's' : ''}`}>
                  {count > 0 && <span className="text-[8px] text-blue-900 font-bold">{count}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function TopClientesWidget({ data }: { data: { name: string; count: number }[] }) {
  if (!data.length) return <Empty />;
  const max = Math.max(...data.map(d => d.count));
  return (
    <div className="px-4 py-3 space-y-2 overflow-auto h-full">
      {data.map((item, i) => (
        <div key={item.name} className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-300 w-4">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs font-semibold text-slate-800 truncate">{item.name}</span>
              <span className="text-xs text-slate-500 ml-2">{item.count}x</span>
            </div>
            <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-400 rounded-full" style={{ width: `${(item.count / max) * 100}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TiempoPeriodoWidget() {
  const today = formatDate(new Date());
  const [view, setView] = useState<'week' | 'month'>('week');

  const { from, to } = useMemo(() => {
    const ref = parseISO(today + 'T12:00:00');
    if (view === 'week') {
      const s = startOfWeek(ref, { weekStartsOn: 1 });
      const e = endOfWeek(ref,   { weekStartsOn: 1 });
      return { from: format(s, 'yyyy-MM-dd'), to: format(e, 'yyyy-MM-dd') };
    }
    const s = startOfMonth(ref);
    const e = endOfMonth(ref);
    return { from: format(s, 'yyyy-MM-dd'), to: format(e, 'yyyy-MM-dd') };
  }, [view, today]);

  const { data: appointments = [] } = useAppointmentsByRange(from, to);
  const { data: technicians = [] }  = useTechnicians();
  const { data: weekCap = {} }      = useWeekCapacity(from, to);

  const chartData = useMemo(() => {
    if (view === 'week') {
      const days = eachDayOfInterval({ start: parseISO(from + 'T12:00:00'), end: parseISO(to + 'T12:00:00') })
        .filter(d => d.getDay() !== 0);
      return days.map(d => {
        const ds = format(d, 'yyyy-MM-dd');
        const caps = weekCap[ds] ?? [];
        const avail = caps.reduce((s, c) => s + c.availableHours, 0);
        const used  = caps.reduce((s, c) => s + c.usedHours, 0);
        return { label: format(d, 'EEE d', { locale: es }), avail: parseFloat(avail.toFixed(1)), used: parseFloat(used.toFixed(1)) };
      });
    }
    // month view: aggregate by week
    const weeks = eachWeekOfInterval({ start: parseISO(from + 'T12:00:00'), end: parseISO(to + 'T12:00:00') }, { weekStartsOn: 1 });
    return weeks.map((wStart, i) => {
      const wEnd = endOfWeek(wStart, { weekStartsOn: 1 });
      const days = eachDayOfInterval({ start: wStart, end: wEnd }).filter(d => d.getDay() !== 0);
      let avail = 0, used = 0;
      days.forEach(d => {
        const ds = format(d, 'yyyy-MM-dd');
        (weekCap[ds] ?? []).forEach(c => { avail += c.availableHours; used += c.usedHours; });
      });
      return { label: `Sem ${i + 1}`, avail: parseFloat(avail.toFixed(1)), used: parseFloat(used.toFixed(1)) };
    });
  }, [view, from, to, weekCap]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 px-3 pt-2 pb-1 flex-shrink-0">
        {(['week','month'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`text-[10px] px-2.5 py-1 rounded-md font-medium transition-colors ${view === v ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-100'}`}>
            {v === 'week' ? 'Semana' : 'Mes'}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {chartData.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} unit="h" />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} />
              <Bar dataKey="avail" fill="#e2e8f0" name="Disponibles" radius={[2,2,0,0]} />
              <Bar dataKey="used"  fill="#3b82f6" name="Usadas"      radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function Empty() {
  return <div className="flex items-center justify-center h-full text-xs text-slate-400">Sin datos</div>;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MechanicDashboard() {
  const [today, setToday] = useState(() => formatDate(new Date()));
  const weekRef = today;

  const [mode, setMode]         = useState<PeriodMode>('week');
  const [customFrom, setFrom]   = useState(() => formatDate(new Date()));
  const [customTo, setTo]       = useState(() => formatDate(new Date()));

  useEffect(() => {
    const t = formatDate(new Date());
    setToday(t);
    setFrom(t);
    setTo(t);
  }, []);
  const [editing, setEditing]   = useState(false);
  const [catalog, setCatalog]   = useState(false);
  const [editWidget, setEditWidget] = useState<DWidget | null>(null);
  const [mounted, setMounted]   = useState(false);
  const containerRef            = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(1200);

  const [widgets, setWidgets] = useState<DWidget[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_WIDGETS;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_WIDGETS;
    } catch { return DEFAULT_WIDGETS; }
  });

  useEffect(() => {
    setMounted(true);
    const obs = new ResizeObserver(entries => {
      for (const e of entries) setContainerW(e.contentRect.width);
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (mounted) localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  }, [widgets, mounted]);

  const data = useDashboardData(mode, customFrom, customTo, weekRef);

  function handleLayoutChange(layout: RGLLayoutArr) {
    setWidgets(prev => prev.map(w => {
      const l = layout.find(l => l.i === w.id);
      return l ? { ...w, layout: { x: l.x, y: l.y, w: l.w, h: l.h } } : w;
    }));
  }

  function addWidget(type: WidgetType) {
    const cat = CATALOG.find(c => c.type === type);
    if (!cat) return;
    const id = `w${Date.now()}`;
    setWidgets(prev => [...prev, { id, type, title: cat.label, color: '#3b82f6', layout: { x: 0, y: 999, w: 4, h: 3 } }]);
    setCatalog(false);
  }

  function removeWidget(id: string) { setWidgets(prev => prev.filter(w => w.id !== id)); }
  function resetLayout()            { setWidgets(DEFAULT_WIDGETS); }

  function renderWidgetBody(w: DWidget) {
    switch (w.type) {
      case 'kpi_util':     return <KpiCard title={w.title} value={`${data.utilization}% / 100%`} sub={`${data.usedHours.toFixed(0)}h de ${data.totalHours.toFixed(0)}h`} color={w.color} icon={<Activity className="h-5 w-5"/>} />;
      case 'kpi_turnos':   return <KpiCard title={w.title} value={`${data.appointments.filter(a=>a.status==='done'||a.status==='in_progress').length} / ${data.appointments.filter(a=>a.status!=='cancelled').length}`} sub="ocupados / activos en el período" color={w.color} icon={<Hash className="h-5 w-5"/>} />;
      case 'kpi_techs':    return <KpiCard title={w.title} value={`${data.disponibles} / ${data.technicians.length}`} sub="disponibles / total técnicos" color={w.color} icon={<Users className="h-5 w-5"/>} />;
      case 'kpi_horas':    return <KpiCard title={w.title} value={`${data.usedHours.toFixed(0)}h / ${data.totalHours.toFixed(0)}h`} sub={`${data.utilization}% utilización`} color={w.color} icon={<Clock className="h-5 w-5"/>} />;
      case 'bandas':       return <BandasWidget data={data.techLoad} />;
      case 'alertas':      return <AlertasWidget data={data.alertas} />;
      case 'turnos_list':  return <TurnosListWidget appointments={data.appointments} />;
      case 'semana_bar':   return <SemanaBarWidget data={data.barData} />;
      case 'ocupacion_line': return <OcupacionLineWidget data={data.ocupacionLine} />;
      case 'timeline_hoy': return <TimelineHoyWidget appointments={data.todayAppts} technicians={data.technicians} />;
      case 'tiempo_periodo': return <TiempoPeriodoWidget />;
      case 'ranking_servicios': return <RankingServiciosWidget data={data.rankingServicios} />;
      case 'cancelaciones': return <CancelacionesWidget appointments={data.appointments} />;
      case 'heatmap_demanda': return <HeatmapDemandaWidget appointments={data.appointments} />;
      case 'top_clientes': return <TopClientesWidget data={data.topClientes} />;
      default: return <Empty />;
    }
  }

  const rglLayout = widgets.map(w => ({
    i: w.id, x: w.layout.x, y: w.layout.y, w: w.layout.w, h: w.layout.h, minW: 2, minH: 2,
  }));

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      {/* Toolbar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold text-slate-900">Panel de Control</h1>
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            {(['today','week','month','custom'] as PeriodMode[]).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {m === 'today' ? 'Hoy' : m === 'week' ? 'Semana' : m === 'month' ? 'Mes' : 'Personalizado'}
              </button>
            ))}
          </div>
          {mode === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="date" value={customFrom} onChange={e => setFrom(e.target.value)} className="text-xs border border-slate-200 rounded-md px-2 py-1.5 text-slate-700 focus:outline-none" />
              <span className="text-xs text-slate-400">—</span>
              <input type="date" value={customTo} onChange={e => setTo(e.target.value)} className="text-xs border border-slate-200 rounded-md px-2 py-1.5 text-slate-700 focus:outline-none" />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCatalog(true)} className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors">
            <Plus className="h-3.5 w-3.5" /> Agregar widget
          </button>
          <button onClick={() => setEditing(e => !e)} className={`flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 transition-colors ${editing ? 'bg-blue-50 text-blue-700 border-blue-200' : 'text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
            <Settings2 className="h-3.5 w-3.5" /> {editing ? 'Listo' : 'Editar'}
          </button>
          {editing && (
            <button onClick={resetLayout} className="text-xs text-slate-400 hover:text-red-500 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors">
              Restablecer
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-4">
        {mounted && (
          <GridLayout
            layout={rglLayout}
            width={containerW - 32}
            onLayoutChange={handleLayoutChange}
            gridConfig={{ cols: COLS, rowHeight: ROW_HEIGHT, margin: [12, 12], containerPadding: null, maxRows: Infinity }}
            dragConfig={{ enabled: editing, handle: '.drag-handle', bounded: false, threshold: 3 }}
            resizeConfig={{ enabled: editing }}
          >
            {widgets.map(w => (
              <div key={w.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                {/* Widget header */}
                <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 flex-shrink-0" style={{ borderLeftColor: w.color, borderLeftWidth: 3 }}>
                  {editing && <GripVertical className="drag-handle h-3.5 w-3.5 text-slate-300 cursor-grab flex-shrink-0" />}
                  <p className="text-xs font-semibold text-slate-700 flex-1 truncate">{w.title}</p>
                  {editing && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditWidget(w)} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button onClick={() => removeWidget(w.id)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
                {/* Widget body */}
                <div className="flex-1 min-h-0">{renderWidgetBody(w)}</div>
              </div>
            ))}
          </GridLayout>
        )}
      </div>

      {/* Catalog modal */}
      {catalog && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setCatalog(false)}>
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-5 w-80 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-slate-900">Agregar widget</p>
              <button onClick={() => setCatalog(false)} className="p-1 rounded hover:bg-slate-100 text-slate-400"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-1">
              {CATALOG.map(c => (
                <button key={c.type} onClick={() => addWidget(c.type)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 text-left transition-colors">
                  <span className="text-slate-400">{c.icon}</span>
                  <span className="text-sm text-slate-700">{c.label}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-300 ml-auto" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Edit widget modal */}
      {editWidget && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setEditWidget(null)}>
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-5 w-72" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-slate-900">Editar widget</p>
              <button onClick={() => setEditWidget(null)} className="p-1 rounded hover:bg-slate-100 text-slate-400"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Título</label>
                <input
                  value={editWidget.title}
                  onChange={e => setEditWidget({ ...editWidget, title: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {['#3b82f6','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#64748b'].map(c => (
                    <button key={c} onClick={() => setEditWidget({ ...editWidget, color: c })}
                      className={`h-6 w-6 rounded-full transition-all ${editWidget.color === c ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'hover:scale-105'}`}
                      style={{ background: c }} />
                  ))}
                </div>
              </div>
              <button
                onClick={() => { setWidgets(prev => prev.map(w => w.id === editWidget.id ? editWidget : w)); setEditWidget(null); }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg text-sm transition-colors">
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
