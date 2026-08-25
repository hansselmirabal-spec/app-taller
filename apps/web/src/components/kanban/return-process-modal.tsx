'use client';

// Modal de confirmación para devolver una tarjeta a cualquier proceso madre
// anterior (kanban-devolver-multi-proceso-anterior, PR3 — generaliza el
// single-hop de kanban-devolver-proceso-anterior). Combina el patrón de motivo
// de `PauseModal` (page.tsx) con el patrón de selección de técnico de
// `ResumeTechModal`, y agrega un selector de destino (mismo patrón visual que
// `RETURN_REASONS`) que se resuelve ANTES de motivo/técnico — ambos campos
// siguen siendo obligatorios en un único paso de confirmación (spec: "The
// system MUST require both a reason and a technician for the reopened process
// before executing a return, in a single confirmation step"). El backend
// valida `reason` con `@MaxLength(120)` (reutiliza `blocked_reason`), por eso
// el input respeta el mismo límite acá.

import { useState } from 'react';
import { X, Undo2, User2 } from 'lucide-react';
import { useTechnicians } from '@/hooks/use-technicians';
import type { ReturnTarget } from '@/lib/api';

const REASON_MAX_LENGTH = 120;

const RETURN_REASONS = [
  'Falla detectada en el proceso anterior',
  'Retrabajo solicitado por control de calidad',
  'Reclamo del cliente',
  'Repuesto/material incorrecto instalado',
  'Otro',
];

// Re-orden defensivo del lado del cliente — el backend ya manda
// `availableReturnTargets` en orderIndex DESC (design D1), pero no confiamos
// en el orden del payload para la UI.
export function sortReturnTargets(targets: ReturnTarget[]): ReturnTarget[] {
  return [...targets].sort((a, b) => b.orderIndex - a.orderIndex);
}

// Destinos que se devolverán en cascada junto con el elegido (todo proceso
// intermedio con orderIndex mayor al del destino elegido) — solo para el hint
// informativo "También se devolverán: …"; el backend recalcula y aplica esta
// misma lógica de forma autoritativa (D2/D5).
export function computeCascadeTargets(
  targets: ReturnTarget[],
  selectedProcessCode: string,
): ReturnTarget[] {
  const selected = targets.find(t => t.processCode === selectedProcessCode);
  if (!selected) return [];
  return targets.filter(t => t.orderIndex > selected.orderIndex);
}

export function ReturnProcessModal({
  processName, targets, onConfirm, onClose, isLoading,
}: {
  processName: string;
  targets: ReturnTarget[];
  onConfirm: (targetProcessCode: string, reason: string, technicianId: string, technicianName: string) => Promise<void>;
  onClose: () => void;
  isLoading: boolean;
}) {
  const { data: technicians = [] } = useTechnicians();
  const sortedTargets = sortReturnTargets(targets);
  const [targetProcessCode, setTargetProcessCode] = useState(sortedTargets[0]?.processCode ?? '');
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason]     = useState('');
  const [technicianId, setTechnicianId]     = useState<string | null>(null);
  const [error, setError]                   = useState('');

  const selectedTarget = sortedTargets.find(t => t.processCode === targetProcessCode) ?? null;
  const cascadeTargets = computeCascadeTargets(sortedTargets, targetProcessCode);
  const effectiveReason = (selectedReason === 'Otro' ? customReason : selectedReason).trim();
  const selectedTech = technicians.find(t => t.id === technicianId) ?? null;
  const canConfirm = !!selectedTarget && !!effectiveReason && !!selectedTech && !isLoading;

  async function handleConfirm() {
    if (!selectedTarget)  { setError('Elegí a qué proceso devolver la tarjeta'); return; }
    if (!effectiveReason) { setError('El motivo es obligatorio'); return; }
    if (!selectedTech)    { setError('Elegí un técnico para el proceso destino'); return; }
    setError('');
    try {
      await onConfirm(selectedTarget.processCode, effectiveReason, selectedTech.id, selectedTech.name);
    } catch (err: any) {
      setError(err.message ?? 'No se pudo devolver el proceso');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Devolver proceso</h2>
            <p className="text-xs text-slate-500 mt-0.5">{processName}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-600">Devolver a</p>
          <div className="space-y-1.5">
            {sortedTargets.map(t => (
              <label key={t.processCode} className="flex items-center gap-2.5 cursor-pointer">
                <input type="radio" name="return-target" value={t.processCode}
                  checked={targetProcessCode === t.processCode} onChange={() => setTargetProcessCode(t.processCode)}
                  className="accent-indigo-500" />
                <span className={`text-xs ${targetProcessCode === t.processCode ? 'text-slate-900 font-medium' : 'text-slate-600'}`}>{t.processName}</span>
              </label>
            ))}
          </div>
          {cascadeTargets.length > 0 && (
            <p className="text-[11px] text-amber-600">
              También se devolverán: {cascadeTargets.map(t => t.processName).join(', ')}
            </p>
          )}
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
            Técnico para {selectedTarget?.processName ?? 'el proceso destino'}
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
