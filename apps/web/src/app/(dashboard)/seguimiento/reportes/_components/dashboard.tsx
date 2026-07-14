'use client';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, LabelList,
  PieChart, Pie, Legend,
  LineChart, Line,
  AreaChart, Area,
  Treemap,
} from 'recharts';
import {
  TrendingUp, AlertTriangle, Wallet, Building2, Users, Activity,
  Clock, AlertOctagon, Snowflake, Zap, Filter, RefreshCw, Printer, Flame,
  X, Search, ChevronRight, CheckCircle2, Calendar,
} from 'lucide-react';
import type { DashboardPayload } from '@/app/api/ot-seguimiento/reportes/dashboard/route';
import type { KpiKind, DetailPayload } from '@/app/api/ot-seguimiento/reportes/dashboard/detail/route';
import { tipoServicioOption } from '@/lib/tipos-servicio';

const fmtMoney   = (n: number) => `₲ ${n.toLocaleString('es-PY')}`;
const fmtMoneyM  = (n: number) => n >= 1_000_000 ? `₲ ${(n / 1_000_000).toFixed(1)}M` : fmtMoney(n);
const fmtNumber  = (n: number) => n.toLocaleString('es-PY');
const fmtMonth   = (ym: string) => {
  const [y, m] = ym.split('-');
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${meses[Number(m) - 1] ?? m} ${y.slice(2)}`;
};

const COLORS = {
  estado: ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#0284c7'],
  bucket: {
    'Reciente · 0-7 d':       '#10b981',
    'Normal · 8-14 d':        '#3b82f6',
    'Demora · 15-30 d':       '#f59e0b',
    'Atraso alto · 31-60 d':  '#f97316',
    'Atraso crítico · 61-90 d':'#dc2626',
    'Congelada · +90 d':      '#7c2d12',
  } as Record<string, string>,
  bucketIcon: {
    'Reciente · 0-7 d':       Activity,
    'Normal · 8-14 d':        Clock,
    'Demora · 15-30 d':       AlertTriangle,
    'Atraso alto · 31-60 d':  Flame,
    'Atraso crítico · 61-90 d':AlertOctagon,
    'Congelada · +90 d':      Snowflake,
  } as Record<string, React.ComponentType<any>>,
  tipo: ['#4f46e5', '#10b981', '#f59e0b', '#06b6d4', '#ec4899', '#8b5cf6', '#84cc16', '#f97316', '#0ea5e9'],
};

const PERIODOS = [
  { value: 30,  label: '30 d' },
  { value: 90,  label: '90 d' },
  { value: 180, label: '6 m' },
  { value: 365, label: '1 año' },
  { value: 720, label: '2 años' },
];

interface Props {
  sucursalesDisponibles: string[];
  generatedAt: string;
}

export default function DashboardEjecutivo({ sucursalesDisponibles, generatedAt: initialGeneratedAt }: Props) {
  const [data, setData]         = useState<DashboardPayload | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [days, setDays]         = useState<number>(365);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo]     = useState<string>('');
  // today se computa en el cliente para evitar hydration mismatch en atributos max de inputs
  const [today, setToday]       = useState<string>('');
  useEffect(() => { setToday(new Date().toISOString().split('T')[0]); }, []);
  const [rangoActivo, setRangoActivo] = useState(false);
  const [sucursal, setSucursal] = useState<string>('');
  const [tipo, setTipo]         = useState<string>('');
  const [openKpi, setOpenKpi]               = useState<KpiKind | null>(null);
  const [openBucket, setOpenBucket]         = useState<string | null>(null);
  const [openDrillSucursal, setOpenDrillSucursal] = useState<string | null>(null);
  const [openDrillEstado,   setOpenDrillEstado]   = useState<string | null>(null);

  const useCustomRange = rangoActivo && !!dateFrom && !!dateTo && dateFrom <= dateTo;

  async function fetchData(force = false) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (useCustomRange) {
        params.set('dateFrom', dateFrom);
        params.set('dateTo', dateTo);
      } else {
        params.set('days', String(days));
      }
      if (sucursal) params.set('sucursal', sucursal);
      if (tipo)     params.set('tipo', tipo);
      if (force)    params.set('force', '1');
      const res = await fetch(`/api/ot-seguimiento/reportes/dashboard?${params}`);
      if (!res.ok) throw new Error('Error al cargar el dashboard');
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [days, dateFrom, dateTo, sucursal, tipo, rangoActivo]);

  // Tipos disponibles ordenados por nombre legible (no por código)
  const tiposDisponibles = useMemo(() => {
    const codes = data?.porTipo.map(t => t.tipo).filter(Boolean) ?? [];
    return codes
      .map(code => ({ code, label: tipoServicioOption(code) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }, [data]);
  const filtrosActivos = !!(sucursal || tipo || useCustomRange);

  return (
    <div className="px-6 py-6 space-y-5 max-w-[1600px] mx-auto">
      {/* ── Filtros globales ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 print:hidden">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <Filter className="h-3.5 w-3.5 text-indigo-600" /> Filtros globales:
          </div>

          <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
            {PERIODOS.map(p => (
              <button
                key={p.value}
                onClick={() => { setRangoActivo(false); setDays(p.value); }}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all ${
                  !rangoActivo && days === p.value ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => setRangoActivo(r => !r)}
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-md font-medium transition-all ${
                rangoActivo ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700'
              }`}
              title="Rango de fechas personalizado"
            >
              <Calendar className="h-3 w-3" /> Rango
            </button>
          </div>

          {/* Inputs de rango — visibles solo cuando Rango está activo */}
          {rangoActivo && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <Calendar className="h-3.5 w-3.5 text-indigo-500" /> Desde
              </div>
              <input
                type="date"
                value={dateFrom}
                max={dateTo || today}
                onChange={e => setDateFrom(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <span className="text-xs text-slate-400">→</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom}
                max={today}
                onChange={e => setDateTo(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              {useCustomRange && (
                <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                  {dateFrom} → {dateTo}
                </span>
              )}
              {dateFrom && dateTo && dateFrom > dateTo && (
                <span className="text-[11px] text-red-500">La fecha inicial debe ser anterior a la final</span>
              )}
            </div>
          )}

          <select
            value={sucursal}
            onChange={e => setSucursal(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 max-w-[220px]"
          >
            <option value="">Todas las sucursales</option>
            {sucursalesDisponibles.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select
            value={tipo}
            onChange={e => setTipo(e.target.value)}
            disabled={!data}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 max-w-[260px]"
            title="Filtrar por tipo de servicio"
          >
            <option value="">Todos los tipos de servicio</option>
            {tiposDisponibles.map(t => (
              <option key={t.code} value={t.code}>{t.label}</option>
            ))}
          </select>

          {filtrosActivos && (
            <button
              onClick={() => { setSucursal(''); setTipo(''); setDateFrom(''); setDateTo(''); setRangoActivo(false); }}
              className="text-[11px] font-semibold text-red-500 hover:text-red-700"
            >
              Limpiar filtros
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => fetchData(true)}
              disabled={loading}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
              title="Refrescar"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => window.print()}
              disabled={!data || loading}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Printer className="h-3.5 w-3.5" /> PDF
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-700">{error}</div>
      ) : loading && !data ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 flex items-center justify-center gap-3 text-slate-400">
          <div className="h-5 w-5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
          <span className="text-sm">Generando dashboard desde el DMS...</span>
        </div>
      ) : data ? (
        <>
          {/* ── KPIs ejecutivos (clickeables → detalle) ── */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <BigKpi tone="indigo"  icon={<Activity      className="h-4 w-4" />} label="OTs abiertas"      value={fmtNumber(data.kpi.totalAbiertas)} hint="Sin contar facturadas" onClick={() => setOpenKpi('abiertas')} />
            <BigKpi tone="red"     icon={<AlertTriangle className="h-4 w-4" />} label="Compromisos vencidos" value={fmtNumber(data.kpi.vencidas)}     hint={data.kpi.totalAbiertas ? `${((data.kpi.vencidas / data.kpi.totalAbiertas) * 100).toFixed(1)}% del total` : undefined} onClick={() => setOpenKpi('vencidas')} />
            <BigKpi tone="orange"  icon={<Flame         className="h-4 w-4" />} label="Atraso crítico (+30 d)" value={fmtNumber(data.kpi.atrasoCritico)} onClick={() => setOpenKpi('atrasoCritico')} />
            <BigKpi tone="amber"   icon={<Clock         className="h-4 w-4" />} label="Días promedio en taller" value={`${data.kpi.diasPromedio} d`} onClick={() => setOpenKpi('diasPromedio')} />
            <BigKpi tone="emerald" icon={<TrendingUp    className="h-4 w-4" />} label="Tasa de cierre 30 d"  value={`${data.kpi.tasaCierre30d}%`} onClick={() => setOpenKpi('tasaCierre30d')} />
            <BigKpi tone="blue"    icon={<Wallet        className="h-4 w-4" />} label="Monto en taller"      value={fmtMoneyM(data.kpi.montoTotal)} hint={fmtMoney(data.kpi.montoTotal)} onClick={() => setOpenKpi('montoTotal')} />
          </div>

          {/* ── Widget independiente: OTs facturadas pendientes de cierre operativo ── */}
          {data.kpi.facturadasPendientes > 0 && (
            <div className="bg-emerald-50 rounded-xl border-2 border-emerald-200 overflow-hidden">
              <button
                type="button"
                className="w-full text-left px-5 py-3 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-200 flex items-center justify-between flex-wrap gap-2 hover:bg-emerald-100/60 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-inset"
                onClick={() => setOpenKpi('facturadas')}
                title="Click para ver todas las OTs facturadas"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <h3 className="text-sm font-bold text-emerald-900">OTs facturadas · cliente OK · cierre operativo pendiente</h3>
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                    {fmtNumber(data.kpi.facturadasPendientes)} OTs
                  </span>
                  <span className="text-emerald-600 font-semibold">{fmtMoneyM(data.kpi.facturadasMonto)}</span>
                  <span className="text-slate-500 hidden sm:inline">
                    El cliente pagó · solo falta cerrar la OT en el sistema
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" aria-hidden />
                </div>
              </button>
              {data.facturadasTop && data.facturadasTop.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-emerald-50/60">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-semibold text-emerald-800">OT</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-emerald-800">Cliente</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-emerald-800">Modelo</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-emerald-800">Sucursal</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-emerald-800">Estado</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-emerald-800">Tipo</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-emerald-800">Ingreso</th>
                        <th className="text-right px-4 py-2.5 font-semibold text-emerald-800">Días taller</th>
                        <th className="text-right px-4 py-2.5 font-semibold text-emerald-800">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.facturadasTop.map((r, i) => (
                        <tr key={r.ot} className={i % 2 === 0 ? 'bg-white' : 'bg-emerald-50/30'}>
                          <td className="px-4 py-2 font-bold text-slate-900 whitespace-nowrap">{r.ot}</td>
                          <td className="px-4 py-2 text-slate-700 max-w-[180px] truncate" title={r.cliente}>{r.cliente || '—'}</td>
                          <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{r.modelo || '—'}</td>
                          <td className="px-4 py-2 text-slate-500 text-[11px] whitespace-nowrap">{r.sucursal || '—'}</td>
                          <td className="px-4 py-2 text-slate-600 whitespace-nowrap text-[11px]">{r.estadoOt || '—'}</td>
                          <td className="px-4 py-2 text-slate-500 text-[11px] whitespace-nowrap">{r.tipoServicio || '—'}</td>
                          <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                            {r.fechaIngreso || '—'}
                            {r.fechaIngreso && (
                              r.horaIngreso
                                ? <span className="ml-1.5 text-[10px] font-mono text-slate-400">{r.horaIngreso}</span>
                                : <span className="ml-1.5 text-[10px] text-slate-300 italic">sin hora</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            <span className="font-semibold text-emerald-700">{r.diasIngreso}d</span>
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-slate-700 whitespace-nowrap">{fmtMoney(r.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Modal de detalle del KPI */}
          {openKpi && (
            <KpiDetailModal
              kpi={openKpi}
              bucket={openBucket}
              days={days}
              sucursal={sucursal}
              tipo={tipo}
              drillSucursal={openDrillSucursal}
              estadoDrill={openDrillEstado}
              onClose={() => { setOpenKpi(null); setOpenBucket(null); setOpenDrillSucursal(null); setOpenDrillEstado(null); }}
            />
          )}

          {/* ── Antigüedad bucketizada (cards de calor, clickeables) ── */}
          <Card title="Antigüedad de OTs abiertas" subtitle="Click en cualquier rango para ver el detalle de las OTs que lo componen">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {(['Reciente · 0-7 d', 'Normal · 8-14 d', 'Demora · 15-30 d', 'Atraso alto · 31-60 d', 'Atraso crítico · 61-90 d', 'Congelada · +90 d'] as const).map(bucket => {
                const item  = data.antiguedad.find(a => a.bucket === bucket);
                const total = item?.total ?? 0;
                const monto = item?.monto ?? 0;
                const Icon  = COLORS.bucketIcon[bucket];
                const color = COLORS.bucket[bucket];
                const disabled = total === 0;
                return (
                  <button
                    key={bucket}
                    type="button"
                    disabled={disabled}
                    onClick={() => { setOpenBucket(bucket); setOpenKpi('antiguedad'); }}
                    title={disabled ? 'Sin OTs en este rango' : `Ver las ${total} OTs del bucket "${bucket}"`}
                    className={`text-left rounded-xl border-2 px-3 py-2.5 transition-all w-full
                      ${disabled
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:shadow-md hover:-translate-y-0.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1'}`}
                    style={{ background: `${color}10`, borderColor: `${color}40` }}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color }} />
                        <span className="text-[10px] font-bold uppercase tracking-wider truncate" style={{ color }}>
                          {bucket.split(' · ')[0]}
                        </span>
                      </div>
                      {!disabled && <ChevronRight className="h-3 w-3 text-slate-300 flex-shrink-0" aria-hidden />}
                    </div>
                    <p className="text-[10px] text-slate-500">{bucket.split(' · ')[1]}</p>
                    <p className="text-2xl font-bold mt-1" style={{ color }}>{fmtNumber(total)}</p>
                    <p className="text-[10px] text-slate-400 truncate">{fmtMoneyM(monto)}</p>
                  </button>
                );
              })}
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* ── Por estado (excluyendo Finalizado para enfocarse en lo activo) ── */}
            <Card title="OTs por estado" subtitle="Solo estados activos · click en barra para ver detalle" className="lg:col-span-2">
              {(() => {
                const estadosActivos = data.porEstado.filter(e => e.estado.toLowerCase() !== 'finalizado');
                return (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={estadosActivos} margin={{ top: 10, right: 20, left: 0, bottom: 70 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="estado" stroke="#64748b" style={{ fontSize: 10 }} angle={-30} textAnchor="end" height={70} interval={0} />
                      <YAxis stroke="#64748b" style={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} cursor={{ fill: '#e0e7ff', opacity: 0.6 }} />
                      <Bar
                        dataKey="total"
                        name="Total"
                        radius={[4, 4, 0, 0]}
                        cursor="pointer"
                        onClick={(d: any) => { setOpenDrillEstado(d.estado); setOpenKpi('abiertas'); }}
                      >
                        {estadosActivos.map((_, i) => (
                          <Cell key={i} fill={COLORS.estado[i % COLORS.estado.length]} />
                        ))}
                        <LabelList dataKey="total" position="top" style={{ fill: '#475569', fontSize: 10, fontWeight: 600 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                );
              })()}
            </Card>

            {/* ── Por tipo de servicio (donut) ── */}
            <Card title="Por tipo de servicio" subtitle="% de OTs por código">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={data.porTipo.slice(0, 8)}
                    dataKey="total"
                    nameKey="tipo"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={95}
                    paddingAngle={2}
                  >
                    {data.porTipo.slice(0, 8).map((_, i) => (
                      <Cell key={i} fill={COLORS.tipo[i % COLORS.tipo.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                    formatter={(v: any) => fmtNumber(Number(v))}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* ── Tendencia mensual ── */}
            <Card title="Tendencia mensual" subtitle="Ingresos vs cierres en los últimos 12 meses">
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={data.tendencia} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                  <defs>
                    <linearGradient id="grad-ing" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#4f46e5" stopOpacity={0.5}/>
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="grad-fin" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#10b981" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="mes" stroke="#64748b" style={{ fontSize: 10 }} tickFormatter={fmtMonth} />
                  <YAxis stroke="#64748b" style={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} labelFormatter={(label: any) => fmtMonth(String(label))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                  <Area type="monotone" dataKey="ingresos"    stroke="#4f46e5" strokeWidth={2} fill="url(#grad-ing)" name="Ingresos" />
                  <Area type="monotone" dataKey="finalizadas" stroke="#10b981" strokeWidth={2} fill="url(#grad-fin)" name="Finalizadas" />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            {/* ── Sucursales (stacked) ── */}
            <Card title="Carga por sucursal" subtitle="Abiertas · Vencidas · Atraso crítico · click en barra para ver OTs">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={data.porSucursal}
                  layout="vertical"
                  margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                  onClick={(state: any) => {
                    const suc = state?.activePayload?.[0]?.payload?.sucursal;
                    if (suc) { setOpenDrillSucursal(suc); setOpenKpi('abiertas'); }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" stroke="#64748b" style={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="sucursal" stroke="#64748b" style={{ fontSize: 10 }} width={150} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} cursor={{ fill: '#e0e7ff', opacity: 0.4 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                  <Bar dataKey="abiertas"   stackId="a" fill="#4f46e5" name="Abiertas" />
                  <Bar dataKey="vencidas"   stackId="a" fill="#ef4444" name="Vencidas" />
                  <Bar dataKey="criticas"   stackId="a" fill="#f97316" name="+30 d" />
                  <Bar dataKey="facturadas" stackId="a" fill="#10b981" name="Facturadas" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* ── Operativo: Días promedio en taller por tipo de servicio ── */}
            <Card title="Días promedio en taller por tipo" subtitle="Cuáles trabajos se atascan más · barra más larga = más demora">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={[...data.porTipo]
                    .filter(t => t.avgDaysOpen > 0)
                    .sort((a, b) => b.avgDaysOpen - a.avgDaysOpen)
                    .slice(0, 10)}
                  layout="vertical"
                  margin={{ top: 10, right: 50, left: 10, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" stroke="#64748b" style={{ fontSize: 10 }} unit="d" />
                  <YAxis type="category" dataKey="tipo" stroke="#64748b" style={{ fontSize: 11 }} width={90} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                    formatter={(v: any) => [`${Number(v)} días`, 'Promedio en taller']}
                  />
                  <Bar dataKey="avgDaysOpen" radius={[0, 4, 4, 0]}>
                    {[...data.porTipo].filter(t => t.avgDaysOpen > 0).sort((a, b) => b.avgDaysOpen - a.avgDaysOpen).slice(0, 10).map((t, i) => (
                      <Cell
                        key={i}
                        fill={t.avgDaysOpen > 30 ? '#dc2626' : t.avgDaysOpen > 14 ? '#f59e0b' : '#10b981'}
                      />
                    ))}
                    <LabelList dataKey="avgDaysOpen" position="right" formatter={(v: any) => `${v}d`} style={{ fill: '#475569', fontSize: 10, fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* ── Top asesores ── */}
            <Card title="Top 10 asesores" subtitle={`Total OTs en el período · ${data.filters.days} días`}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.topAsesores} margin={{ top: 10, right: 20, left: 0, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="asesor" stroke="#64748b" style={{ fontSize: 10 }} />
                  <YAxis stroke="#64748b" style={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                    formatter={(v: any) => fmtNumber(Number(v))}
                  />
                  <Bar dataKey="finalizadas" stackId="a" fill="#10b981" name="Finalizadas" />
                  <Bar dataKey="total"       stackId="a" fill="#cbd5e1" name="Pendientes" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* ── Tabla crítica de OTs vencidas ── */}
          {data.vencidasTop.length > 0 && (
            <div className="bg-white rounded-xl border-2 border-red-200 overflow-hidden">
              <div className="px-5 py-3 bg-gradient-to-r from-red-50 to-orange-50 border-b border-red-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertOctagon className="h-4 w-4 text-red-600" />
                  <h3 className="text-sm font-bold text-red-900">OTs con compromiso vencido — acción urgente</h3>
                </div>
                <span className="text-[11px] font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                  Top {data.vencidasTop.length} con más retraso
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-semibold text-slate-600">OT</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Cliente</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Modelo</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Sucursal</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Estado</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Tipo</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Compromiso</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-slate-600">Días retraso</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-slate-600">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.vencidasTop.map((r, i) => (
                      <tr key={r.ot} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                        <td className="px-4 py-2 font-bold text-slate-900 whitespace-nowrap">{r.ot}</td>
                        <td className="px-4 py-2 text-slate-700 max-w-[180px] truncate" title={r.cliente}>{r.cliente}</td>
                        <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{r.modelo}</td>
                        <td className="px-4 py-2 text-slate-500 text-[11px] whitespace-nowrap">{r.sucursal}</td>
                        <td className="px-4 py-2 text-slate-600 whitespace-nowrap text-[11px]">{r.estadoOt}</td>
                        <td className="px-4 py-2 text-slate-500 text-[11px] whitespace-nowrap">{r.tipoServicio || '—'}</td>
                        <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{r.fechaCompromiso}</td>
                        <td className="px-4 py-2 text-right">
                          <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded ${
                            r.diasRetraso > 60 ? 'bg-red-100 text-red-800'
                            : r.diasRetraso > 30 ? 'bg-orange-100 text-orange-800'
                            : 'bg-amber-100 text-amber-800'
                          }`}>
                            <Zap className="h-3 w-3" />
                            {r.diasRetraso} d
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-700 whitespace-nowrap">{fmtMoney(r.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Tabla final: OTs MÁS CRÍTICAS combinadas (vencidas + atraso crítico) ── */}
          {data.criticasTop && data.criticasTop.length > 0 && (
            <div className="bg-white rounded-xl border-2 border-orange-200 overflow-hidden">
              <div className="px-5 py-3 bg-gradient-to-r from-orange-50 via-red-50 to-orange-50 border-b border-orange-200 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Flame className="h-4 w-4 text-orange-600" />
                  <h3 className="text-sm font-bold text-orange-900">OTs más críticas — priorizá acción aquí</h3>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="font-semibold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">
                    Top {data.criticasTop.length}
                  </span>
                  <span className="text-slate-500">
                    Criterio: <strong>compromiso vencido</strong> o <strong>+30 días en taller</strong>, ordenadas por criticidad
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-semibold text-slate-600 whitespace-nowrap">#</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-slate-600 whitespace-nowrap">OT</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Cliente</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Modelo</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Sucursal</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Estado</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Tipo</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-slate-600 whitespace-nowrap">Razón</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-slate-600 whitespace-nowrap">En taller</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-slate-600 whitespace-nowrap">Retraso</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-slate-600 whitespace-nowrap">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.criticasTop.map((r, i) => {
                      const razonClass =
                        r.razon === 'Vencido + atraso crítico' ? 'bg-red-100 text-red-800 border-red-200' :
                        r.razon === 'Compromiso vencido'       ? 'bg-amber-100 text-amber-800 border-amber-200' :
                        r.razon === 'Congelada (+90 d)'        ? 'bg-slate-200 text-slate-800 border-slate-300' :
                        r.razon === 'Atraso crítico (61-90 d)' ? 'bg-red-50 text-red-700 border-red-200' :
                                                                  'bg-orange-50 text-orange-700 border-orange-200';
                      return (
                        <tr key={r.ot} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                          <td className="px-4 py-2 text-slate-400 tabular-nums whitespace-nowrap">{i + 1}</td>
                          <td className="px-4 py-2 font-bold text-slate-900 whitespace-nowrap">{r.ot}</td>
                          <td className="px-4 py-2 text-slate-700 max-w-[180px] truncate" title={r.cliente}>{r.cliente || '—'}</td>
                          <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{r.modelo || '—'}</td>
                          <td className="px-4 py-2 text-slate-500 text-[11px] whitespace-nowrap">{r.sucursal || '—'}</td>
                          <td className="px-4 py-2 text-slate-600 whitespace-nowrap text-[11px]">{r.estadoOt}</td>
                          <td className="px-4 py-2 text-slate-500 text-[11px] whitespace-nowrap">{r.tipoServicio || '—'}</td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded border ${razonClass}`}>
                              {r.razon}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            <span className={`font-semibold ${r.diasIngreso > 60 ? 'text-red-700' : r.diasIngreso > 30 ? 'text-orange-700' : 'text-slate-600'}`}>
                              {r.diasIngreso}d
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {r.diasRetraso > 0
                              ? <span className={`inline-flex items-center gap-1 font-bold px-1.5 py-0.5 rounded ${r.diasRetraso > 60 ? 'bg-red-100 text-red-800' : r.diasRetraso > 30 ? 'bg-orange-100 text-orange-800' : 'bg-amber-100 text-amber-800'}`}>
                                  <Zap className="h-3 w-3" />{r.diasRetraso}d
                                </span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-slate-700 whitespace-nowrap">{fmtMoney(r.monto)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="text-[10px] text-slate-400 text-right pt-2">
            Generado el {new Date(data.generatedAt).toLocaleString('es-PY')} · datos vivos del DMS Condor
          </p>
        </>
      ) : null}
    </div>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function BigKpi({
  icon, label, value, hint, tone, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone: 'indigo' | 'red' | 'orange' | 'amber' | 'emerald' | 'blue';
  onClick?: () => void;
}) {
  const toneClasses = {
    indigo:  { bg: 'from-indigo-500/10 to-indigo-500/0',   border: 'border-indigo-200',   icon: 'bg-indigo-100 text-indigo-700',  text: 'text-indigo-700' },
    red:     { bg: 'from-red-500/10 to-red-500/0',         border: 'border-red-200',      icon: 'bg-red-100 text-red-700',        text: 'text-red-700' },
    orange:  { bg: 'from-orange-500/10 to-orange-500/0',   border: 'border-orange-200',   icon: 'bg-orange-100 text-orange-700',  text: 'text-orange-700' },
    amber:   { bg: 'from-amber-500/10 to-amber-500/0',     border: 'border-amber-200',    icon: 'bg-amber-100 text-amber-700',    text: 'text-amber-700' },
    emerald: { bg: 'from-emerald-500/10 to-emerald-500/0', border: 'border-emerald-200',  icon: 'bg-emerald-100 text-emerald-700',text: 'text-emerald-700' },
    blue:    { bg: 'from-blue-500/10 to-blue-500/0',       border: 'border-blue-200',     icon: 'bg-blue-100 text-blue-700',      text: 'text-blue-700' },
  } as const;
  const c = toneClasses[tone];
  const interactive = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      title={interactive ? 'Click para ver el detalle' : undefined}
      className={`text-left bg-gradient-to-br ${c.bg} bg-white rounded-xl border ${c.border} px-3 py-3 transition-all w-full
        ${interactive ? 'hover:shadow-md hover:border-slate-400 hover:-translate-y-0.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-300' : 'cursor-default'}`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${c.icon}`}>
            {icon}
          </div>
          <p className={`text-[10px] uppercase tracking-wider font-bold ${c.text} truncate`}>{label}</p>
        </div>
        {interactive && <ChevronRight className="h-3.5 w-3.5 text-slate-300 flex-shrink-0" aria-hidden />}
      </div>
      <p className="text-2xl font-bold text-slate-900 tabular-nums truncate" title={value}>{value}</p>
      {hint && <p className="text-[10px] text-slate-500 mt-0.5 truncate">{hint}</p>}
    </button>
  );
}

function Card({ title, subtitle, children, className = '' }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-5 ${className}`}>
      <div className="mb-3">
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        {subtitle && <p className="text-[11px] text-slate-400">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ─── Modal de detalle por KPI ─────────────────────────────────────────────────
// Se abre al hacer click en cualquier KPI. Renderiza tabla con todas las OTs
// que componen ese indicador (filtradas por los mismos filtros globales).
// Portal al body + position fixed para escapar del overflow del dashboard.

function KpiDetailModal({
  kpi, bucket, days, sucursal, tipo, onClose, drillSucursal, estadoDrill,
}: {
  kpi: KpiKind;
  bucket?: string | null;
  days: number;
  sucursal: string;
  tipo: string;
  onClose: () => void;
  drillSucursal?: string | null;
  estadoDrill?: string | null;
}) {
  const [data, setData]       = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [search, setSearch]   = useState('');

  const effectiveSucursal = drillSucursal ?? sucursal;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      setSearch('');
      try {
        const qp = new URLSearchParams({ kpi, days: String(days) });
        if (effectiveSucursal) qp.set('sucursal', effectiveSucursal);
        if (tipo)              qp.set('tipo', tipo);
        if (bucket)            qp.set('bucket', bucket);
        if (estadoDrill)       qp.set('estadoDrill', estadoDrill);
        const res = await fetch(`/api/ot-seguimiento/reportes/dashboard/detail?${qp}`);
        if (!res.ok) throw new Error('Error al cargar el detalle');
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [kpi, bucket, days, effectiveSucursal, tipo, estadoDrill]); // eslint-disable-line react-hooks/exhaustive-deps

  // ESC cierra
  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  // Filtrado client-side por buscador
  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.rows;
    return data.rows.filter(r =>
      String(r.ot).includes(q) ||
      r.cliente.toLowerCase().includes(q) ||
      r.modelo.toLowerCase().includes(q) ||
      r.plate.toLowerCase().includes(q) ||
      r.sucursal.toLowerCase().includes(q) ||
      r.asesor.toLowerCase().includes(q) ||
      r.tipoServicio.toLowerCase().includes(q)
    );
  }, [data, search]);

  function exportCSV() {
    if (!filtered.length) return;
    const headers = ['OT','Cliente','Modelo','Chapa','Sucursal','Estado','Tipo','Asesor','Ingreso','Compromiso','Finalizado','Días en taller','Días retraso','Monto'];
    const rows = filtered.map(r => [
      r.ot, r.cliente, r.modelo, r.plate, r.sucursal, r.estadoOt, r.tipoServicio,
      r.asesor, r.fechaIngreso ?? '', r.fechaCompromiso ?? '', r.fechaFinalizado ?? '',
      r.diasIngreso, r.diasRetraso, r.monto,
    ]);
    const csv = [headers, ...rows]
      .map(line => line.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${kpi}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[88vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider font-bold text-indigo-600">Detalle del indicador</p>
            <h2 className="text-xl font-bold text-slate-900 mt-0.5 truncate" title={data?.title}>
              {data?.title ?? '...'}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {loading ? 'Cargando OTs...' : `${filtered.length.toLocaleString('es-PY')} OTs${search ? ` filtradas (${data?.total ?? 0} total)` : ''}`}
              {(estadoDrill || effectiveSucursal || tipo) && (
                <span className="ml-2 text-indigo-600">· {[estadoDrill, effectiveSucursal, tipo].filter(Boolean).join(' · ')}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!loading && filtered.length > 0 && (
              <button
                onClick={exportCSV}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium"
                title="Descargar la lista en CSV"
              >
                Exportar CSV
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
              title="Cerrar (ESC)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Search bar */}
        {!loading && data && data.rows.length > 0 && (
          <div className="px-6 py-3 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por OT, cliente, chapa, modelo, sucursal, asesor o tipo..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {error ? (
            <div className="p-8 text-center text-sm text-red-500">{error}</div>
          ) : loading ? (
            <div className="p-12 flex items-center justify-center gap-3 text-slate-400">
              <div className="h-5 w-5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
              <span className="text-sm">Cargando detalle desde el DMS...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-400">Sin resultados</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600 whitespace-nowrap">OT</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-slate-600 whitespace-nowrap">Días ↓</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-slate-600 whitespace-nowrap">Retraso</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Cliente</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Modelo</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600 whitespace-nowrap">Estado</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600 whitespace-nowrap">Asesor</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Sucursal</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Tipo</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600 whitespace-nowrap">Ingreso</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600 whitespace-nowrap">Compromiso</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-slate-600 whitespace-nowrap">Monto</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.ot} className={`border-b border-slate-100 hover:bg-blue-50/40 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                    <td className="px-4 py-2 font-bold text-slate-900 whitespace-nowrap">{r.ot}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      <span className={`font-semibold ${r.diasIngreso > 30 ? 'text-red-600' : r.diasIngreso > 14 ? 'text-amber-600' : 'text-slate-600'}`}>
                        {r.diasIngreso}d
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {r.diasRetraso > 0
                        ? <span className={`font-bold px-1.5 py-0.5 rounded ${r.diasRetraso > 60 ? 'bg-red-100 text-red-800' : r.diasRetraso > 30 ? 'bg-orange-100 text-orange-800' : 'bg-amber-100 text-amber-800'}`}>{r.diasRetraso}d</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2 text-slate-700 max-w-[200px] truncate" title={r.cliente}>{r.cliente || '—'}</td>
                    <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{r.modelo || '—'}</td>
                    <td className="px-4 py-2 text-slate-600 whitespace-nowrap text-[11px]">{r.estadoOt}</td>
                    <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{r.asesor || '—'}</td>
                    <td className="px-4 py-2 text-slate-500 text-[11px] whitespace-nowrap">{r.sucursal || '—'}</td>
                    <td className="px-4 py-2 text-slate-500 text-[11px] whitespace-nowrap">{r.tipoServicio || '—'}</td>
                    <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{r.fechaIngreso ?? '—'}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {r.fechaCompromiso ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-700 whitespace-nowrap">{fmtMoney(r.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        {!loading && data && (
          <div className="px-6 py-2.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-[10px] text-slate-400">
            <span>Datos vivos del DMS Condor · {new Date(data.generatedAt).toLocaleString('es-PY')}</span>
            <span>Mostrando hasta 500 OTs por consulta</span>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
