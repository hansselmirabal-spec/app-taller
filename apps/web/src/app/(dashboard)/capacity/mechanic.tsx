'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Users, CheckCircle2, AlertCircle, XCircle, MinusCircle, AlertTriangle } from 'lucide-react';
import { addWeeks, subWeeks, startOfWeek, addDays, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useWeekCapacity, useCreateAbsence, useDeleteAbsence } from '@/hooks/use-capacity';
import { useTechnicians } from '@/hooks/use-technicians';
import { useActiveWorkshop } from '@/hooks/use-active-workshop';
import { formatDate } from '@/lib/utils';
import { AbsenceModal } from '@/components/capacity/absence-modal';
import { TechnicianDayModal } from '@/components/capacity/technician-day-modal';
import type { TechnicianCapacity, WeekDay } from '@/types';
import { DEFAULT_WEEKLY_SCHEDULE } from '@/types';

const JS_DAY_TO_KEY: WeekDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
function dayKey(d: Date): WeekDay { return JS_DAY_TO_KEY[d.getDay()]; }

export default function MechanicCapacityPage() {
  const { workshop } = useActiveWorkshop();
  const weeklySchedule = workshop?.config?.weeklySchedule ?? DEFAULT_WEEKLY_SCHEDULE;
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [dayTarget, setDayTarget] = useState<{ technicianId: string; technicianName: string; date: string; capacity: TechnicianCapacity | undefined } | null>(null);
  const [absenceTarget, setAbsenceTarget] = useState<{ technicianId: string; technicianName: string; date: string } | null>(null);

  const weekDates = Array.from({ length: 6 }, (_, i) => addDays(weekStart, i));
  const from = formatDate(weekDates[0]);
  const to   = formatDate(weekDates[5]);

  const { data: weekCapacity = {}, isLoading } = useWeekCapacity(from, to);
  const { data: technicians = [] } = useTechnicians();

  const allCaps = Object.values(weekCapacity).flat() as TechnicianCapacity[];
  const disponibles   = allCaps.filter(c => c.isWorkingDay && !c.absenceType && (c.availableHours - c.usedHours) >= c.dailyHours * 0.5).length;
  const parciales     = allCaps.filter(c => c.isWorkingDay && !c.absenceType && (c.availableHours - c.usedHours) > 0 && (c.availableHours - c.usedHours) < c.dailyHours * 0.5).length;
  const sobrecargados = allCaps.filter(c => c.availableHours > 0 && c.usedHours > c.availableHours).length;
  const ocupados      = allCaps.filter(c => c.availableHours > 0 && c.usedHours >= c.availableHours * 0.9 && c.usedHours <= c.availableHours).length;
  const fueraServicio = allCaps.filter(c => !c.isWorkingDay || c.absenceType === 'full').length;

  function cellStatus(cap: TechnicianCapacity): 'available' | 'partial' | 'occupied' | 'overloaded' | 'off' | 'absence' {
    if (!cap.isWorkingDay || cap.absenceType === 'full') return 'off';
    if (cap.absenceType === 'half' || cap.absenceType === 'holiday') return 'absence';
    if (cap.availableHours <= 0) return 'off';
    if (cap.usedHours > cap.availableHours) return 'overloaded';
    const remaining = cap.availableHours - cap.usedHours;
    if (remaining <= 0) return 'occupied';
    if (remaining < cap.dailyHours * 0.5) return 'partial';
    return 'available';
  }

  const cellStyles: Record<string, string> = {
    available:  'bg-emerald-50 border-emerald-200 text-emerald-700',
    partial:    'bg-amber-50 border-amber-200 text-amber-700',
    occupied:   'bg-red-50 border-red-200 text-red-700',
    overloaded: 'bg-red-100 border-red-400 text-red-800',
    off:        'bg-slate-50 border-slate-200 text-slate-400',
    absence:    'bg-blue-50 border-blue-200 text-blue-600',
  };

  const cellLabel: Record<string, string> = {
    available:  'Libre',
    partial:    'Parcial',
    occupied:   'Completo',
    overloaded: '⚠ Sobrecargado',
    off:        'No labora',
    absence:    'Ausente',
  };

  const utilizacionSemanal = allCaps.length > 0
    ? Math.round((allCaps.reduce((s, c) => s + c.usedHours, 0) / allCaps.reduce((s, c) => s + (c.availableHours || 1), 0)) * 100)
    : 0;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Planificación de Capacidad</h1>
            <div className="flex items-center gap-2 mt-1">
              <button onClick={() => setWeekStart(subWeeks(weekStart, 1))} className="p-0.5 rounded hover:bg-slate-100">
                <ChevronLeft className="h-4 w-4 text-slate-400" />
              </button>
              <span className="text-xs font-medium text-slate-600">
                {format(weekDates[0], "d MMM", { locale: es })} — {format(weekDates[5], "d MMM yyyy", { locale: es })}
              </span>
              <button onClick={() => setWeekStart(addWeeks(weekStart, 1))} className="p-0.5 rounded hover:bg-slate-100">
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
              <button onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))} className="text-xs text-blue-600 font-medium hover:underline ml-1">
                Hoy
              </button>
            </div>
          </div>
          <div className="flex items-center gap-5">
            <StatPill icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />} label="Disponibles"     value={disponibles}   color="text-emerald-700" />
            <StatPill icon={<AlertCircle  className="h-3.5 w-3.5 text-amber-500"   />} label="Parcial"         value={parciales}     color="text-amber-700" />
            <StatPill icon={<XCircle      className="h-3.5 w-3.5 text-red-500"     />} label="Completos"       value={ocupados}      color="text-red-700" />
            {sobrecargados > 0 && (
              <StatPill icon={<AlertTriangle className="h-3.5 w-3.5 text-red-600" />} label="Sobrecargados" value={sobrecargados} color="text-red-800" />
            )}
            <StatPill icon={<MinusCircle  className="h-3.5 w-3.5 text-slate-400"  />} label="Fuera de Servicio" value={fueraServicio} color="text-slate-500" />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Cargando...</div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="grid border-b border-slate-200 bg-slate-50" style={{ gridTemplateColumns: '200px repeat(6, 1fr)' }}>
              <div className="px-4 py-3 flex items-center gap-2 border-r border-slate-200">
                <Users className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Técnico</span>
              </div>
              {weekDates.map(d => {
                const isToday = formatDate(d) === formatDate(new Date());
                const sched = weeklySchedule[dayKey(d)];
                const nonWorking = !sched.working;
                const partial = sched.working && sched.hours;
                return (
                  <div key={d.toISOString()} className={`px-3 py-3 text-center border-r border-slate-200 last:border-r-0 ${nonWorking ? 'bg-slate-100' : ''}`}>
                    <p className={`text-xs font-medium capitalize ${nonWorking ? 'text-slate-400' : isToday ? 'text-blue-600' : 'text-slate-500'}`}>
                      {format(d, 'EEE', { locale: es })}
                    </p>
                    <p className={`text-base font-bold mt-0.5 ${nonWorking ? 'text-slate-400' : isToday ? 'text-blue-700' : 'text-slate-900'}`}>
                      {format(d, 'd')}
                    </p>
                    {nonWorking && <span className="text-[10px] text-slate-400 font-medium">No laboral</span>}
                    {partial && <span className="text-[10px] text-orange-500 font-medium">{sched.hours}h</span>}
                    {isToday && !nonWorking && <div className="h-1 w-1 rounded-full bg-blue-500 mx-auto mt-1" />}
                  </div>
                );
              })}
            </div>

            {technicians.map((tech, idx) => (
              <div
                key={tech.id}
                className={`grid border-b border-slate-100 last:border-b-0 ${idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}
                style={{ gridTemplateColumns: '200px repeat(6, 1fr)' }}
              >
                {(() => {
                  const techDays = weekDates.map(d => {
                    const cap = (weekCapacity[formatDate(d)] ?? []).find(c => c.technicianId === tech.id);
                    return cap;
                  }).filter(Boolean) as TechnicianCapacity[];
                  const hasOverload = techDays.some(c => c.availableHours > 0 && c.usedHours > c.availableHours);
                  return (
                    <div className="flex items-center gap-3 px-4 py-3 border-r border-slate-200">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${hasOverload ? 'bg-gradient-to-br from-red-500 to-red-700' : 'bg-gradient-to-br from-blue-500 to-blue-700'}`}>
                        <span className="text-xs font-bold text-white">{tech.name.charAt(0)}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-slate-900 truncate">{tech.name.split(' ')[0]}</p>
                          {hasOverload && <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />}
                        </div>
                        {tech.specialty && (
                          <p className="text-xs text-blue-600 font-medium truncate leading-tight">{tech.specialty}</p>
                        )}
                        <p className="text-xs text-slate-400">{tech.dailyHours}h/día</p>
                      </div>
                    </div>
                  );
                })()}

                {weekDates.map(d => {
                  const dateStr = formatDate(d);
                  const sched = weeklySchedule[dayKey(d)];
                  const isNonWorkingDay = !sched.working;
                  const isToday = dateStr === formatDate(new Date());

                  // Día no laborable por horario semanal: celda bloqueada, sin interacción
                  if (isNonWorkingDay) return (
                    <div key={dateStr} className="px-2 py-3 border-r border-slate-100 last:border-r-0 bg-slate-50">
                      <div className="h-14 w-full rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center">
                        <span className="text-xs text-slate-400 font-medium">No laboral</span>
                      </div>
                    </div>
                  );

                  const cap = (weekCapacity[dateStr] ?? []).find(c => c.technicianId === tech.id);
                  if (!cap) return (
                    <div key={dateStr} className="px-2 py-3 border-r border-slate-100 last:border-r-0 flex items-center justify-center">
                      <div className="h-8 w-full rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center">
                        <span className="text-xs text-slate-400">—</span>
                      </div>
                    </div>
                  );

                  const status = cellStatus(cap);
                  const remaining = Math.max(cap.availableHours - cap.usedHours, 0);

                  return (
                    <div key={dateStr} className={`px-2 py-3 border-r border-slate-100 last:border-r-0 ${isToday ? 'bg-blue-50/30' : ''}`}>
                      <button
                        onClick={() => setDayTarget({ technicianId: tech.id, technicianName: tech.name, date: dateStr, capacity: cap })}
                        className={`w-full h-14 rounded-lg border text-left px-2.5 py-1.5 transition-all hover:opacity-80 hover:shadow-sm ${cellStyles[status]}`}
                      >
                        <p className="text-xs font-semibold leading-tight">{cellLabel[status]}</p>
                        {sched.hours && <p className="text-[10px] text-orange-500 font-medium">Hasta {8 + sched.hours}:00</p>}
                        {status === 'overloaded' && <p className="text-xs mt-0.5 opacity-90">+{(cap.usedHours - cap.availableHours).toFixed(1)}h extra</p>}
                        {(status === 'available' || status === 'partial') && <p className="text-xs mt-0.5 opacity-80">{remaining.toFixed(1)}h libres</p>}
                        {status === 'occupied' && <p className="text-xs mt-0.5 opacity-80">Sin cupos</p>}
                        {status !== 'off' && status !== 'absence' && cap.availableHours > 0 && (
                          <div className="mt-1.5 h-1 bg-current opacity-20 rounded-full overflow-hidden">
                            <div className="h-full bg-current opacity-70 rounded-full" style={{ width: `${Math.min((cap.usedHours / cap.availableHours) * 100, 100)}%` }} />
                          </div>
                        )}
                        {status === 'absence' && <p className="text-xs mt-0.5 opacity-80">{cap.absenceType === 'half' ? 'Media jornada' : 'Feriado'}</p>}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="stat-card flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
              <TrendingUpIcon className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900">{utilizacionSemanal}%</p>
              <p className="text-xs text-slate-500">Utilización Semanal</p>
            </div>
          </div>
          <div className="stat-card flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900">{disponibles}</p>
              <p className="text-xs text-slate-500">Slots Disponibles</p>
            </div>
          </div>
          <div className="stat-card flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
              <Users className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900">{technicians.length}</p>
              <p className="text-xs text-slate-500">Estadísticas del Equipo</p>
            </div>
          </div>
        </div>
      </div>

      {dayTarget && (
        <TechnicianDayModal
          technicianId={dayTarget.technicianId}
          technicianName={dayTarget.technicianName}
          date={dayTarget.date}
          capacity={dayTarget.capacity}
          onRegisterAbsence={() => {
            setAbsenceTarget({ technicianId: dayTarget.technicianId, technicianName: dayTarget.technicianName, date: dayTarget.date });
            setDayTarget(null);
          }}
          onClose={() => setDayTarget(null)}
        />
      )}

      {absenceTarget && (
        <AbsenceModal
          technicianId={absenceTarget.technicianId}
          technicianName={absenceTarget.technicianName}
          date={absenceTarget.date}
          onClose={() => setAbsenceTarget(null)}
        />
      )}
    </div>
  );
}

function StatPill({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-sm font-bold ${color}`}>{value}</span>
    </div>
  );
}

function TrendingUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="17 6 23 6 23 12" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
