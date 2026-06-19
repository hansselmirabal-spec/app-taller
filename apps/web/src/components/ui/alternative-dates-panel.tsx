'use client';
import { CalendarDays, Check, Zap } from 'lucide-react';
import type { AlternativeDay, AvailableSlot } from '@/lib/api';

interface Props {
  alternatives: AlternativeDay[];
  onSelect: (date: string, slot: AvailableSlot) => void;
  /** Carrocería: oculta slots de hora, solo muestra el día con un botón "Elegir" */
  dateOnly?: boolean;
}

export function AlternativeDatesPanel({ alternatives, onSelect, dateOnly }: Props) {
  if (alternatives.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
        No se encontraron fechas con disponibilidad en los próximos 30 días.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
        Próximas fechas disponibles
      </p>
      {alternatives.map(day => (
        <div
          key={day.date}
          className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-sm font-semibold text-slate-900 capitalize">{day.dayLabel}</span>
            </div>
            {dateOnly ? (
              <button
                type="button"
                onClick={() => onSelect(day.date, day.slots[0])}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
              >
                <Check className="h-3 w-3" />
                Elegir fecha
              </button>
            ) : (
              <span className="text-xs text-slate-400 font-medium">
                {day.slotsCount} cupo{day.slotsCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {!dateOnly && (
            <div className="px-4 py-3 flex flex-wrap gap-2">
              {day.slots.map(slot => (
                <button
                  key={`${day.date}-${slot.time}-${slot.technicianId}`}
                  type="button"
                  onClick={() => onSelect(day.date, slot)}
                  className={`
                    group flex flex-col items-center px-3 py-2 rounded-lg border text-xs font-medium
                    transition-all hover:shadow-sm active:scale-95
                    ${slot.hasSpecialtyMatch
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300'}
                  `}
                >
                  <span className="font-bold text-sm tabular-nums">{slot.time}</span>
                  {slot.technicianName && slot.technicianName !== 'Auto-asignado' && (
                    <span className="opacity-60 truncate max-w-[72px] text-center leading-tight mt-0.5">
                      {slot.technicianName.split(' ')[0]}
                    </span>
                  )}
                  {slot.hasSpecialtyMatch && slot.specialty && (
                    <span className="text-[9px] text-emerald-600 font-semibold mt-0.5 flex items-center gap-0.5">
                      <Zap className="h-2 w-2" />match
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
