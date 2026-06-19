'use client';
import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { Layout as RGLLayout } from 'react-grid-layout';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import {
  TrendingUp, Users, Clock, AlertTriangle, ChevronRight,
  Activity, Zap, Settings2, CheckCircle2, Plus, Trash2,
  Pencil, GripVertical, X, CalendarDays, CalendarRange,
  Hash, BarChart3,
} from 'lucide-react';
import {
  format, addDays, startOfWeek, endOfWeek, parseISO,
  eachDayOfInterval, isToday, isSameWeek,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { useTechnicians } from '@/hooks/use-technicians';
import { useDailyCapacity, useWeekCapacity } from '@/hooks/use-capacity';
import { useAppointmentsByDate, useAppointmentsByRange } from '@/hooks/use-appointments';
import { formatDate } from '@/lib/utils';
import type { Appointment, TechnicianCapacity } from '@/types';

import 'react-grid-layout/css/styles.css';

const GridLayout = dynamic(
  () => import('react-grid-layout').then(m => ({ default: m.GridLayout })),
  { ssr: false }
);

// ─── Types ────────────────────────────────────────────────────────────────────

type PeriodMode = 'today' | 'week' | 'custom';
type WidgetType = 'kpi_util' | 'kpi_turnos' | 'kpi_techs' | 'kpi_horas'
  | 'bandas' | 'alertas' | 'turnos_list' | 'semana_bar' | 'ocupacion_line';

interface DWidget {
  id: string;
  type: WidgetType;
  title: string;
  color: string;
  layout: { x: number; y: number; w: number; h: number };
}

// ─── Default layout ───────────────────────────────────────────────────────────

const DEFAULT_WIDGETS: DWidget[] = [
  { id:'d1', type:'kpi_util',      title:'Utilización',           color:'#3b82f6', layout:{ x:0, y:0,  w:3, h:2 } },
  { id:'d2', type:'kpi_turnos',    title:'Turnos del Período',    color:'#8b5cf6', layout:{ x:3, y:0,  w:3, h:2 } },
  { id:'d3', type:'kpi_techs',     title:'Técnicos Disponibles',  color:'#22c55e', layout:{ x:6, y:0,  w:3, h:2 } },
  { id:'d4', type:'kpi_horas',     title:'Horas en Uso',          color:'#f59e0b', layout:{ x:9, y:0,  w:3, h:2 } },
  { id:'d5', type:'semana_bar',    title:'Turnos por Día',        color:'#3b82f6', layout:{ x:0, y:2,  w:7, h:4 } },
  { id:'d6', type:'bandas',        title:'Carga por Técnico',     color:'#22c55e', layout:{ x:7, y:2,  w:5, h:4 } },
  { id:'d7', type:'alertas',       title:'Alertas',               color:'#ef4444', layout:{ x:0, y:6,  w:4, h:4 } },
  { id:'d8', type:'turnos_list',   title:'Agenda del Período',    color:'#64748b', layout:{ x:4, y:6,  w:8, h:5 } },
];

const CATALOG: Array<{ type: WidgetType; label: string; icon: React.ReactNode }> = [
  { type: 'kpi_util',     label: 'KPI Utilización',         icon: <Activity className="h-4 w-4" /> },
  { type: 'kpi_turnos',   label: 'KPI Turnos',              icon: <Hash className="h-4 w-4" /> },
  { type: 'kpi_techs',    label: 'KPI Técnicos',            icon: <Users className="h-4 w-4" /> },
  { type: 'kpi_horas',    label: 'KPI Horas en Uso',        icon: <Clock className="h-4 w-4" /> },
  { type: 'semana_bar',   label: 'Turnos por Día',          icon: <BarChart3 className="h-4 w-4" /> },
  { type: 'bandas',       label: 'Carga por Técnico',       icon: <Zap className="h-4 w-4" /> },
  { type: 'alertas',      label: 'Alertas Críticas',        icon: <AlertTriangle className="h-4 w-4" /> },
  { type: 'turnos_list',  label: 'Agenda del Período',      icon: <CalendarDays className="h-4 w-4" /> },
  { type: 'ocupacion_line',label:'Ocupación Semanal',       icon: <TrendingUp className="h-4 w-4" /> },
];

const STORAGE_KEY = 'dashboard_widgets_v1';
const COLS = 12;
const ROW_HEIGHT = 62;

// ─── Utilidades de período ────────────────────────────────────────────────────

function getWeekRange(referenceDate: string) {
  const d = parseISO(referenceDate + 'T12:00:00');
  const start = startOfWeek(d, { weekStartsOn: 1 });
  const end = endOfWeek(d, { weekStartsOn: 1 });
  return { from: format(start, 'yyyy-MM-dd'), to: format(end, 'yyyy-MM-dd') };
}

// ─── Hook de datos unificado ──────────────────────────────────────────────────

function useDashboardData(mode: PeriodMode, customFrom: string, customTo: string, weekRef: string) {
  const today = formatDate(new Date());
  const { from, to } = mode === 'today'
    ? { from: today, to: today }
    : mode === 'week'
    ? getWeekRange(weekRef)
    : { from: customFrom, to: customTo };

  const { data: appointments = [] } = useAppointmentsByRange(from, to);
  const { data: todayAppts = [] } = useAppointmentsByDate(today);
  const { data: technicians = [] } = useTechnicians();
  const { data: dailyCap = [] } = useDailyCapacity(today);
  const { data: weekCap = {} } = useWeekCapacity(from, to);

  // Días del período
  const days = useMemo(() => {
    try {
      return eachDayOfInterval({
        start: parseISO(from + 'T12:00:00'),
        end: parseISO(to + 'T12:00:00'),
      }).filter(d => d.getDay() !== 0); // sin domingos
    } catch { return []; }
  }, [from, to]);

  // Capacidad agregada del período
  const periodCap = useMemo(() => {
    let totalAvail = 0, totalUsed = 0;
    Object.values(weekCap).forEach(dayCapArr => {
      dayCapArr.forEach(c => {
        totalAvail += c.availableHours;
        totalUsed += c.usedHours;
      });
    });
    return { totalAvail, totalUsed };
  }, [weekCap]);

  // Utilización del período
  const utilization = periodCap.totalAvail > 0
    ? Math.round((periodCap.totalUsed / periodCap.totalAvail) * 100)
    : 0;

  // Turnos activos hoy (solo para KPI de técnicos disponibles)
  const disponibles = dailyCap.filter(c => (c.availableHours - c.usedHours) >= 1 && c.isWorkingDay).length;

  // Bar data: turnos por día del período
  const barData = days.map(d => {
    const ds = format(d, 'yyyy-MM-dd');
    const label = format(d, 'EEE d', { locale: es });
    const done = appointments.filter(a => a.date === ds && a.status === 'done').length;
    const scheduled = appointments.filter(a => a.date === ds && a.status === 'scheduled').length;
    const inProgress = appointments.filter(a => a.date === ds && a.status === 'in_progress').length;
    return { date: label, done, scheduled, inProgress, total: done + scheduled + inProgress };
  });

  // Carga por técnico: ocupación % en el período
  const techLoad = technicians.map(tech => {
    let avail = 0, used = 0;
    Object.values(weekCap).forEach(dayArr => {
      const c = dayArr.find(x => x.technicianId === tech.id);
      if (c) { avail += c.availableHours; used += c.usedHours; }
    });
    const pct = avail > 0 ? Math.round((used / avail) * 100) : 0;
    return { name: tech.name.split(' ')[0], pct, used, avail };
  }).sort((a, b) => b.pct - a.pct);

  // Ocupación diaria para línea
  const ocupacionLine = days.map(d => {
    const ds = format(d, 'yyyy-MM-dd');
    const label = format(d, 'EEE d', { locale: es });
    const caps: TechnicianCapacity[] = weekCap[ds] ?? [];
    const avail = caps.reduce((s, c) => s + c.availableHours, 0);
    const used = caps.reduce((s, c) => s + c.usedHours, 0);
    return { date: label, pct: avail > 0 ? Math.round((used / avail) * 100) : 0 };
  });

  // Alertas dinámicas
  const alertas = useMemo(() => {
    const list: { id: string; tipo: string; desc: string; level: 'critical' | 'warning' }[] = [];
    dailyCap.forEach(c => {
      const pct = c.availableHours > 0 ? (c.usedHours / c.availableHours) * 100 : 0;
      if (pct >= 90) list.push({ id: c.technicianId + '_overload', tipo: 'Sobrecarga', desc: `${c.technicianName} al ${Math.round(pct)}% de capacidad hoy`, level: 'critical' });
      if (c.absenceType === 'full') list.push({ id: c.technicianId + '_absent', tipo: 'Ausencia total', desc: `${c.technicianName} no trabaja hoy`, level: 'warning' });
      if (c.absenceType === 'half') list.push({ id: c.technicianId + '_half', tipo: 'Media jornada', desc: `${c.technicianName} trabaja medio día`, level: 'warning' });
    });
    const cancelToday = todayAppts.filter(a => a.status === 'cancelled').length;
    if (cancelToday > 0) list.push({ id: 'cancel', tipo: 'Cancelaciones', desc: `${cancelToday} turno${cancelToday > 1 ? 's' : ''} cancelado${cancelToday > 1 ? 's' : ''} hoy`, level: 'warning' });
    return list;
  }, [dailyCap, todayAppts]);

  return {
    from, to,
    appointments,
    todayAppts,
    technicians,
    dailyCap,
    utilization,
    disponibles,
    totalHours: periodCap.totalAvail,
    usedHours: periodCap.totalUsed,
    barData,
    techLoad,
    ocupacionLine,
    alertas,
  };
}

// ─── Widget bodies ────────────────────────────────────────────────────────────

function KpiCard({ title, value, sub, color, icon }: {
  title: string; value: string | number; sub: string; color: string; icon: React.ReactNode;
}) {
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

  return (
    <div className="overflow-auto h-full">
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
          {appointments.slice(0, 20).map(a => (
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
          {appointments.length === 0 && (
            <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">Sin turnos en el período</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SemanaBarWidget({ data }: { data: { date: string; done: number; scheduled: number; inProgress: number }[] }) {
  if (!data.length) return <div className="flex items-center justify-center h-full text-xs text-slate-400">Sin datos</div>;

  const todayLabel = format(new Date(), 'EEE d', { locale: es });

  return (
    <div className="flex flex-col h-full gap-3 px-1 pt-1 pb-2">
      {/* Leyenda */}
      <div className="flex items-center gap-4 px-1">
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400" />Listo
        </span>
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400" />En proceso
        </span>
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-400" />Agendado
        </span>
      </div>

      {/* Barras */}
      <div className="flex items-end justify-between flex-1 gap-1.5 px-1">
        {data.map((d) => {
          const total = d.done + d.inProgress + d.scheduled;
          const isHoy = d.date === todayLabel;
          const maxTotal = Math.max(...data.map(x => x.done + x.inProgress + x.scheduled), 1);

          return (
            <div key={d.date} className="flex flex-col items-center gap-1.5 flex-1 min-w-0 h-full">
              {/* Número total */}
              <span className={`text-xs font-semibold ${isHoy ? 'text-slate-700' : 'text-slate-400'}`}>
                {total > 0 ? total : ''}
              </span>
              {/* Barra apilada */}
              <div className="flex flex-col justify-end w-full flex-1 gap-px">
                {[
                  { val: d.scheduled, color: isHoy ? 'bg-blue-500' : 'bg-blue-200' },
                  { val: d.inProgress, color: isHoy ? 'bg-amber-400' : 'bg-amber-200' },
                  { val: d.done, color: isHoy ? 'bg-emerald-500' : 'bg-emerald-200' },
                ].map(({ val, color }, i) => {
                  const heightPct = maxTotal > 0 ? (val / maxTotal) * 100 : 0;
                  return heightPct > 0 ? (
                    <div
                      key={i}
                      className={`w-full rounded-sm transition-all ${color}`}
                      style={{ height: `${heightPct}%`, minHeight: val > 0 ? 4 : 0 }}
                    />
                  ) : null;
                })}
              </div>
              {/* Etiqueta del día */}
              <span className={`text-xs capitalize truncate w-full text-center leading-tight ${
                isHoy ? 'font-bold text-blue-600' : 'text-slate-400'
              }`}>
                {d.date}
              </span>
              {isHoy && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 -mt-1" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OcupacionLineWidget({ data }: { data: { date: string; pct: number }[] }) {
  if (!data.length) return <div className="flex items-center justify-center h-full text-xs text-slate-400">Sin datos</div>;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} domain={[0, 100]} unit="%" />
        <Tooltip formatter={(v: any) => [`${v}%`, 'Ocupación']} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} />
        <ReferenceLine y={80} stroke="#22c55e" strokeDasharray="4 4" label={{ value: 'Target 80%', position: 'right', fontSize: 10, fill: '#22c55e' }} />
        <Line type="monotone" dataKey="pct" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} name="Ocupación" />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Widget Card wrapper ──────────────────────────────────────────────────────

function WidgetCard({ widget, editMode, children, onRemove, onEdit }: {
  widget: DWidget; editMode: boolean; children: React.ReactNode;
  onRemove: () => void; onEdit: () => void;
}) {
  return (
    <div className={`bg-white rounded-xl border shadow-sm flex flex-col h-full overflow-hidden transition-all ${
      editMode ? 'border-blue-300 shadow-blue-100' : 'border-slate-200'
    }`}>
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
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

// ─── Add Widget Modal ─────────────────────────────────────────────────────────

function AddModal({ onAdd, onClose }: { onAdd: (w: DWidget) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">Agregar Widget</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {CATALOG.map(item => (
            <button key={item.type}
              onClick={() => {
                onAdd({ id: `d${Date.now()}`, type: item.type, title: item.label, color: '#3b82f6', layout: { x:0, y:999, w:4, h:3 } });
                onClose();
              }}
              className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-left transition-all group"
            >
              <div className="h-8 w-8 rounded-lg bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center flex-shrink-0 text-slate-500 group-hover:text-blue-600">
                {item.icon}
              </div>
              <p className="text-xs font-semibold text-slate-800 truncate">{item.label}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function EditModal({ widget, onSave, onClose }: { widget: DWidget; onSave: (w: DWidget) => void; onClose: () => void }) {
  const [title, setTitle] = useState(widget.title);
  const [color, setColor] = useState(widget.color);
  const COLORS = ['#3b82f6','#8b5cf6','#22c55e','#f59e0b','#ef4444','#06b6d4','#64748b','#ec4899'];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 z-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-900">Configurar Widget</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Título</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Color</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full transition-transform ${color===c?'scale-125 ring-2 ring-offset-1 ring-slate-400':'hover:scale-110'}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>
        </div>
        <button onClick={() => { onSave({ ...widget, title, color }); onClose(); }}
          className="mt-5 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
          Aplicar
        </button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const today = formatDate(new Date());
  const [mode, setMode] = useState<PeriodMode>('today');
  const [weekRef, setWeekRef] = useState(today);
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [editMode, setEditMode] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingWidget, setEditingWidget] = useState<DWidget | null>(null);
  const [widgets, setWidgets] = useState<DWidget[]>(DEFAULT_WIDGETS);
  const [mounted, setMounted] = useState(false);
  const [containerWidth, setContainerWidth] = useState(1200);

  const {
    from, to, appointments, utilization, disponibles,
    totalHours, usedHours, barData, techLoad, ocupacionLine, alertas,
  } = useDashboardData(mode, customFrom, customTo, weekRef);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setWidgets(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    if (mounted) localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  }, [widgets, mounted]);

  useEffect(() => {
    const el = document.getElementById('dashboard-grid');
    if (!el) return;
    const ro = new ResizeObserver(e => setContainerWidth(e[0].contentRect.width));
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [mounted]);

  function handleLayoutChange(layout: RGLLayout) {
    setWidgets(prev => prev.map(w => {
      const item = (layout as any[]).find((l: any) => l.i === w.id);
      if (!item) return w;
      return { ...w, layout: { x: item.x, y: item.y, w: item.w, h: item.h } };
    }));
  }

  function renderBody(w: DWidget) {
    switch (w.type) {
      case 'kpi_util':    return <KpiCard title={w.title} value={`${utilization}%`} sub={`Target 80% · ${totalHours.toFixed(0)}h disponibles`} color={w.color} icon={<Activity className="h-4 w-4" />} />;
      case 'kpi_turnos':  return <KpiCard title={w.title} value={appointments.filter(a=>a.status!=='cancelled').length} sub={`${from === to ? 'Hoy' : `${from} — ${to}`}`} color={w.color} icon={<Hash className="h-4 w-4" />} />;
      case 'kpi_techs':   return <KpiCard title={w.title} value={disponibles} sub="con al menos 1h libre hoy" color={w.color} icon={<Users className="h-4 w-4" />} />;
      case 'kpi_horas':   return <KpiCard title={w.title} value={`${usedHours.toFixed(0)}h`} sub={`de ${totalHours.toFixed(0)}h totales en el período`} color={w.color} icon={<Clock className="h-4 w-4" />} />;
      case 'bandas':      return <BandasWidget data={techLoad} />;
      case 'alertas':     return <AlertasWidget data={alertas} />;
      case 'turnos_list': return <TurnosListWidget appointments={[...appointments].filter(a=>a.status!=='cancelled').sort((a,b)=>b.date.localeCompare(a.date)||b.timeStart.localeCompare(a.timeStart))} />;
      case 'semana_bar':  return <SemanaBarWidget data={barData} />;
      case 'ocupacion_line': return <OcupacionLineWidget data={ocupacionLine} />;
      default: return null;
    }
  }

  const periodLabel = mode === 'today' ? 'Hoy' : mode === 'week' ? `Semana del ${format(parseISO(from + 'T12:00:00'), "d 'de' MMMM", { locale: es })}` : `${from} — ${to}`;
  const gridItems: RGLLayout = widgets.map(w => ({ i: w.id, ...w.layout, minW: 2, minH: 2 }));

  if (!mounted) return null;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Panel de Control</h1>
          <p className="text-xs text-slate-500 mt-0.5">{periodLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          {editMode && (
            <>
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors">
                <Plus className="h-3.5 w-3.5" /> Agregar widget
              </button>
              <button onClick={() => setWidgets(DEFAULT_WIDGETS)}
                className="text-xs text-slate-500 hover:text-slate-800 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors">
                Restablecer
              </button>
            </>
          )}
          <button onClick={() => setEditMode(e => !e)}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors ${
              editMode ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}>
            {editMode ? <><CheckCircle2 className="h-3.5 w-3.5" /> Listo</> : <><Settings2 className="h-3.5 w-3.5" /> Editar</>}
          </button>
        </div>
      </div>

      {/* Filtro de período */}
      <div className="bg-white border-b border-slate-100 px-6 py-2.5 flex items-center gap-3 flex-shrink-0 flex-wrap">
        {/* Selector de modo */}
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
          {(['today','week','custom'] as PeriodMode[]).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {m === 'today' && <><CalendarDays className="h-3.5 w-3.5" /> Hoy</>}
              {m === 'week'  && <><CalendarRange className="h-3.5 w-3.5" /> Semana</>}
              {m === 'custom'&& <><CalendarRange className="h-3.5 w-3.5" /> Personalizado</>}
            </button>
          ))}
        </div>

        {/* Selector de semana */}
        {mode === 'week' && (
          <div className="flex items-center gap-2">
            <button onClick={() => setWeekRef(formatDate(addDays(parseISO(weekRef), -7)))}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-500">
              ←
            </button>
            <span className="text-xs font-medium text-slate-700 whitespace-nowrap">
              {format(parseISO(from + 'T12:00:00'), "d MMM", { locale: es })} — {format(parseISO(to + 'T12:00:00'), "d MMM yyyy", { locale: es })}
            </span>
            <button onClick={() => setWeekRef(formatDate(addDays(parseISO(weekRef), 7)))}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-500">
              →
            </button>
          </div>
        )}

        {/* Selector de rango custom */}
        {mode === 'custom' && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">Desde</label>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
            <label className="text-xs text-slate-500">Hasta</label>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        <div id="dashboard-grid">
          {containerWidth > 0 && (
            <GridLayout
              layout={gridItems}
              width={containerWidth}
              onLayoutChange={handleLayoutChange}
              gridConfig={{ cols: COLS, rowHeight: ROW_HEIGHT, margin: [12, 12], containerPadding: [0, 0], maxRows: Infinity }}
              dragConfig={{ enabled: editMode, handle: '.drag-handle', bounded: false, threshold: 3 }}
              resizeConfig={{ enabled: editMode }}
            >
              {widgets.map(w => (
                <div key={w.id} className="drag-handle">
                  <WidgetCard widget={w} editMode={editMode}
                    onRemove={() => setWidgets(p => p.filter(x => x.id !== w.id))}
                    onEdit={() => setEditingWidget(w)}>
                    {renderBody(w)}
                  </WidgetCard>
                </div>
              ))}
            </GridLayout>
          )}
        </div>
      </div>

      {showAdd && <AddModal onAdd={w => setWidgets(p => [...p, w])} onClose={() => setShowAdd(false)} />}
      {editingWidget && (
        <EditModal widget={editingWidget}
          onSave={u => setWidgets(p => p.map(w => w.id === u.id ? u : w))}
          onClose={() => setEditingWidget(null)} />
      )}
    </div>
  );
}
