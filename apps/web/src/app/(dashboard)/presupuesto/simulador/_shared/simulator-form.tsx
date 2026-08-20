'use client';

import { Loader2, Plus, Trash2 } from 'lucide-react';
import type { DamageLevel, SimulatorEstimateResult } from '@/lib/api';
import type { SimulatorItem } from './use-simulator-form';

const DAMAGE_LEVELS: { value: DamageLevel; label: string }[] = [
  { value: 'Leve',        label: 'Leve'         },
  { value: 'Medio',       label: 'Medio'        },
  { value: 'Grave',       label: 'Grave'        },
  { value: 'Sustitucion', label: 'Sustitución'  },
];

interface SimulatorFormProps {
  // Vehicle header
  plate: string;
  onPlateChange: (value: string) => void;
  onPlateLookup: () => void;
  isLookingUpPlate: boolean;
  vehicleModel?: string;
  plateSearchError: string;

  budgetNumber: string;
  onBudgetNumberChange: (value: string) => void;

  customerName: string;
  onCustomerNameChange: (value: string) => void;

  phone: string;
  onPhoneChange: (value: string) => void;

  notes: string;
  onNotesChange: (value: string) => void;

  // Items
  items: SimulatorItem[];
  piezas: string[];
  estimate: SimulatorEstimateResult | null;
  isEstimating: boolean;
  onUpdateItem: (id: string, patch: Partial<Omit<SimulatorItem, 'id'>>) => void;
  onRemoveItem: (id: string) => void;
  onAddItem: () => void;

  error: string;
}

/**
 * Vehicle header + damaged panels list + inline error — the part of the
 * Simulator shared byte-for-byte between "create" and "edit" modes. Presented
 * as a pure container/presentational split: all state lives in
 * `useSimulatorForm`, this component only renders it.
 */
export function SimulatorForm({
  plate, onPlateChange, onPlateLookup, isLookingUpPlate, vehicleModel, plateSearchError,
  budgetNumber, onBudgetNumberChange,
  customerName, onCustomerNameChange,
  phone, onPhoneChange,
  notes, onNotesChange,
  items, piezas, estimate, isEstimating, onUpdateItem, onRemoveItem, onAddItem,
  error,
}: SimulatorFormProps) {
  return (
    <>
      {/* Vehicle card */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Vehículo</p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Chapa o Chasis *
              {vehicleModel && (
                <span className="ml-2 text-emerald-500 font-normal normal-case">{vehicleModel}</span>
              )}
            </label>
            <p className="text-[11px] text-slate-400 mb-1.5">
              Ingresá la chapa (ej: AACA898) o el número de chasis (ej: 9BD186DZ0LB035786)
            </p>
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={plate}
                  onChange={e => onPlateChange(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && onPlateLookup()}
                  placeholder="AACA898 · 9BD186DZ0LB035786"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium uppercase outline-none focus:ring-2 focus:ring-blue-400 pr-8"
                />
                {isLookingUpPlate && (
                  <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-slate-400" />
                )}
              </div>
              <button
                type="button"
                onClick={() => onPlateLookup()}
                disabled={isLookingUpPlate || !plate.trim()}
                className="px-3 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg disabled:opacity-60 flex-shrink-0 hover:bg-blue-700 transition-colors"
              >
                {isLookingUpPlate ? '...' : 'Buscar'}
              </button>
            </div>
            {plateSearchError && (
              <p className="text-[11px] text-red-600 mt-1">{plateSearchError}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">N° Presupuesto</label>
            <input
              type="text"
              value={budgetNumber}
              onChange={e => onBudgetNumberChange(e.target.value)}
              placeholder="Opcional"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nombre del cliente *</label>
          <input
            type="text"
            value={customerName}
            onChange={e => onCustomerNameChange(e.target.value)}
            placeholder="Juan Pérez"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Teléfono</label>
            <input
              type="tel"
              value={phone}
              onChange={e => onPhoneChange(e.target.value)}
              placeholder="0981 000 000"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notas</label>
          <textarea
            value={notes}
            onChange={e => onNotesChange(e.target.value)}
            rows={2}
            placeholder="Descripción del daño, información adicional..."
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />
        </div>
      </div>

      {/* Panels card */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Paneles dañados</p>
          {isEstimating && <Loader2 className="h-4 w-4 animate-spin text-blue-400" />}
        </div>

        <div className="space-y-3">
          {items.map((item, idx) => {
            const lineResult = estimate?.lines?.[idx];
            return (
              <div key={item.id} className="space-y-1.5">
                {/* Row */}
                <div className="flex items-center gap-2">
                  {/* Pieza */}
                  <div className="flex-1">
                    <select
                      value={item.pieza}
                      onChange={e => onUpdateItem(item.id, { pieza: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                    >
                      <option value="">Seleccionar pieza...</option>
                      {piezas.map((p: string) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>

                  {/* Daño */}
                  <div className="w-32">
                    <select
                      value={item.damageLevel}
                      onChange={e => onUpdateItem(item.id, { damageLevel: e.target.value as DamageLevel })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                    >
                      {DAMAGE_LEVELS.map(d => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Qty */}
                  <div className="w-16">
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={item.qty}
                      onChange={e => onUpdateItem(item.id, { qty: Math.max(1, Math.min(10, Number(e.target.value))) })}
                      className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-center outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>

                  {/* Delete */}
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onRemoveItem(item.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Estimate breakdown for this line */}
                {lineResult && (
                  <div className="ml-1 flex items-center gap-3 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-1.5">
                    <span>Chapería <span className="font-semibold text-slate-700">{lineResult.bodyworkHours}h</span></span>
                    <span className="text-slate-300">|</span>
                    <span>Prep <span className="font-semibold text-slate-700">{lineResult.prepHours}h</span></span>
                    <span className="text-slate-300">|</span>
                    <span>Pintura <span className="font-semibold text-slate-700">{lineResult.paintHours}h</span></span>
                    <span className="text-slate-300">|</span>
                    <span className="font-semibold text-slate-800">{lineResult.totalHoras}h</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add row */}
        <button
          type="button"
          onClick={onAddItem}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-slate-300 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Agregar panel
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 text-red-600 rounded-lg px-3 py-2 text-sm">{error}</div>
      )}
    </>
  );
}

/**
 * KPI bar (bodywork/prep/paint/total hours + cost) — shared between create
 * and edit modes, rendered above the sticky action buttons.
 */
export function EstimateSummaryBar({ estimate }: { estimate: SimulatorEstimateResult | null }) {
  if (!estimate) return null;

  return (
    <div className="flex items-center justify-around px-4 py-2 border-b border-slate-100 bg-slate-50">
      <div className="text-center">
        <p className="text-xs text-slate-400">Chapería</p>
        <p className="text-sm font-semibold text-slate-700">{estimate.bodyworkHours}h</p>
      </div>
      <div className="text-center">
        <p className="text-xs text-slate-400">Preparación</p>
        <p className="text-sm font-semibold text-slate-700">{estimate.prepHours}h</p>
      </div>
      <div className="text-center">
        <p className="text-xs text-slate-400">Pintura</p>
        <p className="text-sm font-semibold text-slate-700">{estimate.paintHours}h</p>
      </div>
      <div className="text-center">
        <p className="text-xs text-slate-400">Total</p>
        <p className="text-sm font-bold text-slate-900">{estimate.totalHoras}h</p>
      </div>
      <div className="text-center">
        <p className="text-xs text-slate-400">{estimate.moneda ?? 'Gs.'}</p>
        <p className="text-sm font-bold text-emerald-600">
          {estimate.totalMdo.toLocaleString('es-PY')}
        </p>
      </div>
    </div>
  );
}
