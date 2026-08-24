'use client';

// Modal de confirmación para devolver una tarjeta al proceso madre inmediatamente
// anterior (kanban-devolver-proceso-anterior, PR3). Combina el patrón de motivo de
// `PauseModal` (page.tsx) con el patrón de selección de técnico de
// `ResumeTechModal` — acá ambos campos son obligatorios en un único paso de
// confirmación (spec: "The system MUST require both a reason and a technician
// for the reopened process before executing a return, in a single confirmation
// step"). El backend valida `reason` con `@MaxLength(120)` (reutiliza
// `blocked_reason`), por eso el input respeta el mismo límite acá.

import { useState } from 'react';
import { X, Undo2, User2 } from 'lucide-react';
import { useTechnicians } from '@/hooks/use-technicians';

const REASON_MAX_LENGTH = 120;

const RETURN_REASONS = [
  'Falla detectada en el proceso anterior',
  'Retrabajo solicitado por control de calidad',
  'Reclamo del cliente',
  'Repuesto/material incorrecto instalado',
  'Otro',
];

export function ReturnProcessModal({
  processName, previousProcessName, onConfirm, onClose, isLoading,
}: {
  processName: string;
  previousProcessName: string;
  onConfirm: (reason: string, technicianId: string, technicianName: string) => Promise<void>;
  onClose: () => void;
  isLoading: boolean;
}) {
  const { data: technicians = [] } = useTechnicians();
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason]     = useState('');
  const [technicianId, setTechnicianId]     = useState<string | null>(null);
  const [error, setError]                   = useState('');

  const effectiveReason = (selectedReason === 'Otro' ? customReason : selectedReason).trim();
  const selectedTech = technicians.find(t => t.id === technicianId) ?? null;
  const canConfirm = !!effectiveReason && !!selectedTech && !isLoading;

  async function handleConfirm() {
    if (!effectiveReason) { setError('El motivo es obligatorio'); return; }
    if (!selectedTech)    { setError('Elegí un técnico para el proceso anterior'); return; }
    setError('');
    try {
      await onConfirm(effectiveReason, selectedTech.id, selectedTech.name);
    } catch (err: any) {
      setError(err.message ?? 'No se pudo devolver el proceso');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Devolver a {previousProcessName}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{processName}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-600">Motivo de la devolución</p>
          <div className="space-y-1.5">
            {RETURN_REASONS.map(r => (
              <label key={r} className="flex items-center gap-2.5 cursor-pointer">
                <input type="radio" name="return-reason" value={r}
                  checked={selectedReason === r} onChange={() => setSelectedReason(r)}
                  className="accent-indigo-500" />
                <span className={`text-xs ${selectedReason === r ? 'text-slate-900 font-medium' : 'text-slate-600'}`}>{r}</span>
              </label>
            ))}
          </div>
          {selectedReason === 'Otro' && (
            <input type="text" placeholder="Descripción del motivo..." maxLength={REASON_MAX_LENGTH}
              value={customReason} onChange={e => setCustomReason(e.target.value)} autoFocus
              className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-400 mt-1" />
          )}
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-600">
            Técnico para {previousProcessName}
          </p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {technicians.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3">Sin técnicos disponibles</p>
            ) : technicians.map(t => {
              const isSelected = t.id === technicianId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTechnicianId(t.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg border flex items-center gap-2 transition-colors ${
                    isSelected ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <User2 className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                  <span className="text-xs font-medium text-slate-700 flex-1 truncate">{t.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {error && <p className="text-[11px] text-red-600">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 text-xs font-medium py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button type="button" disabled={!canConfirm} onClick={handleConfirm}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            <Undo2 className="h-3.5 w-3.5" />
            {isLoading ? 'Devolviendo...' : 'Devolver'}
          </button>
        </div>
      </div>
    </div>
  );
}
