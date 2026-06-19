'use client';
import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { GripVertical, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KanbanColConfig {
  status: string;
  label: string;
  color: string;
  enabled: boolean;
  custom?: boolean;   // true = creado por el usuario, puede eliminarse
}

export interface KanbanFieldConfig {
  id: string;
  label: string;
  visible: boolean;
  type?: 'text' | 'number' | 'date' | 'select';
  custom?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SWATCHES = [
  '#94a3b8', '#64748b', '#3b82f6', '#2563eb',
  '#f97316', '#ea580c', '#22c55e', '#16a34a',
  '#ef4444', '#dc2626', '#8b5cf6', '#7c3aed',
  '#f59e0b', '#d97706', '#ec4899', '#db2777',
  '#14b8a6', '#0d9488', '#6366f1', '#4f46e5',
];

const FIELD_TYPE_LABELS: Record<string, string> = {
  text:   'Texto',
  number: 'Número',
  date:   'Fecha',
  select: 'Selección',
};

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  columns: KanbanColConfig[];
  fields: KanbanFieldConfig[];
  onSave: (columns: KanbanColConfig[], fields: KanbanFieldConfig[]) => void;
  onClose: () => void;
}

export function KanbanSettingsModal({ columns: initCols, fields: initFields, onSave, onClose }: Props) {
  const [tab, setTab]       = useState<'columns' | 'fields'>('columns');
  const [cols, setCols]     = useState<KanbanColConfig[]>(initCols);
  const [fields, setFields] = useState<KanbanFieldConfig[]>(initFields);
  const [colorOpen, setColorOpen] = useState<number | null>(null);
  const dragIdx = useRef<number | null>(null);

  // New column form
  const [newColLabel, setNewColLabel]   = useState('');
  const [newColColor, setNewColColor]   = useState('#3b82f6');
  const [showNewCol, setShowNewCol]     = useState(false);
  const [newColSwatchOpen, setNewColSwatchOpen] = useState(false);

  // New field form
  const [newFieldLabel, setNewFieldLabel]   = useState('');
  const [newFieldType, setNewFieldType]     = useState<KanbanFieldConfig['type']>('text');
  const [showNewField, setShowNewField]     = useState(false);

  // ── Column DnD ───────────────────────────────────────────────────────────
  function handleDragStart(idx: number) { dragIdx.current = idx; }
  function handleDragOver(e: React.DragEvent) { e.preventDefault(); }
  function handleDrop(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === idx) return;
    const next = [...cols];
    const [moved] = next.splice(dragIdx.current, 1);
    next.splice(idx, 0, moved);
    setCols(next);
    dragIdx.current = null;
  }

  // ── Column actions ───────────────────────────────────────────────────────
  function setLabel(idx: number, label: string) {
    setCols(c => c.map((col, i) => i === idx ? { ...col, label } : col));
  }
  function setColor(idx: number, color: string) {
    setCols(c => c.map((col, i) => i === idx ? { ...col, color } : col));
    setColorOpen(null);
  }
  function toggleEnabled(idx: number) {
    setCols(c => c.map((col, i) => i === idx ? { ...col, enabled: !col.enabled } : col));
  }
  function deleteCol(idx: number) {
    setCols(c => c.filter((_, i) => i !== idx));
  }
  function addColumn() {
    if (!newColLabel.trim()) return;
    const status = `custom_${newColLabel.trim().toLowerCase().replace(/\s+/g, '_')}_${Date.now().toString(36)}`;
    setCols(c => [...c, { status, label: newColLabel.trim(), color: newColColor, enabled: true, custom: true }]);
    setNewColLabel('');
    setNewColColor('#3b82f6');
    setShowNewCol(false);
  }

  // ── Field actions ────────────────────────────────────────────────────────
  function toggleField(id: string) {
    setFields(f => f.map(fi => fi.id === id ? { ...fi, visible: !fi.visible } : fi));
  }
  function deleteField(id: string) {
    setFields(f => f.filter(fi => fi.id !== id));
  }
  function addField() {
    if (!newFieldLabel.trim()) return;
    const id = `custom_${Date.now().toString(36)}`;
    setFields(f => [...f, { id, label: newFieldLabel.trim(), visible: true, type: newFieldType, custom: true }]);
    setNewFieldLabel('');
    setNewFieldType('text');
    setShowNewField(false);
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Configuración del tablero</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 flex-shrink-0">
          {(['columns', 'fields'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 text-sm py-2 font-medium border-b-2 transition-colors ${
                tab === t
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t === 'columns' ? `Columnas (${cols.length})` : `Campos (${fields.length})`}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto min-h-0 py-1">

          {/* ── Columns tab ──────────────────────────────────────────────── */}
          {tab === 'columns' && (
            <div className="space-y-2 px-0.5">
              <p className="text-xs text-slate-400">
                Arrastrá para reordenar. Click en el color para cambiarlo.
              </p>

              {cols.map((col, idx) => (
                <div
                  key={col.status}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={handleDragOver}
                  onDrop={e => handleDrop(e, idx)}
                  className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-2.5 py-2 hover:border-slate-300 transition-colors"
                >
                  <GripVertical className="h-4 w-4 text-slate-300 cursor-grab flex-shrink-0" />

                  {/* Color dot + picker */}
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={() => setColorOpen(colorOpen === idx ? null : idx)}
                      className="h-4 w-4 rounded-full ring-1 ring-slate-200 hover:ring-slate-400 transition-all"
                      style={{ background: col.color }}
                    />
                    {colorOpen === idx && (
                      <div
                        className="absolute left-0 top-6 z-50 bg-white rounded-xl border border-slate-200 shadow-xl p-2.5 w-[152px]"
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="grid grid-cols-5 gap-1.5">
                          {SWATCHES.map(c => (
                            <button
                              key={c}
                              onClick={() => setColor(idx, c)}
                              className="h-5 w-5 rounded-full hover:scale-110 transition-transform"
                              style={{
                                background: c,
                                outline: col.color === c ? `2px solid ${c}` : 'none',
                                outlineOffset: 2,
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Editable label */}
                  <input
                    value={col.label}
                    onChange={e => setLabel(idx, e.target.value)}
                    className="flex-1 text-sm font-medium text-slate-800 bg-transparent focus:bg-slate-50 rounded px-1 outline-none focus:ring-1 focus:ring-blue-300 min-w-0"
                  />

                  {/* Eye toggle */}
                  <button
                    onClick={() => toggleEnabled(idx)}
                    title={col.enabled ? 'Ocultar' : 'Mostrar'}
                    className={`p-1 rounded-lg hover:bg-slate-100 transition-colors flex-shrink-0 ${
                      col.enabled ? 'text-slate-500' : 'text-slate-300'
                    }`}
                  >
                    {col.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </button>

                  {/* Delete (solo columnas custom) */}
                  {col.custom && (
                    <button
                      onClick={() => deleteCol(idx)}
                      title="Eliminar columna"
                      className="p-1 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}

              {/* New column form */}
              {showNewCol ? (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
                  <p className="text-xs font-semibold text-slate-600">Nueva columna</p>
                  <input
                    autoFocus
                    value={newColLabel}
                    onChange={e => setNewColLabel(e.target.value)}
                    placeholder="Nombre del estado..."
                    className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    onKeyDown={e => e.key === 'Enter' && addColumn()}
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Color:</span>
                    <div className="relative">
                      <button
                        onClick={() => setNewColSwatchOpen(o => !o)}
                        className="h-6 w-6 rounded-full ring-2 ring-white shadow-sm border border-slate-200"
                        style={{ background: newColColor }}
                      />
                      {newColSwatchOpen && (
                        <div
                          className="absolute left-0 top-8 z-50 bg-white rounded-xl border border-slate-200 shadow-xl p-2.5 w-[152px]"
                          onClick={e => e.stopPropagation()}
                        >
                          <div className="grid grid-cols-5 gap-1.5">
                            {SWATCHES.map(c => (
                              <button
                                key={c}
                                onClick={() => { setNewColColor(c); setNewColSwatchOpen(false); }}
                                className="h-5 w-5 rounded-full hover:scale-110 transition-transform"
                                style={{
                                  background: c,
                                  outline: newColColor === c ? `2px solid ${c}` : 'none',
                                  outlineOffset: 2,
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => { setShowNewCol(false); setNewColLabel(''); }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                      disabled={!newColLabel.trim()}
                      onClick={addColumn}
                    >
                      Agregar
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewCol(true)}
                  className="w-full flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-blue-600 border border-dashed border-slate-200 hover:border-blue-300 rounded-xl py-2.5 transition-all"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Agregar columna
                </button>
              )}
            </div>
          )}

          {/* ── Fields tab ───────────────────────────────────────────────── */}
          {tab === 'fields' && (
            <div className="space-y-2 px-0.5">
              <p className="text-xs text-slate-400">
                Controlá qué datos se muestran en cada card.
              </p>

              {fields.map(fi => (
                <div
                  key={fi.id}
                  className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2.5 hover:border-slate-300 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{fi.label}</p>
                    {fi.type && (
                      <p className="text-xs text-slate-400">{FIELD_TYPE_LABELS[fi.type]}</p>
                    )}
                  </div>

                  {/* Toggle */}
                  <button
                    onClick={() => toggleField(fi.id)}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-200 ${
                      fi.visible ? 'bg-blue-600' : 'bg-slate-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                        fi.visible ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>

                  {/* Delete (solo custom) */}
                  {fi.custom && (
                    <button
                      onClick={() => deleteField(fi.id)}
                      title="Eliminar campo"
                      className="p-1 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}

              {/* New field form */}
              {showNewField ? (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
                  <p className="text-xs font-semibold text-slate-600">Nuevo campo</p>
                  <input
                    autoFocus
                    value={newFieldLabel}
                    onChange={e => setNewFieldLabel(e.target.value)}
                    placeholder="Nombre del campo..."
                    className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    onKeyDown={e => e.key === 'Enter' && addField()}
                  />
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500">Tipo de dato</label>
                    <select
                      value={newFieldType}
                      onChange={e => setNewFieldType(e.target.value as KanbanFieldConfig['type'])}
                      className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                    >
                      <option value="text">Texto</option>
                      <option value="number">Número</option>
                      <option value="date">Fecha</option>
                      <option value="select">Selección</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => { setShowNewField(false); setNewFieldLabel(''); }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                      disabled={!newFieldLabel.trim()}
                      onClick={addField}
                    >
                      Agregar
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewField(true)}
                  className="w-full flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-blue-600 border border-dashed border-slate-200 hover:border-blue-300 rounded-xl py-2.5 transition-all"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Agregar campo
                </button>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 flex-shrink-0 border-t border-slate-100">
          <Button variant="outline" className="flex-1" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            size="sm"
            onClick={() => { onSave(cols, fields); onClose(); }}
          >
            Guardar cambios
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
