'use client';
import { useState, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, TrendingUp, Clock,
  AlertTriangle, CheckCircle2, BarChart3,
} from 'lucide-react';
import {
  format, parseISO, addDays, subDays,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
  addWeeks, subWeeks, addMonths, subMonths,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { useBodyshopWeekCapacity, useBodyshopEntriesKanban } from '@/hooks/use-bodyshop';
import { formatDate } from '@/lib/utils';
import { MotivationalLoader } from '@/components/ui/motivational-loader';
import type { BodyshopEntry, BodyshopWeekCapacity } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = 'day' | 'week' | 'month';

interface PeriodRange { from: string; to: string }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getPeriodRange(anchor: string, period: Period): PeriodRange {
  const d = parseISO(anchor + 'T12:00:00');
  if (period === 'day')   return { from: anchor, to: anchor };
  if (period === 'week') {
    const mon = startOfWeek(d, { weekStartsOn: 1 });
    return { from: formatDate(mon), to: formatDate(endOfWeek(d, { weekStartsOn: 1 })) };
  }
  // month
  return { from: formatDate(startOfMonth(d)), to: formatDate(endOfMonth(d)) };
}

function navigateAnchor(anchor: string, period: Period, dir: 1 | -1): string {
  const d = parseISO(anchor + 'T12:00:00');
  if (period === 'day')   return formatDate(dir === 1 ? addDays(d, 1)    : subDays(d, 1));
  if (period === 'week')  return formatDate(dir === 1 ? addWeeks(d, 1)   : subWeeks(d, 1));
  return formatDate(dir === 1 ? addMonths(d, 1) : subMonths(d, 1));
}

function periodLabel(anchor: string, period: Period): string {
  const d = parseISO(anchor + 'T12:00:00');
  if (period === 'day')   return format(d, "EEEE d 'de' MMMM yyyy", { locale: es });
  if (period === 'week') {
    const mon = startOfWeek(d, { weekStartsOn: 1 });
    const sun = endOfWeek(d,   { weekStartsOn: 1 });
    return `${format(mon, "d MMM", { locale: es })} – ${format(sun, "d MMM yyyy", { locale: es })}`;
  }
  return format(d, "MMMM yyyy", { locale: es });
}

/** Aggregate commercializable + occupied hours per process from week capacity data */
function aggregateCapacity(weekCap: BodyshopWeekCapacity | undefined) {
  const totals = {
    BODYWORK: { cap: 0, used: 0 },
    PREP:     { cap: 0, used: 0 },
    PAINT:    { cap: 0, used: 0 },
  };
  if (!weekCap) return totals;
  for (const day of Object.values(weekCap)) {
    for (const key of ['BODYWORK', 'PREP', 'PAINT'] as const) {
      totals[key].cap  += day.byProcess[key].commercializableHours;
      totals[key].used += day.byProcess[key].occupiedHours;
    }
  }
  return totals;
}

function pct(value: number, total: number) {
  if (!total) return 0;
  return Math.min(100, (value / total) * 100);
}

// ─── Color helpers ────────────────────────────────────────────────────────────

function pctColor(p: number) {
  if (p >= 90) return { bar: 'bg-red-500',    text: 'text-red-700',    bg: 'bg-red-50'    };
  if (p >= 70) return { bar: 'bg-amber-400',  text: 'text-amber-700',  bg: 'bg-amber-50'  };
  if (p >= 40) return { bar: 'bg-blue-500',   text: 'text-blue-700',   bg: 'bg-blue-50'   };
  return         { bar: 'bg-slate-300',   text: 'text-slate-500',  bg: 'bg-slate-50'  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({
  label, color, capHours, usedHours,
}: { label: string; color: string; capHours: number; usedHours: number }) {
  const p = pct(usedHours, capHours);
  const c = pctColor(p);
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
          {p.toFixed(1)}%
        </span>
      </div>
      <div className="flex items-end gap-1.5 mb-2">
        <span className="text-2xl font-bold text-slate-900">{usedHours.toFixed(1)}</span>
        <span className="text-sm text-slate-400 mb-0.5">/ {capHours.toFixed(1)} h</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${c.bar}`}
          style={{ width: `${p}%`, backgroundColor: p > 0 ? color : undefined }}
        />
      </div>
      <div className="flex justify-between mt-1.5">
        <span className="text-[10px] text-slate-400">Ocupado</span>
        <span className="text-[10px] text-slate-400">{(capHours - usedHours).toFixed(1)} h libres</span>
      </div>
    </div>
  );
}

function ProcessCell({
  hours, capHours,
}: { hours: number; capHours: number }) {
  if (hours === 0) return <td className="px-3 py-2.5 text-center text-slate-300 text-xs">—</td>;
  const p = pct(hours, capHours);
  const c = pctColor(p);
  return (
    <td className="px-3 py-2.5">
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-xs font-semibold text-slate-800">{hours}h</span>
        <div className="w-full flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${p}%` }} />
          </div>
          <span className={`text-[9px] font-bold ${c.text} w-8 text-right`}>{p.toFixed(1)}%</span>
        </div>
      </div>
    </td>
  );
}

// ─── Main report ──────────────────────────────────────────────────────────────

export default function BodyshopReport() {
  const [period, setPeriod] = useState<Period>('week');
  const [anchor, setAnchor] = useState(formatDate(new Date()));

  const range   = useMemo(() => getPeriodRange(anchor, period), [anchor, period]);
  const { from, to } = range;

  const { data: weekCap,    isLoading: capLoading }     = useBodyshopWeekCapacity(from, to);
  const { data: rawEntries = [], isLoading: entLoading } = useBodyshopEntriesKanban(from, to);

  const entries = rawEntries.filter(e => e.status !== 'cancelled');
  const totals  = useMemo(() => aggregateCapacity(weekCap), [weekCap]);
  const loading = capLoading || entLoading;

  // Column totals from entries
  const entryTotals = useMemo(() => entries.reduce(
    (acc, e) => ({
      bodywork: acc.bodywork + e.bodyworkHours,
      prep:     acc.prep     + e.prepHours,
      paint:    acc.paint    + e.paintHours,
      total:    acc.total    + e.bodyworkHours + e.prepHours + e.paintHours,
    }),
    { bodywork: 0, prep: 0, paint: 0, total: 0 },
  ), [entries]);

  return (
    <div className="flex flex-col gap-5 p-6">

      {/* ── Controls ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Period tabs */}
        <div className="flex bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm text-xs font-semibold">
          {(['day', 'week', 'month'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 transition-colors ${period === p ? 'bg-orange-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              {p === 'day' ? 'Día' : p === 'week' ? 'Semana' : 'Mes'}
            </button>
          ))}
        </div>

        {/* Date nav */}
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm">
          <button
            onClick={() => setAnchor(navigateAnchor(anchor, period, -1))}
            className="p-0.5 rounded hover:bg-slate-100 text-slate-400"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-slate-700 capitalize min-w-52 text-center">
            {periodLabel(anchor, period)}
          </span>
          <button
            onClick={() => setAnchor(navigateAnchor(anchor, period, 1))}
            className="p-0.5 rounded hover:bg-slate-100 text-slate-400"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => setAnchor(formatDate(new Date()))}
            className="text-xs text-orange-600 font-medium hover:underline ml-1"
          >
            Hoy
          </button>
        </div>
      </div>

      {loading ? (
        <MotivationalLoader className="h-64" />
      ) : (
        <>
          {/* ── Summary cards ── */}
          <div className="grid grid-cols-4 gap-4">
            {/* Global */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-7 w-7 rounded-lg bg-orange-50 flex items-center justify-center">
                  <BarChart3 className="h-4 w-4 text-orange-600" />
                </div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Global</span>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Trabajos activos</span>
                  <span className="font-bold text-slate-800">{entries.length}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Horas cargadas</span>
                  <span className="font-bold text-slate-800">{entryTotals.total.toFixed(1)} h</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Cap. total</span>
                  <span className="font-bold text-slate-800">
                    {(totals.BODYWORK.cap + totals.PREP.cap + totals.PAINT.cap).toFixed(1)} h
                  </span>
                </div>
                {totals.BODYWORK.cap + totals.PREP.cap + totals.PAINT.cap > 0 && (
                  <div className="pt-1">
                    {(() => {
                      const p = pct(
                        entryTotals.total,
                        totals.BODYWORK.cap + totals.PREP.cap + totals.PAINT.cap,
                      );
                      const c = pctColor(p);
                      return (
                        <>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${p}%` }} />
                          </div>
                          <p className={`text-right text-[10px] font-bold mt-0.5 ${c.text}`}>{p.toFixed(1)}%</p>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>

            <SummaryCard
              label="Chapería"
              color="#3b82f6"
              capHours={totals.BODYWORK.cap}
              usedHours={totals.BODYWORK.used}
            />
            <SummaryCard
              label="Preparación"
              color="#8b5cf6"
              capHours={totals.PREP.cap}
              usedHours={totals.PREP.used}
            />
            <SummaryCard
              label="Pintura"
              color="#f97316"
              capHours={totals.PAINT.cap}
              usedHours={totals.PAINT.used}
            />
          </div>

          {/* ── Table ── */}
          {entries.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center py-16 text-slate-300 shadow-sm">
              <BarChart3 className="h-10 w-10 mb-3" />
              <p className="text-sm font-medium">Sin ingresos activos en este período</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-slate-400" />
                <span className="text-sm font-semibold text-slate-700">
                  Distribución de horas por trabajo
                </span>
                <span className="ml-auto text-xs text-slate-400">{entries.length} trabajos</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">Chapa</th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cliente</th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide w-20">Fecha</th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">Estado</th>
                      {/* Process columns */}
                      <th className="px-3 py-2.5 text-center text-xs font-semibold text-blue-600 uppercase tracking-wide w-36">
                        <span className="flex items-center justify-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-blue-500 inline-block" />
                          Chapería
                        </span>
                        <span className="text-[9px] font-normal text-slate-400 block">
                          cap. {totals.BODYWORK.cap.toFixed(1)} h
                        </span>
                      </th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold text-violet-600 uppercase tracking-wide w-36">
                        <span className="flex items-center justify-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-violet-500 inline-block" />
                          Prep.
                        </span>
                        <span className="text-[9px] font-normal text-slate-400 block">
                          cap. {totals.PREP.cap.toFixed(1)} h
                        </span>
                      </th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold text-orange-600 uppercase tracking-wide w-36">
                        <span className="flex items-center justify-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-orange-500 inline-block" />
                          Pintura
                        </span>
                        <span className="text-[9px] font-normal text-slate-400 block">
                          cap. {totals.PAINT.cap.toFixed(1)} h
                        </span>
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">Total h</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">% Global</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-50">
                    {entries.map((e, idx) => {
                      const totalH = e.bodyworkHours + e.prepHours + e.paintHours;
                      const globalCap = totals.BODYWORK.cap + totals.PREP.cap + totals.PAINT.cap;
                      const globalPct = pct(totalH, globalCap);
                      const gc = pctColor(globalPct);

                      return (
                        <tr key={e.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'} hover:bg-orange-50/30 transition-colors`}>
                          {/* Chapa */}
                          <td className="px-4 py-2.5">
                            <span className="text-xs font-mono font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                              {e.plate}
                            </span>
                          </td>

                          {/* Cliente */}
                          <td className="px-3 py-2.5 max-w-[160px]">
                            <p className="text-xs font-medium text-slate-800 truncate">{e.customerName}</p>
                            {e.technician && (
                              <p className="text-[10px] text-slate-400 truncate">Téc: {e.technician.name}</p>
                            )}
                          </td>

                          {/* Tipo */}
                          <td className="px-3 py-2.5">
                            <span
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap"
                              style={{ background: (e.workType?.color ?? '#94a3b8') + '22', color: e.workType?.color ?? '#94a3b8' }}
                            >
                              {e.workType?.name}
                            </span>
                          </td>

                          {/* Fecha */}
                          <td className="px-3 py-2.5 text-[11px] text-slate-500 whitespace-nowrap">
                            {format(parseISO(e.date + 'T12:00:00'), 'd MMM', { locale: es })}
                            {e.stayDays > 1 && (
                              <span className="ml-1 text-slate-400">{e.stayDays}d</span>
                            )}
                          </td>

                          {/* Estado */}
                          <td className="px-3 py-2.5">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                              e.status === 'scheduled'   ? 'bg-blue-100 text-blue-700'    :
                              e.status === 'in_progress' ? 'bg-amber-100 text-amber-700'  :
                                                           'bg-emerald-100 text-emerald-700'
                            }`}>
                              {e.status === 'scheduled' ? 'Agendado' : e.status === 'in_progress' ? 'En proceso' : 'Listo'}
                            </span>
                          </td>

                          {/* Process cells */}
                          <ProcessCell hours={e.bodyworkHours} capHours={totals.BODYWORK.cap} />
                          <ProcessCell hours={e.prepHours}     capHours={totals.PREP.cap} />
                          <ProcessCell hours={e.paintHours}    capHours={totals.PAINT.cap} />

                          {/* Total */}
                          <td className="px-3 py-2.5 text-right">
                            <span className="text-xs font-bold text-slate-800">{totalH}h</span>
                          </td>

                          {/* % Global */}
                          <td className="px-3 py-2.5">
                            <div className="flex flex-col items-end gap-0.5">
                              <span className={`text-[10px] font-bold ${gc.text}`}>{globalPct.toFixed(1)}%</span>
                              <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${gc.bar}`} style={{ width: `${globalPct}%` }} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* Totals row */}
                  <tfoot>
                    <tr className="bg-slate-100 border-t-2 border-slate-200">
                      <td colSpan={5} className="px-4 py-2.5 text-xs font-bold text-slate-600 uppercase tracking-wide">
                        Totales período
                      </td>
                      {/* Chapería total */}
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-xs font-bold text-slate-800">{entryTotals.bodywork.toFixed(1)}h</span>
                          <span className={`text-[9px] font-bold ${pctColor(pct(entryTotals.bodywork, totals.BODYWORK.cap)).text}`}>
                            {pct(entryTotals.bodywork, totals.BODYWORK.cap).toFixed(1)}% cap.
                          </span>
                        </div>
                      </td>
                      {/* Prep total */}
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-xs font-bold text-slate-800">{entryTotals.prep.toFixed(1)}h</span>
                          <span className={`text-[9px] font-bold ${pctColor(pct(entryTotals.prep, totals.PREP.cap)).text}`}>
                            {pct(entryTotals.prep, totals.PREP.cap).toFixed(1)}% cap.
                          </span>
                        </div>
                      </td>
                      {/* Paint total */}
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-xs font-bold text-slate-800">{entryTotals.paint.toFixed(1)}h</span>
                          <span className={`text-[9px] font-bold ${pctColor(pct(entryTotals.paint, totals.PAINT.cap)).text}`}>
                            {pct(entryTotals.paint, totals.PAINT.cap).toFixed(1)}% cap.
                          </span>
                        </div>
                      </td>
                      {/* Grand total */}
                      <td className="px-3 py-2.5 text-right">
                        <span className="text-xs font-bold text-slate-900">{entryTotals.total.toFixed(1)}h</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col items-end gap-0.5">
                          {(() => {
                            const gc = totals.BODYWORK.cap + totals.PREP.cap + totals.PAINT.cap;
                            const p  = pct(entryTotals.total, gc);
                            const c  = pctColor(p);
                            return (
                              <>
                                <span className={`text-[10px] font-bold ${c.text}`}>{p.toFixed(1)}%</span>
                                <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${p}%` }} />
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
