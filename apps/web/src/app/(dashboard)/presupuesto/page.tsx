'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft, ChevronRight, Plus, FileText, Calculator,
  Clock, CheckCircle2, XCircle, AlertCircle, RefreshCw, Search, BookOpen,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useBudgetAppointments } from '@/hooks/use-budget-appointments';
import { useWorkshopId } from '@/context/workshop-context';
import { AppointmentSearchModal } from '@/components/ui/appointment-search';
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

export default function PresupuestoPage() {
  const router     = useRouter();
  const workshopId = useWorkshopId();
  const [date, setDate]           = useState(formatDate(new Date()));
  const [searchOpen, setSearchOpen] = useState(false);

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
            {pending.length > 0 && (
              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-semibold">
                {pending.length} pendiente{pending.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
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
          <div className="flex items-center justify-center h-40">
            <RefreshCw className="h-6 w-6 text-slate-400 animate-spin" />
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
