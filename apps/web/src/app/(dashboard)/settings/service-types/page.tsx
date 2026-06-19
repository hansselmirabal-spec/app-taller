'use client';
import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { useServiceTypes, useCreateServiceType, useUpdateServiceType } from '@/hooks/use-service-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { ServiceType } from '@/types';

const PRESET_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'];

export default function ServiceTypesPage() {
  const { data: serviceTypes = [] } = useServiceTypes();
  const create = useCreateServiceType();
  const update = useUpdateServiceType();
  const [editing, setEditing] = useState<ServiceType | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', durationHours: '1.5', color: '#3b82f6' });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await create.mutateAsync({ name: form.name, durationHours: parseFloat(form.durationHours), color: form.color });
    setForm({ name: '', durationHours: '1.5', color: '#3b82f6' });
    setShowForm(false);
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    await update.mutateAsync({ id: editing.id, data: editing });
    setEditing(null);
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Tipos de servicio</h1>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-1" /> Agregar
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4 space-y-3">
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Nombre</label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ej: Service completo" required autoFocus />
            </div>
            <div className="w-32 space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Duracion (hs)</label>
              <Input type="number" value={form.durationHours} onChange={e => setForm({ ...form, durationHours: e.target.value })} min="0.5" max="8" step="0.5" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700">Color</label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setForm({ ...form, color: c })}
                  className={`h-6 w-6 rounded-full transition-all ${form.color === c ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'hover:scale-105'}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" size="sm" disabled={create.isPending}>Guardar</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-4 py-3 font-medium text-slate-700">Servicio</th>
              <th className="text-center px-4 py-3 font-medium text-slate-700">Duracion</th>
              <th className="text-center px-4 py-3 font-medium text-slate-700">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {serviceTypes.map(st => (
              <tr key={st.id} className="border-b border-slate-100 last:border-0">
                {editing?.id === st.id ? (
                  <td colSpan={4} className="p-3">
                    <form onSubmit={handleUpdate} className="space-y-2">
                      <div className="flex gap-3 items-center">
                        <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ background: editing.color }} />
                        <Input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} className="flex-1" autoFocus />
                        <Input type="number" value={editing.durationHours} onChange={e => setEditing({ ...editing, durationHours: parseFloat(e.target.value) })} className="w-24" step="0.5" min="0.5" />
                        <Button size="sm" type="submit" disabled={update.isPending}>Guardar</Button>
                        <Button size="sm" variant="outline" type="button" onClick={() => setEditing(null)}>Cancelar</Button>
                      </div>
                      <div className="flex gap-2 pl-6">
                        {PRESET_COLORS.map(c => (
                          <button key={c} type="button" onClick={() => setEditing({ ...editing, color: c })}
                            className={`h-5 w-5 rounded-full ${editing.color === c ? 'ring-2 ring-offset-1 ring-slate-400' : ''}`}
                            style={{ background: c }}
                          />
                        ))}
                      </div>
                    </form>
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: st.color }} />
                        <span className="font-medium text-slate-900">{st.name}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">{st.durationHours}h</td>
                    <td className="px-4 py-3 text-center">
                      <Badge className={st.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}>
                        {st.active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setEditing(st)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-900">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
