'use client';
import { useState } from 'react';
import { addWeeks, subWeeks, startOfWeek, addDays, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useActiveWorkshop } from '@/hooks/use-active-workshop';
import { useRequirePermission } from '@/hooks/use-require-permission';
import MechanicCapacityPage from './mechanic';
import BodyshopCapacityPage from './bodyshop';
import BodyshopSchedulePage from './schedule';

type Tab = 'capacity' | 'schedule';

export default function CapacityPage() {
  useRequirePermission('capacity');
  const { isBodyshop } = useActiveWorkshop();

  const [tab, setTab] = useState<Tab>('capacity');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));

  // Para talleres mecánicos no hay tabs
  if (!isBodyshop) return <MechanicCapacityPage />;

  const weekDates = Array.from({ length: 6 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="flex flex-col h-full">
      {/* ── Header con tabs y navegación semanal ─────────────────────────────── */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
        {/* Tabs */}
        <div className="flex items-center bg-slate-100 rounded-lg p-1 gap-0.5">
          <button
            onClick={() => setTab('capacity')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === 'capacity'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Capacidad
          </button>
          <button
            onClick={() => setTab('schedule')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === 'schedule'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Agenda por proceso
          </button>
        </div>

        {/* Navegación semanal (solo visible en tab Agenda) */}
        {tab === 'schedule' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekStart(subWeeks(weekStart, 1))}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <ChevronLeft className="h-4 w-4 text-slate-600" />
            </button>
            <span className="text-sm font-medium text-slate-700 min-w-[160px] text-center">
              {format(weekDates[0], "d MMM", { locale: es })}
              {' — '}
              {format(weekDates[5], "d MMM yyyy", { locale: es })}
            </span>
            <button
              onClick={() => setWeekStart(addWeeks(weekStart, 1))}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <ChevronRight className="h-4 w-4 text-slate-600" />
            </button>
            <button
              onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
              className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
            >
              Hoy
            </button>
          </div>
        )}
      </div>

      {/* ── Contenido por tab ────────────────────────────────────────────────── */}
      {/* Capacidad: pasa h-full al hijo que gestiona su propio scroll interno   */}
      {tab === 'capacity' && (
        <div className="flex-1 flex flex-col min-h-0">
          <BodyshopCapacityPage />
        </div>
      )}
      {/* Agenda: el contenedor externo scrollea verticalmente                   */}
      {tab === 'schedule' && (
        <div className="flex-1 overflow-y-auto p-6">
          <BodyshopSchedulePage weekStart={weekStart} />
        </div>
      )}
    </div>
  );
}
