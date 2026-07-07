'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, ChevronDown, ChevronRight, Gauge, CheckCircle2, Clock, PauseCircle,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, Legend, ReferenceLine, Cell,
} from 'recharts';
import { useTrackingProductivity } from '@/hooks/use-tracking-productivity';
import type { TechProductivityRow } from '@/lib/api';

// Efficiency color thresholds shared with porteria compliance badges
function effColor(pct: number): string {
  if (pct >= 90) return '#22c55e';
  if (pct >= 60) return '#f59e0b';
  return '#ef4444';
}

const todayISO = () => new Date().toISOString().split('T')[0];

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

function monthStartISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

type Period = 'month' | '30d' | '90d' | 'custom';

const fmtH = (n: number) => `${n.toLocaleString('es-PY', { maximumFractionDigits: 1 })} h`;

export default function ProductividadPage() {
  const [period, setPeriod] = useState<Period>('month');
  const [customFrom, setCustomFrom] = useState(daysAgoISO(30));
  const [customTo, setCustomTo] = useState(todayISO());

  const { from, to } = useMemo(() => {
    switch (period) {
      case 'month': return { from: monthStartISO(), to: todayISO() };
      case '30d':   return { from: daysAgoISO(30), to: todayISO() };
      case '90d':   return { from: daysAgoISO(90), to: todayISO() };
      case 'custom': return { from: customFrom, to: customTo };
    }
  }, [period, customFrom, customTo]);

  const { data, isLoading, error } = useTrackingProductivity(from, to);

  const kpis = useMemo(() => {
    const techs = data?.technicians ?? [];
    const completed = techs.reduce((s, t) => s + t.completedProcesses, 0);
    const netHours = techs.reduce((s, t) => s + t.netHours, 0);
    const plannedHours = techs.reduce((s, t) => s + t.plannedHours, 0);
    const pausedMinutes = techs.reduce((s, t) => s + t.pausedMinutes, 0);
    const avgEfficiency = netHours > 0.001
      ? Math.min(200, Math.round((plannedHours / netHours) * 100))
      : 0;
    return { completed, netHours, pausedMinutes, avgEfficiency };
  }, [data]);

  return (
    <div className="flex flex-col h-full bg-slate-100 overflow-y-auto">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link
              href="/porteria"
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
              title="Volver a reportería"
            >
              <ArrowLeft className="h-4 w-4 text-slate-500" />
            </Link>
            <div className="h-10 w-10 rounded-xl bg-emerald-600 flex items-center justify-center shadow-sm">
              <Gauge className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Productividad de Técnicos</h1>
              <p className="text-xs text-slate-500">
                {data?.workshopName ?? ''} · {from} → {to}
              </p>
            </div>
          </div>

          {/* Period selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
              {([
                { key: 'month', label: 'Mes actual' },
                { key: '30d',   label: '30 días' },
                { key: '90d',   label: '90 días' },
                { key: 'custom', label: 'Personalizado' },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setPeriod(key)}
                  className={`text-xs px-2.5 py-1.5 rounded-md font-medium transition-all ${
                    period === key ? 'bg-white shadow-sm text-emerald-700' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {period === 'custom' && (
              <div className="flex items-center gap-1.5">
                <input
                  type="date" value={customFrom} max={customTo}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
                />
                <span className="text-xs text-slate-400">→</span>
                <input
                  type="date" value={customTo} min={customFrom} max={todayISO()}
                  onChange={e => setCustomTo(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            No se pudo cargar el reporte de productividad
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-20 text-sm text-slate-400">
            Cargando reporte…
          </div>
        )}

        {!isLoading && data && data.technicians.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl px-6 py-16 text-center">
            <p className="text-sm font-semibold text-slate-500">Sin datos para el período</p>
            <p className="text-xs text-slate-400 mt-1">
              No hay procesos completados con técnico asignado entre {from} y {to}
            </p>
          </div>
        )}

        {!isLoading && data && data.technicians.length > 0 && (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard title="Procesos Completados" value={String(kpis.completed)} sub="en el período" icon={<CheckCircle2 className="h-4 w-4" />} color="#22c55e" />
              <KpiCard title="Eficiencia Promedio" value={`${kpis.avgEfficiency}%`} sub="plan / horas netas (ponderada)" icon={<Gauge className="h-4 w-4" />} color={effColor(kpis.avgEfficiency)} />
              <KpiCard title="Horas Netas" value={fmtH(kpis.netHours)} sub="trabajadas sin pausas" icon={<Clock className="h-4 w-4" />} color="#3b82f6" />
              <KpiCard title="Pausas" value={`${Math.round(kpis.pausedMinutes)} min`} sub="tiempo bloqueado total" icon={<PauseCircle className="h-4 w-4" />} color="#f59e0b" />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <h2 className="text-sm font-bold text-slate-700 mb-3">Ranking de eficiencia</h2>
                <RankingChart rows={data.technicians} />
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <h2 className="text-sm font-bold text-slate-700 mb-3">Eficiencia mensual (últimos 6 meses)</h2>
                <TrendChart trend={data.trend} technicians={data.technicians} />
              </div>
            </div>

            {/* Detail table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <TechTable rows={data.technicians} />
            </div>

            {/* Data quality note */}
            {data.dataQuality.unattributedCompletedCount > 0 && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-4 py-2.5">
                Nota: {data.dataQuality.unattributedCompletedCount} proceso(s) completados en el
                período no tienen técnico atribuido y fueron excluidos del reporte.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function KpiCard({ title, value, sub, icon, color }: {
  title: string; value: string; sub: string; icon: React.ReactNode; color: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-5 py-4">
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: color + '20', color }}>
          {icon}
        </div>
        <p className="text-xs font-semibold text-slate-500 leading-tight">{title}</p>
      </div>
      <p className="text-4xl font-black tabular-nums leading-none tracking-tight mt-3" style={{ color }}>{value}</p>
      <p className="text-xs text-slate-400 mt-1.5">{sub}</p>
    </div>
  );
}

function RankingChart({ rows }: { rows: TechProductivityRow[] }) {
  const chartData = rows.map(t => ({ name: t.technicianName || t.technicianId, eff: t.efficiencyPct }));
  const height = Math.max(180, chartData.length * 42);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" unit="%" domain={[0, 200]} tick={{ fontSize: 10 }} />
        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Tooltip formatter={(v: any) => [`${v}% (>100% = más rápido que lo planificado)`, 'Eficiencia']} />
        <ReferenceLine x={100} stroke="#94a3b8" strokeDasharray="4 4" />
        <Bar dataKey="eff" radius={[0, 4, 4, 0]} barSize={20}>
          {chartData.map((d, i) => <Cell key={i} fill={effColor(d.eff)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const TREND_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899'];

function TrendChart({ trend, technicians }: {
  trend: { technicianId: string; technicianName: string; month: string; efficiencyPct: number }[];
  technicians: TechProductivityRow[];
}) {
  // Top-5 technicians by efficiency in the selected period
  const topIds = technicians.slice(0, 5).map(t => t.technicianId);
  const months = Array.from(new Set(trend.map(r => r.month))).sort();

  const chartData = months.map(month => {
    const row: Record<string, string | number | null> = { month };
    for (const id of topIds) {
      const r = trend.find(t => t.technicianId === id && t.month === month);
      row[id] = r ? r.efficiencyPct : null;
    }
    return row;
  });

  if (months.length === 0) {
    return <div className="flex items-center justify-center h-44 text-xs text-slate-400">Sin datos para el período</div>;
  }

  const nameOf = (id: string) =>
    technicians.find(t => t.technicianId === id)?.technicianName || id;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={chartData} margin={{ left: 0, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
        <YAxis unit="%" domain={[0, 200]} tick={{ fontSize: 10 }} />
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Tooltip formatter={(v: any, key: any) => [`${v}%`, nameOf(String(key))]} />
        <Legend formatter={(id: string) => <span style={{ fontSize: 10, color: '#64748b' }}>{nameOf(id)}</span>} />
        <ReferenceLine y={100} stroke="#94a3b8" strokeDasharray="4 4" />
        {topIds.map((id, i) => (
          <Line key={id} type="monotone" dataKey={id} stroke={TREND_COLORS[i % TREND_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function EffBadge({ pct }: { pct: number }) {
  if (pct === 0) return <span className="text-xs text-slate-400">—</span>;
  const color = effColor(pct);
  return (
    <span
      className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: color + '20', color }}
    >
      {pct}%
    </span>
  );
}

function TechTable({ rows }: { rows: TechProductivityRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const num = (n: number) => n.toLocaleString('es-PY', { maximumFractionDigits: 1 });

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
          <th className="px-3 py-2.5 text-left font-semibold w-8"></th>
          <th className="px-3 py-2.5 text-left font-semibold">#</th>
          <th className="px-3 py-2.5 text-left font-semibold">Técnico</th>
          <th className="px-3 py-2.5 text-right font-semibold">Procesos</th>
          <th className="px-3 py-2.5 text-right font-semibold">H. Plan.</th>
          <th className="px-3 py-2.5 text-right font-semibold">H. Real</th>
          <th className="px-3 py-2.5 text-right font-semibold">H. Netas</th>
          <th className="px-3 py-2.5 text-right font-semibold">Pausa (min)</th>
          <th className="px-3 py-2.5 text-right font-semibold">Desviación</th>
          <th className="px-3 py-2.5 text-right font-semibold">Eficiencia</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(t => (
          <TechRowGroup
            key={t.technicianId}
            tech={t}
            expanded={expanded.has(t.technicianId)}
            onToggle={() => toggle(t.technicianId)}
            num={num}
          />
        ))}
      </tbody>
    </table>
  );
}

function TechRowGroup({ tech, expanded, onToggle, num }: {
  tech: TechProductivityRow;
  expanded: boolean;
  onToggle: () => void;
  num: (n: number) => string;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
      >
        <td className="px-3 py-2.5 text-slate-400">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </td>
        <td className="px-3 py-2.5 font-bold text-slate-400">{tech.rankByEfficiency}</td>
        <td className="px-3 py-2.5 font-semibold text-slate-800">{tech.technicianName || tech.technicianId}</td>
        <td className="px-3 py-2.5 text-right tabular-nums">{tech.completedProcesses}</td>
        <td className="px-3 py-2.5 text-right tabular-nums">{num(tech.plannedHours)}</td>
        <td className="px-3 py-2.5 text-right tabular-nums">{num(tech.realHours)}</td>
        <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{num(tech.netHours)}</td>
        <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{num(tech.pausedMinutes)}</td>
        <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${tech.deviation > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
          {tech.deviation > 0 ? '+' : ''}{num(tech.deviation)}
        </td>
        <td className="px-3 py-2.5 text-right"><EffBadge pct={tech.efficiencyPct} /></td>
      </tr>
      {expanded && tech.processes.map(p => (
        <tr key={p.processCode} className="border-b border-slate-50 bg-slate-50/60 text-slate-600">
          <td className="px-3 py-2"></td>
          <td className="px-3 py-2"></td>
          <td className="px-3 py-2 pl-8 text-slate-500">{p.processName}</td>
          <td className="px-3 py-2 text-right tabular-nums">{p.completedCount}</td>
          <td className="px-3 py-2 text-right tabular-nums">{num(p.plannedHours)}</td>
          <td className="px-3 py-2 text-right tabular-nums">{num(p.realHours)}</td>
          <td className="px-3 py-2 text-right tabular-nums">{num(p.netHours)}</td>
          <td className="px-3 py-2 text-right tabular-nums text-slate-400">—</td>
          <td className={`px-3 py-2 text-right tabular-nums ${p.deviation > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
            {p.deviation > 0 ? '+' : ''}{num(p.deviation)}
          </td>
          <td className="px-3 py-2 text-right"><EffBadge pct={p.efficiencyPct} /></td>
        </tr>
      ))}
    </>
  );
}
