'use client';
import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarDays, Clock, ArrowRight, AlertCircle, CheckCircle2, X } from 'lucide-react';
import {
  useCancelAppointment,
  useUpdateAppointmentStatus,
  useRescheduleAppointment,
  usePatchAppointment,
} from '@/hooks/use-appointments';
import { useAppointmentsByDate } from '@/hooks/use-appointments';
import { useTechnicians } from '@/hooks/use-technicians';
import { statusLabel, statusColor, timeToMinutes, minutesToTime } from '@/lib/utils';
import { isAdmin } from '@/lib/auth';
import type { Appointment } from '@/types';

// ─── Slots disponibles 08:00 – 17:30 cada 30 min ─────────────────────────────
const ALL_SLOTS: string[] = [];
for (let m = 8 * 60; m < 18 * 60; m += 30) {
  ALL_SLOTS.push(minutesToTime(m));
}

interface Props {
  appointment: Appointment;
  onClose: () => void;
}

export function AppointmentDetailModal({ appointment: appt, onClose }: Props) {
  const cancel        = useCancelAppointment();
  const updateStatus  = useUpdateAppointmentStatus();
  const reschedule    = useRescheduleAppointment();
  const patch         = usePatchAppointment();
  const admin         = isAdmin();

  // Estado del panel reagendar
  const [mode, setMode]           = useState<'detail' | 'reschedule' | 'adjust'>('detail');
  const [newDate, setNewDate]     = useState(appt.date);
  const [newTime, setNewTime]     = useState(appt.timeStart);
  const [newTechId, setNewTechId] = useState(appt.technicianId);
  const [conflictMsg, setConflictMsg] = useState('');

  // Estado del panel ajustar horas
  const [adjustEnd, setAdjustEnd]   = useState(appt.timeEnd);
  const [adjustErr, setAdjustErr]   = useState('');

  const { data: technicians = [] } = useTechnicians();
  // Turnos del día destino para detectar conflictos en el cliente
  const { data: dayAppts = [] }   = useAppointmentsByDate(newDate);

  // Duración del servicio en minutos
  const durationMin = appt.serviceType.durationHours * 60;

  // timeEnd proyectado según el nuevo horario seleccionado
  const projectedEnd = useMemo(() => {
    const [h, m] = newTime.split(':').map(Number);
    const endMin = h * 60 + m + durationMin;
    if (endMin > 18 * 60) return null; // no cabe en la jornada
    return minutesToTime(endMin);
  }, [newTime, durationMin]);

  // Slots disponibles para el técnico seleccionado en la nueva fecha
  const availableSlots = useMemo(() => {
    const occupied = dayAppts.filter(a => a.id !== appt.id && a.status !== 'cancelled' && a.technicianId === newTechId);
    return ALL_SLOTS.filter(slot => {
      const [h, m] = slot.split(':').map(Number);
      const start = h * 60 + m;
      const end   = start + durationMin;
      if (end > 18 * 60) return false;
      // Sin solapamiento con turnos existentes
      return !occupied.some(a =>
        start < timeToMinutes(a.timeEnd) &&
        end   > timeToMinutes(a.timeStart)
      );
    });
  }, [dayAppts, newTechId, appt.id, durationMin]);

  const isSlotAvailable = projectedEnd !== null && availableSlots.includes(newTime);
  const noChanges = newDate === appt.date && newTime === appt.timeStart && newTechId === appt.technicianId;

  // Detección de mismatch de especialidad entre el técnico nuevo y el servicio
  const newTech = technicians.find(t => t.id === newTechId);
  const requiredSpecialty = (appt.serviceType.specialtyName ?? appt.serviceType.specialty?.name ?? '').trim();
  const techSpecialty     = (newTech?.specialty ?? '').trim();
  const techChanged       = newTechId !== appt.technicianId;
  const specialtyMismatch =
    techChanged &&
    !!requiredSpecialty &&
    !!techSpecialty &&
    requiredSpecialty.toUpperCase() !== techSpecialty.toUpperCase();

  async function handleCancel() {
    if (!confirm('¿Cancelar este turno?')) return;
    await cancel.mutateAsync({ id: appt.id, date: appt.date });
    onClose();
  }

  async function handleStatus(status: string) {
    await updateStatus.mutateAsync({ id: appt.id, status, date: appt.date });
    onClose();
  }

  async function handleAdjust() {
    setAdjustErr('');
    try {
      await patch.mutateAsync({ id: appt.id, date: appt.date, timeEnd: adjustEnd });
      onClose();
    } catch (err: unknown) {
      setAdjustErr(err instanceof Error ? err.message : 'Error al guardar');
    }
  }

  async function handleReschedule() {
    setConflictMsg('');

    if (specialtyMismatch) {
      const confirmed = window.confirm(
        `La especialidad del técnico no coincide con el servicio.\n\n` +
        `Servicio: ${appt.serviceType.name} (${requiredSpecialty})\n` +
        `Técnico:  ${newTech?.name} (${techSpecialty})\n\n` +
        `¿Querés continuar con el reagendado?`,
      );
      if (!confirmed) return;
    }

    try {
      await reschedule.mutateAsync({
        id:          appt.id,
        oldDate:     appt.date,
        date:        newDate,
        timeStart:   newTime,
        technicianId: newTechId,
      });
      onClose();
    } catch (err: unknown) {
      setConflictMsg(err instanceof Error ? err.message : 'Error al reagendar');
    }
  }

  const canReschedule = appt.status === 'scheduled' || appt.status === 'in_progress';

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'detail' ? 'Detalle del turno' : mode === 'reschedule' ? 'Reagendar turno' : 'Ajustar hora fin'}
          </DialogTitle>
        </DialogHeader>

        {/* ── Vista detalle ────────────────────────────────────────────── */}
        {mode === 'detail' && (
          <>
            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Estado</span>
                <Badge className={statusColor(appt.status)}>{statusLabel(appt.status)}</Badge>
              </div>
              <Row label="Cliente"  value={appt.customerName} />
              <Row label="Patente"  value={appt.plate} />
              <Row label="Servicio" value={appt.serviceType.name} />
              <Row label="Técnico"  value={appt.technician.name} />
              <Row label="Horario"  value={`${appt.timeStart} – ${appt.timeEnd}`} />
              <Row label="Fecha"    value={appt.date} />
              {appt.notes && <Row label="Notas" value={appt.notes} />}
            </div>

            <div className="flex flex-col gap-2 pt-2">
              {/* Reagendar */}
              {admin && canReschedule && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setMode('reschedule')}
                  className="border-blue-200 text-blue-700 hover:bg-blue-50"
                >
                  <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                  Reagendar
                </Button>
              )}
              {/* Ajustar horas reales */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setAdjustEnd(appt.timeEnd); setAdjustErr(''); setMode('adjust'); }}
                className="border-amber-200 text-amber-700 hover:bg-amber-50"
              >
                <Clock className="h-3.5 w-3.5 mr-1.5" />
                Ajustar hora fin
              </Button>

              {/* Cambios de estado */}
              {admin && appt.status === 'scheduled' && (
                <Button size="sm" variant="outline" onClick={() => handleStatus('in_progress')}>
                  Marcar en proceso
                </Button>
              )}
              {admin && appt.status === 'in_progress' && (
                <Button size="sm" variant="outline" onClick={() => handleStatus('done')}>
                  Marcar terminado
                </Button>
              )}

              {/* Cancelar */}
              {canReschedule && (
                <Button size="sm" variant="destructive" onClick={handleCancel} disabled={cancel.isPending}>
                  Cancelar turno
                </Button>
              )}
            </div>
          </>
        )}

        {/* ── Vista reagendar ──────────────────────────────────────────── */}
        {mode === 'reschedule' && (
          <>
            {/* Resumen del turno original */}
            <div className="bg-slate-50 rounded-lg border border-slate-200 px-3 py-2.5 text-xs text-slate-600 space-y-0.5">
              <p className="font-semibold text-slate-800">{appt.customerName} · {appt.plate}</p>
              <p>{appt.serviceType.name} · {appt.serviceType.durationHours}h</p>
              <p className="text-slate-400">{appt.date} · {appt.timeStart}–{appt.timeEnd} · {appt.technician.name.split(' ')[0]}</p>
            </div>

            <div className="space-y-4">
              {/* Nueva fecha */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" /> Nueva fecha
                </label>
                <input
                  type="date"
                  value={newDate}
                  onChange={e => { setNewDate(e.target.value); setConflictMsg(''); }}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              {/* Técnico */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Técnico
                  {requiredSpecialty && (
                    <span className="ml-1.5 text-[10px] font-medium text-slate-400 normal-case tracking-normal">
                      · servicio requiere {requiredSpecialty}
                    </span>
                  )}
                </label>
                <Select value={newTechId} onValueChange={v => { setNewTechId(v); setNewTime(appt.timeStart); setConflictMsg(''); }}>
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {technicians.map(t => {
                      const tSpec = (t.specialty ?? '').trim();
                      const matches = !requiredSpecialty || !tSpec || tSpec.toUpperCase() === requiredSpecialty.toUpperCase();
                      return (
                        <SelectItem key={t.id} value={t.id}>
                          <span className="flex items-center gap-2">
                            <span>{t.name}</span>
                            {tSpec && (
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${matches ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                                {tSpec}
                              </span>
                            )}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {specialtyMismatch && (
                  <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-1.5">
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>{newTech?.name?.split(' ')[0]}</strong> es de <strong>{techSpecialty}</strong>, pero el servicio requiere <strong>{requiredSpecialty}</strong>. Se va a pedir confirmación al guardar.
                    </span>
                  </div>
                )}
              </div>

              {/* Nuevo horario */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Horario de inicio
                </label>
                <div className="grid grid-cols-4 gap-1.5 max-h-40 overflow-y-auto pr-1">
                  {ALL_SLOTS.map(slot => {
                    const isAvail = availableSlots.includes(slot);
                    const isSelected = slot === newTime;
                    return (
                      <button
                        key={slot}
                        disabled={!isAvail}
                        onClick={() => { setNewTime(slot); setConflictMsg(''); }}
                        className={`px-2 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                            : isAvail
                            ? 'bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:bg-blue-50'
                            : 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed line-through'
                        }`}
                      >
                        {slot}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-400">Los slots en gris ya están ocupados para ese técnico</p>
              </div>

              {/* Preview del nuevo horario */}
              {isSlotAvailable && !noChanges && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-center gap-2 text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                  <div className="text-blue-700">
                    <span className="font-semibold">{appt.date} {appt.timeStart}</span>
                    <ArrowRight className="inline h-3 w-3 mx-1" />
                    <span className="font-semibold">{newDate} {newTime}–{projectedEnd}</span>
                    {newTechId !== appt.technicianId && (
                      <span className="ml-1 text-blue-500">
                        · {technicians.find(t => t.id === newTechId)?.name.split(' ')[0]}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Sin cambios */}
              {noChanges && (
                <p className="text-xs text-slate-400 text-center">Sin cambios respecto al turno actual</p>
              )}

              {/* Slot fuera de jornada */}
              {projectedEnd === null && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  El servicio ({appt.serviceType.durationHours}h) excede la jornada laboral desde ese horario.
                </div>
              )}

              {/* Error de conflicto del servidor */}
              {conflictMsg && (
                <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  {conflictMsg}
                </div>
              )}
            </div>

            {/* Acciones */}
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => { setMode('detail'); setConflictMsg(''); setNewDate(appt.date); setNewTime(appt.timeStart); setNewTechId(appt.technicianId); }}
              >
                <X className="h-3.5 w-3.5 mr-1" /> Cancelar
              </Button>
              <Button
                size="sm"
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                disabled={noChanges || !isSlotAvailable || reschedule.isPending}
                onClick={handleReschedule}
              >
                <CalendarDays className="h-3.5 w-3.5 mr-1" />
                {reschedule.isPending ? 'Guardando...' : 'Confirmar reagendado'}
              </Button>
            </div>
          </>
        )}

        {/* ── Vista ajustar hora fin ──────────────────────────────────── */}
        {mode === 'adjust' && (
          <>
            <div className="bg-slate-50 rounded-lg border border-slate-200 px-3 py-2.5 text-xs text-slate-600 space-y-0.5">
              <p className="font-semibold text-slate-800">{appt.customerName} · {appt.plate}</p>
              <p>{appt.serviceType.name}</p>
              <p className="text-slate-400">Horario original: {appt.timeStart} – {appt.timeEnd}</p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Nueva hora de fin
                </label>
                <input
                  type="time"
                  value={adjustEnd}
                  onChange={e => { setAdjustEnd(e.target.value); setAdjustErr(''); }}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                {adjustEnd && adjustEnd !== appt.timeEnd && (
                  <p className="text-xs text-amber-700">
                    Duración ajustada: {Math.round(timeToMinutes(adjustEnd) - timeToMinutes(appt.timeStart))} min
                    {' '}(era {appt.serviceType.durationHours * 60} min)
                  </p>
                )}
              </div>

              {adjustErr && (
                <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  {adjustErr}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => { setMode('detail'); setAdjustErr(''); }}
              >
                <X className="h-3.5 w-3.5 mr-1" /> Cancelar
              </Button>
              <Button
                size="sm"
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                disabled={!adjustEnd || adjustEnd === appt.timeEnd || patch.isPending}
                onClick={handleAdjust}
              >
                <Clock className="h-3.5 w-3.5 mr-1" />
                {patch.isPending ? 'Guardando...' : 'Confirmar ajuste'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="text-slate-900 text-right">{value}</span>
    </div>
  );
}
