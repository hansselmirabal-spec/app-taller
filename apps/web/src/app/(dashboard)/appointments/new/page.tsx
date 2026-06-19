'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, AlertTriangle, Clock, User, Car, Wrench, CalendarDays, CheckCircle2 } from 'lucide-react';
import { useTechnicians } from '@/hooks/use-technicians';
import { useServiceTypes } from '@/hooks/use-service-types';
import { useDailyCapacity } from '@/hooks/use-capacity';
import { useCreateAppointment, useAppointmentsByDate } from '@/hooks/use-appointments';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDate, minutesToTime, timeToMinutes, formatDateDisplay } from '@/lib/utils';
import type { Appointment } from '@/types';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

const SLOT_INTERVAL = 30;
const HOUR_START = 8;
const HOUR_END = 18;

function generateTimeSlots() {
  const slots: string[] = [];
  for (let min = HOUR_START * 60; min < HOUR_END * 60; min += SLOT_INTERVAL) {
    slots.push(minutesToTime(min));
  }
  return slots;
}

function checkOverlap(slotStart: string, durationHours: number, existingAppointments: Appointment[], technicianId: string): Appointment | null {
  const newStart = timeToMinutes(slotStart);
  const newEnd = newStart + durationHours * 60;
  return existingAppointments.find(appt =>
    appt.technicianId === technicianId &&
    appt.status !== 'cancelled' &&
    timeToMinutes(appt.timeStart) < newEnd &&
    timeToMinutes(appt.timeEnd) > newStart
  ) ?? null;
}

function NewAppointmentForm() {
  const router = useRouter();
  const params = useSearchParams();
  const create = useCreateAppointment();

  const [date, setDate] = useState(params.get('date') || formatDate(new Date()));
  const [serviceTypeId, setServiceTypeId] = useState('');
  const [technicianId, setTechnicianId] = useState(params.get('tech') || '');
  const [timeStart, setTimeStart] = useState(params.get('time') || '');
  const [customerName, setCustomerName] = useState('');
  const [plate, setPlate] = useState('');
  const [model, setModel] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [confirmOverload, setConfirmOverload] = useState(false);

  const { data: technicians = [] } = useTechnicians();
  const { data: serviceTypes = [] } = useServiceTypes();
  const { data: capacity = [] } = useDailyCapacity(date);
  const { data: existingAppointments = [] } = useAppointmentsByDate(date);

  const selectedService = serviceTypes.find(s => s.id === serviceTypeId);
  const selectedTech = technicians.find(t => t.id === technicianId);

  // Cálculo de sobrecarga: horas ya usadas + duración del nuevo turno vs disponibles
  const techCapacity = capacity.find(c => c.technicianId === technicianId);
  const projectedUsed = (techCapacity?.usedHours ?? 0) + (selectedService?.durationHours ?? 0);
  const availableHours = techCapacity?.availableHours ?? 0;
  const isOverloaded = !!(technicianId && selectedService && availableHours > 0 && projectedUsed > availableHours);
  const isNearCapacity = !!(technicianId && selectedService && availableHours > 0 && !isOverloaded && projectedUsed >= availableHours * 0.85);
  const horasRestantes = availableHours - (techCapacity?.usedHours ?? 0);

  const availableTechnicians = technicians.filter(tech => {
    const cap = capacity.find(c => c.technicianId === tech.id);
    // Siempre incluir el técnico pre-seleccionado aunque capacity aún no haya cargado
    if (tech.id === technicianId) return true;
    return cap && cap.availableHours > 0;
  });

  const timeSlots = generateTimeSlots().map(slot => ({
    slot,
    conflict: technicianId && selectedService
      ? checkOverlap(slot, selectedService.durationHours, existingAppointments, technicianId)
      : null,
  }));

  const currentConflict = timeStart && selectedService && technicianId
    ? checkOverlap(timeStart, selectedService.durationHours, existingAppointments, technicianId)
    : null;

  const timeEnd = timeStart && selectedService
    ? minutesToTime(timeToMinutes(timeStart) + selectedService.durationHours * 60)
    : null;

  const isFormComplete = customerName && plate && serviceTypeId && technicianId && timeStart && !currentConflict && (!isOverloaded || confirmOverload);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!isFormComplete) {
      setError('Completá todos los campos obligatorios');
      return;
    }
    try {
      await create.mutateAsync({ date, timeStart, technicianId, serviceTypeId, customerName, plate: plate.toUpperCase(), notes });
      router.push(`/appointments?date=${date}`);
    } catch (err: any) {
      setError(err.message || 'Error al crear el turno');
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
          <ArrowLeft className="h-4 w-4 text-slate-500" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-slate-900">Confirmar Turno</h1>
          <p className="text-xs text-slate-500">Finalizá y detallá el taller para el turno de servicio premium</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <form onSubmit={handleSubmit} className="flex gap-6 p-6 min-h-full">
          {/* Left — Form */}
          <div className="flex-1 space-y-5 min-w-0">

            {/* Seccion 1: Cliente */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100">
                <div className="h-6 w-6 rounded-md bg-blue-50 flex items-center justify-center">
                  <User className="h-3.5 w-3.5 text-blue-600" />
                </div>
                <span className="text-sm font-semibold text-slate-900">Información del Cliente</span>
              </div>
              <div className="px-5 py-4 grid grid-cols-2 gap-4">
                <Field label="Nombre y Apellido">
                  <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Juan Perez" />
                </Field>
                <Field label="Teléfono">
                  <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+54 11 0000-0000" type="tel" />
                </Field>
              </div>
            </div>

            {/* Seccion 2: Vehículo */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100">
                <div className="h-6 w-6 rounded-md bg-violet-50 flex items-center justify-center">
                  <Car className="h-3.5 w-3.5 text-violet-600" />
                </div>
                <span className="text-sm font-semibold text-slate-900">Detalles del Vehículo</span>
              </div>
              <div className="px-5 py-4 grid grid-cols-3 gap-4">
                <Field label="Patente">
                  <Input value={plate} onChange={e => setPlate(e.target.value.toUpperCase())} placeholder="ABC123" className="uppercase" />
                </Field>
                <Field label="Modelo">
                  <Input value={model} onChange={e => setModel(e.target.value)} placeholder="Toyota Corolla" />
                </Field>
                <Field label="Año">
                  <Input placeholder="2022" type="number" min="1990" max="2030" />
                </Field>
              </div>
            </div>

            {/* Seccion 3: Servicio */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100">
                <div className="h-6 w-6 rounded-md bg-emerald-50 flex items-center justify-center">
                  <Wrench className="h-3.5 w-3.5 text-emerald-600" />
                </div>
                <span className="text-sm font-semibold text-slate-900">Selección de Servicio</span>
              </div>
              <div className="px-5 py-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Tipo de servicio">
                    <Select value={serviceTypeId} onValueChange={v => { setServiceTypeId(v); setTimeStart(''); setConfirmOverload(false); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar..." />
                      </SelectTrigger>
                      <SelectContent>
                        {serviceTypes.map(st => (
                          <SelectItem key={st.id} value={st.id}>
                            <span className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full inline-block" style={{ background: st.color }} />
                              {st.name} ({st.durationHours}h)
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Fecha">
                    <Input type="date" value={date} onChange={e => { setDate(e.target.value); setTimeStart(''); setConfirmOverload(false); }} />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Técnico disponible">
                    <Select value={technicianId} onValueChange={v => { setTechnicianId(v); setTimeStart(''); setConfirmOverload(false); }} disabled={!serviceTypeId && !technicianId}>
                      <SelectTrigger>
                        <SelectValue placeholder={serviceTypeId ? 'Seleccionar...' : 'Primero elige un servicio'} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableTechnicians.map(tech => {
                          const cap = capacity.find(c => c.technicianId === tech.id);
                          return (
                            <SelectItem key={tech.id} value={tech.id}>
                              {tech.name} — {(cap?.availableHours ?? 0).toFixed(0)}h disp.
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Hora de inicio">
                    <Select value={timeStart} onValueChange={setTimeStart} disabled={!technicianId}>
                      <SelectTrigger className={currentConflict ? 'border-amber-400' : ''}>
                        <SelectValue placeholder="Seleccionar horario..." />
                      </SelectTrigger>
                      <SelectContent>
                        {timeSlots.map(({ slot, conflict }) => (
                          <SelectItem key={slot} value={slot} disabled={!!conflict} className={conflict ? 'opacity-40 line-through' : ''}>
                            {conflict ? `${slot} — ocupado` : slot}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                {currentConflict && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-amber-800">
                      <p className="font-semibold">Horario ocupado</p>
                      <p>{selectedTech?.name} tiene turno de <strong>{currentConflict.timeStart}</strong> a <strong>{currentConflict.timeEnd}</strong> ({currentConflict.customerName})</p>
                    </div>
                  </div>
                )}

                {/* Sobrecarga: excede capacidad disponible */}
                {isOverloaded && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-red-300 bg-red-50 px-4 py-3">
                    <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-red-800 flex-1">
                      <p className="font-semibold">Técnico sobrecargado</p>
                      <p>
                        {selectedTech?.name} solo tiene <strong>{horasRestantes.toFixed(1)}h disponibles</strong> y este servicio requiere <strong>{selectedService?.durationHours}h</strong>.
                      </p>
                      <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={confirmOverload}
                          onChange={e => setConfirmOverload(e.target.checked)}
                          className="rounded border-red-400 accent-red-600"
                        />
                        <span className="font-medium">Entiendo el riesgo, confirmar igual</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Advertencia: cerca del límite (≥85%) */}
                {isNearCapacity && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-amber-800">
                      <p className="font-semibold">Capacidad casi completa</p>
                      <p>{selectedTech?.name} quedará con <strong>{(availableHours - projectedUsed).toFixed(1)}h libres</strong> después de este turno.</p>
                    </div>
                  </div>
                )}

                <Field label="Notas (opcional)">
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Observaciones, historial del vehículo..."
                    className="flex min-h-[72px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 resize-none"
                  />
                </Field>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3">
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
          </div>

          {/* Right — Panel de resumen */}
          <div className="w-72 flex-shrink-0 space-y-4">
            {/* Horario seleccionado */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-900 px-4 py-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Horario Seleccionado</p>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <CalendarDays className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900 capitalize">
                      {date ? format(parseISO(date + 'T12:00:00'), "EEE d 'de' MMMM", { locale: es }) : '—'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {timeStart ? `${timeStart} ${timeEnd ? `→ ${timeEnd}` : ''}` : 'Sin hora seleccionada'}
                    </p>
                  </div>
                </div>
                {selectedTech && (
                  <div className="flex items-center gap-3 border-t border-slate-100 pt-3">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-white">{selectedTech.name.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{selectedTech.name}</p>
                      <p className="text-xs text-slate-500">Técnico asignado</p>
                    </div>
                  </div>
                )}
                {selectedService && (
                  <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
                    <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: selectedService.color }} />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{selectedService.name}</p>
                      <p className="text-xs text-slate-500">{selectedService.durationHours}h de duración</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* CTA */}
            <button
              type="submit"
              disabled={!isFormComplete || create.isPending}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2"
            >
              {create.isPending ? (
                <>Guardando...</>
              ) : (
                <><CheckCircle2 className="h-4 w-4" /> Confirmar Reserva</>
              )}
            </button>

            <button
              type="button"
              onClick={() => router.back()}
              className="w-full text-sm text-slate-500 hover:text-slate-800 py-2 text-center transition-colors"
            >
              Cancelar
            </button>

            {/* Info extra */}
            <div className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3">
              <p className="text-xs font-semibold text-slate-700 mb-1">¿Cambio de vehículo de servicio?</p>
              <p className="text-xs text-slate-500">Contactá a administración para registrar un vehículo diferente antes de confirmar el turno.</p>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function NewAppointmentPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full text-slate-400 text-sm">Cargando...</div>}>
      <NewAppointmentForm />
    </Suspense>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}
