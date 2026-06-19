'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, RefreshCw, AlertTriangle, CheckCircle2,
  Clock, TrendingUp, Car, Users, CalendarClock,
  ChevronRight, Loader2, AlertCircle, BarChart3,
  ArrowDown, Minus, Filter, X, ExternalLink,
} from 'lucide-react';
import type { OperativoData, VencidoRow, ProximoVencerRow, AsesorOpRow, Periodo, DrillMetric, DrillResult, DrillRow } from '@/app/api/ot-seguimiento/operativo/route';
import { OT_ESTADOS } from '@/lib/ot-estados';

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });

/* ── Componentes de UI ──────────────────────────────────────────────────── */

function KpiCard({
  label, value, sub, color, icon: Icon, alert, onClick,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color: 'red' | 'amber' | 'green' | 'indigo' | 'slate' | 'emerald';
  icon: React.ElementType;
  alert?: boolean;
  onClick?: () => void;
}) {
  const cfg = {
    red:     { bg: 'bg-red-50',     border: 'border-red-200',     icon: 'text-red-500',     val: 'text-red-700'   },
    amber:   { bg: 'bg-amber-50',   border: 'border-amber-200',   icon: 'text-amber-500',   val: 'text-amber-700' },
    green:   { bg: 'bg-green-50',   border: 'border-green-200',   icon: 'text-green-500',   val: 'text-green-700' },
    indigo:  { bg: 'bg-indigo-50',  border: 'border-indigo-200',  icon: 'text-indigo-500',  val: 'text-indigo-700' },
    slate:   { bg: 'bg-slate-50',   border: 'border-slate-200',   icon: 'text-slate-400',   val: 'text-slate-700' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'text-emerald-500', val: 'text-emerald-700' },
  }[color];

  const clickable = !!onClick;
  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={e => { if (onClick && (e.key === 'Enter' || e.key === ' ')) onClick(); }}
      className={`rounded-xl border p-4 flex flex-col gap-2 ${cfg.bg} ${cfg.border} ${alert ? 'ring-2 ring-red-400 ring-offset-1' : ''} ${clickable ? 'cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all select-none' : ''}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
        <div className="flex items-center gap-1">
          {clickable && <ChevronRight className="h-3 w-3 text-slate-300" />}
          <Icon className={`h-4 w-4 ${cfg.icon}`} />
        </div>
      </div>
      <p className={`text-3xl font-black tabular-nums ${cfg.val}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400 leading-tight">{sub}</p>}
    </div>
  );
}

function DrillPanel({
  drill, periodo, sucursal, asesor, estado, onClose, onOpenOt,
}: {
  drill: DrillMetric;
  periodo: Periodo;
  sucursal: string;
  asesor: string;
  estado: string;
  onClose: () => void;
  onOpenOt: (ot: number) => void;
}) {
  const [result, setResult] = useState<DrillResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setError('');
    setResult(null);
    const params = new URLSearchParams({ drill, periodo });
    if (sucursal) params.set('sucursal', sucursal);
    if (asesor)   params.set('asesor', asesor);
    if (estado)   params.set('estado', estado);
    fetch(`/api/ot-seguimiento/operativo?${params}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Error al cargar')))
      .then(d => setResult(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [drill, periodo, sucursal, asesor, estado]);

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const stateColor: Record<string, string> = {
    'En Proceso':    'bg-amber-100 text-amber-700',
    'Pendiente':     'bg-blue-100 text-blue-700',
    'Finalizado':    'bg-emerald-100 text-emerald-700',
    'Cancelado':     'bg-slate-100 text-slate-500',
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Panel derecho */}
      <div
        ref={panelRef}
        className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="text-sm font-bold text-slate-900">{result?.label ?? '...'}</h2>
            {result && (
              <p className="text-xs text-slate-400 mt-0.5">{result.total} OTs</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center h-40 gap-2 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Consultando DMS...</span>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 m-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}
          {result && result.rows.length === 0 && (
            <div className="flex items-center gap-2 m-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              Sin OTs para esta métrica
            </div>
          )}
          {result && result.rows.length > 0 && (
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[10px]">OT</th>
                  <th className="text-left px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[10px]">Cliente / Modelo</th>
                  <th className="text-left px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[10px] hidden sm:table-cell">Asesor</th>
                  <th className="text-left px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[10px]">Estado</th>
                  <th className="text-right px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[10px]">Días</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.rows.map((row: DrillRow, i) => (
                  <tr
                    key={row.ot}
                    onClick={() => onOpenOt(row.ot)}
                    className={`cursor-pointer hover:bg-orange-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}
                  >
                    <td className="px-4 py-2.5 font-bold text-slate-800 tabular-nums">#{row.ot}</td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-slate-800 truncate max-w-[180px]">{row.cliente || '—'}</p>
                      <p className="text-[10px] text-slate-400 truncate">{row.modelo || '—'}</p>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 hidden sm:table-cell truncate max-w-[120px]">{row.asesor || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${stateColor[row.estado] ?? 'bg-slate-100 text-slate-600'}`}>
                        {row.estado || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      <span className={`font-bold text-[11px] ${row.diasEnTaller > 30 ? 'text-red-600' : row.diasEnTaller > 14 ? 'text-amber-600' : 'text-slate-500'}`}>
                        {row.diasEnTaller}d
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <ExternalLink className="h-3 w-3 text-slate-300" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 flex-shrink-0">
          <p className="text-[10px] text-slate-400">Click en una fila para abrir la OT en seguimiento</p>
        </div>
      </div>
    </>
  );
}

function TasaIndicador({ tasa }: { tasa: number }) {
  const color = tasa >= 80 ? 'text-emerald-600' : tasa >= 50 ? 'text-amber-600' : 'text-red-600';
  const Icon  = tasa >= 80 ? TrendingUp : tasa >= 50 ? Minus : ArrowDown;
  return (
    <div className={`flex items-center gap-1 ${color}`}>
      <Icon className="h-3.5 w-3.5" />
      <span className="text-xs font-bold">{tasa}%</span>
    </div>
  );
}

function VencidosList({ rows, onOpen }: { rows: VencidoRow[]; onOpen: (ot: number) => void }) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
        <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
        Sin compromisos vencidos
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-red-200">
      <table className="min-w-full text-xs">
        <thead className="bg-red-50">
          <tr>
            <th className="text-left px-3 py-2 font-bold text-red-700 uppercase tracking-wider text-[10px]">OT</th>
            <th className="text-left px-3 py-2 font-bold text-red-700 uppercase tracking-wider text-[10px]">Cliente</th>
            <th className="text-left px-3 py-2 font-bold text-red-700 uppercase tracking-wider text-[10px] hidden sm:table-cell">Asesor</th>
            <th className="text-right px-3 py-2 font-bold text-red-700 uppercase tracking-wider text-[10px]">Vencido</th>
            <th className="text-right px-3 py-2 font-bold text-red-700 uppercase tracking-wider text-[10px] hidden md:table-cell">En taller</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-red-50">
          {rows.map((r, i) => (
            <tr key={r.ot} className={`hover:bg-red-50/50 transition-colors cursor-pointer ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`} onClick={() => onOpen(r.ot)}>
              <td className="px-3 py-2 font-bold text-slate-800">#{r.ot}</td>
              <td className="px-3 py-2">
                <p className="font-medium text-slate-800 truncate max-w-[160px]">{r.cliente || '—'}</p>
                <p className="text-[10px] text-slate-400 truncate">{r.modelo || '—'}</p>
              </td>
              <td className="px-3 py-2 text-slate-600 hidden sm:table-cell">{r.asesor || '—'}</td>
              <td className="px-3 py-2 text-right">
                <span className="inline-flex items-center gap-1 font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full text-[11px]">
                  +{r.diasVencido}d
                </span>
              </td>
              <td className="px-3 py-2 text-right text-slate-500 hidden md:table-cell">{r.diasEnTaller}d</td>
              <td className="px-3 py-2">
                <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProximosList({ rows, onOpen }: { rows: ProximoVencerRow[]; onOpen: (ot: number) => void }) {
  if (rows.length === 0) {
    return (
      <p className="text-xs text-slate-400 italic px-1">Sin compromisos en los próximos 3 días.</p>
    );
  }
  return (
    <div className="space-y-1.5">
      {rows.map(r => {
        const hoy = r.diasRestantes === 0;
        return (
          <div
            key={r.ot}
            onClick={() => onOpen(r.ot)}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer hover:shadow-sm transition-all ${
              hoy ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100'
            }`}
          >
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded min-w-[28px] text-center ${
              hoy ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'
            }`}>
              {hoy ? 'HOY' : `${r.diasRestantes}d`}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-800 truncate">#{r.ot} · {r.cliente || '—'}</p>
              <p className="text-[10px] text-slate-400 truncate">{r.modelo || '—'} · {r.asesor || '—'}</p>
            </div>
            <span className="text-[10px] text-slate-400 flex-shrink-0 font-mono">{r.fechaCompromiso}</span>
          </div>
        );
      })}
    </div>
  );
}

function Distribucion({ rows }: { rows: { label: string; count: number }[] }) {
  if (rows.length === 0) return <p className="text-xs text-slate-400 italic">Sin ingresos en el período.</p>;
  const max = Math.max(...rows.map(r => r.count), 1);
  return (
    <div className="space-y-1.5">
      {rows.map(r => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-slate-400 w-14 flex-shrink-0 text-right">{r.label}</span>
          <div className="flex-1 h-5 bg-slate-100 rounded overflow-hidden">
            <div
              className="h-full bg-indigo-400 rounded transition-all"
              style={{ width: `${(r.count / max) * 100}%` }}
            />
          </div>
          <span className="text-[11px] font-bold text-slate-700 w-5 text-right">{r.count}</span>
        </div>
      ))}
    </div>
  );
}

function AsesorTable({ rows }: { rows: AsesorOpRow[] }) {
  if (rows.length === 0) return <p className="text-xs text-slate-400 italic">Sin datos de asesores para el período.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full text-xs">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="text-left px-3 py-2.5 font-bold text-slate-600 uppercase tracking-wider text-[10px]">Asesor / Técnico</th>
            <th className="text-right px-3 py-2.5 font-bold text-slate-600 uppercase tracking-wider text-[10px]" title="OTs ingresadas en el período">Ingresos</th>
            <th className="text-right px-3 py-2.5 font-bold text-slate-600 uppercase tracking-wider text-[10px]" title="OTs cerradas en el período">Cerradas</th>
            <th className="text-right px-3 py-2.5 font-bold text-slate-600 uppercase tracking-wider text-[10px]" title="Compromisos vencidos activos">Vencidos</th>
            <th className="text-right px-3 py-2.5 font-bold text-slate-600 uppercase tracking-wider text-[10px] hidden sm:table-cell" title="Promedio de días para cerrar una OT">Días prom.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((r, i) => (
            <tr key={r.asesor} className={i % 2 === 0 ? '' : 'bg-slate-50/40'}>
              <td className="px-3 py-2 font-medium text-slate-800">{r.asesor}</td>
              <td className="px-3 py-2 text-right text-slate-600 tabular-nums">{r.ingresados}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.cerrados > 0 ? (
                  <span className="text-emerald-600 font-semibold">{r.cerrados}</span>
                ) : (
                  <span className="text-slate-300">0</span>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.vencidos > 0 ? (
                  <span className="inline-flex items-center gap-0.5 font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded text-[10px]">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {r.vencidos}
                  </span>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </td>
              <td className="px-3 py-2 text-right text-slate-500 tabular-nums hidden sm:table-cell">
                {r.diasPromCierre > 0 ? `${r.diasPromCierre}d` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Filtro select reutilizable ─────────────────────────────────────────── */
function FilterSelect({
  value, onChange, placeholder, children,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`appearance-none text-xs pl-3 pr-7 py-1.5 rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-orange-300 ${
          value
            ? 'bg-orange-50 border-orange-300 text-orange-800 font-semibold'
            : 'bg-white border-slate-200 text-slate-600'
        }`}
      >
        <option value="">{placeholder}</option>
        {children}
      </select>
      <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
      </svg>
    </div>
  );
}

/* ── Page principal ─────────────────────────────────────────────────────── */
export default function OperativoPage() {
  const [periodo,   setPeriodo]   = useState<Periodo>('hoy');
  const [sucursalF, setSucursalF] = useState('');
  const [asesorF,   setAsesorF]   = useState('');
  const [estadoF,   setEstadoF]   = useState('');
  const [data,      setData]      = useState<OperativoData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [drill,     setDrill]     = useState<DrillMetric | null>(null);

  const hasFilters = !!(sucursalF || asesorF || estadoF);

  const fetchData = useCallback(async (
    p: Periodo,
    suc: string,
    ase: string,
    est: string,
    force = false,
  ) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ periodo: p });
      if (suc)   params.set('sucursal', suc);
      if (ase)   params.set('asesor', ase);
      if (est)   params.set('estado', est);
      if (force) params.set('force', '1');
      const res = await fetch(`/api/ot-seguimiento/operativo?${params}`);
      if (!res.ok) throw new Error('Error al cargar datos');
      setData(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(periodo, sucursalF, asesorF, estadoF);
  }, [periodo, sucursalF, asesorF, estadoF, fetchData]);

  // Auto-refresh 60s
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') fetchData(periodo, sucursalF, asesorF, estadoF);
    }, 60_000);
    return () => clearInterval(id);
  }, [periodo, sucursalF, asesorF, estadoF, fetchData]);

  function openOt(ot: number) {
    window.open(`/seguimiento?ot=${ot}`, '_self');
  }

  const periodoLabel = periodo === 'hoy' ? 'hoy' : 'esta semana';

  return (
    <div className="flex flex-col h-full bg-slate-100 overflow-y-auto">

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 flex-shrink-0">
        {/* Fila principal */}
        <div className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/seguimiento" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Volver a Seguimiento">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-sm">
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Reporte operativo</h1>
              <p className="text-xs text-slate-500">
                {data ? `Actualizado a las ${fmtTime(data.generatedAt)}` : 'Cargando...'}
                {hasFilters && <span className="ml-2 text-orange-500 font-semibold">· filtros activos</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Período */}
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
              {(['hoy', 'semana'] as Periodo[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriodo(p)}
                  className={`text-xs px-4 py-1.5 rounded-md font-semibold transition-all capitalize ${
                    periodo === p
                      ? 'bg-white shadow-sm text-orange-600'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {p === 'hoy' ? 'Hoy' : 'Esta semana'}
                </button>
              ))}
            </div>
            <button
              onClick={() => fetchData(periodo, sucursalF, asesorF, estadoF, true)}
              disabled={loading}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              title="Actualizar"
            >
              <RefreshCw className={`h-4 w-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* ── Barra de filtros ── */}
        <div className="px-6 pb-3 flex items-center gap-2 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">Filtrar:</span>

          {/* Sucursal */}
          <FilterSelect
            value={sucursalF}
            onChange={setSucursalF}
            placeholder="Todas las sucursales"
          >
            {(data?.filterOptions.sucursales ?? []).map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </FilterSelect>

          {/* Estado OT */}
          <FilterSelect
            value={estadoF}
            onChange={setEstadoF}
            placeholder="Todos los estados"
          >
            {OT_ESTADOS.map(e => (
              <option key={e.key} value={e.key}>{e.shortLabel ?? e.label}</option>
            ))}
          </FilterSelect>

          {/* Asesor / Técnico */}
          <FilterSelect
            value={asesorF}
            onChange={setAsesorF}
            placeholder="Todos los técnicos"
          >
            {(data?.filterOptions.asesores ?? []).map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </FilterSelect>

          {/* Limpiar */}
          {hasFilters && (
            <button
              onClick={() => { setSucursalF(''); setAsesorF(''); setEstadoF(''); }}
              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-red-600 px-2 py-1 rounded-md hover:bg-red-50 transition-colors border border-slate-200 hover:border-red-200"
            >
              <X className="h-3 w-3" />
              Limpiar
            </button>
          )}

          {/* Chips activos */}
          {sucursalF && (
            <span className="inline-flex items-center gap-1 text-[11px] bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded-full">
              {sucursalF}
              <button onClick={() => setSucursalF('')} className="hover:text-orange-900"><X className="h-2.5 w-2.5" /></button>
            </span>
          )}
          {estadoF && (
            <span className="inline-flex items-center gap-1 text-[11px] bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded-full">
              {OT_ESTADOS.find(e => e.key === estadoF)?.shortLabel ?? estadoF}
              <button onClick={() => setEstadoF('')} className="hover:text-orange-900"><X className="h-2.5 w-2.5" /></button>
            </span>
          )}
          {asesorF && (
            <span className="inline-flex items-center gap-1 text-[11px] bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded-full">
              {asesorF}
              <button onClick={() => setAsesorF('')} className="hover:text-orange-900"><X className="h-2.5 w-2.5" /></button>
            </span>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 p-5 space-y-5">

        {loading && !data && (
          <div className="flex items-center justify-center h-40 gap-2 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Consultando DMS...</span>
          </div>
        )}

        {/* Overlay de carga sobre datos existentes */}
        {loading && data && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400 -mb-3">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Actualizando...
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {data && (
          <>
            {/* ── KPI cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <KpiCard
                label={`Ingresos ${periodoLabel}`}
                value={data.ingresados}
                sub="OTs que entraron al taller"
                color="indigo"
                icon={Car}
                onClick={() => setDrill('ingresos')}
              />
              <KpiCard
                label="Compromisos vencidos"
                value={data.totalVencidos}
                sub="Requieren gestión urgente"
                color={data.totalVencidos > 0 ? 'red' : 'emerald'}
                icon={AlertTriangle}
                alert={data.totalVencidos > 5}
                onClick={() => setDrill('vencidos')}
              />
              <KpiCard
                label={`Tasa de cierre ${periodoLabel}`}
                value={`${data.tasaCierre}%`}
                sub={`${data.cerradosEnPeriodo} cerradas / ${data.ingresados} ingresadas`}
                color={data.tasaCierre >= 80 ? 'emerald' : data.tasaCierre >= 50 ? 'amber' : 'red'}
                icon={TrendingUp}
                onClick={() => setDrill('cerrados')}
              />
              <KpiCard
                label="OTs críticas"
                value={data.otsCriticas}
                sub="+30 días en taller"
                color={data.otsCriticas > 0 ? 'red' : 'slate'}
                icon={AlertCircle}
                onClick={() => setDrill('criticas')}
              />
              <KpiCard
                label="Total abiertas"
                value={data.otsAbiertas}
                sub={`${data.otsEnAtraso} en atraso (+14d)`}
                color="slate"
                icon={ClipboardIcon}
                onClick={() => setDrill('abiertas')}
              />
              <KpiCard
                label="En atraso"
                value={data.otsEnAtraso}
                sub="14–30 días en taller"
                color={data.otsEnAtraso > 0 ? 'amber' : 'slate'}
                icon={Clock}
                onClick={() => setDrill('atraso')}
              />
            </div>

            {/* ── Main content: 2 cols ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

              {/* Col izquierda: vencidos (2/3) */}
              <div className="lg:col-span-2 space-y-4">
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                      <h2 className="text-sm font-bold text-slate-900">Compromisos vencidos</h2>
                      {data.totalVencidos > 0 && (
                        <span className="text-[11px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                          {data.totalVencidos}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400">Click en fila para abrir OT</p>
                  </div>
                  <VencidosList rows={data.vencidos} onOpen={openOt} />
                </div>
              </div>

              {/* Col derecha: próximos + distribución (1/3) */}
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CalendarClock className="h-4 w-4 text-amber-500" />
                    <h2 className="text-sm font-bold text-slate-900">Vencen en 3 días</h2>
                    {data.proximosVencer.length > 0 && (
                      <span className="text-[11px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                        {data.proximosVencer.length}
                      </span>
                    )}
                  </div>
                  <ProximosList rows={data.proximosVencer} onOpen={openOt} />
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <BarChart3 className="h-4 w-4 text-indigo-500" />
                    <h2 className="text-sm font-bold text-slate-900">
                      Ingresos {periodo === 'hoy' ? 'por hora' : 'por día'}
                    </h2>
                  </div>
                  <Distribucion rows={data.distribucion} />
                </div>
              </div>
            </div>

            {/* ── Por asesor / técnico ── */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-slate-500" />
                <h2 className="text-sm font-bold text-slate-900">Por técnico / asesor — {periodoLabel}</h2>
              </div>
              <AsesorTable rows={data.porAsesor} />
            </div>
          </>
        )}
      </div>

      {/* ── Drill panel ── */}
      {drill && (
        <DrillPanel
          drill={drill}
          periodo={periodo}
          sucursal={sucursalF}
          asesor={asesorF}
          estado={estadoF}
          onClose={() => setDrill(null)}
          onOpenOt={ot => { openOt(ot); setDrill(null); }}
        />
      )}
    </div>
  );
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="9" y="2" width="6" height="4" rx="1" />
      <path d="M9 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2h-3" />
    </svg>
  );
}
