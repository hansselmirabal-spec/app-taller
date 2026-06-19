'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from 'lucide-react';
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, isSameMonth, isToday,
  startOfWeek, endOfWeek, addWeeks, subWeeks,
  startOfDay,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { useAppointmentsByRange } from '@/hooks/use-appointments';
import { useRequirePermission } from '@/hooks/use-require-permission';
import { AppointmentDetailModal } from '@/components/appointments/appointment-detail-modal';
import type { Appointment } from '@/types';

type ViewMode = 'month' | 'week';

const STATUS_DOT: Record<string, string> = {
  scheduled:   'bg-blue-500',
  in_progress: 'bg-amber-500',
  done:        'bg-emerald-500',
  cancelled:   'bg-slate-300',
};

const STATUS_CARD: Record<string, string> = {
  scheduled:   'bg-blue-50 border-blue-200 text-blue-900',
  in_progress: 'bg-amber-50 border-amber-300 text-amber-900',
  done:        'bg-emerald-50 border-emerald-200 text-emerald-900',
  cancelled:   'bg-slate-100 border-slate-200 text-slate-400 line-through opacity-60',
};

const STATUS_LABEL: Record<string, string> = {
  scheduled:   'Agendado',
  in_progress: 'En proceso',
  done:        'Listo',
  cancelled:   'Cancelado',
};

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(date: Date, f: string) {
  return format(date, f, { locale: es });
}

function fmtTime(t: string) {
  return t.slice(0, 5);
}

function getWeekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor, { weekStartsOn: 0 });
  const end   = endOfWeek(anchor,   { weekStartsOn: 0 });
  return eachDayOfInterval({ start, end });
}

// ── Appointment chip (both views) ─────────────────────────────────────────────

function AppointmentChip({ appt, onClick }: { appt: Appointment; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-1.5 py-0.5 rounded border text-[11px] leading-tight truncate transition-opacity hover:opacity-80 ${STATUS_CARD[appt.status]}`}
    >
      <span className="font-semibold">{fmtTime(appt.timeStart)}</span>
      {' '}{appt.plate}
    </button>
  );
}

// ── Week appointment block (richer) ───────────────────────────────────────────

function WeekApptBlock({ appt, onClick }: { appt: Appointment; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-2 py-1.5 rounded-lg border mb-1 transition-opacity hover:opacity-80 ${STATUS_CARD[appt.status]}`}
    >
      <div className="flex items-center gap-1 mb-0.5">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[appt.status]}`} />
        <span className="text-[11px] font-semibold">{fmtTime(appt.timeStart)}–{fmtTime(appt.timeEnd)}</span>
      </div>
      <p className="text-xs font-bold truncate">{appt.plate}</p>
      <p className="text-[11px] truncate opacity-80">{appt.customerName}</p>
      {appt.technician && (
        <p className="text-[10px] opacity-60 truncate">{appt.technician.name}</p>
      )}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CalendarioPage() {
  useRequirePermission('appointments');
  const router = useRouter();

  const [mounted, setMounted]   = useState(false);
  const [view, setView]         = useState<ViewMode>('month');
  const [anchor, setAnchor]     = useState<Date>(new Date(0)); // placeholder SSR-safe
  const [selected, setSelected] = useState<Appointment | null>(null);

  useEffect(() => {
    setAnchor(startOfDay(new Date()));
    setMounted(true);
  }, []);

  // Range for data fetch
  const rangeStart = useMemo(() =>
    view === 'month'
      ? fmt(startOfWeek(startOfMonth(anchor), { weekStartsOn: 0 }), 'yyyy-MM-dd')
      : fmt(startOfWeek(anchor, { weekStartsOn: 0 }), 'yyyy-MM-dd'),
  [view, anchor]);

  const rangeEnd = useMemo(() =>
    view === 'month'
      ? fmt(endOfWeek(endOfMonth(anchor), { weekStartsOn: 0 }), 'yyyy-MM-dd')
      : fmt(endOfWeek(anchor, { weekStartsOn: 0 }), 'yyyy-MM-dd'),
  [view, anchor]);

  const { data: appointments = [], isLoading } = useAppointmentsByRange(rangeStart, rangeEnd);

  // ── Navigation ──────────────────────────────────────────────────────────────

  function prev() {
    setAnchor(a => view === 'month' ? subMonths(a, 1) : subWeeks(a, 1));
  }
  function next() {
    setAnchor(a => view === 'month' ? addMonths(a, 1) : addWeeks(a, 1));
  }
  function goToday() { setAnchor(startOfDay(new Date())); }

  // ── Title ──────────────────────────────────────────────────────────────────

  const title = view === 'month'
    ? fmt(anchor, 'MMMM yyyy')
    : (() => {
        const days = getWeekDays(anchor);
        return `${fmt(days[0], 'd MMM')} – ${fmt(days[6], 'd MMM yyyy')}`;
      })();

  // ── Month grid ─────────────────────────────────────────────────────────────

  const monthCells = useMemo(() => {
    const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: 0 });
    const end   = endOfWeek(endOfMonth(anchor),     { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [anchor]);

  function apptsByDay(day: Date) {
    const ds = fmt(day, 'yyyy-MM-dd');
    return appointments
      .filter(a => a.date === ds && a.status !== 'cancelled')
      .sort((a, b) => a.timeStart.localeCompare(b.timeStart));
  }

  // ── Week grid ──────────────────────────────────────────────────────────────

  const weekDays = getWeekDays(anchor);

  if (!mounted) {
    return (
      <div className="h-screen flex flex-col bg-slate-50">
        <div className="flex-shrink-0 bg-white border-b border-slate-200 px-5 py-3 flex items-center gap-3">
          <CalendarDays className="h-5 w-5 text-blue-600" />
          <h1 className="text-base font-bold text-slate-900">Calendario</h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="h-6 w-6 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-5 py-3 flex items-center gap-3">
        <CalendarDays className="h-5 w-5 text-blue-600 flex-shrink-0" />
        <h1 className="text-base font-bold text-slate-900 flex-1">Calendario</h1>

        {/* Hoy */}
        <button
          onClick={goToday}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors text-slate-600"
        >
          Hoy
        </button>

        {/* Nav prev/next */}
        <div className="flex items-center gap-1">
          <button onClick={prev} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <ChevronLeft className="h-4 w-4 text-slate-500" />
          </button>
          <span className="text-sm font-semibold text-slate-800 w-40 text-center capitalize">{title}</span>
          <button onClick={next} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <ChevronRight className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        {/* View toggle */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          {(['month', 'week'] as ViewMode[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                view === v ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              {v === 'month' ? 'Mes' : 'Semana'}
            </button>
          ))}
        </div>

        {/* Nuevo turno */}
        <button
          onClick={() => router.push('/appointments/new')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Nuevo turno
        </button>
      </div>

      {/* ── Calendar body ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-4">

        {/* ── MONTH VIEW ─────────────────────────────────────────────────── */}
        {view === 'month' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-slate-100">
              {WEEKDAYS.map(d => (
                <div key={d} className="py-2 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
              {monthCells.map(day => {
                const dayAppts   = apptsByDay(day);
                const isCurrentMonth = isSameMonth(day, anchor);
                const isTodayDay = isToday(day);
                const ds         = fmt(day, 'yyyy-MM-dd');

                return (
                  <div
                    key={ds}
                    className={`min-h-[100px] p-1.5 ${isCurrentMonth ? 'bg-white' : 'bg-slate-50/60'}`}
                  >
                    {/* Day number */}
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                        isTodayDay
                          ? 'bg-blue-600 text-white'
                          : isCurrentMonth ? 'text-slate-700' : 'text-slate-300'
                      }`}>
                        {format(day, 'd')}
                      </span>
                      {dayAppts.length > 0 && (
                        <span className="text-[10px] text-slate-400">{dayAppts.length}</span>
                      )}
                    </div>

                    {/* Appointments */}
                    <div className="space-y-0.5">
                      {dayAppts.slice(0, 3).map(a => (
                        <AppointmentChip key={a.id} appt={a} onClick={() => setSelected(a)} />
                      ))}
                      {dayAppts.length > 3 && (
                        <p className="text-[10px] text-slate-400 pl-1">+{dayAppts.length - 3} más</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── WEEK VIEW ──────────────────────────────────────────────────── */}
        {view === 'week' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-slate-100">
              {weekDays.map(day => {
                const isTodayDay = isToday(day);
                return (
                  <div key={fmt(day, 'yyyy-MM-dd')} className="py-3 text-center border-r last:border-r-0 border-slate-100">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase">
                      {fmt(day, 'EEE')}
                    </p>
                    <span className={`mt-0.5 text-sm font-bold w-8 h-8 flex items-center justify-center rounded-full mx-auto ${
                      isTodayDay ? 'bg-blue-600 text-white' : 'text-slate-700'
                    }`}>
                      {format(day, 'd')}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Appointment columns */}
            <div className="grid grid-cols-7 divide-x divide-slate-100 min-h-[400px]">
              {weekDays.map(day => {
                const ds        = fmt(day, 'yyyy-MM-dd');
                const dayAppts  = appointments
                  .filter(a => a.date === ds)
                  .sort((a, b) => a.timeStart.localeCompare(b.timeStart));
                const isTodayDay = isToday(day);

                return (
                  <div key={ds} className={`p-2 ${isTodayDay ? 'bg-blue-50/30' : ''}`}>
                    {dayAppts.length === 0 ? (
                      <p className="text-[11px] text-slate-300 text-center pt-4">—</p>
                    ) : (
                      dayAppts.map(a => (
                        <WeekApptBlock key={a.id} appt={a} onClick={() => setSelected(a)} />
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
            <div className="h-6 w-6 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
          </div>
        )}
      </div>

      {/* ── Legend ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-white border-t border-slate-100 px-5 py-2 flex items-center gap-4">
        {Object.entries(STATUS_LABEL).map(([status, label]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${STATUS_DOT[status]}`} />
            <span className="text-xs text-slate-500">{label}</span>
          </div>
        ))}
      </div>

      {/* ── Detail modal ───────────────────────────────────────────────────── */}
      {selected && (
        <AppointmentDetailModal
          appointment={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
