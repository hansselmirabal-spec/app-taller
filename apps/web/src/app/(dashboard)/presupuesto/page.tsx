'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft, ChevronRight, Plus, FileText, Calculator,
  Clock, CheckCircle2, XCircle, AlertCircle, RefreshCw, Search, BookOpen,
  LayoutList, CalendarClock,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useBudgetAppointments } from '@/hooks/use-budget-appointments';
import { useWorkshopId } from '@/context/workshop-context';
import { AppointmentSearchModal } from '@/components/ui/appointment-search';
import { InfoButton } from '@/components/ui/info-button';
import { MotivationalLoader } from '@/components/ui/motivational-loader';
import type { BudgetAppointment } from '@/types';

const STATUS_CONFIG = {
  pending:   { label: 'Pendiente',  badge: 'bg-yellow-100 text-yellow-700', icon: AlertCircle  },
  approved:  { label: 'Aprobado',   badge: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  rejected:  { label: 'Rechazado',  badge: 'bg-red-100 text-red-700',       icon: XCircle       },
  cancelled: { label: 'Cancelado',  badge: 'bg-slate-100 text-slate-500',   icon: XCircle       },
} as const;

function BudgetCard({ appt, onClick }: { appt: BudgetAppointment; onClick: () => void }) {
  const cfg = STATUS_CONFIG[appt.status];
  const Icon = cfg.icon;
  const totalHours = appt.processes?.reduce((s, p) => s + p.hours, 0) ?? 0;
  const isCancelled = appt.status === 'cancelled' || appt.status === 'rejected';
  const pendingTooLong = appt.status === 'pending'
    && (!appt.processes || appt.processes.length === 0)
    && (Date.now() - new Date(appt.createdAt).getTime()) > 2 * 3_600_000;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      className={`rounded-xl border bg-white p-4 shadow-sm cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all space-y-2.5 ${isCancelled ? 'opacity-60' : ''} ${pendingTooLong ? 'border-orange-300 border-l-4 border-l-orange-400' : 'border-slate-200'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-base text-slate-900 tracking-wider">{appt.plate}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${cfg.badge}`}>
              {cfg.label}
            </span>
            {pendingTooLong && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-orange-100 text-orange-700">
                Sin procesos +2h
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-0.5">{appt.customerName}</p>
        </div>
        <Icon className={`h-4 w-4 flex-shrink-0 mt-0.5 ${cfg.badge.split(' ')[1]}`} />
      </div>

      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {appt.timeStart} – {appt.timeEnd}
        </span>
        {appt.perito && (
          <span className="bg-slate-100 px-2 py-0.5 rounded-md">{appt.perito.name}</span>
        )}
        {appt.budgetNumber && (
          <span className="text-slate-400">#{appt.budgetNumber}</span>
        )}
      </div>

      {appt.processes && appt.processes.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {appt.processes.map(p => (
            <span key={p.code} className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
              {p.name} · {p.hours}h
            </span>
          ))}
          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
            Total: {totalHours}h
          </span>
        </div>
      ) : (
        <p className="text-[11px] text-slate-400 italic">Sin procesos cargados aún</p>
      )}
    </div>
  );
}

// ─── Vista Agenda — grilla horaria (08:00–18:00) ──────────────────────────────

const GRID_START_HOUR = 8;
const GRID_END_HOUR   = 18;
const HOUR_HEIGHT      = 64; // px

const GRID_STATUS_STYLE: Record<BudgetAppointment['status'], string> = {
  pending:   'bg-yellow-50 border-yellow-300 text-yellow-900',
  approved:  'bg-emerald-50 border-emerald-300 text-emerald-900',
  rejected:  'bg-slate-100 border-slate-300 text-slate-400 line-through opacity-70',
  cancelled: 'bg-slate-100 border-slate-300 text-slate-400 line-through opacity-70',
};

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function timeOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// Asigna columnas a citas que se solapan en horario, para que ninguna quede
// tapada por otra (2 peritos agendados a la misma hora, por ejemplo).
function layoutDayAppointments(appts: BudgetAppointment[]): Map<string, { col: number; totalCols: number }> {
  const sorted = [...appts].sort((a, b) => a.timeStart.localeCompare(b.timeStart) || a.timeEnd.localeCompare(b.timeEnd));
  const cols: number[] = [];
  const result = new Map<string, { col: number; totalCols: number }>();

  sorted.forEach((a, i) => {
    const usedCols = new Set<number>();
    for (let j = 0; j < i; j++) {
      if (timeOverlap(a.timeStart, a.timeEnd, sorted[j].timeStart, sorted[j].timeEnd)) {
        usedCols.add(cols[j]);
      }
    }
    let col = 0;
    while (usedCols.has(col)) col++;
    cols.push(col);
  });

  sorted.forEach((a, i) => {
    let maxCol = cols[i];
    sorted.forEach((b, j) => {
      if (i !== j && timeOverlap(a.timeStart, a.timeEnd, b.timeStart, b.timeEnd)) {
        maxCol = Math.max(maxCol, cols[j]);
      }
    });
    result.set(a.id, { col: cols[i], totalCols: maxCol + 1 });
  });

  return result;
}

function AgendaGrid({ appts, onClick }: { appts: BudgetAppointment[]; onClick: (id: string) => void }) {
  const hours = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR + 1 }, (_, i) => GRID_START_HOUR + i);
  const totalHeight = (GRID_END_HOUR - GRID_START_HOUR) * HOUR_HEIGHT;
  const gridStartMin = GRID_START_HOUR * 60;
  const layout = layoutDayAppointments(appts);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex">
        {/* Columna de horas */}
        <div className="w-14 flex-shrink-0 border-r border-slate-100 relative" style={{ height: totalHeight }}>
          {hours.map((h, i) => (
            <span
              key={h}
              className="absolute right-2 text-[11px] text-slate-400 -translate-y-1/2"
              style={{ top: i * HOUR_HEIGHT }}
            >
              {String(h).padStart(2, '0')}:00
            </span>
          ))}
        </div>

        {/* Grilla */}
        <div className="flex-1 relative" style={{ height: totalHeight }}>
          {hours.map((h, i) => (
            <div key={h} className="absolute left-0 right-0 border-t border-slate-100" style={{ top: i * HOUR_HEIGHT }} />
          ))}

          {appts.length === 0 && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-300">
              Sin citas para este día
            </p>
          )}

          {appts.map(a => {
            const { col, totalCols } = layout.get(a.id) ?? { col: 0, totalCols: 1 };
            const startMin = Math.max(gridStartMin, timeToMinutes(a.timeStart));
            const endMin   = Math.min(GRID_END_HOUR * 60, Math.max(startMin + 20, timeToMinutes(a.timeEnd)));
            const top    = ((startMin - gridStartMin) / 60) * HOUR_HEIGHT;
            const height = Math.max(26, ((endMin - startMin) / 60) * HOUR_HEIGHT - 2);
            const widthPct = 100 / totalCols;

            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onClick(a.id)}
                className={`absolute rounded-lg border px-2 py-1 text-left overflow-hidden hover:shadow-md hover:z-10 transition-shadow ${GRID_STATUS_STYLE[a.status]}`}
                style={{
                  top,
                  height,
                  left: `calc(${col * widthPct}% + 4px)`,
                  width: `calc(${widthPct}% - 8px)`,
                }}
              >
                <p className="text-[10px] font-bold leading-none">{a.timeStart}–{a.timeEnd}</p>
                <p className="text-xs font-semibold truncate leading-tight mt-0.5">{a.plate} · {a.customerName}</p>
                {a.perito && <p className="text-[10px] opacity-70 truncate leading-tight">{a.perito.name}</p>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function PresupuestoPage() {
  const router     = useRouter();
  const workshopId = useWorkshopId();
  const [date, setDate]           = useState(formatDate(new Date()));
  const [searchOpen, setSearchOpen] = useState(false);
  const [view, setView] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(o => !o);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const { data: appts = [], isLoading, refetch } = useBudgetAppointments(workshopId ?? undefined, date);

  function prevDay() {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    setDate(formatDate(d));
  }
  function nextDay() {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    setDate(formatDate(d));
  }

  const pending  = appts.filter(a => a.status === 'pending');
  const approved = appts.filter(a => a.status === 'approved');
  const others   = appts.filter(a => a.status === 'cancelled' || a.status === 'rejected');

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-slate-400" />
            <h1 className="text-base font-semibold text-slate-900">Agenda de Presupuestos</h1>
            <InfoButton helpKey="presupuesto" />
            {pending.length > 0 && (
              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-semibold">
                {pending.length} pendiente{pending.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setView('grid')}
                title="Vista agenda (por hora)"
                className={`p-1.5 rounded-md transition-colors ${view === 'grid' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <CalendarClock className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setView('list')}
                title="Vista lista"
                className={`p-1.5 rounded-md transition-colors ${view === 'list' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <LayoutList className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              <button type="button" onClick={prevDay} className="p-1 rounded hover:bg-white transition-colors">
                <ChevronLeft className="h-4 w-4 text-slate-600" />
              </button>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="text-xs font-medium text-slate-700 bg-transparent border-none outline-none px-1"
              />
              <button type="button" onClick={nextDay} className="p-1 rounded hover:bg-white transition-colors">
                <ChevronRight className="h-4 w-4 text-slate-600" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => router.push('/presupuesto/catalogo')}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <BookOpen className="h-4 w-4" />
              Catálogo
            </button>
            <button
              type="button"
              onClick={() => router.push('/presupuesto/simulador')}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              <Calculator className="h-4 w-4" />
              Simulador
            </button>
            <button
              type="button"
              onClick={() => router.push('/presupuesto/nueva-cita')}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Cita
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <MotivationalLoader />
        ) : view === 'grid' ? (
          <div className="max-w-3xl mx-auto">
            <AgendaGrid appts={appts} onClick={id => router.push(`/presupuesto/${id}`)} />
          </div>
        ) : appts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-slate-400">
            <FileText className="h-10 w-10 opacity-30" />
            <p className="text-sm">Sin presupuestos para este día</p>
            <button
              type="button"
              onClick={() => router.push('/presupuesto/nueva-cita')}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              Crear el primero
            </button>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6">
            {pending.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                  Pendientes ({pending.length})
                </h2>
                <div className="space-y-3">
                  {pending.map(a => (
                    <BudgetCard
                      key={a.id}
                      appt={a}
                      onClick={() => router.push(`/presupuesto/${a.id}`)}
                    />
                  ))}
                </div>
              </section>
            )}

            {approved.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                  Aprobados · en taller ({approved.length})
                </h2>
                <div className="space-y-3">
                  {approved.map(a => (
                    <BudgetCard
                      key={a.id}
                      appt={a}
                      onClick={() => router.push(`/presupuesto/${a.id}`)}
                    />
                  ))}
                </div>
              </section>
            )}

            {others.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                  Cancelados / Rechazados
                </h2>
                <div className="space-y-3">
                  {others.map(a => (
                    <BudgetCard
                      key={a.id}
                      appt={a}
                      onClick={() => router.push(`/presupuesto/${a.id}`)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Botón flotante buscador de citas — igual que en /appointments */}
      <button
        onClick={() => setSearchOpen(true)}
        title="Buscar cliente, chapa o id (Cmd+K)"
        className="fixed bottom-6 right-6 z-[80] flex items-center gap-2 px-4 py-3 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 hover:shadow-xl transition-all print:hidden"
      >
        <Search className="h-4 w-4" />
        <span className="text-sm font-medium hidden sm:inline">Buscar cita</span>
        <kbd className="hidden md:inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/20 border border-white/30">⌘K</kbd>
      </button>

      <AppointmentSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
