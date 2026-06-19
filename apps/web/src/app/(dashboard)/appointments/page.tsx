'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus, Clock, User } from 'lucide-react';
import { format, addDays, subDays, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAppointmentsByDate } from '@/hooks/use-appointments';
import { useTechnicians } from '@/hooks/use-technicians';
import { useDailyCapacity } from '@/hooks/use-capacity';
import { formatDate, timeToMinutes, minutesToTime } from '@/lib/utils';
import type { Appointment, Technician } from '@/types';
import { AppointmentDetailModal } from '@/components/appointments/appointment-detail-modal';

const HOUR_START = 8;
const HOUR_END = 18;

function generateSlots(): string[] {
  const slots: string[] = [];
  for (let m = HOUR_START * 60; m < HOUR_END * 60; m += 60) {
    slots.push(minutesToTime(m));
    slots.push(minutesToTime(m + 30));
  }
  return slots;
}

const ALL_SLOTS = generateSlots();

export default function AppointmentsPage() {
  const router = useRouter();
  const [date, setDate] = useState(formatDate(new Date()));
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  const { data: appointments = [], isLoading } = useAppointmentsByDate(date);
  const { data: technicians = [] } = useTechnicians();
  const { data: capacity = [] } = useDailyCapacity(date);

  const occupied = appointments.filter(a => a.status !== 'cancelled');
  const pctOcupado = technicians.length > 0
    ? Math.round((occupied.length / (technicians.length * 4)) * 100)
    : 0;

  function getSlotAppointment(slot: string, techId: string): Appointment | null {
    return occupied.find(a =>
      a.technicianId === techId &&
      timeToMinutes(a.timeStart) <= timeToMinutes(slot) &&
      timeToMinutes(a.timeEnd) > timeToMinutes(slot)
    ) ?? null;
  }

  function isSlotStart(slot: string, appt: Appointment): boolean {
    return appt.timeStart === slot;
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Consultar Disponibilidad</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Horarios Disponibles: <span className="capitalize font-medium text-slate-700">
                {format(parseISO(date + 'T12:00:00'), "EEEE, d 'de' MMMM", { locale: es })}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 border border-slate-200 rounded-lg px-1 py-1 bg-white">
            <button onClick={() => setDate(formatDate(subDays(parseISO(date), 1)))} className="p-1.5 rounded-md hover:bg-slate-100">
              <ChevronLeft className="h-4 w-4 text-slate-400" />
            </button>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="text-sm font-medium text-slate-700 border-0 outline-none bg-transparent px-1"
            />
            <button onClick={() => setDate(formatDate(addDays(parseISO(date), 1)))} className="p-1.5 rounded-md hover:bg-slate-100">
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </button>
          </div>
          <button
            onClick={() => router.push(`/appointments/new?date=${date}`)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" /> Nuevo Turno
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Cargando...</div>
        ) : (
          <div className="p-6 space-y-2">
            {/* Column headers */}
            <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: '80px repeat(' + technicians.length + ', 1fr)' }}>
              <div />
              {technicians.map(tech => {
                const cap = capacity.find(c => c.technicianId === tech.id);
                return (
                  <div key={tech.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-white">{tech.name.charAt(0)}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{tech.name.split(' ')[0]}</p>
                      <p className="text-xs text-slate-400">{(cap?.availableHours ?? 0) - (cap?.usedHours ?? 0)}h libres</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Slots */}
            {ALL_SLOTS.map(slot => {
              const isHour = slot.endsWith(':00');
              const slotAppointments = technicians.map(tech => ({
                tech,
                appt: getSlotAppointment(slot, tech.id),
              }));

              return (
                <div
                  key={slot}
                  className="grid gap-2 items-center"
                  style={{ gridTemplateColumns: '80px repeat(' + technicians.length + ', 1fr)' }}
                >
                  {/* Time label */}
                  <div className={`text-right pr-3 ${isHour ? 'py-1' : ''}`}>
                    {isHour && (
                      <span className="text-sm font-bold text-slate-700">{slot}</span>
                    )}
                    {!isHour && (
                      <span className="text-xs text-slate-400">{slot}</span>
                    )}
                  </div>

                  {/* Tech cells */}
                  {slotAppointments.map(({ tech, appt }) => {
                    const cap = capacity.find(c => c.technicianId === tech.id);
                    const isAbsent = !cap?.isWorkingDay || cap.absenceType === 'full';

                    if (isAbsent) {
                      return (
                        <div key={tech.id} className="h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center">
                          <span className="text-xs text-slate-400">No labora</span>
                        </div>
                      );
                    }

                    if (appt && isSlotStart(slot, appt)) {
                      const durationSlots = (timeToMinutes(appt.timeEnd) - timeToMinutes(appt.timeStart)) / 30;
                      return (
                        <button
                          key={tech.id}
                          onClick={() => setSelectedAppointment(appt)}
                          className="rounded-lg border text-left px-3 py-2 transition-all hover:shadow-md"
                          style={{
                            height: `${durationSlots * 48 + (durationSlots - 1) * 8}px`,
                            borderLeftColor: appt.serviceType.color,
                            borderLeftWidth: 3,
                            borderColor: `${appt.serviceType.color}40`,
                            backgroundColor: `${appt.serviceType.color}10`,
                          }}
                        >
                          <p className="text-xs font-bold text-slate-900 truncate">{appt.customerName}</p>
                          <p className="text-xs text-slate-500 truncate">{appt.serviceType.name}</p>
                          <p className="text-xs text-slate-400">{appt.timeStart}–{appt.timeEnd}</p>
                          <span className={`inline-flex mt-1 text-xs font-medium px-1.5 py-0.5 rounded-full ${
                            appt.status === 'in_progress' ? 'bg-amber-100 text-amber-700' :
                            appt.status === 'done' ? 'bg-emerald-100 text-emerald-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {appt.status === 'in_progress' ? 'En proceso' : appt.status === 'done' ? 'Listo' : 'Agendado'}
                          </span>
                        </button>
                      );
                    }

                    if (appt && !isSlotStart(slot, appt)) {
                      return <div key={tech.id} className="h-10" />;
                    }

                    // Empty slot
                    return (
                      <button
                        key={tech.id}
                        onClick={() => router.push(`/appointments/new?date=${date}&time=${slot}&tech=${tech.id}`)}
                        className="h-10 rounded-lg border border-dashed border-slate-200 hover:border-blue-300 hover:bg-blue-50 flex items-center justify-center gap-1.5 group transition-all"
                      >
                        <Plus className="h-3 w-3 text-slate-300 group-hover:text-blue-500" />
                        <span className="text-xs text-slate-300 group-hover:text-blue-500 font-medium">Reservar</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}

            {/* Bottom ocupado stat */}
            <div className="mt-4 bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-slate-500" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Consultar Disponibilidad</p>
                  <p className="text-xs text-slate-500">{occupied.length} de {technicians.length * 4} slots usados hoy</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pctOcupado}%` }} />
                </div>
                <span className="text-sm font-bold text-slate-900">{pctOcupado}% Ocupado</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {selectedAppointment && (
        <AppointmentDetailModal
          appointment={selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
        />
      )}
    </div>
  );
}
