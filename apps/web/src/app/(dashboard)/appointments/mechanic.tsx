'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus, Clock, Wrench, User, CalendarCheck, Car } from 'lucide-react';
import { useModulePermission } from '@/hooks/use-module-permission';
import { format, addDays, subDays, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isToday as dateFnsIsToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAppointmentsByDate, useAppointmentsByRange } from '@/hooks/use-appointments';
import { useTechnicians } from '@/hooks/use-technicians';
import { useDailyCapacity } from '@/hooks/use-capacity';
import { formatDate, timeToMinutes, minutesToTime } from '@/lib/utils';
import type { Appointment } from '@/types';
import { InfoButton } from '@/components/ui/info-button';
import { AppointmentDetailModal } from '@/components/appointments/appointment-detail-modal';

const HOUR_START = 8;
const HOUR_END = 18;
const SLOT_HEIGHT = 52; // px por slot de 30 min
const SLOT_GAP = 4;     // px de gap entre slots

function generateSlots(): string[] {
  const slots: string[] = [];
  for (let m = HOUR_START * 60; m < HOUR_END * 60; m += 60) {
    slots.push(minutesToTime(m));
    slots.push(minutesToTime(m + 30));
  }
  return slots;
}

const ALL_SLOTS = generateSlots();

// Paleta por estado — fondo, borde izq, texto, badge
const STATUS_STYLE = {
  scheduled: {
    card: 'bg-blue-50 border-blue-200',
    stripe: 'bg-blue-500',
    title: 'text-blue-900',
    sub: 'text-blue-600',
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
    label: 'Agendado',
    dot: 'bg-blue-500',
  },
  in_progress: {
    card: 'bg-amber-50 border-amber-300',
    stripe: 'bg-amber-500',
    title: 'text-amber-900',
    sub: 'text-amber-700',
    badge: 'bg-amber-100 text-amber-800 border-amber-300',
    label: 'En proceso',
    dot: 'bg-amber-500 animate-pulse',
  },
  done: {
    card: 'bg-emerald-50 border-emerald-200',
    stripe: 'bg-emerald-500',
    title: 'text-emerald-900',
    sub: 'text-emerald-600',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    label: 'Listo',
    dot: 'bg-emerald-500',
  },
  cancelled: {
    card: 'bg-slate-100 border-slate-200 opacity-50',
    stripe: 'bg-slate-300',
    title: 'text-slate-400 line-through',
    sub: 'text-slate-400',
    badge: 'bg-slate-100 text-slate-400 border-slate-200',
    label: 'Cancelado',
    dot: 'bg-slate-300',
  },
} as const;

// Colores de avatar por índice (para los técnicos)
const AVATAR_COLORS = [
  'from-blue-500 to-blue-700',
  'from-violet-500 to-violet-700',
  'from-emerald-500 to-emerald-700',
  'from-orange-500 to-orange-700',
  'from-rose-500 to-rose-700',
  'from-cyan-500 to-cyan-700',
  'from-indigo-500 to-indigo-700',
  'from-teal-500 to-teal-700',
];

export default function MechanicAppointmentsPage() {
  const { canEdit } = useModulePermission('appointments');
  const router = useRouter();
  const searchParams = useSearchParams();
  // Soporta deep-link desde el buscador: /appointments?date=X&openId=Y abre el modal del turno.
  const initialDate = searchParams.get('date') ?? formatDate(new Date());
  const openId      = searchParams.get('openId') ?? null;
  const [date, setDate]       = useState(initialDate);
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day');
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  const ref = parseISO(date + 'T12:00:00');
  const rangeFrom = viewMode === 'week'
    ? formatDate(startOfWeek(ref, { weekStartsOn: 1 }))
    : viewMode === 'month'
    ? formatDate(startOfMonth(ref))
    : date;
  const rangeTo = viewMode === 'week'
    ? formatDate(endOfWeek(ref, { weekStartsOn: 1 }))
    : viewMode === 'month'
    ? formatDate(endOfMonth(ref))
    : date;

  const { data: appointments = [], isLoading }       = useAppointmentsByDate(date);
  const { data: rangeAppts = [], isLoading: loadingRange } = useAppointmentsByRange(
    viewMode !== 'day' ? rangeFrom : '',
    viewMode !== 'day' ? rangeTo   : '',
  );
  const { data: technicians = [] } = useTechnicians();
  const { data: capacity = [] }    = useDailyCapacity(date);

  // Si vino con ?openId=... y los appointments del día ya están cargados,
  // abrir automáticamente el modal del turno coincidente y limpiar el query param.
  useEffect(() => {
    if (!openId || appointments.length === 0) return;
    const found = appointments.find(a => a.id === openId);
    if (found) {
      setSelectedAppointment(found);
      // Limpia el openId de la URL para que recargar no vuelva a disparar el modal.
      const params = new URLSearchParams(searchParams.toString());
      params.delete('openId');
      router.replace(`/appointments${params.toString() ? '?' + params.toString() : ''}`, { scroll: false });
    }
  }, [openId, appointments, searchParams, router]);

  const occupied = appointments.filter(a => a.status !== 'cancelled');
  const scheduledCount = appointments.filter(a => a.status === 'scheduled').length;
  const inProgressCount = appointments.filter(a => a.status === 'in_progress').length;
  const doneCount = appointments.filter(a => a.status === 'done').length;
  const totalSlots = technicians.length * ALL_SLOTS.length;
  const pctOcupado = totalSlots > 0 ? Math.round((occupied.length / totalSlots) * 100) : 0;

  function getSlotAppointment(slot: string, techId: string): Appointment | null {
    return appointments.find(a =>
      a.status !== 'cancelled' &&
      a.technicianId === techId &&
      timeToMinutes(a.timeStart) <= timeToMinutes(slot) &&
      timeToMinutes(a.timeEnd) > timeToMinutes(slot)
    ) ?? null;
  }

  function isSlotStart(slot: string, appt: Appointment): boolean {
    return appt.timeStart === slot;
  }

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm">
              <CalendarCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900">Agenda de Mecánica</h1>
                <InfoButton helpKey="appointments" />
              </div>
              <p className="text-xs text-slate-500 capitalize">
                {format(parseISO(date + 'T12:00:00'), "EEEE, d 'de' MMMM yyyy", { locale: es })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Pills de resumen rápido */}
            <div className="hidden md:flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> {scheduledCount} agendados
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" /> {inProgressCount} en proceso
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {doneCount} listos
              </span>
            </div>

            {/* Filtros Hoy / Semana / Mes */}
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              {(['day','week','month'] as const).map(m => (
                <button key={m} onClick={() => { setViewMode(m); if (m === 'day') setDate(formatDate(new Date())); }}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${viewMode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {m === 'day' ? 'Hoy' : m === 'week' ? 'Semana' : 'Mes'}
                </button>
              ))}
            </div>

            {/* Navegacion de fecha */}
            <div className="flex items-center gap-1 border border-slate-200 rounded-lg px-1 py-1 bg-white shadow-sm">
              <button
                onClick={() => setDate(formatDate(subDays(parseISO(date), 1)))}
                className="p-1.5 rounded-md hover:bg-slate-100 transition-colors"
              >
                <ChevronLeft className="h-4 w-4 text-slate-400" />
              </button>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="text-sm font-semibold text-slate-700 border-0 outline-none bg-transparent px-1"
              />
              <button
                onClick={() => setDate(formatDate(addDays(parseISO(date), 1)))}
                className="p-1.5 rounded-md hover:bg-slate-100 transition-colors"
              >
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
            </div>

            {canEdit && (
              <button
                onClick={() => router.push(`/appointments/new?date=${date}`)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm"
              >
                <Plus className="h-4 w-4" /> Nuevo Turno
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Vista Semana / Mes ──────────────────────────────────────────── */}
      {viewMode !== 'day' && (
        <div className="flex-1 overflow-auto p-5 space-y-4">
          {loadingRange ? (
            <div className="flex items-center justify-center h-40 gap-3 text-slate-400">
              <div className="h-5 w-5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
              <span className="text-sm">Cargando...</span>
            </div>
          ) : (
            eachDayOfInterval({ start: parseISO(rangeFrom + 'T12:00:00'), end: parseISO(rangeTo + 'T12:00:00') })
              .filter(d => d.getDay() !== 0)
              .map(d => {
                const ds = formatDate(d);
                const dayAppts = rangeAppts.filter((a: Appointment) => a.date === ds && a.status !== 'cancelled');
                const isHoy = dateFnsIsToday(d);
                return (
                  <div key={ds}>
                    <div className={`flex items-center gap-2 mb-2 cursor-pointer`} onClick={() => { setDate(ds); setViewMode('day'); }}>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${isHoy ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                        {format(d, "EEE d MMM", { locale: es })}
                      </span>
                      <span className="text-xs text-slate-400">{dayAppts.length} turno{dayAppts.length !== 1 ? 's' : ''}</span>
                    </div>
                    {dayAppts.length === 0 ? (
                      <p className="text-xs text-slate-300 pl-2 pb-2">Sin turnos</p>
                    ) : (
                      <div className="space-y-1.5">
                        {dayAppts.map((a: Appointment) => {
                          const statusColor = a.status === 'done' ? 'bg-emerald-500' : a.status === 'in_progress' ? 'bg-amber-500' : 'bg-blue-500';
                          return (
                            <button key={a.id} onClick={() => setSelectedAppointment(a)}
                              className="w-full text-left bg-white border border-slate-200 rounded-xl px-4 py-2.5 flex items-center gap-3 hover:border-blue-300 hover:shadow-sm transition-all">
                              <span className={`h-2 w-2 rounded-full flex-shrink-0 ${statusColor}`} />
                              <span className="text-xs font-semibold text-slate-700 w-20 flex-shrink-0">{a.timeStart} – {a.timeEnd}</span>
                              <span className="text-xs font-bold text-slate-900 truncate flex-1">{a.customerName}</span>
                              <span className="text-xs text-slate-500 truncate hidden sm:block">{a.serviceType?.name}</span>
                              <span className="text-[10px] text-slate-400 flex-shrink-0">{technicians.find(t => t.id === a.technicianId)?.name?.split(' ')[0]}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
          )}
        </div>
      )}

      {/* ── Grilla principal ────────────────────────────────────────────── */}
      {viewMode === 'day' && <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-64 gap-3 text-slate-400">
            <div className="h-5 w-5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
            <span className="text-sm">Cargando agenda...</span>
          </div>
        ) : (
          <div className="p-5">
            {/* ── Ocupacion del dia ────────────────────────────────────── */}
            <div className="mb-4 bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      pctOcupado >= 80 ? 'bg-rose-500' :
                      pctOcupado >= 50 ? 'bg-amber-400' :
                      'bg-blue-500'
                    }`}
                    style={{ width: `${pctOcupado}%` }}
                  />
                </div>
                <span className="text-sm font-bold text-slate-800 whitespace-nowrap">{pctOcupado}% ocupado</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3 flex-1">
                  <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <Clock className="h-5 w-5 text-slate-500" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">Ocupación del día</p>
                    <p className="text-xs text-slate-500">
                      {occupied.length} turnos activos · {technicians.length} técnico{technicians.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> Agendado</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> En proceso</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Listo</span>
                </div>
              </div>
            </div>

            {/* ── Cabeceras de técnicos ────────────────────────────────── */}
            <div
              className="grid gap-3 mb-4 sticky top-0 z-10 bg-slate-100 pb-2 pt-1"
              style={{ gridTemplateColumns: `72px repeat(${technicians.length}, 1fr)` }}
            >
              <div /> {/* spacer hora */}
              {technicians.map((tech, idx) => {
                const cap = capacity.find(c => c.technicianId === tech.id);
                const horasLibres = (cap?.availableHours ?? 0) - (cap?.usedHours ?? 0);
                const horasTotal = cap?.availableHours ?? 0;
                const pct = horasTotal > 0 ? Math.round(((horasTotal - horasLibres) / horasTotal) * 100) : 0;
                const avatarColor = AVATAR_COLORS[idx % AVATAR_COLORS.length];
                const initials = tech.name
                  .split(' ')
                  .slice(0, 2)
                  .map((n: string) => n[0])
                  .join('');

                return (
                  <div
                    key={tech.id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3.5 flex items-center gap-3"
                  >
                    {/* Avatar */}
                    <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${avatarColor} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                      <span className="text-xs font-bold text-white">{initials}</span>
                    </div>

                    <div className="min-w-0 flex-1">
                      {/* Nombre */}
                      <p className="text-sm font-bold text-slate-900 truncate leading-tight">
                        {tech.name.split(' ')[0]}
                      </p>

                      {/* Especialidad — badge destacado */}
                      {tech.specialty && (
                        <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-700 border border-violet-200 leading-none">
                          <Wrench className="h-2.5 w-2.5" />
                          {tech.specialty}
                        </span>
                      )}

                      {/* Barra de ocupacion */}
                      <div className="mt-2 flex items-center gap-1.5">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              pct >= 80 ? 'bg-rose-500' :
                              pct >= 50 ? 'bg-amber-400' :
                              'bg-emerald-400'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-semibold text-slate-500 whitespace-nowrap">
                          {horasLibres}h libres
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Slots ───────────────────────────────────────────────── */}
            <div className="space-y-1">
              {ALL_SLOTS.map(slot => {
                const isHour = slot.endsWith(':00');
                const slotAppointments = technicians.map(tech => ({
                  tech,
                  appt: getSlotAppointment(slot, tech.id),
                }));

                return (
                  <div
                    key={slot}
                    className="grid gap-3 items-center"
                    style={{ gridTemplateColumns: `72px repeat(${technicians.length}, 1fr)` }}
                  >
                    {/* Etiqueta hora */}
                    <div className="text-right pr-3 select-none">
                      {isHour ? (
                        <span className="text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-md px-1.5 py-0.5 shadow-sm">
                          {slot}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-300">{slot}</span>
                      )}
                    </div>

                    {slotAppointments.map(({ tech, appt }) => {
                      const cap = capacity.find(c => c.technicianId === tech.id);
                      const isAbsent = !cap?.isWorkingDay || cap.absenceType === 'full';

                      const isBlocked =
                        cap?.absenceType === 'partial' &&
                        cap.blockedFrom && cap.blockedTo &&
                        timeToMinutes(slot) >= timeToMinutes(cap.blockedFrom) &&
                        timeToMinutes(slot) < timeToMinutes(cap.blockedTo);

                      // No labora
                      if (isAbsent) {
                        return (
                          <div
                            key={tech.id}
                            className="rounded-xl bg-slate-100 border border-dashed border-slate-200 flex items-center justify-center"
                            style={{ height: SLOT_HEIGHT }}
                          >
                            <span className="text-[10px] text-slate-300 font-medium">No labora</span>
                          </div>
                        );
                      }

                      // Bloqueo parcial
                      if (isBlocked && !appt) {
                        const isBlockStart = cap.blockedFrom === slot;
                        if (isBlockStart) {
                          const blockMins = timeToMinutes(cap.blockedTo!) - timeToMinutes(cap.blockedFrom!);
                          const blockSlots = blockMins / 30;
                          const blockH = blockSlots * SLOT_HEIGHT + (blockSlots - 1) * SLOT_GAP;
                          return (
                            <div
                              key={tech.id}
                              className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 flex flex-col justify-center"
                              style={{ height: blockH }}
                            >
                              <p className="text-xs font-bold text-violet-700 truncate">
                                {cap.absenceReason ?? 'Bloqueo'}
                              </p>
                              <p className="text-[10px] text-violet-400 mt-0.5">
                                {cap.blockedFrom} – {cap.blockedTo}
                              </p>
                            </div>
                          );
                        }
                        return <div key={tech.id} style={{ height: SLOT_HEIGHT }} />;
                      }

                      // Turno agendado — tarjeta visual
                      if (appt && isSlotStart(slot, appt)) {
                        const durationSlots = (timeToMinutes(appt.timeEnd) - timeToMinutes(appt.timeStart)) / 30;
                        const cardH = durationSlots * SLOT_HEIGHT + (durationSlots - 1) * SLOT_GAP;
                        const statusKey = (appt.status as keyof typeof STATUS_STYLE) in STATUS_STYLE
                          ? (appt.status as keyof typeof STATUS_STYLE)
                          : 'scheduled';
                        const s = STATUS_STYLE[statusKey];

                        return (
                          <button
                            key={tech.id}
                            onClick={() => setSelectedAppointment(appt)}
                            className={`relative w-full rounded-xl border text-left overflow-hidden transition-all hover:shadow-md hover:-translate-y-0.5 ${s.card}`}
                            style={{ height: cardH }}
                          >
                            {/* Franja lateral de color por estado */}
                            <div className={`absolute left-0 top-0 bottom-0 w-1 ${s.stripe}`} />

                            <div className="pl-3 pr-2.5 py-2 h-full flex flex-col justify-between">
                              <div className="min-w-0">
                                {/* Cliente + chapa en misma fila */}
                                <div className="flex items-center justify-between gap-1.5 min-w-0">
                                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                    <User className={`h-3 w-3 flex-shrink-0 ${s.sub}`} />
                                    <p className={`text-xs font-bold truncate ${s.title}`}>
                                      {appt.customerName}
                                    </p>
                                  </div>
                                  {appt.plate && (
                                    <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${s.badge}`}>
                                      <Car className="h-2 w-2" />
                                      {appt.plate}
                                    </span>
                                  )}
                                </div>

                                {/* Servicio */}
                                {cardH > 60 && (
                                  <div className="flex items-center gap-1 mt-0.5 min-w-0">
                                    <Wrench className={`h-2.5 w-2.5 flex-shrink-0 ${s.sub}`} />
                                    <p className={`text-[10px] truncate ${s.sub}`}>
                                      {appt.serviceType.name}
                                    </p>
                                  </div>
                                )}

                                {/* Notas — solo si hay espacio suficiente */}
                                {cardH > 100 && appt.notes && (
                                  <p className={`text-[10px] italic truncate mt-0.5 ${s.sub} opacity-70`}>
                                    {appt.notes}
                                  </p>
                                )}
                              </div>

                              {/* Fila inferior: horario + badge estado */}
                              <div className="flex items-center justify-between mt-1 gap-1">
                                <div className={`flex items-center gap-1 text-[10px] font-semibold ${s.sub}`}>
                                  <Clock className="h-2.5 w-2.5 flex-shrink-0" />
                                  <span>{appt.timeStart}–{appt.timeEnd}</span>
                                </div>
                                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${s.badge} whitespace-nowrap`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                                  {s.label}
                                </span>
                              </div>
                            </div>
                          </button>
                        );
                      }

                      // Slot ocupado por continuacion de turno previo
                      if (appt && !isSlotStart(slot, appt)) {
                        return <div key={tech.id} style={{ height: SLOT_HEIGHT }} />;
                      }

                      // Slot libre — invita a reservar
                      return (
                        <button
                          key={tech.id}
                          onClick={() => canEdit && router.push(`/appointments/new?date=${date}&time=${slot}&tech=${tech.id}`)}
                          className={`rounded-xl border border-dashed flex items-center justify-center gap-1.5 group transition-all ${
                            canEdit
                              ? 'border-slate-200 hover:border-blue-400 hover:bg-blue-50 cursor-pointer'
                              : 'border-slate-100 cursor-default'
                          }`}
                          style={{ height: SLOT_HEIGHT }}
                        >
                          {canEdit && (
                            <>
                              <Plus className="h-3.5 w-3.5 text-slate-200 group-hover:text-blue-500 transition-colors" />
                              <span className="text-[10px] font-semibold text-slate-200 group-hover:text-blue-500 transition-colors">
                                Reservar
                              </span>
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>

          </div>
        )}
      </div>}

      {selectedAppointment && (
        <AppointmentDetailModal
          appointment={selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
        />
      )}
    </div>
  );
}
