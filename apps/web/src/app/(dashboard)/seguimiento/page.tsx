'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, RefreshCw, ClipboardList, ChevronUp, ChevronDown, ChevronsUpDown, X, LayoutGrid, Table as TableIcon, User, Building2, CalendarClock, Clock, Calendar, Info, Database, BarChart3, CheckCircle2, Timer, FileText } from 'lucide-react';
import Link from 'next/link';
import { OT_ESTADOS, getEstado, resolveEstado, isFacturada, type OtEstado } from '@/lib/ot-estados';

// Devuelve la definición de estado o un fallback gris para estados desconocidos del DMS.
function estadoFromKey(key: string): OtEstado {
  return getEstado(key) ?? {
    key,
    label: key,
    color: '#94a3b8',
    bgColor: 'bg-slate-100',
    textColor: 'text-slate-600',
    borderColor: 'border-slate-300',
    order: 999,
    isOpen: true,
  };
}

// Convierte el summary {key→count} en array ordenado por count desc, con definición de estado.
// Agrupa alias del DMS bajo su clave canónica para evitar claves React duplicadas.
function summaryToList(summary: Record<string, number>): Array<{ estado: OtEstado; count: number }> {
  const merged = new Map<string, { estado: OtEstado; count: number }>();
  for (const [key, count] of Object.entries(summary)) {
    if (count <= 0) continue;
    const estado = estadoFromKey(key);
    const existing = merged.get(estado.key);
    if (existing) {
      existing.count += count;
    } else {
      merged.set(estado.key, { estado, count });
    }
  }
  return Array.from(merged.values()).sort((a, b) => b.count - a.count);
}
import {
  TIPO_SERVICIO_LABELS,
  TIPO_SERVICIO_FAMILIES,
  tipoServicioLabel,
  tipoServicioOption,
  tipoServicioBadgeClass,
} from '@/lib/tipos-servicio';
import { useWorkshop } from '@/context/workshop-context';
import { useWorkshops } from '@/hooks/use-workshops';
import type { OtRow } from '@/app/api/ot-seguimiento/route';
import type { OtDetail } from '@/app/api/ot-detail/[ot]/route';
import { OtDetailPanel } from '@/components/ui/ot-detail-panel';
import { InfoButton } from '@/components/ui/info-button';

type SortKey = 'ot' | 'nombreCliente' | 'modelo' | 'estadoOt' | 'asesor' | 'diasIngreso' | 'fechaIngreso' | 'fechaCompromisoCliente';
type SortDir = 'asc' | 'desc';
type ViewMode = 'table' | 'kanban';

// Tooltip narrativo para los "días abiertos" de una OT
function diasTooltip(dias: number, fechaIngreso: string | null): string {
  const base = fechaIngreso ? ` · ingreso ${fechaIngreso}` : '';
  if (dias <= 0) return `OT abierta hoy${base}`;
  if (dias === 1) return `OT abierta hace 1 día${base}`;
  if (dias > 30)  return `OT abierta hace ${dias} días — atraso crítico (+30 d)${base}`;
  if (dias > 14)  return `OT abierta hace ${dias} días — demora alta (+14 d)${base}`;
  return `OT abierta hace ${dias} días${base}`;
}

const RANGE_OPTIONS: { value: number; label: string }[] = [
  { value: 7,   label: '7 días' },
  { value: 30,  label: '30 días' },
  { value: 90,  label: '90 días' },
  { value: 180, label: '6 meses' },
  { value: 365, label: '1 año' },
  { value: 0,   label: 'Todo' },
];

// Filtro de antigüedad (días mínimos en taller)
const ANTIGUEDAD_OPTIONS: { value: number; label: string }[] = [
  { value: 0,   label: 'Cualquiera' },
  { value: 7,   label: 'Más de 1 semana' },
  { value: 30,  label: 'Más de 1 mes' },
  { value: 60,  label: 'Más de 2 meses' },
  { value: 90,  label: 'Más de 3 meses' },
  { value: 180, label: 'Más de 6 meses' },
];

// Umbrales de alerta por antigüedad (en días). Defaults si el taller no los configuró.
// Configurables por taller desde Settings → Talleres.
const DEFAULT_ALERTA_ATRASO   = 30;
const DEFAULT_ALERTA_CRITICO  = 60;

const todayISO = () => new Date().toISOString().split('T')[0];

// Días entre fecha YYYY-MM-DD y hoy. Sirve para autoajustar el rango cuando se elige una fecha específica.
function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso + 'T00:00:00').getTime();
  return Math.max(1, Math.ceil(ms / 86_400_000) + 1);
}

// Mapa de tipos de servicio centralizado en /lib/tipos-servicio para evitar duplicación.


export default function SeguimientoPage() {
  const [data, setData]         = useState<OtRow[]>([]);
  const [summary, setSummary]   = useState<Record<string, number>>({});
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [sucursalFiltro, setSucursalFiltro] = useState('');
  const [empresaFiltro, setEmpresaFiltro]   = useState('');
  const [asesorFiltro, setAsesorFiltro]     = useState('');
  const [tipoServicioFiltro, setTipoServicioFiltro] = useState('');
  const [antiguedadFiltro, setAntiguedadFiltro] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'ots' | 'presupuestos'>('ots');
  const [sortKey, setSortKey]   = useState<SortKey>('fechaIngreso');
  const [sortDir, setSortDir]   = useState<SortDir>('desc');
  const [rangeDays, setRangeDays] = useState<number>(90);
  const [fechaEspecifica, setFechaEspecifica] = useState<string>('');
  const [truncated, setTruncated] = useState(false);
  const [loadMs, setLoadMs] = useState<number | null>(null);
  // Freshness del snapshot del worker (segundos desde que el worker consultó al DMS).
  // null = los datos vinieron del DMS directo (no hay snapshot disponible).
  const [snapshotAgeS, setSnapshotAgeS] = useState<number | null>(null);
  const [dataSource, setDataSource]     = useState<'worker-snapshot' | 'direct-cache' | 'direct-fresh' | null>(null);
  const [view, setView] = useState<ViewMode>('table');

  // OT detail panel
  const [selectedOtNum, setSelectedOtNum] = useState<number | null>(null);
  const [otDetail, setOtDetail]           = useState<OtDetail | null>(null);
  const [otDetailLoading, setOtDetailLoading] = useState(false);
  const [otDetailError, setOtDetailError]     = useState('');
  const otDetailCache = useRef<Map<number, OtDetail>>(new Map());

  async function openOt(num: number) {
    setSelectedOtNum(num);
    setOtDetailError('');
    const cached = otDetailCache.current.get(num);
    if (cached) {
      setOtDetail(cached);
      return;
    }
    setOtDetail(null);
    setOtDetailLoading(true);
    try {
      const res = await fetch(`/api/ot-detail/${num}`);
      if (!res.ok) throw new Error('No se pudo cargar el detalle de la OT');
      const data: OtDetail = await res.json();
      otDetailCache.current.set(num, data);
      setOtDetail(data);
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

  // Taller activo → si tiene dmsBranch, filtra automáticamente las OTs por esa sucursal del DMS.
  const { workshopId } = useWorkshop();
  const { data: workshops = [] } = useWorkshops();
  const activeWorkshop = useMemo(() => workshops.find(w => w.id === workshopId), [workshops, workshopId]);
  const workshopBranch = activeWorkshop?.dmsBranch ?? null;

  async function fetchData(days = rangeDays, opts: { silent?: boolean; force?: boolean } = {}) {
    if (!opts.silent) setLoading(true);
    setError('');
    const t0 = performance.now();
    try {
      const qs = new URLSearchParams({ soloAbiertas: 'true', days: String(days), limit: '5000' });
      if (opts.force) qs.set('force', '1');
      const res = await fetch(`/api/ot-seguimiento?${qs}`);
      if (!res.ok) throw new Error('Error al cargar datos');
      const json = await res.json();
      setData(json.data);
      setSummary(json.summary);
      setTruncated(!!json.truncated);
      // Metadata de freshness: el endpoint adjunta source y ageSeconds en el body
      // (y también en headers, pero el body es más portátil con json normal).
      setDataSource(json.source ?? (res.headers.get('X-Source') as any) ?? null);
      const ageHeader = res.headers.get('X-Snapshot-Age-Seconds');
      const ageBody   = json.ageSeconds;
      setSnapshotAgeS(ageBody != null ? Number(ageBody) : ageHeader ? Number(ageHeader) : null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      if (!opts.silent) setLoading(false);
      setLoadMs(Math.round(performance.now() - t0));
    }
  }

  useEffect(() => { fetchData(rangeDays); }, [rangeDays]);

  // Polling 30 s, solo cuando la pestaña está visible. No muestra spinner para no
  // distraer al usuario; los datos se actualizan en silencio.
  useEffect(() => {
    const POLL_MS = 30_000;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchData(rangeDays, { silent: true });
      }
    }, POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeDays]);

  // Refresh cuando vuelve el foco a la pestaña (después de cambio de tab/screen).
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') {
        fetchData(rangeDays, { silent: true });
      }
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeDays]);

  // Si se elige una fecha específica fuera del rango cargado, expandir automáticamente
  useEffect(() => {
    if (!fechaEspecifica) return;
    const needed = daysSince(fechaEspecifica);
    if (rangeDays !== 0 && needed > rangeDays) setRangeDays(needed);
  }, [fechaEspecifica]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  // Umbrales de alerta vienen del taller activo (configurables en /settings/workshops).
  // Si están vacíos o son inválidos, caen a los defaults globales.
  const alertaAtraso  = Number(activeWorkshop?.alertAtrasoDays  ?? DEFAULT_ALERTA_ATRASO);
  const alertaCritico = Number(activeWorkshop?.alertCriticoDays ?? DEFAULT_ALERTA_CRITICO);

  // Conteos para el banner de alerta de antigüedad.
  // Aplican solo el filtro de sucursal del taller activo (la métrica representa el universo
  // que el operador realmente gestiona, no los demás filtros locales).
  const alertaCounts = useMemo(() => {
    const universo = workshopBranch
      ? data.filter(r => r.sucursal === workshopBranch)
      : data;
    return {
      atraso:     universo.filter(r => !isFacturada(r.estadoFinanciero) && r.diasIngreso > alertaAtraso  && r.diasIngreso <= alertaCritico).length,
      critico:    universo.filter(r => !isFacturada(r.estadoFinanciero) && r.diasIngreso > alertaCritico).length,
      facturadas: universo.filter(r => isFacturada(r.estadoFinanciero)).length,
    };
  }, [data, workshopBranch, alertaAtraso, alertaCritico]);

  const filtered = useMemo(() => {
    let rows = data;
    if (activeTab === 'ots') rows = rows.filter(r => (r.estadoIdis || r.estadoOt) !== 'En Presupuesto');
    else                     rows = rows.filter(r => (r.estadoIdis || r.estadoOt) === 'En Presupuesto');
    // Filtro automático: SOLO aplica si el taller activo tiene su propia sucursal del DMS
    // configurada. Si no, el usuario ve todas las OTs (los demás talleres no se ven afectados
    // por las sucursales que tengan configuradas otros talleres).
    if (workshopBranch) {
      rows = rows.filter(r => r.sucursal === workshopBranch);
    }
    if (fechaEspecifica)    rows = rows.filter(r => r.fechaIngreso === fechaEspecifica);
    if (estadoFiltro)       rows = rows.filter(r => (r.estadoIdis || r.estadoOt) === estadoFiltro);
    if (sucursalFiltro)     rows = rows.filter(r => r.sucursal === sucursalFiltro);
    if (empresaFiltro)      rows = rows.filter(r => r.empresa === empresaFiltro);
    if (asesorFiltro)       rows = rows.filter(r => r.asesor === asesorFiltro);
    if (tipoServicioFiltro) rows = rows.filter(r => r.tipoServicio === tipoServicioFiltro);
    if (antiguedadFiltro > 0) rows = rows.filter(r => r.diasIngreso > antiguedadFiltro);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(r =>
        String(r.ot).includes(q) ||
        r.nombreCliente.toLowerCase().includes(q) ||
        r.chasis.toLowerCase().includes(q) ||
        r.modelo.toLowerCase().includes(q) ||
        r.asesor.toLowerCase().includes(q)
      );
    }
    return [...rows].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      const cmp = String(av) < String(bv) ? -1 : String(av) > String(bv) ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, activeTab, workshopBranch, fechaEspecifica, estadoFiltro, sucursalFiltro, empresaFiltro, asesorFiltro, tipoServicioFiltro, antiguedadFiltro, search, sortKey, sortDir]);

  // Base filtrada sin estadoFiltro ni sort — usada para el kanban bar y pills
  // para que reflejen los filtros activos (sucursal, asesor, etc.) pero sigan mostrando
  // la distribución de todos los estados (no solo el estado seleccionado).
  const filteredBase = useMemo(() => {
    let rows = data;
    if (activeTab === 'ots') rows = rows.filter(r => (r.estadoIdis || r.estadoOt) !== 'En Presupuesto');
    else                     rows = rows.filter(r => (r.estadoIdis || r.estadoOt) === 'En Presupuesto');
    if (workshopBranch)      rows = rows.filter(r => r.sucursal === workshopBranch);
    if (fechaEspecifica)     rows = rows.filter(r => r.fechaIngreso === fechaEspecifica);
    if (sucursalFiltro)      rows = rows.filter(r => r.sucursal === sucursalFiltro);
    if (empresaFiltro)       rows = rows.filter(r => r.empresa === empresaFiltro);
    if (asesorFiltro)        rows = rows.filter(r => r.asesor === asesorFiltro);
    if (tipoServicioFiltro)  rows = rows.filter(r => r.tipoServicio === tipoServicioFiltro);
    if (antiguedadFiltro > 0) rows = rows.filter(r => r.diasIngreso > antiguedadFiltro);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(r =>
        String(r.ot).includes(q) ||
        r.nombreCliente.toLowerCase().includes(q) ||
        r.chasis.toLowerCase().includes(q) ||
        r.modelo.toLowerCase().includes(q) ||
        r.asesor.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [data, activeTab, workshopBranch, fechaEspecifica, sucursalFiltro, empresaFiltro, asesorFiltro, tipoServicioFiltro, antiguedadFiltro, search]);

  const filteredSummary = useMemo(() => {
    const s: Record<string, number> = {};
    for (const row of filteredBase) {
      const k = row.estadoIdis || row.estadoOt;
      s[k] = (s[k] ?? 0) + 1;
    }
    return s;
  }, [filteredBase]);

  const presupuestosBySucursal = useMemo(() => {
    const rows = data.filter(r => (r.estadoIdis || r.estadoOt) === 'En Presupuesto');
    const map = new Map<string, number>();
    for (const r of rows) {
      const suc = r.sucursal || '(sin sucursal)';
      map.set(suc, (map.get(suc) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([sucursal, total]) => ({ sucursal, total }));
  }, [data]);

  // Opciones de dropdowns derivadas de filteredBase (respetan el tab activo y filtros aplicados).
  const sucursales = useMemo(() => {
    if (workshopBranch) return [workshopBranch];
    return Array.from(new Set(filteredBase.map(r => r.sucursal).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [filteredBase, workshopBranch]);
  const asesores = useMemo(
    () => Array.from(new Set(filteredBase.map(r => r.asesor).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [filteredBase],
  );
  const tiposServicio = useMemo(
    () => Array.from(new Set(filteredBase.map(r => r.tipoServicio).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [filteredBase],
  );
  const empresas = useMemo(
    () => Array.from(new Set(data.map(r => r.empresa).filter(Boolean) as string[])).sort(),
    [data],
  );

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronsUpDown className="h-3 w-3 text-slate-300 inline ml-1" />;
    return sortDir === 'asc'
      ? <ChevronUp className="h-3 w-3 text-blue-500 inline ml-1" />
      : <ChevronDown className="h-3 w-3 text-blue-500 inline ml-1" />;
  }

  function EstadoBadge({ estado }: { estado: string }) {
    const e = getEstado(estado);
    if (!e) return <span className="text-xs text-slate-400">{estado}</span>;
    return (
      <span
        className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${e.bgColor} ${e.textColor} ${e.borderColor} whitespace-nowrap`}
        title={`Estado actual de la OT: ${e.label}`}
      >
        <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: e.color }} />
        {e.label}
      </span>
    );
  }

  const totalFiltrados = filtered.length;

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-sm">
              <ClipboardList className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900">Seguimiento de OTs</h1>
                <InfoButton helpKey="seguimiento" />
              </div>
              <p className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                <span>{totalFiltrados.toLocaleString()} órdenes{estadoFiltro ? ` · ${estadoFiltro}` : ' · todos los estados'}</span>
                {loadMs !== null && <span className="text-slate-300">· {loadMs}ms</span>}
                {truncated && <span className="text-amber-600 font-semibold">· truncado a 10.000</span>}
                <FreshnessBadge ageS={snapshotAgeS} source={dataSource} />
              </p>
              {workshopBranch && activeWorkshop && (
                <div
                  className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200"
                  title={`Filtro fijo por sucursal del DMS configurada en el taller "${activeWorkshop.name}"`}
                >
                  <Database className="h-3 w-3" />
                  Taller {activeWorkshop.name} · solo OTs de {workshopBranch}
                </div>
              )}

              {/* Banner de alerta de antigüedad — chips clickeables que aplican el filtro */}
              {(alertaCounts.atraso > 0 || alertaCounts.critico > 0 || alertaCounts.facturadas > 0) && (
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Alertas:</span>
                  {alertaCounts.critico > 0 && (
                    <button
                      onClick={() => setAntiguedadFiltro(alertaCritico)}
                      title={`Ver las ${alertaCounts.critico} OTs con +${alertaCritico} días en taller`}
                      className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full border transition-all hover:shadow-sm ${
                        antiguedadFiltro === alertaCritico
                          ? 'bg-red-600 text-white border-red-600'
                          : 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${antiguedadFiltro === alertaCritico ? 'bg-white' : 'bg-red-500 animate-pulse'}`} />
                      🔴 {alertaCounts.critico} {alertaCounts.critico === 1 ? 'OT crítica' : 'OTs críticas'} (+{alertaCritico} d)
                    </button>
                  )}
                  {alertaCounts.atraso > 0 && (
                    <button
                      onClick={() => setAntiguedadFiltro(alertaAtraso)}
                      title={`Ver las ${alertaCounts.atraso} OTs con más de ${alertaAtraso} días (sin contar las críticas)`}
                      className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full border transition-all hover:shadow-sm ${
                        antiguedadFiltro === alertaAtraso
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${antiguedadFiltro === alertaAtraso ? 'bg-white' : 'bg-amber-500'}`} />
                      🟠 {alertaCounts.atraso} en atraso (+{alertaAtraso} d)
                    </button>
                  )}
                  {alertaCounts.facturadas > 0 && (
                    <span
                      className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full border bg-emerald-100 text-emerald-700 border-emerald-300"
                      title="OTs ya facturadas al cliente · están abiertas operativamente pero el cliente está conforme"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      {alertaCounts.facturadas} {alertaCounts.facturadas === 1 ? 'facturada' : 'facturadas'} (cliente OK)
                    </span>
                  )}
                  {(antiguedadFiltro === alertaAtraso || antiguedadFiltro === alertaCritico) && (
                    <button
                      onClick={() => setAntiguedadFiltro(0)}
                      className="text-[11px] text-slate-400 hover:text-slate-700 font-medium"
                      title="Quitar filtro de antigüedad"
                    >
                      ← ver todas
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Botones de acción: vista + navegación — siempre arriba a la derecha */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
              <button
                onClick={() => setView('table')}
                className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-md font-medium transition-all ${
                  view === 'table' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
                }`}
                title="Vista tabla"
              >
                <TableIcon className="h-3.5 w-3.5" /> Tabla
              </button>
              <button
                onClick={() => setView('kanban')}
                className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-md font-medium transition-all ${
                  view === 'kanban' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
                }`}
                title="Vista kanban"
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Kanban
              </button>
            </div>
            <TipoServicioLegend />
<Link
              href="/seguimiento/operativo"
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600 transition-all shadow-sm font-medium"
              title="Reporte operativo del día"
            >
              <BarChart3 className="h-3.5 w-3.5" /> Operativo
            </Link>
            <Link
              href="/seguimiento/reportes"
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 transition-all shadow-sm font-medium"
              title="Reportes ejecutivos"
            >
              <BarChart3 className="h-3.5 w-3.5" /> Reportes
            </Link>
          </div>
        </div>

        {/* Tabs: OTs · Presupuestos */}
        <div className="flex items-center gap-1 mt-4 border-b border-slate-200">
          {([
            { key: 'ots',          label: 'OTs',          icon: ClipboardList },
            { key: 'presupuestos', label: 'Presupuestos', icon: FileText       },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => { setActiveTab(key); setEstadoFiltro(''); }}
              className={`flex items-center gap-1.5 text-sm font-medium px-4 py-2 border-b-2 transition-all -mb-px ${
                activeTab === key
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              <span className={`ml-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
                activeTab === key ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {key === 'ots'
                  ? data.filter(r => (r.estadoIdis || r.estadoOt) !== 'En Presupuesto').length
                  : data.filter(r => (r.estadoIdis || r.estadoOt) === 'En Presupuesto').length}
              </span>
            </button>
          ))}
        </div>

        {/* Segunda fila: filtros */}
        <div className="flex items-center gap-2 flex-wrap mt-3">
            {/* Atajos: Hoy / Esta semana */}
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5" title="Atajos de fecha de ingreso">
              <button
                onClick={() => { setFechaEspecifica(todayISO()); }}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all ${
                  fechaEspecifica === todayISO() ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700'
                }`}
                title="Mostrar solo OTs ingresadas HOY"
              >
                Hoy
              </button>
              <button
                onClick={() => { setFechaEspecifica(''); setRangeDays(7); }}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all ${
                  rangeDays === 7 && !fechaEspecifica ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700'
                }`}
                title="Últimos 7 días (semana actual)"
              >
                Semana
              </button>
            </div>

            {/* Selector de fecha específica */}
            <div className="relative">
              <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                type="date"
                value={fechaEspecifica}
                onChange={e => setFechaEspecifica(e.target.value)}
                max={todayISO()}
                className="pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                title="Elegí una fecha específica de ingreso al taller"
              />
              {fechaEspecifica && (
                <button
                  onClick={() => setFechaEspecifica('')}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-slate-100"
                  title="Quitar filtro de fecha"
                >
                  <X className="h-3 w-3 text-slate-400" />
                </button>
              )}
            </div>

            <select
              value={rangeDays}
              onChange={e => { setRangeDays(Number(e.target.value)); setFechaEspecifica(''); }}
              disabled={loading}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50"
              title="Ventana de fecha de ingreso al taller"
            >
              {RANGE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.value === 0 ? 'Todo el histórico' : `Últimos ${opt.label}`}</option>
              ))}
            </select>
            {empresas.length > 1 && (
              <select
                value={empresaFiltro}
                onChange={e => { setEmpresaFiltro(e.target.value); }}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                title="Filtrar por empresa"
              >
                <option value="">Todas las empresas</option>
                {empresas.map(e => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            )}
            <select
              value={sucursalFiltro}
              onChange={e => setSucursalFiltro(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 max-w-[160px]"
              title="Filtrar por sucursal"
            >
              <option value="">Todas las sucursales</option>
              {sucursales.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={asesorFiltro}
              onChange={e => setAsesorFiltro(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 max-w-[180px]"
              title="Filtrar por asesor"
            >
              <option value="">Todos los asesores</option>
              {asesores.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <select
              value={tipoServicioFiltro}
              onChange={e => setTipoServicioFiltro(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 max-w-[200px]"
              title="Filtrar por tipo de servicio"
            >
              <option value="">Todos los tipos</option>
              {tiposServicio.map(t => (
                <option key={t} value={t}>{tipoServicioOption(t)}</option>
              ))}
            </select>
            <select
              value={antiguedadFiltro}
              onChange={e => setAntiguedadFiltro(Number(e.target.value))}
              className={`text-xs border rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                antiguedadFiltro > 0 ? 'border-red-300 text-red-700 font-semibold' : 'border-slate-200'
              }`}
              title="Filtrar por antigüedad en taller"
            >
              {ANTIGUEDAD_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="OT, cliente, chasis, modelo..."
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 w-56"
              />
            </div>
            <button onClick={() => fetchData(rangeDays, { force: true })} disabled={loading}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
        </div>

        {/* Barra Kanban: distribución de todos los estados como % sobre 100 */}
        <EstadosKanbanBar
          summary={filteredSummary}
          total={filteredBase.length}
          activo={estadoFiltro}
          onChange={setEstadoFiltro}
        />

        {/* Pills de estado: top 5 inline + dropdown "Más" */}
        <EstadosPills
          summary={filteredSummary}
          totalAll={filteredBase.length}
          activo={estadoFiltro}
          onChange={setEstadoFiltro}
        />

        {/* Chips de filtros activos */}
        {(fechaEspecifica || sucursalFiltro || empresaFiltro || asesorFiltro || search.trim()) && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Filtros:</span>
            {fechaEspecifica && (
              <FilterChip
                label={fechaEspecifica === todayISO() ? 'Hoy' : 'Fecha'}
                value={fechaEspecifica}
                onClear={() => setFechaEspecifica('')}
                tone="indigo"
              />
            )}
            {sucursalFiltro && (
              <FilterChip label="Sucursal" value={sucursalFiltro} onClear={() => setSucursalFiltro('')} tone="indigo" />
            )}
            {empresaFiltro && (
              <FilterChip label="Empresa" value={empresaFiltro} onClear={() => setEmpresaFiltro('')} tone="indigo" />
            )}
            {asesorFiltro && (
              <FilterChip label="Asesor" value={asesorFiltro} onClear={() => setAsesorFiltro('')} tone="emerald" />
            )}
            {antiguedadFiltro > 0 && (
              <FilterChip
                label="Antigüedad"
                value={ANTIGUEDAD_OPTIONS.find(o => o.value === antiguedadFiltro)?.label ?? `>${antiguedadFiltro}d`}
                onClear={() => setAntiguedadFiltro(0)}
                tone="red"
              />
            )}
            {search.trim() && (
              <FilterChip label="Búsqueda" value={search.trim()} onClear={() => setSearch('')} tone="slate" />
            )}
            <button
              onClick={() => { setFechaEspecifica(''); setSucursalFiltro(''); setEmpresaFiltro(''); setAsesorFiltro(''); setAntiguedadFiltro(0); setSearch(''); }}
              className="text-[11px] font-semibold text-slate-400 hover:text-red-500 transition-colors ml-1"
            >
              Limpiar todo
            </button>
          </div>
        )}
      </div>

      {/* Presupuestos por sucursal — solo visible en tab Presupuestos */}
      {activeTab === 'presupuestos' && presupuestosBySucursal.length > 0 && (
        <div className="px-6 py-4 bg-white border-b border-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Presupuestos por sucursal</p>
          <div className="flex flex-wrap gap-3">
            {presupuestosBySucursal.map(({ sucursal, total }) => (
              <button
                key={sucursal}
                onClick={() => setSucursalFiltro(sucursalFiltro === sucursal ? '' : sucursal)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                  sucursalFiltro === sucursal
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/50'
                }`}
              >
                <Building2 className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                <span className="font-medium">{sucursal}</span>
                <span className="ml-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{total}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Body: Tabla o Kanban */}
      <div className="flex-1 overflow-auto">
        {error ? (
          <div className="flex items-center justify-center h-40 text-sm text-red-500">{error}</div>
        ) : loading ? (
          <div className="flex items-center justify-center h-40 gap-3 text-slate-400">
            <div className="h-5 w-5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
            <span className="text-sm">Cargando OTs desde DMS...</span>
          </div>
        ) : view === 'kanban' ? (
          <KanbanView rows={filtered} onCardClick={openOt} />
        ) : (
          <table className="min-w-full text-xs">
            <thead className="bg-white border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <th onClick={() => toggleSort('ot')} title="Número de Orden de Trabajo en el DMS" className="text-left px-4 py-3 font-semibold text-slate-600 cursor-pointer whitespace-nowrap hover:text-slate-900">
                  OT <SortIcon k="ot" />
                </th>
                <th onClick={() => toggleSort('nombreCliente')} title="Nombre del cliente titular del vehículo" className="text-left px-4 py-3 font-semibold text-slate-600 cursor-pointer hover:text-slate-900">
                  Cliente <SortIcon k="nombreCliente" />
                </th>
                <th onClick={() => toggleSort('modelo')} title="Modelo del vehículo" className="text-left px-4 py-3 font-semibold text-slate-600 cursor-pointer whitespace-nowrap hover:text-slate-900">
                  Modelo <SortIcon k="modelo" />
                </th>
                <th title="Número de chasis (VIN) del vehículo" className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Chasis</th>
                <th onClick={() => toggleSort('estadoOt')} title="Estado actual de la OT en el flujo del taller" className="text-left px-4 py-3 font-semibold text-slate-600 cursor-pointer whitespace-nowrap hover:text-slate-900">
                  Estado <SortIcon k="estadoOt" />
                </th>
                <th onClick={() => toggleSort('asesor')} title="Asesor de servicio asignado a la OT" className="text-left px-4 py-3 font-semibold text-slate-600 cursor-pointer hover:text-slate-900">
                  Asesor <SortIcon k="asesor" />
                </th>
                <th title="Tipo de servicio (MC=Correctivo · SC=Programado · GAR=Garantía · INT=Interno)" className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">
                  Tipo
                </th>
                <th onClick={() => toggleSort('fechaIngreso')} title="Fecha en que el vehículo ingresó al taller" className="text-left px-4 py-3 font-semibold text-slate-600 cursor-pointer whitespace-nowrap hover:text-slate-900">
                  Ingreso <SortIcon k="fechaIngreso" />
                </th>
                <th onClick={() => toggleSort('fechaCompromisoCliente')} title="Fecha de entrega comprometida con el cliente. Si está en rojo, ya está vencida." className="text-left px-4 py-3 font-semibold text-slate-600 cursor-pointer whitespace-nowrap hover:text-slate-900">
                  Compromiso <SortIcon k="fechaCompromisoCliente" />
                </th>
                <th onClick={() => toggleSort('diasIngreso')} title="Días que la OT lleva abierta desde el ingreso al taller. Verde ≤14 d · Ámbar 15-30 d · Rojo +30 d" className="text-right px-4 py-3 font-semibold text-slate-600 cursor-pointer whitespace-nowrap hover:text-slate-900">
                  Días <SortIcon k="diasIngreso" />
                </th>
                <th title="Sucursal donde está siendo atendida la OT" className="text-left px-4 py-3 font-semibold text-slate-600">Sucursal</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-12 text-slate-400">Sin resultados</td></tr>
              ) : (
                filtered.map((row, i) => {
                  const facturada = isFacturada(row.estadoFinanciero);
                  // Si está facturada el cliente está conforme — el verde gana al rojo
                  // de antigüedad. La fila se acentúa en verde y no en rojo/ámbar.
                  const isCritico = !facturada && row.diasIngreso > alertaCritico;
                  const isAtraso  = !facturada && !isCritico && row.diasIngreso > alertaAtraso;
                  const rowAccent = facturada ? 'border-l-4 border-l-emerald-500'
                                  : isCritico ? 'border-l-4 border-l-red-500'
                                  : isAtraso   ? 'border-l-4 border-l-amber-500'
                                  : '';
                  return (
                  <tr key={row.ot} onClick={() => openOt(row.ot)} className={`border-b border-slate-100 hover:bg-blue-50/40 transition-colors cursor-pointer ${rowAccent} ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                    <td className="px-4 py-2.5 font-bold text-slate-800 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        {row.ot}
                        {facturada && (
                          <span
                            className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded border bg-emerald-100 text-emerald-700 border-emerald-300"
                            title={`Estado financiero: ${row.estadoFinanciero || 'FACTURADO'} · cliente OK, falta cierre operativo`}
                          >
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            Fact.
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700 max-w-[220px] truncate" title={row.nombreCliente}>{row.nombreCliente || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{row.modelo || '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-500 text-[10px] whitespace-nowrap">{row.chasis || '—'}</td>
                    <td className="px-4 py-2.5"><EstadoBadge estado={row.estadoIdis || row.estadoOt} /></td>
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{row.asesor || '—'}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {row.tipoServicio
                        ? <TipoServicioBadge tipo={row.tipoServicio} variant="table" />
                        : <span className="text-slate-300" title="Sin tipo de servicio registrado">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap" title={row.fechaIngreso ? `Ingresó al taller el ${row.fechaIngreso}${row.horaIngreso ? ` a las ${row.horaIngreso}` : ' · sin hora registrada'}` : 'Sin fecha de ingreso registrada'}>
                      {row.fechaIngreso ?? '—'}
                      {row.fechaIngreso && (
                        row.horaIngreso
                          ? <span className="ml-1.5 text-[10px] font-mono text-slate-400">{row.horaIngreso}</span>
                          : <span className="ml-1.5 text-[10px] text-slate-300 italic">sin hora</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {row.fechaCompromisoCliente
                        ? (() => {
                            const vencido = row.fechaCompromisoCliente < new Date().toISOString().split('T')[0];
                            return (
                              <span
                                className={vencido ? 'text-red-600 font-semibold' : 'text-slate-500'}
                                title={vencido
                                  ? `Compromiso vencido: debió entregarse el ${row.fechaCompromisoCliente}`
                                  : `Fecha comprometida con el cliente: ${row.fechaCompromisoCliente}`}
                              >
                                {row.fechaCompromisoCliente}
                              </span>
                            );
                          })()
                        : <span className="text-slate-300" title="Sin fecha de compromiso registrada">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <DaysBadge dias={row.diasIngreso} fechaIngreso={row.fechaIngreso} variant="text" />
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{row.sucursal || '—'}</td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      <OtDetailPanel
        otNum={selectedOtNum}
        detail={otDetail}
        loading={otDetailLoading}
        error={otDetailError}
        onClose={closeOt}
      />
    </div>
  );
}

// ─── Kanban view ──────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().split('T')[0];

function KanbanView({ rows, onCardClick }: { rows: OtRow[]; onCardClick: (ot: number) => void }) {
  // Agrupar desde los datos reales — incluye estados desconocidos del DMS
  const columns = useMemo(() => {
    const grouped = new Map<string, OtRow[]>();
    for (const r of rows) {
      // Resolver alias DMS → clave canónica antes de agrupar
      const key = resolveEstado(r.estadoIdis || r.estadoOt);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(r);
    }
    // Primero los estados conocidos (en su orden), luego los desconocidos al final
    const known = OT_ESTADOS.filter(e => grouped.has(e.key)).map(e => ({ estado: e, items: grouped.get(e.key)! }));
    const knownKeys = new Set(OT_ESTADOS.map(e => e.key));
    const unknown = [...grouped.entries()]
      .filter(([k]) => !knownKeys.has(k))
      .map(([k, items]) => ({ estado: estadoFromKey(k), items }))
      .sort((a, b) => b.items.length - a.items.length);
    return [...known, ...unknown];
  }, [rows]);

  if (columns.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-slate-400">
        Sin OTs para los filtros aplicados.
      </div>
    );
  }

  return (
    <div className="h-full overflow-x-auto p-4">
      <div className="flex gap-3 h-full" style={{ minWidth: `${columns.length * 296}px` }}>
        {columns.map(({ estado, items }) => (
          <div key={estado.key} className="flex flex-col w-72 flex-shrink-0">
            {/* Column header */}
            <div className={`flex items-center justify-between px-3 py-2 rounded-t-lg border ${estado.bgColor} ${estado.borderColor}`}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: estado.color }} />
                <span className={`text-xs font-bold ${estado.textColor} truncate`}>{estado.label}</span>
              </div>
              <span className={`text-xs font-bold ${estado.textColor} bg-white/70 px-1.5 py-0.5 rounded-full flex-shrink-0`}>
                {items.length}
              </span>
            </div>
            {/* Column body */}
            <div className="flex-1 overflow-y-auto bg-slate-50 border-x border-b border-slate-200 rounded-b-lg p-2 space-y-2">
              {items.map(row => (
                <KanbanCard key={row.ot} row={row} estadoColor={estado.color} onClick={() => onCardClick(row.ot)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function KanbanCard({ row, estadoColor, onClick }: { row: OtRow; estadoColor: string; onClick: () => void }) {
  const compromisoVencido = !!row.fechaCompromisoCliente && row.fechaCompromisoCliente < today();
  const facturada = isFacturada(row.estadoFinanciero);
  // Si la OT ya está facturada, el cliente está conforme — la operativa solo
  // tiene que cerrar el ticket interno. No la pintamos en rojo aunque tenga
  // muchos días en taller; el verde "OK" gana al rojo de atraso.
  const critical = !facturada && (row.diasIngreso > 30 || compromisoVencido);
  const cardClass = facturada
    ? 'bg-emerald-50 rounded-lg border-2 border-emerald-300 ring-1 ring-emerald-200 hover:ring-emerald-300 hover:shadow-md transition-all overflow-hidden cursor-pointer'
    : critical
      ? 'bg-red-50 rounded-lg border-2 border-red-300 ring-1 ring-red-200 hover:ring-red-300 hover:shadow-md transition-all overflow-hidden cursor-pointer'
      : 'bg-white rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all overflow-hidden cursor-pointer';

  return (
    <div
      className={cardClass}
      title={row.observaciones || `OT ${row.ot} · click para ver detalle`}
      onClick={onClick}
    >
      <div className="h-1 w-full" style={{ background: estadoColor }} />
      <div className="p-2.5 space-y-1.5">
        {/* Header: OT # + días */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-bold text-slate-900" title={`Número de Orden de Trabajo: ${row.ot}`}>#{row.ot}</span>
            {row.tipoServicio && (
              <TipoServicioBadge tipo={row.tipoServicio} variant="card" />
            )}
            {facturada && (
              <span
                className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded border bg-emerald-100 text-emerald-700 border-emerald-300"
                title={`Estado financiero: ${row.estadoFinanciero || 'FACTURADO'} · cliente OK, falta cierre operativo`}
                onClick={(e) => e.stopPropagation()}
              >
                <CheckCircle2 className="h-2.5 w-2.5" />
                Facturada
              </span>
            )}
          </div>
          <DaysBadge dias={row.diasIngreso} fechaIngreso={row.fechaIngreso} variant="pill" />
        </div>

        {/* Cliente */}
        <p className="text-xs font-semibold text-slate-800 truncate" title={`Cliente: ${row.nombreCliente || '—'}`}>
          {row.nombreCliente || '—'}
        </p>

        {/* Modelo + chasis */}
        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
          <span className="truncate" title={`Modelo: ${row.modelo || '—'}`}>{row.modelo || '—'}</span>
          {row.chasis && (
            <span className="font-mono text-[10px] text-slate-400 flex-shrink-0" title={`Chasis (VIN): ${row.chasis}`}>…{row.chasis.slice(-6)}</span>
          )}
        </div>

        {/* Asesor */}
        {row.asesor && (
          <div className="flex items-center gap-1 text-[11px] text-slate-500" title={`Asesor de servicio: ${row.asesor}`}>
            <User className="h-3 w-3 text-slate-400 flex-shrink-0" />
            <span className="truncate">{row.asesor}</span>
          </div>
        )}

        {/* Sucursal */}
        {row.sucursal && (
          <div className="flex items-center gap-1 text-[11px] text-slate-500" title={`Sucursal: ${row.sucursal}`}>
            <Building2 className="h-3 w-3 text-slate-400 flex-shrink-0" />
            <span className="truncate">{row.sucursal}</span>
          </div>
        )}

        {/* Hora de ingreso */}
        {row.fechaIngreso && (
          <div className="flex items-center gap-1 text-[11px] text-slate-400" title={`Ingresó el ${row.fechaIngreso}${row.horaIngreso ? ` a las ${row.horaIngreso}` : ' · sin hora registrada'}`}>
            <Clock className="h-3 w-3 flex-shrink-0" />
            <span>
              {row.fechaIngreso}
              {row.horaIngreso
                ? <span className="font-mono ml-1">{row.horaIngreso}</span>
                : <span className="ml-1 italic text-slate-300">sin hora</span>
              }
            </span>
          </div>
        )}

        {/* Fecha compromiso */}
        {row.fechaCompromisoCliente && (
          <div
            className={`flex items-center gap-1 text-[11px] ${compromisoVencido ? 'text-red-600 font-semibold' : 'text-slate-500'}`}
            title={compromisoVencido
              ? `Compromiso vencido: debió entregarse el ${row.fechaCompromisoCliente}`
              : `Fecha comprometida con el cliente: ${row.fechaCompromisoCliente}`}
          >
            <CalendarClock className="h-3 w-3 flex-shrink-0" />
            <span>
              Compromiso: {row.fechaCompromisoCliente}
              {compromisoVencido && ' · vencido'}
            </span>
          </div>
        )}

        {/* Tiempo en estado actual */}
        {row.diasEnEstado > 0 && (
          <div
            className="flex items-center gap-1 text-[11px] text-slate-400 border-t border-slate-100 pt-1.5 mt-0.5"
            title={`Lleva ${row.diasEnEstado}d en el estado "${row.estadoOt}" · total en taller: ${row.diasIngreso}d`}
          >
            <Timer className="h-3 w-3 flex-shrink-0" />
            <span>
              <span className={`font-bold ${row.diasEnEstado > 14 ? 'text-amber-600' : 'text-slate-500'}`}>{row.diasEnEstado}d</span>
              {' en estado actual'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── DaysBadge ──────────────────────────────────────────────────────────────
// Click en el "Xd" → muestra una burbuja con el significado narrativo.
// Click afuera o segundo click sobre el badge la cierra.

function DaysBadge({
  dias,
  fechaIngreso,
  variant,
}: {
  dias: number;
  fechaIngreso: string | null;
  variant: 'text' | 'pill';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const tone = dias > 30 ? 'critical' : dias > 14 ? 'warning' : 'normal';
  const text = diasTooltip(dias, fechaIngreso);

  const triggerClasses = variant === 'pill'
    ? `text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-0.5 cursor-pointer hover:ring-2 hover:ring-offset-1 transition-all ${
        tone === 'critical' ? 'bg-red-100 text-red-700 hover:ring-red-300'
        : tone === 'warning' ? 'bg-amber-100 text-amber-700 hover:ring-amber-300'
        :                      'bg-slate-100 text-slate-500 hover:ring-slate-300'
      }`
    : `font-semibold cursor-pointer hover:underline decoration-dotted underline-offset-2 ${
        tone === 'critical' ? 'text-red-600' : tone === 'warning' ? 'text-amber-600' : 'text-slate-600'
      }`;

  // Burbuja anclada por la derecha del trigger en ambos variantes:
  // crece hacia la izquierda → nunca se sale del card del kanban.
  const bubbleClasses = `absolute z-50 mt-1.5 right-0
    w-60 max-w-[calc(100vw-2rem)] px-3 py-2 rounded-lg shadow-lg border text-[11px] leading-snug
    ${tone === 'critical' ? 'bg-red-50 border-red-200 text-red-900'
      : tone === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-900'
      :                      'bg-white border-slate-200 text-slate-700'}`;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className={triggerClasses}
        aria-expanded={open}
        aria-label={`${dias} días en taller, click para detalle`}
      >
        {variant === 'pill' && <Clock className="h-2.5 w-2.5" />}
        {dias}d
      </button>

      {open && (
        <div className={bubbleClasses} role="dialog">
          {text}
        </div>
      )}
    </div>
  );
}

// ─── EstadosKanbanBar ────────────────────────────────────────────────────────
// Barra apilada con la distribución de OTs por estado como % sobre 100.
// Cada segmento es proporcional al conteo. Click → filtra por ese estado.

function EstadosKanbanBar({
  summary,
  total,
  activo,
  onChange,
}: {
  summary: Record<string, number>;
  total: number;
  activo: string;
  onChange: (k: string) => void;
}) {
  if (total === 0) return null;

  const conDatos = summaryToList(summary);
  if (conDatos.length === 0) return null;

  return (
    <div className="mt-3 space-y-1.5">
      {/* Barra apilada */}
      <div className="flex h-5 rounded-lg overflow-hidden gap-px">
        {conDatos.map(({ estado, count }) => {
          const pct = (count / total) * 100;
          const isActivo = activo === estado.key;
          return (
            <button
              key={estado.key}
              type="button"
              onClick={() => onChange(isActivo ? '' : estado.key)}
              style={{ width: `${pct}%`, backgroundColor: estado.color, minWidth: pct > 0.3 ? undefined : 2 }}
              className={`h-full transition-all hover:brightness-110 hover:z-10 relative ${
                activo && !isActivo ? 'opacity-30' : 'opacity-100'
              }`}
              title={`${estado.label}: ${count.toLocaleString()} OTs · ${pct.toFixed(1)}%`}
            />
          );
        })}
      </div>

      {/* Leyenda con badges clickeables */}
      <div className="flex flex-wrap gap-1">
        {conDatos.map(({ estado, count }) => {
          const pct = ((count / total) * 100).toFixed(1);
          const isActivo = activo === estado.key;
          return (
            <button
              key={estado.key}
              type="button"
              onClick={() => onChange(isActivo ? '' : estado.key)}
              className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border transition-all ${
                isActivo
                  ? `${estado.bgColor} ${estado.textColor} ${estado.borderColor} ring-1 ring-offset-1`
                  : activo
                    ? 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
              }`}
              title={`Filtrar por ${estado.label} · ${count.toLocaleString()} OTs · ${pct}%`}
            >
              <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: estado.color }} />
              {estado.shortLabel ?? estado.label}
              <span className="tabular-nums font-bold">{count.toLocaleString()}</span>
              <span className="opacity-50">{pct}%</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── EstadosPills ───────────────────────────────────────────────────────────
// Top 5 estados con más OTs visibles inline. El resto colapsado en un dropdown
// "Más (N) ▼". Si el filtro activo es uno de los del dropdown, lo promovemos a
// inline para que siempre sea visible.

const TOP_INLINE = 5;

function EstadosPills({
  summary,
  totalAll,
  activo,
  onChange,
}: {
  summary: Record<string, number>;
  totalAll: number;
  activo: string;
  onChange: (k: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  // Solo estados con count > 0, ordenados por count desc.
  const conDatos = summaryToList(summary);

  // Top N + el activo (si quedó fuera del top, promoverlo).
  let inline = conDatos.slice(0, TOP_INLINE);
  let dropdown = conDatos.slice(TOP_INLINE);
  if (activo && !inline.some(x => x.estado.key === activo)) {
    const promo = dropdown.find(x => x.estado.key === activo);
    if (promo) {
      inline = [...inline.slice(0, TOP_INLINE - 1), promo];
      dropdown = dropdown.filter(x => x.estado.key !== activo);
      // re-incluir el desplazado en dropdown
      const desplazado = conDatos.slice(TOP_INLINE - 1, TOP_INLINE)[0];
      if (desplazado && desplazado.estado.key !== activo) {
        dropdown = [desplazado, ...dropdown];
      }
    }
  }

  function pillClass(active: boolean, e: typeof inline[number]['estado']) {
    return `inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-all ${
      active
        ? `${e.bgColor} ${e.textColor} ${e.borderColor}`
        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
    }`;
  }

  return (
    <div className="flex items-center gap-1.5 mt-3 flex-wrap">
      <button
        onClick={() => onChange('')}
        className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-all ${
          !activo
            ? 'bg-slate-900 text-white border-slate-900'
            : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400 hover:text-slate-700'
        }`}
      >
        Todos
        <span className={`text-[10px] tabular-nums ${!activo ? 'opacity-80' : 'opacity-60'}`}>
          {totalAll.toLocaleString()}
        </span>
      </button>

      {inline.map(({ estado: e, count }) => {
        const active = activo === e.key;
        return (
          <button key={e.key} onClick={() => onChange(active ? '' : e.key)} className={pillClass(active, e)} title={e.label}>
            <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: e.color }} />
            {e.shortLabel ?? e.label}
            <span className="text-[10px] tabular-nums opacity-60">{count.toLocaleString()}</span>
          </button>
        );
      })}

      {dropdown.length > 0 && (
        <div ref={ref} className="relative">
          <button
            onClick={() => setOpen(o => !o)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-white text-slate-500 border-slate-200 hover:border-slate-400 hover:text-slate-700 transition-all"
          >
            Más
            <span className="text-[10px] tabular-nums opacity-60">
              {dropdown.length}
            </span>
            <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>

          {open && (
            <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[180px]">
              {dropdown.map(({ estado: e, count }) => {
                const active = activo === e.key;
                return (
                  <button
                    key={e.key}
                    onClick={() => { onChange(active ? '' : e.key); setOpen(false); }}
                    className={`w-full flex items-center justify-between gap-3 text-[11px] px-2.5 py-1.5 transition-colors ${
                      active ? `${e.bgColor} ${e.textColor} font-semibold` : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: e.color }} />
                      <span className="truncate">{e.label}</span>
                    </span>
                    <span className="text-[10px] tabular-nums text-slate-400 flex-shrink-0">
                      {count.toLocaleString()}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── TipoServicioBadge ────────────────────────────────────────────────────────
// Badge clickeable: al click abre una burbuja con la descripción completa.
// El popover se renderiza vía portal al <body> con position:fixed para escapar
// del overflow-hidden de la card del kanban y del overflow-auto de la columna.

const POPOVER_WIDTH  = 264; // ≈ w-64 + padding
const POPOVER_HEIGHT = 180; // alto aproximado para clamp vertical

function TipoServicioBadge({
  tipo,
  variant,
}: {
  tipo: string;
  variant: 'table' | 'card';
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos]   = useState<{ top: number; left: number } | null>(null);
  const triggerRef      = useRef<HTMLButtonElement>(null);
  const popoverRef      = useRef<HTMLDivElement>(null);

  function computePosition() {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const margin = 8;
    // Por defecto: alineado al borde derecho del trigger, debajo
    let left = rect.right - POPOVER_WIDTH;
    let top  = rect.bottom + 4;
    // Si se sale por la izquierda → alinear a la izquierda del trigger
    if (left < margin) left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - margin);
    // Si se sale por la derecha → recalcular
    if (left + POPOVER_WIDTH > window.innerWidth - margin) {
      left = window.innerWidth - POPOVER_WIDTH - margin;
    }
    // Si no entra abajo → mostrar arriba
    if (top + POPOVER_HEIGHT > window.innerHeight - margin) {
      top = rect.top - POPOVER_HEIGHT - 4;
    }
    setPos({ top, left });
  }

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!open) computePosition();
    setOpen(o => !o);
  }

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      const inTrigger = triggerRef.current?.contains(e.target as Node);
      const inPopover = popoverRef.current?.contains(e.target as Node);
      if (!inTrigger && !inPopover) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onScrollOrResize() {
      computePosition();
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEsc);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEsc);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  const code   = tipo.trim().toUpperCase();
  const label  = TIPO_SERVICIO_LABELS[code];
  const family = TIPO_SERVICIO_FAMILIES.find(f => f.codes.includes(code));
  const swatch = tipoServicioBadgeClass(code);

  const triggerClasses = variant === 'card'
    ? `inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded border cursor-pointer hover:ring-2 hover:ring-offset-1 transition-all ${swatch}`
    : `inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border cursor-pointer hover:ring-2 hover:ring-offset-1 transition-all ${swatch}`;

  const popoverNode = open && pos && typeof document !== 'undefined' ? createPortal(
    <div
      ref={popoverRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: POPOVER_WIDTH }}
      className="z-[100] bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header con el badge en grande */}
      <div className="px-3 py-2.5 border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`inline-flex items-center text-xs font-bold px-2 py-1 rounded border flex-shrink-0 ${swatch}`}>
            {code}
          </span>
          <span className="text-xs font-semibold text-slate-800 truncate">
            {label ?? <span className="italic text-slate-400">Sin descripción</span>}
          </span>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex-shrink-0"
          title="Cerrar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Cuerpo: familia + descripción larga */}
      <div className="px-3 py-2.5 space-y-2 text-[11px]">
        {family ? (
          <>
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full border ${family.swatch}`} />
              <span className="font-semibold text-slate-700">{family.name}</span>
            </div>
            <p className="text-slate-500 leading-relaxed">{family.description}</p>
          </>
        ) : (
          <p className="text-slate-400 italic">
            Código no clasificado en una familia conocida. Aparece tal cual viene del DMS.
          </p>
        )}
      </div>

      <div className="px-3 py-1.5 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-400">
        Fuente: <span className="font-mono">v_maestro_ot_condor.TipoServicio</span>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        className={triggerClasses}
        title="Click para ver descripción"
      >
        {code}
      </button>
      {popoverNode}
    </>
  );
}

function FilterChip({
  label,
  value,
  onClear,
  tone,
}: {
  label: string;
  value: string;
  onClear: () => void;
  tone: 'indigo' | 'emerald' | 'slate' | 'red';
}) {
  const toneClasses = {
    indigo:  'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
    slate:   'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200',
    red:     'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
  } as const;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full border transition-colors ${toneClasses[tone]}`}>
      <span className="opacity-60">{label}:</span>
      <span className="font-semibold max-w-[160px] truncate">{value}</span>
      <button
        onClick={onClear}
        className="hover:bg-white/60 rounded-full p-0.5 transition-colors"
        title={`Quitar filtro de ${label.toLowerCase()}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

// ─── Leyenda de Tipos de Servicio ─────────────────────────────────────────────
// Botón en el header → al click despliega un panel con todas las familias y
// sus códigos. Click afuera o ESC cierran. Sirve para que el usuario entienda
// qué significan los badges MC/SC/MP/etc. de la columna Tipo.

function TipoServicioLegend() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
          open
            ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
        }`}
        title="Ver qué significan los códigos de la columna Tipo"
      >
        <Info className="h-3.5 w-3.5" />
        <span className="font-medium">Tipos</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[420px] max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Header del popover */}
          <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Tipos de servicio</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Cada OT lleva un código que indica la naturaleza del trabajo. Los colores agrupan por familia.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex-shrink-0"
                title="Cerrar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Familias */}
          <div className="max-h-[60vh] overflow-y-auto p-3 space-y-3">
            {TIPO_SERVICIO_FAMILIES.map(fam => (
              <div key={fam.name}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`h-2.5 w-2.5 rounded-full border ${fam.swatch}`} />
                  <h4 className="text-[12px] font-bold text-slate-800">{fam.name}</h4>
                </div>
                <p className="text-[11px] text-slate-500 mb-2 ml-4.5 pl-0.5">{fam.description}</p>
                <div className="grid grid-cols-1 gap-1 ml-4">
                  {fam.codes.map(code => (
                    <div key={code} className="flex items-start gap-2 text-[11px]">
                      <span
                        className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 mt-0.5 ${tipoServicioBadgeClass(code)}`}
                      >
                        {code}
                      </span>
                      <span className="text-slate-600">
                        {TIPO_SERVICIO_LABELS[code] ?? <span className="italic text-slate-400">(sin descripción)</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50">
            <p className="text-[10px] text-slate-400">
              Fuente: <span className="font-mono">v_maestro_ot_condor.TipoServicio</span> · DMS Condor
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── FreshnessBadge ──────────────────────────────────────────────────────────
// Indicador discreto de cuán recientes son los datos. Color verde si el snapshot
// del worker es reciente, ámbar si está envejeciendo, rojo si es muy viejo.
// Si los datos vienen del DMS directo (sin snapshot), muestra etiqueta neutra.

function FreshnessBadge({
  ageS,
  source,
}: {
  ageS: number | null;
  source: 'worker-snapshot' | 'direct-cache' | 'direct-fresh' | null;
}) {
  if (ageS === null && !source) return null;

  // Datos directos del DMS — no hay snapshot del worker.
  if (source === 'direct-fresh' || source === 'direct-cache') {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500"
        title="Worker no disponible · datos consultados directo al DMS"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
        Directo DMS
      </span>
    );
  }

  if (ageS === null) return null;

  const text =
    ageS < 60   ? `hace ${ageS}s`
    : ageS < 3600 ? `hace ${Math.round(ageS / 60)} min`
    :              `hace ${Math.round(ageS / 3600)} h`;

  let cls = 'bg-emerald-100 text-emerald-700';
  let dot = 'bg-emerald-500';
  let title = 'Datos sincronizados recientemente desde el DMS';
  if (ageS > 600) {
    cls = 'bg-red-100 text-red-700';
    dot = 'bg-red-500 animate-pulse';
    title = 'Snapshot del DMS atrasado · revisá el worker (cron)';
  } else if (ageS > 360) {
    cls = 'bg-amber-100 text-amber-700';
    dot = 'bg-amber-500';
    title = 'El worker tarda en refrescar · datos algo viejos';
  }

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`} title={title}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      DMS sync {text}
    </span>
  );
}
