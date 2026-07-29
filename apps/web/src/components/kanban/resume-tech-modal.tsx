'use client';

// Modal de confirmación de técnico al reanudar un proceso pausado (Func.2 PR2 —
// kanban-mecanica-manual-y-pausa-libera-tecnico). Reanudar SIEMPRE requiere
// elegir/confirmar un técnico explícitamente (spec: "Resume always requires
// explicit technician confirmation") — nunca se auto-reanuda. Se preselecciona
// el técnico anterior solo si `getResumeOptions` confirma que sigue libre; si
// está ocupado, se muestra el conflicto y el operador debe elegir otro
// (spec: "Unavailable suggested technician does not block resume"). Copia el
// patrón de interacción de ProcessTechRow (apps/web/.../appointments/bodyshop.tsx).

import { useEffect, useState } from 'react';
import { X, PlayCircle, User2, AlertTriangle } from 'lucide-react';
import { useTechnicians } from '@/hooks/use-technicians';
import { useResumeOptions } from '@/hooks/use-tracking';

export function ResumeTechModal({
  logId, processName, onConfirm, onClose, isLoading,
}: {
  logId: string;
  processName: string;
  onConfirm: (technicianId?: string, technicianName?: string) => Promise<void>;
  onClose: () => void;
  isLoading: boolean;
}) {
  const { data: options, isLoading: isLoadingOptions } = useResumeOptions(logId);
  const { data: technicians = [] } = useTechnicians();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Preselección: solo si el técnico anterior sigue libre. Ocupado → sin
  // preselección, el operador elige explícitamente (no bloquea el flujo).
  useEffect(() => {
    if (options?.previousTechnicianId && options.previousTechnicianFree) {
      setSelectedId(options.previousTechnicianId);
    }
  }, [options?.previousTechnicianId, options?.previousTechnicianFree]);

  const selected = technicians.find(t => t.id === selectedId) ?? null;

  async function handleConfirm() {
    if (!selected) { setError('Elegí un técnico para reanudar'); return; }
    setError('');
    try {
      await onConfirm(selected.id, selected.name);
    } catch (err: any) {
      setError(err.message ?? 'No se pudo reanudar el proceso');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Reanudar proceso</h2>
            <p className="text-xs text-slate-500 mt-0.5">{processName}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        {options?.previousTechnicianId && !options.previousTechnicianFree && (
          <div className="flex items-start gap-1.5 rounded-lg px-2.5 py-2 bg-amber-50 border border-amber-200">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700">
              {options.previousTechnicianName ?? 'El técnico anterior'} ya está en{' '}
              {options.conflictProcessName ?? 'otro proceso'}. Elegí otro técnico.
            </p>
          </div>
        )}

        <div className="space-y-1.5 max-h-56 overflow-y-auto">
          {isLoadingOptions ? (
            <p className="text-xs text-slate-400 text-center py-3">Cargando...</p>
          ) : technicians.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-3">Sin técnicos disponibles</p>
          ) : technicians.map(t => {
            const isPrevious = t.id === options?.previousTechnicianId;
            const isSelected = t.id === selectedId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedId(t.id)}
                className={`w-full text-left px-3 py-2 rounded-lg border flex items-center gap-2 transition-colors ${
                  isSelected ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <User2 className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                <span className="text-xs font-medium text-slate-700 flex-1 truncate">{t.name}</span>
                {isPrevious && (
                  <span className="text-[9px] font-bold text-blue-500 flex-shrink-0">Anterior</span>
                )}
              </button>
            );
          })}
        </div>

        {error && <p className="text-[11px] text-red-600">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 text-xs font-medium py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button type="button" disabled={!selectedId || isLoading} onClick={handleConfirm}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors">
            <PlayCircle className="h-3.5 w-3.5" />
            {isLoading ? 'Reanudando...' : 'Reanudar'}
          </button>
        </div>
      </div>
    </div>
  );
}
