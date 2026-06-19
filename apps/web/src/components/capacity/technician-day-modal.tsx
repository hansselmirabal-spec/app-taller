'use client';
import { useMemo } from 'react';
import { Calendar, Clock, User, AlertTriangle, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAppointmentsByDate } from '@/hooks/use-appointments';
import { useAbsences, useDeleteAbsence } from '@/hooks/use-capacity';
import { formatDateDisplay } from '@/lib/utils';
import type { TechnicianCapacity } from '@/types';

interface Props {
  technicianId: string;
  technicianName: string;
  date: string;
  capacity: TechnicianCapacity | undefined;
  onRegisterAbsence: () => void;
  onClose: () => void;
}

const statusConfig = {
  available:  { label: 'Libre',         dot: 'bg-emerald-500' },
  partial:    { label: 'Parcial',       dot: 'bg-amber-500'   },
  occupied:   { label: 'Completo',      dot: 'bg-red-500'     },
  overloaded: { label: 'Sobrecargado',  dot: 'bg-red-600'     },
  off:        { label: 'No labora',     dot: 'bg-slate-400'   },
  absence:    { label: 'Ausente',       dot: 'bg-blue-500'    },
} as const;

function resolveStatus(cap: TechnicianCapacity | undefined): keyof typeof statusConfig {
  if (!cap) return 'off';
  if (!cap.isWorkingDay || cap.absenceType === 'full') return 'off';
  if (cap.absenceType === 'half' || cap.absenceType === 'holiday') return 'absence';
  if (cap.availableHours <= 0) return 'off';
  if (cap.usedHours > cap.availableHours) return 'overloaded';
  const remaining = cap.availableHours - cap.usedHours;
  if (remaining <= 0) return 'occupied';
  if (remaining < cap.dailyHours * 0.5) return 'partial';
  return 'available';
}

export function TechnicianDayModal({
  technicianId,
  technicianName,
  date,
  capacity,
  onRegisterAbsence,
  onClose,
}: Props) {
  const { data: appointments = [], isLoading } = useAppointmentsByDate(date);
  const { data: absences = [] } = useAbsences();
  const deleteAbsence = useDeleteAbsence();

  const techAppts = useMemo(
    () => appointments
      .filter(a => a.technicianId === technicianId && a.status !== 'cancelled')
      .sort((a, b) => a.timeStart.localeCompare(b.timeStart)),
    [appointments, technicianId],
  );

  const absence = absences.find(a => a.technicianId === technicianId && a.date === date);
  const status = resolveStatus(capacity);
  const totalScheduledHours = techAppts.reduce((sum, a) => sum + (a.serviceType?.durationHours ?? 0), 0);

  const usedHours      = capacity?.usedHours ?? totalScheduledHours;
  const availableHours = capacity?.availableHours ?? 0;
  const remainingHours = Math.max(availableHours - usedHours, 0);
  const overloadHours  = Math.max(usedHours - availableHours, 0);
  const utilizationPct = availableHours > 0 ? Math.min(Math.round((usedHours / availableHours) * 100), 999) : 0;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[88vh] flex flex-col p-0 overflow-hidden gap-0">

        <DialogHeader className="px-6 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-white">{technicianName.charAt(0)}</span>
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base font-semibold text-slate-900 truncate">{technicianName}</DialogTitle>
                <p className="text-xs text-slate-500 capitalize mt-0.5">{formatDateDisplay(date)}</p>
              </div>
            </div>
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full flex-shrink-0">
              <span className={`h-1.5 w-1.5 rounded-full ${statusConfig[status].dot}`} />
              {statusConfig[status].label}
            </span>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {/* Stats */}
          {capacity && capacity.isWorkingDay && capacity.absenceType !== 'full' && (
            <div>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Usadas"    value={`${usedHours.toFixed(1)}h`} tone="blue" />
                <Stat label="Libres"    value={`${remainingHours.toFixed(1)}h`} tone={remainingHours > 0 ? 'emerald' : 'slate'} />
                <Stat label="Disponibles" value={`${availableHours.toFixed(1)}h`} tone="slate" />
              </div>
              <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    overloadHours > 0 ? 'bg-red-500' : utilizationPct >= 90 ? 'bg-red-400' : utilizationPct >= 50 ? 'bg-amber-400' : 'bg-emerald-400'
                  }`}
                  style={{ width: `${Math.min(utilizationPct, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-1.5 text-xs">
                <span className="text-slate-400">Utilización</span>
                <span className={`font-semibold ${overloadHours > 0 ? 'text-red-600' : utilizationPct >= 90 ? 'text-red-500' : 'text-slate-700'}`}>
                  {utilizationPct}%
                </span>
              </div>
              {overloadHours > 0 && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>Sobrecargado en {overloadHours.toFixed(1)}h por encima de la capacidad.</span>
                </div>
              )}
            </div>
          )}

          {/* Absence info */}
          {absence && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-3">
              <Calendar className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-blue-900">
                  {absence.type === 'full' ? 'Ausencia completa' : absence.type === 'half' ? 'Media jornada' : 'Feriado particular'}
                </p>
                <p className="text-xs text-blue-700 mt-0.5">
                  {absence.type === 'full' && 'No se computan horas este día.'}
                  {absence.type === 'half' && 'Se computa el 50% de las horas diarias.'}
                  {absence.type === 'holiday' && 'Día feriado para este técnico.'}
                </p>
              </div>
              <button
                onClick={() => deleteAbsence.mutate(absence.id)}
                disabled={deleteAbsence.isPending}
                className="p-1.5 rounded-lg text-blue-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                title="Eliminar ausencia"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Appointments list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Trabajos agendados ({techAppts.length})
              </p>
              {totalScheduledHours > 0 && (
                <span className="text-xs font-semibold text-slate-700">
                  {totalScheduledHours.toFixed(1)}h en total
                </span>
              )}
            </div>

            {isLoading ? (
              <div className="text-xs text-slate-400 py-6 text-center">Cargando...</div>
            ) : techAppts.length === 0 ? (
              <div className="border border-dashed border-slate-200 rounded-xl py-6 text-center">
                <Clock className="h-5 w-5 text-slate-300 mx-auto mb-1.5" />
                <p className="text-xs text-slate-400">Sin trabajos agendados para este día.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {techAppts.map(a => (
                  <div
                    key={a.id}
                    className="border border-slate-200 rounded-xl px-3 py-2.5 hover:border-slate-300 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            {a.timeStart}
                          </span>
                          <p className="text-sm font-bold text-slate-900 truncate">{a.customerName}</p>
                          <span className="text-xs font-mono text-slate-400">{a.plate}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span
                            className="text-xs font-semibold px-1.5 py-0.5 rounded"
                            style={{ background: a.serviceType?.color + '22', color: a.serviceType?.color }}
                          >
                            {a.serviceType?.name}
                          </span>
                          <span className="text-xs text-slate-400">
                            {a.serviceType?.durationHours ?? 0}h · {a.timeStart}–{a.timeEnd}
                          </span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            a.status === 'in_progress' ? 'bg-amber-100 text-amber-700'
                            : a.status === 'done'      ? 'bg-emerald-100 text-emerald-700'
                            :                            'bg-blue-100 text-blue-700'
                          }`}>
                            {a.status === 'in_progress' ? 'En proceso' : a.status === 'done' ? 'Listo' : 'Agendado'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-between items-center gap-2 px-6 py-3 border-t border-slate-100 flex-shrink-0 bg-slate-50">
          <Button variant="outline" size="sm" onClick={onClose}>Cerrar</Button>
          <Button size="sm" onClick={onRegisterAbsence} disabled={!!absence}>
            <User className="h-4 w-4 mr-1.5" />
            {absence ? 'Ya tiene ausencia' : 'Registrar ausencia'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'blue' | 'emerald' | 'slate' }) {
  const toneClasses = {
    blue:    'bg-blue-50 text-blue-700 border-blue-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    slate:   'bg-slate-50 text-slate-600 border-slate-200',
  } as const;
  return (
    <div className={`border rounded-lg px-3 py-2 ${toneClasses[tone]}`}>
      <p className="text-[10px] font-medium uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-lg font-bold mt-0.5">{value}</p>
    </div>
  );
}
