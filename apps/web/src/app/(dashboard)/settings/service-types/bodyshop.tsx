'use client';
import { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { useModulePermission } from '@/hooks/use-module-permission';
import { useWorkTypes, useCreateWorkType, useUpdateWorkType, useDeleteWorkType } from '@/hooks/use-work-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { WorkSeverity, WorkType } from '@/types';
import { sumBodyshopHours } from '@/lib/utils';

const PRESET_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899', '#64748b', '#14b8a6'];

const SEVERITY_OPTIONS: { value: WorkSeverity; label: string; cls: string }[] = [
  { value: 'LIGHT',    label: 'Leve',     cls: 'bg-emerald-100 text-emerald-700' },
  { value: 'MEDIUM',   label: 'Medio',    cls: 'bg-amber-100 text-amber-700' },
  { value: 'HEAVY',    label: 'Grave',    cls: 'bg-orange-100 text-orange-700' },
  { value: 'MULTIPLE', label: 'Múltiple', cls: 'bg-red-100 text-red-700' },
];

const severityClass: Record<WorkSeverity, string> = {
  LIGHT:    'bg-emerald-100 text-emerald-700',
  MEDIUM:   'bg-amber-100 text-amber-700',
  HEAVY:    'bg-orange-100 text-orange-700',
  MULTIPLE: 'bg-red-100 text-red-700',
};

const severityLabel: Record<WorkSeverity, string> = {
  LIGHT: 'Leve', MEDIUM: 'Medio', HEAVY: 'Grave', MULTIPLE: 'Múltiple',
};

type FormState = {
  name: string;
  severity: WorkSeverity;
  estimatedDays: string;
  bodyworkHours: string;
  prepHours: string;
  paintHours: string;
  color: string;
};

const DEFAULT_FORM: FormState = {
  name: '',
  severity: 'MEDIUM',
  estimatedDays: '3',
  bodyworkHours: '8',
  prepHours: '4',
  paintHours: '4',
  color: '#3b82f6',
};

export default function BodyshopWorkTypesPage() {
  const { canEdit } = useModulePermission('settings');
  const { data: workTypes = [] } = useWorkTypes();
  const create = useCreateWorkType();
  const update = useUpdateWorkType();
  const del    = useDeleteWorkType();

  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState<FormState>(DEFAULT_FORM);
  const [editing, setEditing]     = useState<WorkType | null>(null);
  const [formError, setFormError] = useState<string>('');
  const [editError, setEditError] = useState<string>('');

  function setF(k: keyof FormState, v: string) {
    setForm(f => ({ ...f, [k]: v }));
    if (formError) setFormError('');
  }

  // Valida los 4 campos numéricos y devuelve un mensaje claro o null si está OK.
  // Cubre: vacío, no numérico, fuera de rango. Los inputs muestran "deben ser un número"
  // cuando llegan al backend con NaN; preferimos mensajes específicos en español.
  function validateNumericFields(f: { estimatedDays: any; bodyworkHours: any; prepHours: any; paintHours: any }): string | null {
    const checks: { label: string; value: any; min: number; max: number; integer?: boolean }[] = [
      { label: 'estadía (días)',         value: f.estimatedDays, min: 1, max: 30, integer: true },
      { label: 'horas de chapería',      value: f.bodyworkHours, min: 0, max: 80 },
      { label: 'horas de preparación',   value: f.prepHours,     min: 0, max: 80 },
      { label: 'horas de pintura',       value: f.paintHours,    min: 0, max: 80 },
    ];
    for (const c of checks) {
      const raw = c.value;
      if (raw === '' || raw === null || raw === undefined) {
        return `Completá el campo "${c.label}". No puede quedar vacío.`;
      }
      const n = c.integer ? parseInt(String(raw)) : parseFloat(String(raw));
      if (!Number.isFinite(n)) {
        return `El campo "${c.label}" debe ser un número válido (recibí "${raw}").`;
      }
      if (n < c.min || n > c.max) {
        return `El campo "${c.label}" debe estar entre ${c.min} y ${c.max}. Recibí ${n}.`;
      }
    }
    return null;
  }

  // Extrae mensaje legible de errores del backend (puede ser string o array de validación)
  function backendErrorMsg(err: any): string {
    const data = err?.response?.data ?? err?.data ?? err;
    const msg  = data?.message ?? data?.error ?? err?.message ?? 'No se pudo guardar.';
    return Array.isArray(msg) ? msg.join(' · ') : String(msg);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!form.name.trim()) { setFormError('Ingresá un nombre para el tipo de trabajo.'); return; }
    const numericError = validateNumericFields(form);
    if (numericError) { setFormError(numericError); return; }
    try {
      await create.mutateAsync({
        name:          form.name.trim(),
        severity:      form.severity,
        estimatedDays: parseInt(form.estimatedDays),
        bodyworkHours: parseFloat(form.bodyworkHours),
        prepHours:     parseFloat(form.prepHours),
        paintHours:    parseFloat(form.paintHours),
        color:         form.color,
      });
      setForm(DEFAULT_FORM);
      setShowForm(false);
    } catch (err) {
      setFormError(backendErrorMsg(err));
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setEditError('');
    if (!editing.name?.trim()) { setEditError('El nombre no puede quedar vacío.'); return; }
    const numericError = validateNumericFields(editing);
    if (numericError) { setEditError(numericError); return; }
    try {
      await update.mutateAsync({ id: editing.id, data: editing });
      setEditing(null);
    } catch (err) {
      setEditError(backendErrorMsg(err));
    }
  }

  function startEdit(wt: WorkType) {
    setEditing({ ...wt });
    setShowForm(false);
  }

  const totalHours = sumBodyshopHours;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Tipos de trabajo</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Definí los tipos de reparación con las horas por proceso. Se usan al registrar ingresos.
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => { setShowForm(s => !s); setEditing(null); }}>
            <Plus className="h-4 w-4 mr-1" /> Agregar
          </Button>
        )}
      </div>

      {/* Create form */}
      {showForm && canEdit && (
        <form onSubmit={handleCreate} className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Nombre</label>
              <Input value={form.name} onChange={e => setF('name', e.target.value)} placeholder="Ej: Choque frontal" required autoFocus />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Severidad</label>
              <Select value={form.severity} onValueChange={v => setF('severity', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SEVERITY_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${o.cls}`}>{o.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Estadía (días)</label>
              <Input type="number" value={form.estimatedDays} onChange={e => setF('estimatedDays', e.target.value)} min="1" max="30" step="1" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-blue-600">Chapería (h)</label>
              <Input type="number" value={form.bodyworkHours} onChange={e => setF('bodyworkHours', e.target.value)} min="0" max="80" step="0.5" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-violet-600">Preparación (h)</label>
              <Input type="number" value={form.prepHours} onChange={e => setF('prepHours', e.target.value)} min="0" max="80" step="0.5" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-orange-600">Pintura (h)</label>
              <Input type="number" value={form.paintHours} onChange={e => setF('paintHours', e.target.value)} min="0" max="80" step="0.5" />
            </div>
          </div>

          {/* Total calc */}
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-white rounded-lg border border-slate-200 px-3 py-2">
            <span>Total horas:</span>
            <span className="font-bold text-slate-900">
              {(parseFloat(form.bodyworkHours || '0') + parseFloat(form.prepHours || '0') + parseFloat(form.paintHours || '0')).toFixed(1)}h
            </span>
            <span className="text-slate-300 mx-1">·</span>
            <span>Estadía estimada:</span>
            <span className="font-bold text-slate-900">{form.estimatedDays} día{parseInt(form.estimatedDays) !== 1 ? 's' : ''}</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700">Color de identificación</label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button
                  key={c} type="button" onClick={() => setF('color', c)}
                  className={`h-6 w-6 rounded-full transition-all ${form.color === c ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'hover:scale-105'}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          {formError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 flex items-start gap-2">
              <span aria-hidden>⚠️</span>
              <span>{formError}</span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="submit" size="sm" disabled={create.isPending}>Guardar</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { setShowForm(false); setFormError(''); }}>Cancelar</Button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-4 py-3 font-medium text-slate-700">Tipo de trabajo</th>
              <th className="text-center px-3 py-3 font-medium text-slate-700">Severidad</th>
              <th className="text-center px-3 py-3 font-medium text-slate-700">Días</th>
              <th className="text-center px-3 py-3 font-medium text-blue-600">Chap.</th>
              <th className="text-center px-3 py-3 font-medium text-violet-600">Prep.</th>
              <th className="text-center px-3 py-3 font-medium text-orange-600">Pint.</th>
              <th className="text-center px-3 py-3 font-medium text-slate-500">Total</th>
              <th className="px-3 py-3 w-16" />
            </tr>
          </thead>
          <tbody>
            {workTypes.map(wt => (
              <tr key={wt.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                {editing?.id === wt.id ? (
                  <td colSpan={8} className="p-3">
                    <form onSubmit={handleUpdate} className="space-y-3">
                      <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-end">
                        <Input
                          value={editing.name}
                          onChange={e => setEditing({ ...editing, name: e.target.value })}
                          autoFocus
                        />
                        <Select value={editing.severity} onValueChange={v => setEditing({ ...editing, severity: v as WorkSeverity })}>
                          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {SEVERITY_OPTIONS.map(o => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-500 whitespace-nowrap">Est.días:</span>
                          <Input
                            type="number"
                            value={editing.estimatedDays}
                            onChange={e => setEditing({ ...editing, estimatedDays: parseInt(e.target.value) })}
                            className="w-16"
                            min="1" max="30"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs text-blue-600 font-medium">Chapería (h)</label>
                          <Input type="number" value={editing.bodyworkHours} onChange={e => setEditing({ ...editing, bodyworkHours: parseFloat(e.target.value) })} min="0" max="80" step="0.5" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-violet-600 font-medium">Preparación (h)</label>
                          <Input type="number" value={editing.prepHours} onChange={e => setEditing({ ...editing, prepHours: parseFloat(e.target.value) })} min="0" max="80" step="0.5" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-orange-600 font-medium">Pintura (h)</label>
                          <Input type="number" value={editing.paintHours} onChange={e => setEditing({ ...editing, paintHours: parseFloat(e.target.value) })} min="0" max="80" step="0.5" />
                        </div>
                        <div className="flex flex-wrap gap-1 items-end pb-1">
                          {PRESET_COLORS.map(c => (
                            <button
                              key={c} type="button"
                              onClick={() => setEditing({ ...editing, color: c })}
                              className={`h-5 w-5 rounded-full ${editing.color === c ? 'ring-2 ring-offset-1 ring-slate-400' : ''}`}
                              style={{ background: c }}
                            />
                          ))}
                        </div>
                      </div>
                      {editError && (
                        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 flex items-start gap-2">
                          <span aria-hidden>⚠️</span>
                          <span>{editError}</span>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button size="sm" type="submit" disabled={update.isPending}><Check className="h-3.5 w-3.5 mr-1" />Guardar</Button>
                        <Button size="sm" variant="outline" type="button" onClick={() => { setEditing(null); setEditError(''); }}><X className="h-3.5 w-3.5 mr-1" />Cancelar</Button>
                      </div>
                    </form>
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: wt.color }} />
                        <span className="font-medium text-slate-900">{wt.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${severityClass[wt.severity]}`}>
                        {severityLabel[wt.severity]}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center text-slate-600">{wt.estimatedDays}d</td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-blue-700 font-medium">{wt.bodyworkHours}h</span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-violet-700 font-medium">{wt.prepHours}h</span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-orange-700 font-medium">{wt.paintHours}h</span>
                    </td>
                    <td className="px-3 py-3 text-center text-slate-500 font-medium">
                      {totalHours(wt)}h
                    </td>
                    <td className="px-3 py-3 text-right">
                      {canEdit && (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => startEdit(wt)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => del.mutate(wt.id)} disabled={del.isPending} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
            {workTypes.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                  No hay tipos de trabajo. Agregá el primero.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
        <span className="font-medium text-slate-700">Leyenda:</span>
        <span className="text-blue-600 font-medium">Chap. = Chapería</span>
        <span className="text-violet-600 font-medium">Prep. = Preparación</span>
        <span className="text-orange-600 font-medium">Pint. = Pintura</span>
        <span>· Las horas se usan para calcular la capacidad diaria de cada proceso.</span>
      </div>
    </div>
  );
}
