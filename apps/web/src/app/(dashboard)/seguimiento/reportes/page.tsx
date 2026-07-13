'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart3, Users, Printer, RefreshCw, TrendingUp, AlertTriangle, Wallet, Building2, LayoutDashboard, Clock, PieChart as PieIcon } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList, Cell,
  PieChart, Pie, Legend, LineChart, Line,
} from 'recharts';
import type { SucursalReportRow, AsesorReportRow, SucursalDetail, AsesorDetail } from '@/app/api/ot-seguimiento/reportes/route';
import DashboardEjecutivo from './_components/dashboard';
import type { OtDetail } from '@/app/api/ot-detail/[ot]/route';
import { OtDetailPanel } from '@/components/ui/ot-detail-panel';

type ReportData = {
  sucursales: SucursalReportRow[];
  asesores: AsesorReportRow[];
  sucursalDetail: SucursalDetail | null;
  asesorDetail: AsesorDetail | null;
  availableSucursales: string[];
  availableAsesores: string[];
  filtros: { sucursal: string; asesores: string[] };
  generatedAt: string;
};

type Tab = 'dashboard' | 'sucursales' | 'asesores';

const fmtMoney = (n: number) => `₲ ${n.toLocaleString('es-PY')}`;
const fmtDate = (iso: string) => new Date(iso).toLocaleString('es-PY', { dateStyle: 'long', timeStyle: 'short' });
const SUCURSAL_COLORS = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#0284c7', '#16a34a', '#ea580c'];

export default function ReportesPage() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sucursalFiltro, setSucursalFiltro] = useState('');
  const [asesoresFiltro, setAsesoresFiltro] = useState<string[]>([]);
  const [asesorDays, setAsesorDays]         = useState<number>(30);

  // OT detail panel
  const [selectedOtNum, setSelectedOtNum]     = useState<number | null>(null);
  const [otDetail, setOtDetail]               = useState<OtDetail | null>(null);
  const [otDetailLoading, setOtDetailLoading] = useState(false);
  const [otDetailError, setOtDetailError]     = useState('');

  async function openOt(num: number) {
    setSelectedOtNum(num);
    setOtDetail(null);
    setOtDetailError('');
    setOtDetailLoading(true);
    try {
      const res = await fetch(`/api/ot-detail/${num}`);
      if (!res.ok) throw new Error('No se pudo cargar el detalle de la OT');
      setOtDetail(await res.json());
    } catch (e: any) {
      setOtDetailError(e.message);
    } finally {
      setOtDetailLoading(false);
    }
  }

  function closeOt() {
    setSelectedOtNum(null);
    setOtDetail(null);
    setOtDetailError('');
  }

  async function fetchData(opts?: { force?: boolean }) {
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (opts?.force) params.set('force', '1');
    if (sucursalFiltro)        params.set('sucursal', sucursalFiltro);
    if (asesoresFiltro.length) params.set('asesor', asesoresFiltro.join(','));
    if (tab === 'asesores')    params.set('days', String(asesorDays));
    try {
      const res = await fetch(`/api/ot-seguimiento/reportes?${params.toString()}`);
      if (!res.ok) throw new Error('No se pudo generar el reporte');
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Refetch automático al cambiar los filtros.
  useEffect(() => { fetchData(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sucursalFiltro, asesoresFiltro, asesorDays, tab]);

  function addAsesor(a: string) {
    if (!a || asesoresFiltro.includes(a)) return;
    setAsesoresFiltro([...asesoresFiltro, a].sort());
  }
  function removeAsesor(a: string) {
    setAsesoresFiltro(asesoresFiltro.filter(x => x !== a));
  }

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* Header — se oculta al imprimir */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 print:hidden">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/seguimiento" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Volver a Seguimiento">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-sm">
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Reportes de OTs</h1>
              <p className="text-xs text-slate-500">
                {data ? `Generado el ${fmtDate(data.generatedAt)}` : 'Cargando...'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
              <button
                onClick={() => setTab('dashboard')}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                  tab === 'dashboard' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard ejecutivo
              </button>
              <button
                onClick={() => setTab('sucursales')}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                  tab === 'sucursales' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Building2 className="h-3.5 w-3.5" /> Por sucursal
              </button>
              <button
                onClick={() => setTab('asesores')}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                  tab === 'asesores' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Users className="h-3.5 w-3.5" /> Productividad asesores
              </button>
            </div>

            {tab === 'asesores' && (
              <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
                {([30, 90, 180, 0] as const).map(d => (
                  <button
                    key={d}
                    onClick={() => setAsesorDays(d)}
                    className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                      asesorDays === d ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {d === 0 ? 'Todo' : `${d} d`}
                  </button>
                ))}
              </div>
            )}

            {tab !== 'dashboard' && (
              <>
                <select
                  value={sucursalFiltro}
                  onChange={e => setSucursalFiltro(e.target.value)}
                  disabled={loading || !data}
                  className={`text-xs border rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 max-w-[180px] disabled:opacity-50 ${
                    sucursalFiltro ? 'border-indigo-300 text-indigo-700 font-semibold' : 'border-slate-200'
                  }`}
                  title="Filtrar reportes por sucursal"
                >
                  <option value="">Todas las sucursales</option>
                  {(data?.availableSucursales ?? []).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <select
                  value=""
                  onChange={e => { addAsesor(e.target.value); e.target.value = ''; }}
                  disabled={loading || !data}
                  className={`text-xs border rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 max-w-[180px] disabled:opacity-50 ${
                    asesoresFiltro.length ? 'border-emerald-300 text-emerald-700 font-semibold' : 'border-slate-200'
                  }`}
                  title="Filtrar reportes por uno o más asesores"
                >
                  <option value="">
                    {asesoresFiltro.length === 0 ? 'Todos los asesores' : `+ Agregar (${asesoresFiltro.length} sel.)`}
                  </option>
                  {(data?.availableAsesores ?? [])
                    .filter(a => !asesoresFiltro.includes(a))
                    .map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                </select>
                {(sucursalFiltro || asesoresFiltro.length > 0) && (
                  <button
                    onClick={() => { setSucursalFiltro(''); setAsesoresFiltro([]); }}
                    className="text-xs text-slate-500 hover:text-red-600 font-medium px-1"
                    title="Limpiar filtros"
                  >
                    Limpiar
                  </button>
                )}
                <button
                  onClick={() => fetchData({ force: true })}
                  disabled={loading}
                  className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                  title="Refrescar datos del DMS"
                >
                  <RefreshCw className={`h-4 w-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={() => window.print()}
                  disabled={!data || loading}
                  className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
                  title="Imprimir / Exportar PDF"
                >
                  <Printer className="h-3.5 w-3.5" /> PDF
                </button>
              </>
            )}
          </div>
        </div>

        {/* Chips de asesores seleccionados (multi-filter) */}
        {tab !== 'dashboard' && asesoresFiltro.length > 0 && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">
              Asesores filtrados:
            </span>
            {asesoresFiltro.map(a => (
              <span key={a}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
                <span className="font-semibold">{a}</span>
                <button
                  onClick={() => removeAsesor(a)}
                  className="hover:bg-white/60 rounded-full p-0.5 transition-colors"
                  title={`Quitar asesor ${a}`}
                >
                  <span className="block h-3 w-3 leading-none">×</span>
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {tab === 'dashboard' ? (
          <DashboardEjecutivo
            sucursalesDisponibles={data?.sucursales.map(s => s.sucursal) ?? []}
            generatedAt={data?.generatedAt ?? ''}
          />
        ) : error ? (
          <div className="flex items-center justify-center h-40 text-sm text-red-500">{error}</div>
        ) : loading ? (
          <div className="flex items-center justify-center h-40 gap-3 text-slate-400">
            <div className="h-5 w-5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
            <span className="text-sm">Generando reporte desde el DMS...</span>
          </div>
        ) : data ? (
          tab === 'sucursales'
            ? (data.sucursalDetail
                ? <ReporteSucursalDetail detail={data.sucursalDetail} generatedAt={data.generatedAt} filtros={data.filtros} onOtClick={openOt} />
                : <ReporteSucursales    rows={data.sucursales}        generatedAt={data.generatedAt} filtros={data.filtros} />)
            : (data.asesorDetail
                ? <ReporteAsesorDetail   detail={data.asesorDetail}   generatedAt={data.generatedAt} filtros={data.filtros} onOtClick={openOt} />
                : <ReporteAsesores       rows={data.asesores}         generatedAt={data.generatedAt} filtros={data.filtros} days={asesorDays} />)
        ) : null}
      </div>

      <OtDetailPanel
        otNum={selectedOtNum}
        detail={otDetail}
        loading={otDetailLoading}
        error={otDetailError}
        onClose={closeOt}
      />

      {/* Estilos de impresión: el botón "PDF" usa window.print() */}
      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 16mm; }
          body  { background: white; }
          .print-page-break { page-break-before: always; }
        }
      `}</style>
    </div>
  );
}

// ─── Reporte 1: OTs abiertas por sucursal con gráfico de barras ──────────────

function FiltrosBanner({ filtros }: { filtros: { sucursal: string; asesores: string[] } }) {
  if (!filtros.sucursal && filtros.asesores.length === 0) return null;
  return (
    <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px]">
      <span className="uppercase tracking-wider font-semibold text-slate-400">Filtros aplicados:</span>
      {filtros.sucursal && (
        <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full font-medium">
          Sucursal: {filtros.sucursal}
        </span>
      )}
      {filtros.asesores.map(a => (
        <span key={a} className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">
          Asesor: {a}
        </span>
      ))}
    </div>
  );
}

function ReporteSucursales({ rows, generatedAt, filtros }: { rows: SucursalReportRow[]; generatedAt: string; filtros: { sucursal: string; asesores: string[] } }) {
  const totalAbiertas = rows.reduce((s, r) => s + r.abiertas, 0);
  const totalVencidas = rows.reduce((s, r) => s + r.vencidas, 0);
  const montoTotal    = rows.reduce((s, r) => s + r.montoTotal, 0);
  const top = rows[0];

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">
      {/* Encabezado del reporte (visible en print) */}
      <div className="bg-white rounded-xl border border-slate-200 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider font-bold text-indigo-600">Reporte ejecutivo</p>
            <h2 className="text-2xl font-bold text-slate-900 mt-1">OTs abiertas por sucursal</h2>
            <p className="text-xs text-slate-500 mt-1">Snapshot del DMS Condor · {rows.length} sucursales</p>
            <FiltrosBanner filtros={filtros} />
          </div>
          <div className="text-right text-[11px] text-slate-400">
            <p>Generado</p>
            <p className="font-semibold text-slate-600">{fmtDate(generatedAt)}</p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KpiCard icon={<TrendingUp className="h-4 w-4" />} tone="indigo"
          label="Total OTs abiertas" value={totalAbiertas.toLocaleString('es-PY')} />
        <KpiCard icon={<AlertTriangle className="h-4 w-4" />} tone="red"
          label="Compromisos vencidos" value={totalVencidas.toLocaleString('es-PY')} />
        <KpiCard icon={<Building2 className="h-4 w-4" />} tone="emerald"
          label="Sucursal con más carga" value={top?.sucursal ?? '—'} sub={top ? `${top.abiertas.toLocaleString('es-PY')} OTs` : ''} />
        <KpiCard icon={<Wallet className="h-4 w-4" />} tone="amber"
          label="Monto total facturable" value={fmtMoney(montoTotal)} />
      </div>

      {/* Gráfico de barras */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-800">Distribución de OTs abiertas</h3>
          <p className="text-[11px] text-slate-400">Eje vertical = cantidad de OTs · color por sucursal</p>
        </div>
        <ResponsiveContainer width="100%" height={Math.max(360, rows.length * 26)}>
          <BarChart data={rows} layout="vertical" margin={{ top: 10, right: 50, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis type="number" stroke="#64748b" style={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="sucursal" stroke="#64748b" style={{ fontSize: 11 }} width={220} />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
              formatter={(value: any) => [`${Number(value).toLocaleString('es-PY')} OTs abiertas`, '']}
            />
            <Bar dataKey="abiertas" radius={[0, 4, 4, 0]}>
              {rows.map((_, i) => <Cell key={i} fill={SUCURSAL_COLORS[i % SUCURSAL_COLORS.length]} />)}
              <LabelList dataKey="abiertas" position="right" style={{ fill: '#475569', fontSize: 11, fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabla detalle */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800">Detalle por sucursal</h3>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Sucursal</th>
              <th className="text-right px-4 py-2.5 font-semibold text-slate-600">OTs abiertas</th>
              <th className="text-right px-4 py-2.5 font-semibold text-slate-600">Vencidas</th>
              <th className="text-right px-4 py-2.5 font-semibold text-slate-600">Días promedio</th>
              <th className="text-right px-4 py-2.5 font-semibold text-slate-600">Monto total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.sucursal} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                <td className="px-4 py-2.5 font-medium text-slate-700">
                  <span className="inline-block h-2 w-2 rounded-full mr-2 align-middle" style={{ background: SUCURSAL_COLORS[i % SUCURSAL_COLORS.length] }} />
                  {r.sucursal}
                </td>
                <td className="px-4 py-2.5 text-right font-bold text-slate-900 tabular-nums">{r.abiertas.toLocaleString('es-PY')}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${r.vencidas > 0 ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>
                  {r.vencidas.toLocaleString('es-PY')}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{r.diasPromedio} d</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{fmtMoney(r.montoTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Reporte 2: Productividad de asesores (último mes) ───────────────────────

function ReporteAsesores({ rows, generatedAt, filtros, days }: { rows: AsesorReportRow[]; generatedAt: string; filtros: { sucursal: string; asesores: string[] }; days: number }) {
  const totalOts        = rows.reduce((s, r) => s + r.totalOts, 0);
  const totalFinalizadas = rows.reduce((s, r) => s + r.finalizadas, 0);
  const tasaCierre      = totalOts > 0 ? (totalFinalizadas / totalOts) * 100 : 0;
  const top             = rows[0];

  // Top 10 para gráfico (evitar saturación)
  const top10 = rows.slice(0, 10);

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">
      {/* Encabezado */}
      <div className="bg-white rounded-xl border border-slate-200 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider font-bold text-indigo-600">Reporte ejecutivo</p>
            <h2 className="text-2xl font-bold text-slate-900 mt-1">Productividad de asesores</h2>
            <p className="text-xs text-slate-500 mt-1">{days === 0 ? 'Todo el historial' : `Últimos ${days} días`} · {rows.length} asesor{rows.length !== 1 ? 'es' : ''}</p>
            <FiltrosBanner filtros={filtros} />
          </div>
          <div className="text-right text-[11px] text-slate-400">
            <p>Generado</p>
            <p className="font-semibold text-slate-600">{fmtDate(generatedAt)}</p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KpiCard icon={<TrendingUp className="h-4 w-4" />} tone="indigo"
          label="Total OTs gestionadas" value={totalOts.toLocaleString('es-PY')} />
        <KpiCard icon={<Users className="h-4 w-4" />} tone="emerald"
          label="Tasa de cierre" value={`${tasaCierre.toFixed(1)}%`} sub={`${totalFinalizadas.toLocaleString('es-PY')} finalizadas`} />
        <KpiCard icon={<TrendingUp className="h-4 w-4" />} tone="amber"
          label="Asesor top" value={top?.asesor ?? '—'} sub={top ? `${top.totalOts.toLocaleString('es-PY')} OTs` : ''} />
        <KpiCard icon={<Wallet className="h-4 w-4" />} tone="blue"
          label="Monto total" value={fmtMoney(rows.reduce((s, r) => s + r.montoTotal, 0))} />
      </div>

      {/* Gráfico Top 10 */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-800">Top 10 asesores · OTs gestionadas</h3>
          <p className="text-[11px] text-slate-400">Verde = finalizadas · Ámbar = abiertas</p>
        </div>
        <ResponsiveContainer width="100%" height={360}>
          <BarChart data={top10} margin={{ top: 10, right: 20, left: 0, bottom: 50 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="asesor" stroke="#64748b" style={{ fontSize: 11 }} angle={-30} textAnchor="end" height={60} />
            <YAxis stroke="#64748b" style={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
            <Bar dataKey="finalizadas" stackId="a" fill="#10b981" name="Finalizadas" />
            <Bar dataKey="abiertas"    stackId="a" fill="#f59e0b" name="Abiertas" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabla detalle */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800">Detalle por asesor</h3>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Asesor</th>
              <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Sucursal</th>
              <th className="text-right px-4 py-2.5 font-semibold text-slate-600">Total OTs</th>
              <th className="text-right px-4 py-2.5 font-semibold text-slate-600">Finalizadas</th>
              <th className="text-right px-4 py-2.5 font-semibold text-slate-600">Abiertas</th>
              <th className="text-right px-4 py-2.5 font-semibold text-slate-600">Días prom. cierre</th>
              <th className="text-right px-4 py-2.5 font-semibold text-slate-600">Monto total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const tasa = r.totalOts > 0 ? (r.finalizadas / r.totalOts) * 100 : 0;
              return (
                <tr key={`${r.asesor}-${r.sucursal}`} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                  <td className="px-4 py-2.5 font-bold text-slate-800">{r.asesor}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-[11px]">{r.sucursal || '—'}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-900 tabular-nums">{r.totalOts.toLocaleString('es-PY')}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <span className="text-emerald-600 font-semibold">{r.finalizadas.toLocaleString('es-PY')}</span>
                    <span className="text-slate-400 text-[10px] ml-1">({tasa.toFixed(0)}%)</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-amber-600">{r.abiertas.toLocaleString('es-PY')}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                    {r.diasPromedioCierre > 0 ? `${r.diasPromedioCierre} d` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{fmtMoney(r.montoTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Reporte 1b: Detalle de UNA sucursal específica ──────────────────────────
// Cuando se filtra por sucursal, el listado pierde sentido (1 fila). En su lugar,
// mostramos un dashboard rico de esa sucursal: distribución por estado, antigüedad,
// OTs más viejas y tendencia de ingresos.

const ESTADO_COLORS: Record<string, string> = {
  Abierto:                            '#3b82f6',
  'En Presupuesto':                   '#8b5cf6',
  'En Mecánica':                      '#0ea5e9',
  'En proceso':                       '#f59e0b',
  'Chapería':                         '#f97316',
  'En Chapería y Pintura':            '#ec4899',
  'Montaje':                          '#14b8a6',
  'Control Final':                    '#6366f1',
  'Finalizado con repuesto a colocar': '#84cc16',
  'Otro':                             '#94a3b8',
};
const AGE_COLORS: Record<string, string> = {
  '0-7 días':   '#10b981',
  '8-30 días':  '#f59e0b',
  '1-3 meses':  '#f97316',
  '3-6 meses':  '#ef4444',
  '+6 meses':   '#7f1d1d',
};

function ReporteSucursalDetail({
  detail, generatedAt, filtros, onOtClick,
}: {
  detail: SucursalDetail;
  generatedAt: string;
  filtros: { sucursal: string; asesores: string[] };
  onOtClick?: (num: number) => void;
}) {
  const totalAbiertas = detail.byState.reduce((s, x) => s + x.count, 0);
  const totalAge      = detail.byAge.reduce((s, x) => s + x.count, 0);
  const criticas      = detail.byAge.filter(x => x.bucket === '+6 meses' || x.bucket === '3-6 meses')
                                    .reduce((s, x) => s + x.count, 0);
  const montoOldest   = detail.topOldest.reduce((s, o) => s + o.montoTotal, 0);

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">
      {/* Encabezado */}
      <div className="bg-white rounded-xl border border-slate-200 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider font-bold text-indigo-600">Reporte ejecutivo · sucursal</p>
            <h2 className="text-2xl font-bold text-slate-900 mt-1">{detail.sucursal}</h2>
            <p className="text-xs text-slate-500 mt-1">
              {totalAbiertas.toLocaleString('es-PY')} OTs abiertas · {detail.byState.length} estados activos
            </p>
            <FiltrosBanner filtros={filtros} />
          </div>
          <div className="text-right text-[11px] text-slate-400">
            <p>Generado</p>
            <p className="font-semibold text-slate-600">{fmtDate(generatedAt)}</p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KpiCard icon={<TrendingUp className="h-4 w-4" />} tone="indigo"
          label="OTs abiertas" value={totalAbiertas.toLocaleString('es-PY')} />
        <KpiCard icon={<AlertTriangle className="h-4 w-4" />} tone="red"
          label="Críticas (+3 meses)" value={criticas.toLocaleString('es-PY')}
          sub={totalAge ? `${((criticas / totalAge) * 100).toFixed(1)}% del total` : undefined} />
        <KpiCard icon={<Clock className="h-4 w-4" />} tone="amber"
          label="OT más antigua"
          value={detail.topOldest[0] ? `${detail.topOldest[0].dias} d` : '—'}
          sub={detail.topOldest[0] ? `OT #${detail.topOldest[0].ot}` : undefined} />
        <KpiCard icon={<Wallet className="h-4 w-4" />} tone="emerald"
          label="Monto top 10 antiguas" value={fmtMoney(montoOldest)} />
      </div>

      {/* Distribución por estado y antigüedad */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Distribución por estado — barras horizontales tipo leaderboard.
            Mejor que un pie chart cuando hay muchos estados o uno domina (pie con
            slices muy pequeños se vuelve ilegible y los labels se superponen). */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <PieIcon className="h-4 w-4 text-indigo-500" /> Distribución por estado
            </h3>
            <p className="text-[11px] text-slate-400">
              {detail.byState.length} estados · {totalAbiertas.toLocaleString('es-PY')} OTs
            </p>
          </div>
          {detail.byState.length === 0 ? (
            <p className="text-sm text-slate-400 italic text-center py-10">Sin datos</p>
          ) : (() => {
            const max = Math.max(...detail.byState.map(s => s.count), 1);
            return (
              <div className="space-y-2.5">
                {detail.byState.map(s => {
                  const pct = totalAbiertas > 0 ? (s.count / totalAbiertas) * 100 : 0;
                  const color = ESTADO_COLORS[s.estado] ?? '#94a3b8';
                  return (
                    <div key={s.estado} className="space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: color }} />
                          <span className="text-xs font-semibold text-slate-700 truncate" title={s.estado}>{s.estado}</span>
                        </div>
                        <div className="flex items-baseline gap-2 flex-shrink-0">
                          <span className="text-sm font-bold text-slate-900 tabular-nums">{s.count.toLocaleString('es-PY')}</span>
                          <span className="text-[10px] font-medium text-slate-400 tabular-nums w-9 text-right">{pct.toFixed(1)}%</span>
                        </div>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${(s.count / max) * 100}%`, background: color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Bars por antigüedad */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-amber-500" /> Antigüedad de las OTs abiertas
            </h3>
            <p className="text-[11px] text-slate-400">{totalAge.toLocaleString('es-PY')} OTs</p>
          </div>
          {detail.byAge.length === 0 ? (
            <p className="text-sm text-slate-400 italic text-center py-10">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={detail.byAge} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="bucket" stroke="#64748b" style={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" style={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => [`${v} OTs`, '']} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {detail.byAge.map(b => <Cell key={b.bucket} fill={AGE_COLORS[b.bucket] ?? '#64748b'} />)}
                  <LabelList dataKey="count" position="top" style={{ fill: '#475569', fontSize: 11, fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Tendencia mensual */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-emerald-500" /> Tendencia de los últimos 12 meses
          </h3>
          <p className="text-[11px] text-slate-400">Ingresos · Finalizadas</p>
        </div>
        {detail.monthlyIn.length === 0 ? (
          <p className="text-sm text-slate-400 italic text-center py-10">Sin datos</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={detail.monthlyIn} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: 11 }} />
              <YAxis stroke="#64748b" style={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="ingresos"    stroke="#3b82f6" strokeWidth={2} name="Ingresos" />
              <Line type="monotone" dataKey="finalizadas" stroke="#10b981" strokeWidth={2} name="Finalizadas" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Top OTs más viejas */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-red-500" /> Top 10 OTs más antiguas
          </h3>
          <p className="text-[11px] text-slate-400">Acción inmediata recomendada</p>
        </div>
        {detail.topOldest.length === 0 ? (
          <p className="text-sm text-slate-400 italic text-center py-10">Sin OTs antiguas</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">OT</th>
                <th className="text-right px-4 py-2.5 font-semibold text-slate-600">Días</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Cliente</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Modelo</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Estado</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Asesor</th>
                <th className="text-right px-4 py-2.5 font-semibold text-slate-600">Monto</th>
              </tr>
            </thead>
            <tbody>
              {detail.topOldest.map((o, i) => (
                <tr
                  key={o.ot}
                  className={`${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'} ${onOtClick ? 'cursor-pointer hover:bg-indigo-50/60' : ''}`}
                  onClick={() => onOtClick?.(o.ot)}
                >
                  <td className="px-4 py-2.5 font-bold text-slate-800 tabular-nums">#{o.ot}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-bold ${
                    o.dias > 180 ? 'text-red-700' : o.dias > 90 ? 'text-red-500' : o.dias > 30 ? 'text-amber-600' : 'text-slate-600'
                  }`}>
                    {o.dias} d
                  </td>
                  <td className="px-4 py-2.5 text-slate-700 max-w-[200px] truncate" title={o.cliente}>{o.cliente || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600">{o.modelo || '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full inline-flex items-center gap-1"
                          style={{ background: (ESTADO_COLORS[o.estado] ?? '#94a3b8') + '22', color: ESTADO_COLORS[o.estado] ?? '#475569' }}>
                      {o.estado}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{o.asesor || '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{fmtMoney(o.montoTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Reporte 2b: Detalle de UNO o MÁS asesores ────────────────────────────────
// Cuando se filtra por uno o más asesores, mostramos un dashboard ejecutivo
// específico (similar al de sucursal). Permite comparar carga, sucursales en las
// que trabaja, antigüedad de sus OTs, productividad histórica y top de OTs viejas.

function ReporteAsesorDetail({
  detail, generatedAt, filtros, onOtClick,
}: {
  detail: AsesorDetail;
  generatedAt: string;
  filtros: { sucursal: string; asesores: string[] };
  onOtClick?: (num: number) => void;
}) {
  const totalAge = detail.byAge.reduce((s, x) => s + x.count, 0);
  const criticas = detail.byAge
    .filter(x => x.bucket === '+6 meses' || x.bucket === '3-6 meses')
    .reduce((s, x) => s + x.count, 0);

  const titulo = detail.asesores.length === 1
    ? `Asesor ${detail.asesores[0]}`
    : `${detail.asesores.length} asesores seleccionados`;

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">
      {/* Encabezado */}
      <div className="bg-white rounded-xl border border-slate-200 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider font-bold text-emerald-600">Reporte ejecutivo · asesor</p>
            <h2 className="text-2xl font-bold text-slate-900 mt-1">{titulo}</h2>
            <p className="text-xs text-slate-500 mt-1">
              {detail.totalOts.toLocaleString('es-PY')} OTs últimos 12 meses · {detail.bySucursal.length} sucursales activas
            </p>
            <FiltrosBanner filtros={filtros} />
          </div>
          <div className="text-right text-[11px] text-slate-400">
            <p>Generado</p>
            <p className="font-semibold text-slate-600">{fmtDate(generatedAt)}</p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KpiCard icon={<TrendingUp className="h-4 w-4" />} tone="emerald"
          label="Tasa de cierre" value={`${detail.tasaCierre.toFixed(1)}%`}
          sub={`${detail.finalizadas.toLocaleString('es-PY')} de ${detail.totalOts.toLocaleString('es-PY')}`} />
        <KpiCard icon={<AlertTriangle className="h-4 w-4" />} tone="red"
          label="Críticas (+3 meses)" value={criticas.toLocaleString('es-PY')}
          sub={totalAge ? `${((criticas / totalAge) * 100).toFixed(1)}% de las abiertas` : undefined} />
        <KpiCard icon={<Clock className="h-4 w-4" />} tone="amber"
          label="Días promedio cierre"
          value={detail.diasPromedioCierre > 0 ? `${detail.diasPromedioCierre} d` : '—'}
          sub={detail.finalizadas > 0 ? 'sobre OTs finalizadas' : 'sin cierres aún'} />
        <KpiCard icon={<Wallet className="h-4 w-4" />} tone="blue"
          label="Monto total gestionado" value={fmtMoney(detail.montoTotal)} />
      </div>

      {/* Distribución por sucursal + por estado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Por sucursal — leaderboard */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-indigo-500" /> OTs abiertas por sucursal
            </h3>
            <p className="text-[11px] text-slate-400">
              {detail.bySucursal.length} sucursales · {detail.abiertas.toLocaleString('es-PY')} OTs
            </p>
          </div>
          {detail.bySucursal.length === 0 ? (
            <p className="text-sm text-slate-400 italic text-center py-10">Sin OTs abiertas</p>
          ) : (() => {
            const max = Math.max(...detail.bySucursal.map(s => s.count), 1);
            return (
              <div className="space-y-2.5">
                {detail.bySucursal.map((s, i) => {
                  const pct = detail.abiertas > 0 ? (s.count / detail.abiertas) * 100 : 0;
                  const color = SUCURSAL_COLORS[i % SUCURSAL_COLORS.length];
                  return (
                    <div key={s.sucursal} className="space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: color }} />
                          <span className="text-xs font-semibold text-slate-700 truncate" title={s.sucursal}>{s.sucursal}</span>
                        </div>
                        <div className="flex items-baseline gap-2 flex-shrink-0">
                          <span className="text-sm font-bold text-slate-900 tabular-nums">{s.count.toLocaleString('es-PY')}</span>
                          <span className="text-[10px] font-medium text-slate-400 tabular-nums w-9 text-right">{pct.toFixed(1)}%</span>
                        </div>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(s.count / max) * 100}%`, background: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Por estado — leaderboard (mismo estilo que sucursal detail) */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <PieIcon className="h-4 w-4 text-indigo-500" /> Distribución por estado
            </h3>
            <p className="text-[11px] text-slate-400">{detail.byState.length} estados</p>
          </div>
          {detail.byState.length === 0 ? (
            <p className="text-sm text-slate-400 italic text-center py-10">Sin datos</p>
          ) : (() => {
            const max = Math.max(...detail.byState.map(s => s.count), 1);
            return (
              <div className="space-y-2.5">
                {detail.byState.map(s => {
                  const pct = detail.abiertas > 0 ? (s.count / detail.abiertas) * 100 : 0;
                  const color = ESTADO_COLORS[s.estado] ?? '#94a3b8';
                  return (
                    <div key={s.estado} className="space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: color }} />
                          <span className="text-xs font-semibold text-slate-700 truncate" title={s.estado}>{s.estado}</span>
                        </div>
                        <div className="flex items-baseline gap-2 flex-shrink-0">
                          <span className="text-sm font-bold text-slate-900 tabular-nums">{s.count.toLocaleString('es-PY')}</span>
                          <span className="text-[10px] font-medium text-slate-400 tabular-nums w-9 text-right">{pct.toFixed(1)}%</span>
                        </div>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(s.count / max) * 100}%`, background: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Antigüedad + tendencia mensual */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-amber-500" /> Antigüedad de las OTs abiertas
            </h3>
            <p className="text-[11px] text-slate-400">{totalAge.toLocaleString('es-PY')} OTs</p>
          </div>
          {detail.byAge.length === 0 ? (
            <p className="text-sm text-slate-400 italic text-center py-10">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={detail.byAge} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="bucket" stroke="#64748b" style={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" style={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => [`${v} OTs`, '']} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {detail.byAge.map(b => <Cell key={b.bucket} fill={AGE_COLORS[b.bucket] ?? '#64748b'} />)}
                  <LabelList dataKey="count" position="top" style={{ fill: '#475569', fontSize: 11, fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-emerald-500" /> Productividad últimos 12 meses
            </h3>
            <p className="text-[11px] text-slate-400">Ingresos · Finalizadas</p>
          </div>
          {detail.monthlyIn.length === 0 ? (
            <p className="text-sm text-slate-400 italic text-center py-10">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={detail.monthlyIn} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" style={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="ingresos"    stroke="#3b82f6" strokeWidth={2} name="Ingresos" />
                <Line type="monotone" dataKey="finalizadas" stroke="#10b981" strokeWidth={2} name="Finalizadas" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top OTs más viejas del/los asesor(es) */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-red-500" /> Top 10 OTs más antiguas
          </h3>
          <p className="text-[11px] text-slate-400">Acción inmediata recomendada</p>
        </div>
        {detail.topOldest.length === 0 ? (
          <p className="text-sm text-slate-400 italic text-center py-10">Sin OTs antiguas</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">OT</th>
                <th className="text-right px-4 py-2.5 font-semibold text-slate-600">Días</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Cliente</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Modelo</th>
                {detail.asesores.length > 1 && <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Asesor</th>}
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Sucursal</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Estado</th>
                <th className="text-right px-4 py-2.5 font-semibold text-slate-600">Monto</th>
              </tr>
            </thead>
            <tbody>
              {detail.topOldest.map((o, i) => (
                <tr
                  key={o.ot}
                  className={`${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'} ${onOtClick ? 'cursor-pointer hover:bg-indigo-50/60' : ''}`}
                  onClick={() => onOtClick?.(o.ot)}
                >
                  <td className="px-4 py-2.5 font-bold text-slate-800 tabular-nums">#{o.ot}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-bold ${
                    o.dias > 180 ? 'text-red-700' : o.dias > 90 ? 'text-red-500' : o.dias > 30 ? 'text-amber-600' : 'text-slate-600'
                  }`}>
                    {o.dias} d
                  </td>
                  <td className="px-4 py-2.5 text-slate-700 max-w-[200px] truncate" title={o.cliente}>{o.cliente || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600">{o.modelo || '—'}</td>
                  {detail.asesores.length > 1 && <td className="px-4 py-2.5 text-slate-600">{o.asesor || '—'}</td>}
                  <td className="px-4 py-2.5 text-slate-500 text-[11px]">{o.sucursal || '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ background: (ESTADO_COLORS[o.estado] ?? '#94a3b8') + '22', color: ESTADO_COLORS[o.estado] ?? '#475569' }}>
                      {o.estado}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{fmtMoney(o.montoTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  icon, label, value, sub, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone: 'indigo' | 'red' | 'emerald' | 'amber' | 'blue';
}) {
  const toneClasses = {
    indigo:  'bg-indigo-50 text-indigo-700 border-indigo-200',
    red:     'bg-red-50 text-red-700 border-red-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber:   'bg-amber-50 text-amber-700 border-amber-200',
    blue:    'bg-blue-50 text-blue-700 border-blue-200',
  } as const;

  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-start gap-3">
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center border ${toneClasses[tone]}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">{label}</p>
        <p className="text-lg font-bold text-slate-900 truncate" title={value}>{value}</p>
        {sub && <p className="text-[11px] text-slate-500 truncate">{sub}</p>}
      </div>
    </div>
  );
}
