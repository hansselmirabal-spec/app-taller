'use client';

import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, RefreshCw, Pencil, Trash2, X, Loader2, Clock } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import {
  useOperationalBlocks,
  useCreateOperationalBlock,
  useUpdateOperationalBlock,
  useDeleteOperationalBlock,
} from '@/hooks/use-operational-blocks';
import { useWorkshopId } from '@/context/workshop-context';
import type { OperationalBlock } from '@/types';

const BLOCK_TYPE_CONFIG = {
  meeting:     { label: 'Reunión',       badge: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-500'    },
  cleaning:    { label: 'Limpieza',      badge: 'bg-green-100 text-green-700',   dot: 'bg-green-500'   },
  break:       { label: 'Descanso',      badge: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500'  },
  maintenance: { label: 'Mantenimiento', badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500'  },
  other:       { label: 'Otro',          badge: 'bg-slate-100 text-slate-600',   dot: 'bg-slate-400'   },
} as const;

type BlockType = keyof typeof BLOCK_TYPE_CONFIG;

interface BlockFormState {
  timeStart: string;
  timeEnd: string;
  type: BlockType;
  reason: string;
}

const EMPTY_FORM: BlockFormState = {
  timeStart: '08:00',
  timeEnd:   '09:00',
  type:      'meeting',
  reason:    '',
};

function BlockFormModal({
  initial,
  onSave,
  onClose,
  isSaving,
}: {
  initial: BlockFormState;
  onSave: (data: BlockFormState) => void;
  onClose: () => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<BlockFormState>(initial);
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.reason.trim()) { setError('El motivo es obligatorio'); return; }
    if (form.timeEnd <= form.timeStart) { setError('La hora de fin debe ser posterior al inicio'); return; }
    onSave(form);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Bloque operacional</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Horario */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Inicio</label>
              <input
                type="time"
                value={form.timeStart}
                onChange={e => setForm(f => ({ ...f, timeStart: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Fin</label>
              <input
                type="time"
                value={form.timeEnd}
                onChange={e => setForm(f => ({ ...f, timeEnd: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Tipo</label>
            <select
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value as BlockType }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
            >
              {(Object.keys(BLOCK_TYPE_CONFIG) as BlockType[]).map(t => (
                <option key={t} value={t}>{BLOCK_TYPE_CONFIG[t].label}</option>
              ))}
            </select>
          </div>

          {/* Motivo */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Motivo *</label>
            <input
              type="text"
              value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="Ej: Reunión semanal de producción"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</> : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BlockCard({
  block,
  onEdit,
  onDelete,
  isDeleting,
}: {
  block: OperationalBlock;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const cfg = BLOCK_TYPE_CONFIG[block.type];
  const [startH, startM] = block.timeStart.split(':').map(Number);
  const [endH, endM]     = block.timeEnd.split(':').map(Number);
  const durationMin = (endH * 60 + endM) - (startH * 60 + startM);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${cfg.dot}`} />
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800">{block.reason}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${cfg.badge}`}>
              {cfg.label}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
            <Clock className="h-3 w-3" />
            <span>{block.timeStart} – {block.timeEnd}</span>
            <span className="text-slate-300">·</span>
            <span>{durationMin}min</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          type="button"
          onClick={onEdit}
          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-slate-400 hover:text-red-600 disabled:opacity-50"
        >
          {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

export default function AgendaTallerPage() {
  const workshopId = useWorkshopId();
  const [date, setDate] = useState(formatDate(new Date()));
  const [modal, setModal] = useState<'create' | { block: OperationalBlock } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: blocks = [], isLoading, refetch } = useOperationalBlocks(workshopId ?? undefined, date);
  const createMutation = useCreateOperationalBlock();
  const updateMutation = useUpdateOperationalBlock();
  const deleteMutation = useDeleteOperationalBlock();

  function prevDay() {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    setDate(formatDate(d));
  }
  function nextDay() {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    setDate(formatDate(d));
  }

  async function handleSave(data: BlockFormState) {
    if (!workshopId) return;
    if (modal === 'create') {
      await createMutation.mutateAsync({ workshopId, date, ...data });
    } else if (modal && typeof modal === 'object') {
      await updateMutation.mutateAsync({ id: modal.block.id, dto: data });
    }
    setModal(null);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteMutation.mutateAsync(id);
    } finally {
      setDeletingId(null);
    }
  }

  const sortedBlocks = [...blocks].sort((a, b) => a.timeStart.localeCompare(b.timeStart));

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Modal */}
      {modal && (
        <BlockFormModal
          initial={modal === 'create' ? EMPTY_FORM : {
            timeStart: modal.block.timeStart,
            timeEnd:   modal.block.timeEnd,
            type:      modal.block.type,
            reason:    modal.block.reason,
          }}
          onSave={handleSave}
          onClose={() => setModal(null)}
          isSaving={createMutation.isPending || updateMutation.isPending}
        />
      )}

      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-5 w-5 text-slate-400" />
            <h1 className="text-base font-semibold text-slate-900">Agenda del Taller</h1>
            {blocks.length > 0 && (
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                {blocks.length} bloque{blocks.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              <button type="button" onClick={prevDay} className="p-1 rounded hover:bg-white transition-colors">
                <ChevronLeft className="h-4 w-4 text-slate-600" />
              </button>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="text-xs font-medium text-slate-700 bg-transparent border-none outline-none px-1"
              />
              <button type="button" onClick={nextDay} className="p-1 rounded hover:bg-white transition-colors">
                <ChevronRight className="h-4 w-4 text-slate-600" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setModal('create')}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Nuevo bloque
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <RefreshCw className="h-6 w-6 text-slate-400 animate-spin" />
          </div>
        ) : sortedBlocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-slate-400">
            <CalendarDays className="h-10 w-10 opacity-30" />
            <p className="text-sm">Sin bloques para este día</p>
            <button
              type="button"
              onClick={() => setModal('create')}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              Agregar el primero
            </button>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-3">
            {sortedBlocks.map(block => (
              <BlockCard
                key={block.id}
                block={block}
                onEdit={() => setModal({ block })}
                onDelete={() => handleDelete(block.id)}
                isDeleting={deletingId === block.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
