'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { format, startOfWeek, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Plus, FileText, Calculator,
  CheckCircle2, XCircle, AlertCircle, RefreshCw, Search, BookOpen,
  LayoutList, CalendarClock,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useBudgetAppointmentsRange } from '@/hooks/use-budget-appointments';
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

const STATUS_ORDER: (keyof typeof STATUS_CONFIG)[] = ['pending', 'approved', 'rejected', 'cancelled'];

const EMPTY_TEXT: Record<BudgetAppointment['status'], string> = {
  pending:   'Sin pendientes esta semana',
  approved:  'Sin aprobados esta semana',
  rejected:  'Sin rechazados esta semana',
  cancelled: 'Sin cancelados esta semana',
};

// ─── Vista Agenda — timeline condensado ───────────────────────────────────
// El alto de la página lo define la cantidad real de citas, no un rango de
// horas fijo — evita la caja de 700px casi vacía que tenía la grilla horaria.

// El backend manda time como HH:MM:SS (columna `time` de Postgres) — solo se
// muestra HH:MM.
function fmtHM(time: string): string {
  return time.slice(0, 5);
}

// Solo la primera letra en mayúscula ("Jueves 6 de agosto") — la clase
// Tailwind `capitalize` capitaliza CADA palabra ("Jueves 6 De Agosto").
function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const TIMELINE_DOT: Record<BudgetAppointment['status'], string> = {
  pending:   'bg-yellow-400',
  approved:  'bg-emerald-400',
  rejected:  'bg-slate-300',
  cancelled: 'bg-slate-300',
};

// Only `pending` budgets are editable in the Simulator — everything else is
// read-only. Centralized here so every nav call site stays in sync.
function budgetNavPath(appt: BudgetAppointment): string {
  return appt.status === 'pending'
    ? `/presupuesto/simulador/${appt.id}`
    : `/presupuesto/${appt.id}`;
}

// Hueco libre entre el fin de una cita y el inicio de la siguiente — solo se
// muestra si es de al menos una hora, para no ensuciar la vista con huecos
// de 5-10 minutos entre citas seguidas.
function gapLabel(prevEndHM: string, nextStartHM: string): string | null {
  const [ph, pm] = prevEndHM.split(':').map(Number);
  const [nh, nm] = nextStartHM.split(':').map(Number);
  const minutes = (nh * 60 + nm) - (ph * 60 + pm);
  if (minutes < 60) return null;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours}h libres`;
}

function AgendaTimeline({ appts, onClick }: { appts: BudgetAppointment[]; onClick: (appt: BudgetAppointment) => void }) {
  const sorted = [...appts].sort((a, b) => a.timeStart.localeCompare(b.timeStart));

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-400">
        Sin citas agendadas para este día
      </div>
    );
  }

  return (
    <div className="relative pl-[62px]">
      <div className="absolute left-[52px] top-1 bottom-1 w-px bg-slate-200" />
      {sorted.map((a, i) => {
        const cfg = STATUS_CONFIG[a.status];
        const isCancelled = a.status === 'cancelled' || a.status === 'rejected';
        const gap = i > 0 ? gapLabel(fmtHM(sorted[i - 1].timeEnd), fmtHM(a.timeStart)) : null;
        return (
          <div key={a.id}>
            {gap && <p className="text-[11px] text-slate-400 pl-1 mb-2 -mt-1">— {gap} —</p>}
            <div className="relative mb-3.5 last:mb-0">
              <span className="absolute -left-[62px] top-1 w-12 text-right text-[11.5px] font-bold text-slate-600 tabular-nums">
                {fmtHM(a.timeStart)}
              </span>
              <span className={`absolute -left-[6px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-slate-50 ${TIMELINE_DOT[a.status]}`} />
              <button
                type="button"
                onClick={() => onClick(a)}
                className={`w-full flex items-center gap-3 rounded-xl border bg-white px-3.5 py-2.5 text-left hover:shadow-md hover:-translate-y-0.5 transition-all ${isCancelled ? 'opacity-60 border-slate-200' : 'border-slate-200'}`}
              >
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-sm text-slate-900 tracking-wide">{a.plate}</span>
                  <span className="text-slate-400 text-xs"> · </span>
                  <span className="text-sm text-slate-600 truncate">{a.customerName}</span>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${cfg.badge}`}>
                  {cfg.label}
                </span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Board de estados — card compacta ─────────────────────────────────────
function BoardCard({ appt, onClick }: { appt: BudgetAppointment; onClick: () => void }) {
  const isCancelled = appt.status === 'cancelled' || appt.status === 'rejected';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-lg border bg-white px-3 py-2.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all space-y-1 ${isCancelled ? 'opacity-60 border-slate-200' : 'border-slate-200'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-sm text-slate-900 truncate">{appt.customerName}</span>
        <span className="font-bold text-xs text-slate-500 tracking-wider flex-shrink-0">{appt.plate}</span>
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>{capitalizeFirst(format(new Date(appt.date + 'T12:00:00'), "EEE d MMM", { locale: es }))} · {fmtHM(appt.timeStart)}</span>
        <span className="truncate max-w-[45%]">{appt.insuranceCompany ?? 'Sin aseguradora'}</span>
      </div>
    </button>
  );
}

export default function PresupuestoPage() {
  const router     = useRouter();
  const workshopId = useWorkshopId();
  const [searchOpen, setSearchOpen] = useState(false);

  // Ancla de semana calculada una sola vez al montar — sin persistencia, sin
  // navegación entre semanas (ver design.md Decision 4). Sáb/Dom ancla a la
  // semana que recién terminó en vez de una semana futura vacía.
  const [weekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekDays = useMemo(() => Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const from = formatDate(weekDays[0]);
  const to   = formatDate(weekDays[4]);

  const [selectedDay, setSelectedDay] = useState(() => {
    const today = new Date();
    const dow = today.getDay();
    return dow >= 1 && dow <= 5 ? formatDate(today) : formatDate(weekDays[4]);
  });

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

  const { data: weekAppts = [], isLoading, refetch } = useBudgetAppointmentsRange(workshopId ?? undefined, from, to);

  const pendingCount = weekAppts.filter(a => a.status === 'pending').length;
  const dayAppts     = weekAppts.filter(a => a.date === selectedDay);

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-slate-400" />
            <h1 className="text-base font-semibold text-slate-900">Agenda de Presupuestos</h1>
            <InfoButton helpKey="presupuesto" />
            {pendingCount > 0 && (
              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-semibold">
                {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
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

      {/* Body — panel dual: agenda del día (izquierda) + board por estado (derecha) */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <MotivationalLoader />
          </div>
        ) : (
          <>
            {/* Panel izquierdo — Agenda */}
            <div className="w-1/2 border-r border-slate-200 flex flex-col min-h-0">
              <div className="flex-shrink-0 flex items-center gap-2 px-4 pt-4">
                <CalendarClock className="h-4 w-4 text-slate-400" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Agenda</h2>
              </div>
              <div className="flex-shrink-0 px-4 pt-3 pb-3">
                <div className="grid grid-cols-5 gap-1.5">
                  {weekDays.map(d => {
                    const key = formatDate(d);
                    const count = weekAppts.filter(a => a.date === key).length;
                    const active = key === selectedDay;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedDay(key)}
                        className={`flex flex-col items-center gap-0.5 rounded-lg px-1 py-2 transition-colors ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                      >
                        <span className="text-[10px] font-semibold uppercase">{capitalizeFirst(format(d, 'EEE', { locale: es }))}</span>
                        <span className="text-sm font-bold">{format(d, 'd')}</span>
                        {count > 0 && (
                          <span className={`text-[10px] font-semibold px-1.5 rounded-full ${active ? 'bg-white/20' : 'bg-slate-200 text-slate-500'}`}>
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                <p className="text-sm font-semibold text-slate-700 mb-4">
                  {capitalizeFirst(format(new Date(selectedDay + 'T12:00:00'), "EEEE d 'de' MMMM", { locale: es }))}
                </p>
                <AgendaTimeline appts={dayAppts} onClick={appt => router.push(budgetNavPath(appt))} />
              </div>
            </div>

            {/* Panel derecho — Presupuestos por estado */}
            <div className="w-1/2 flex flex-col min-h-0 p-4 gap-3">
              <div className="flex-shrink-0 flex items-center gap-2">
                <LayoutList className="h-4 w-4 text-slate-400" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Presupuestos por estado</h2>
              </div>
              <div className="grid grid-cols-4 gap-3 flex-1 min-h-0">
                {STATUS_ORDER.map(status => {
                  const cfg = STATUS_CONFIG[status];
                  const items = weekAppts.filter(a => a.status === status);
                  return (
                    <div key={status} className="flex flex-col min-h-0 rounded-xl border border-slate-200 bg-white">
                      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-slate-200">
                        <span className={`h-2 w-2 rounded-full ${TIMELINE_DOT[status]}`} />
                        <span className="text-xs font-semibold text-slate-700">{cfg.label}</span>
                        <span className="ml-auto text-[11px] font-semibold text-slate-400">{items.length}</span>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
                        {items.length === 0 ? (
                          <p className="text-[11px] text-slate-400 italic px-1 py-2">{EMPTY_TEXT[status]}</p>
                        ) : (
                          items.map(a => (
                            <BoardCard key={a.id} appt={a} onClick={() => router.push(budgetNavPath(a))} />
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
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
