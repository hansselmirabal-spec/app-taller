'use client';
import { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { useTechnicians, useCreateTechnician, useUpdateTechnician } from '@/hooks/use-technicians';
import { useSpecialties, useCreateSpecialty, useUpdateSpecialty, useDeleteSpecialty } from '@/hooks/use-specialties';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Technician, Specialty } from '@/types';

export default function TechniciansSettingsPage() {
  const { data: technicians = [] } = useTechnicians();
  const { data: specialties = [] } = useSpecialties();
  const create = useCreateTechnician();
  const update = useUpdateTechnician();

  const [editing, setEditing] = useState<Technician | null>(null);
  const [newName, setNewName] = useState('');
  const [newHours, setNewHours] = useState('8');
  const [newSpecialtyId, setNewSpecialtyId] = useState('');
  const [showForm, setShowForm] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await create.mutateAsync({ name: newName, dailyHours: parseFloat(newHours), ...(newSpecialtyId ? { specialtyId: newSpecialtyId } : {}) } as any);
    setNewName(''); setNewHours('8'); setNewSpecialtyId(''); setShowForm(false);
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    await update.mutateAsync({ id: editing.id, data: { name: editing.name, dailyHours: editing.dailyHours, specialtyId: editing.specialtyId ?? '' } });
    setEditing(null);
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      {/* ── Técnicos ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Técnicos</h1>
            <p className="text-xs text-slate-500 mt-0.5">{technicians.length} técnico{technicians.length !== 1 ? 's' : ''} registrado{technicians.length !== 1 ? 's' : ''}</p>
          </div>
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 mr-1" /> Agregar
          </Button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4 grid grid-cols-[1fr_auto_1fr_auto_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Nombre</label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nombre del técnico" required autoFocus />
            </div>
            <div className="w-24 space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Horas/día</label>
              <Input type="number" value={newHours} onChange={e => setNewHours(e.target.value)} min="1" max="12" step="0.5" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Especialidad</label>
              <Select value={newSpecialtyId} onValueChange={setNewSpecialtyId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {specialties.map(sp => (
                    <SelectItem key={sp.id} value={sp.id}>{sp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" size="sm" disabled={create.isPending}>Guardar</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
          </form>
        )}

        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-700">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-slate-700">Especialidad</th>
                <th className="text-center px-4 py-3 font-medium text-slate-700">Horas/día</th>
                <th className="text-center px-4 py-3 font-medium text-slate-700">Estado</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {technicians.map(tech => (
                <tr key={tech.id} className="border-b border-slate-100 last:border-0">
                  {editing?.id === tech.id ? (
                    <td colSpan={5} className="p-3">
                      <form onSubmit={handleUpdate} className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-3 items-center">
                        <Input
                          value={editing.name}
                          onChange={e => setEditing({ ...editing, name: e.target.value })}
                          autoFocus
                        />
                        <Select
                          value={editing.specialtyId ?? ''}
                          onValueChange={v => setEditing({ ...editing, specialtyId: v })}
                        >
                          <SelectTrigger><SelectValue placeholder="Especialidad..." /></SelectTrigger>
                          <SelectContent>
                            {specialties.map(sp => (
                              <SelectItem key={sp.id} value={sp.id}>{sp.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          value={editing.dailyHours}
                          onChange={e => setEditing({ ...editing, dailyHours: parseFloat(e.target.value) })}
                          className="w-20"
                          min="1" max="12" step="0.5"
                        />
                        <Button size="sm" type="submit" disabled={update.isPending}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" type="button" onClick={() => setEditing(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </form>
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-medium text-slate-900">{tech.name}</td>
                      <td className="px-4 py-3">
                        {tech.specialty ? (
                          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full font-medium">
                            {tech.specialty.name}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Sin asignar</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-600">{tech.dailyHours}h</td>
                      <td className="px-4 py-3 text-center">
                        <Badge className={tech.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}>
                          {tech.active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => setEditing(tech)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-900">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {technicians.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                    No hay técnicos registrados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Especialidades ── */}
      <SpecialtiesSection specialties={specialties} />
    </div>
  );
}

function SpecialtiesSection({ specialties }: { specialties: Specialty[] }) {
  const createSp = useCreateSpecialty();
  const updateSp = useUpdateSpecialty();
  const deleteSp = useDeleteSpecialty();

  const [newName, setNewName] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    await createSp.mutateAsync({ name: newName.trim() });
    setNewName(''); setShowForm(false);
  }

  async function handleUpdate(id: string) {
    if (!editingName.trim()) return;
    await updateSp.mutateAsync({ id, data: { name: editingName.trim() } });
    setEditingId(null);
  }

  function startEdit(sp: Specialty) {
    setEditingId(sp.id);
    setEditingName(sp.name);
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Especialidades</h2>
          <p className="text-xs text-slate-500 mt-0.5">Catálogo de especialidades asignables a técnicos</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-1" /> Nueva
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4 flex gap-3 items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-medium text-slate-700">Nombre de la especialidad</label>
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ej: Motor/Caja" required autoFocus />
          </div>
          <Button type="submit" size="sm" disabled={createSp.isPending}>Guardar</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => { setShowForm(false); setNewName(''); }}>Cancelar</Button>
        </form>
      )}

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-4 py-3 font-medium text-slate-700">Especialidad</th>
              <th className="px-4 py-3 w-24" />
            </tr>
          </thead>
          <tbody>
            {specialties.map(sp => (
              <tr key={sp.id} className="border-b border-slate-100 last:border-0">
                {editingId === sp.id ? (
                  <td colSpan={2} className="p-3">
                    <div className="flex gap-2 items-center">
                      <Input
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        className="flex-1"
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') handleUpdate(sp.id); if (e.key === 'Escape') setEditingId(null); }}
                      />
                      <button
                        onClick={() => handleUpdate(sp.id)}
                        disabled={updateSp.isPending}
                        className="p-1.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-600"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-3 text-slate-800">{sp.name}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => startEdit(sp)}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => deleteSp.mutate(sp.id)}
                          disabled={deleteSp.isPending}
                          className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {specialties.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-sm text-slate-400">
                  No hay especialidades registradas
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
