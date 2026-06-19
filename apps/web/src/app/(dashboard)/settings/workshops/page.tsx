'use client';
import { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, Building2, Database, CalendarSearch } from 'lucide-react';
import { useRequirePermission } from '@/hooks/use-require-permission';
import { useModulePermission } from '@/hooks/use-module-permission';
import { useWorkshops, useCreateWorkshop, useUpdateWorkshop, useDeleteWorkshop } from '@/hooks/use-workshops';
import { useDmsBranches } from '@/hooks/use-dms-branches';
import { useWorkshop } from '@/context/workshop-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Workshop, WorkshopType } from '@/types';

const NO_DMS_BRANCH = '__none__';

const TYPE_OPTIONS: { value: WorkshopType; label: string; badge: string }[] = [
  { value: 'MECHANIC', label: 'Mecánico',   badge: 'bg-blue-100 text-blue-700' },
  { value: 'BODYSHOP', label: 'Carrocería', badge: 'bg-orange-100 text-orange-700' },
];

function TypeBadge({ type }: { type?: WorkshopType }) {
  const opt = TYPE_OPTIONS.find(o => o.value === type);
  if (!opt) return null;
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${opt.badge}`}>{opt.value === 'BODYSHOP' ? 'CARR' : 'MEC'}</span>;
}

export default function WorkshopsPage() {
  useRequirePermission('settings');
  const { canEdit } = useModulePermission('settings');
  const { data: workshops = [] } = useWorkshops();
  const { data: dmsBranches = [], isLoading: loadingBranches } = useDmsBranches();
  const create = useCreateWorkshop();
  const update = useUpdateWorkshop();
  const remove = useDeleteWorkshop();
  const { workshopId, setWorkshopId } = useWorkshop();

  const [showForm, setShowForm]     = useState(false);
  const [newName, setNewName]       = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newType, setNewType]       = useState<WorkshopType>('MECHANIC');
  const [newDmsBranch, setNewDmsBranch] = useState<string>(NO_DMS_BRANCH);
  const [newAtraso,  setNewAtraso]  = useState<string>('30');
  const [newCritico, setNewCritico] = useState<string>('60');
  const [editing, setEditing]       = useState<Workshop | null>(null);
  // States locales para los inputs de umbrales en modo edición. Permiten que el usuario
  // borre el contenido sin que el valor se "rebote" al default — la conversión a número
  // y el fallback al default (30/60) se hace solo al hacer submit.
  const [editAtraso,  setEditAtraso]  = useState<string>('');
  const [editCritico, setEditCritico] = useState<string>('');
  const [formError, setFormError]   = useState('');

  // Availability search config
  const [editAvailDays,    setEditAvailDays]    = useState('3');
  const [editMaxSearch,    setEditMaxSearch]    = useState('30');
  const [editIncludeSat,   setEditIncludeSat]   = useState(false);
  const [editUrgencyBuf,   setEditUrgencyBuf]   = useState('0');
  const [editSlotInterval, setEditSlotInterval] = useState('30');
  const [editDayStart,     setEditDayStart]     = useState('8');
  const [editDayEnd,       setEditDayEnd]       = useState('18');

  function startEdit(w: Workshop) {
    setEditing(w);
    setEditAtraso(String(w.alertAtrasoDays   ?? 30));
    setEditCritico(String(w.alertCriticoDays ?? 60));
    setFormError('');
    const avail = (w.config as any)?.availabilitySearch ?? {};
    setEditAvailDays(String(avail.alternativeDaysCount ?? 3));
    setEditMaxSearch(String(avail.maxSearchDays        ?? 30));
    setEditIncludeSat(avail.includeSaturdays           ?? false);
    setEditUrgencyBuf(String(avail.urgencyBufferHours  ?? 0));
    setEditSlotInterval(String(avail.slotIntervalMinutes ?? 30));
    setEditDayStart(String(avail.dayStartHour          ?? 8));
    setEditDayEnd(String(avail.dayEndHour              ?? 18));
  }

  function cancelEdit() {
    setEditing(null);
    setEditAtraso('');
    setEditCritico('');
    setFormError('');
    setEditAvailDays('3'); setEditMaxSearch('30'); setEditIncludeSat(false);
    setEditUrgencyBuf('0'); setEditSlotInterval('30'); setEditDayStart('8'); setEditDayEnd('18');
  }

  function validateThresholds(atraso: number, critico: number): string | null {
    if (!Number.isFinite(atraso) || atraso < 1 || atraso > 365)
      return 'El umbral de atraso debe estar entre 1 y 365 días.';
    if (!Number.isFinite(critico) || critico < 1 || critico > 365)
      return 'El umbral crítico debe estar entre 1 y 365 días.';
    if (critico <= atraso)
      return `El umbral crítico (${critico}d) debe ser MAYOR que el de atraso (${atraso}d).`;
    return null;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!newName.trim()) return;
    const atraso  = parseInt(newAtraso);
    const critico = parseInt(newCritico);
    const err = validateThresholds(atraso, critico);
    if (err) { setFormError(err); return; }
    await create.mutateAsync({
      name: newName.trim(),
      address: newAddress.trim() || undefined,
      type: newType,
      dmsBranch: newDmsBranch === NO_DMS_BRANCH ? null : newDmsBranch,
      alertAtrasoDays:  atraso,
      alertCriticoDays: critico,
    });
    setNewName(''); setNewAddress(''); setNewType('MECHANIC'); setNewDmsBranch(NO_DMS_BRANCH);
    setNewAtraso('30'); setNewCritico('60');
    setShowForm(false);
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!editing) return;
    // Si el usuario dejó el campo vacío, fallback al default (30/60).
    const atraso  = parseInt(editAtraso)  || 30;
    const critico = parseInt(editCritico) || 60;
    const err = validateThresholds(atraso, critico);
    if (err) { setFormError(err); return; }
    await update.mutateAsync({
      id: editing.id,
      data: {
        name: editing.name,
        address: editing.address,
        type: editing.type,
        dmsBranch: editing.dmsBranch ?? null,
        alertAtrasoDays:  atraso,
        alertCriticoDays: critico,
        config: {
          ...((editing.config as any) ?? {}),
          availabilitySearch: {
            alternativeDaysCount: Math.max(1, Math.min(5,  parseInt(editAvailDays)    || 3)),
            maxSearchDays:        Math.max(7, Math.min(60, parseInt(editMaxSearch)    || 30)),
            includeSaturdays:     editIncludeSat,
            urgencyBufferHours:   Math.max(0, Math.min(8,  parseFloat(editUrgencyBuf) || 0)),
            slotIntervalMinutes:  parseInt(editSlotInterval) || 30,
            dayStartHour:         Math.max(5, Math.min(12, parseInt(editDayStart)     || 8)),
            dayEndHour:           Math.max(14, Math.min(22, parseInt(editDayEnd)      || 18)),
          },
        },
      },
    });
    cancelEdit();
  }

  async function handleDelete(w: Workshop) {
    if (w.id === workshopId) {
      const other = workshops.find(x => x.id !== w.id);
      if (other) setWorkshopId(other.id);
    }
    await remove.mutateAsync(w.id);
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Talleres</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {workshops.length} taller{workshops.length !== 1 ? 'es' : ''} registrado{workshops.length !== 1 ? 's' : ''}
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => { setShowForm(!showForm); setEditing(null); }}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo taller
          </Button>
        )}
      </div>

      {showForm && canEdit && (
        <form onSubmit={handleCreate} className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4 space-y-3">
          <p className="text-sm font-medium text-slate-700">Nuevo taller</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Nombre *</label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ej: Taller Sur" required autoFocus />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Dirección</label>
              <Input value={newAddress} onChange={e => setNewAddress(e.target.value)} placeholder="Ej: Av. San Juan 1234" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Tipo</label>
              <Select value={newType} onValueChange={v => setNewType(v as WorkshopType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
              <Database className="h-3 w-3 text-slate-400" />
              Sucursal del DMS Condor
              <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <Select value={newDmsBranch} onValueChange={setNewDmsBranch} disabled={loadingBranches}>
              <SelectTrigger>
                <SelectValue placeholder={loadingBranches ? 'Cargando sucursales...' : 'Sin filtro · ver todas las OTs'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_DMS_BRANCH}>Sin filtro · ver todas las OTs</SelectItem>
                {dmsBranches.map(b => (
                  <SelectItem key={b.name} value={b.name}>
                    {b.name} <span className="text-slate-400 text-[11px]">({b.total.toLocaleString()})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-slate-500">
              Si elegís una sucursal, este taller solo verá las OTs de esa sucursal en Seguimiento.
            </p>
          </div>

          {/* Umbrales de alerta de antigüedad */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700">
              Umbrales de alerta — Antigüedad de OTs abiertas
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] text-amber-700 font-semibold flex items-center gap-1">
                  🟠 En atraso (días)
                </label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={newAtraso}
                  onChange={e => setNewAtraso(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  placeholder="30"
                  className="font-semibold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-red-700 font-semibold flex items-center gap-1">
                  🔴 Crítico (días)
                </label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={newCritico}
                  onChange={e => setNewCritico(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  placeholder="60"
                  className="font-semibold"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              OTs con días en taller superiores a estos umbrales se marcan como "en atraso" o "críticas" en
              Seguimiento. Crítico debe ser mayor que atraso.
            </p>
          </div>

          {formError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              ⚠️ {formError}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button type="submit" size="sm" disabled={create.isPending}>Guardar</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { setShowForm(false); setNewName(''); setNewAddress(''); setNewDmsBranch(NO_DMS_BRANCH); setNewAtraso('30'); setNewCritico('60'); setFormError(''); }}>Cancelar</Button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-4 py-3 font-medium text-slate-700">Taller</th>
              <th className="text-left px-4 py-3 font-medium text-slate-700">Dirección</th>
              <th className="text-center px-4 py-3 font-medium text-slate-700">Tipo</th>
              <th className="text-left px-4 py-3 font-medium text-slate-700">Sucursal DMS</th>
              <th className="text-center px-4 py-3 font-medium text-slate-700">Estado</th>
              <th className="px-4 py-3 w-24" />
            </tr>
          </thead>
          <tbody>
            {workshops.map(w => (
              <tr key={w.id} className="border-b border-slate-100 last:border-0">
                {editing?.id === w.id ? (
                  <td colSpan={6} className="p-3">
                    <form onSubmit={handleUpdate} className="space-y-2">
                      <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-3 items-center">
                        <Input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Nombre" autoFocus required />
                        <Input value={editing.address ?? ''} onChange={e => setEditing({ ...editing, address: e.target.value })} placeholder="Dirección" />
                        <Select value={editing.type ?? 'MECHANIC'} onValueChange={v => setEditing({ ...editing, type: v as WorkshopType })}>
                          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button size="sm" type="submit" disabled={update.isPending}><Check className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="outline" type="button" onClick={cancelEdit}><X className="h-3.5 w-3.5" /></Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Database className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                        <Select
                          value={editing.dmsBranch ?? NO_DMS_BRANCH}
                          onValueChange={v => setEditing({ ...editing, dmsBranch: v === NO_DMS_BRANCH ? null : v })}
                          disabled={loadingBranches}
                        >
                          <SelectTrigger className="text-xs">
                            <SelectValue placeholder="Sucursal DMS (sin filtro)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_DMS_BRANCH}>Sin filtro · ver todas las OTs</SelectItem>
                            {dmsBranches.map(b => (
                              <SelectItem key={b.name} value={b.name}>
                                {b.name} <span className="text-slate-400 text-[11px]">({b.total.toLocaleString()})</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {/* Umbrales de alerta */}
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-slate-500 whitespace-nowrap">Umbrales:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-amber-700 font-semibold">🟠 Atraso</span>
                          <Input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={editAtraso}
                            onChange={e => setEditAtraso(e.target.value.replace(/\D/g, '').slice(0, 3))}
                            className="w-14 h-7 text-xs font-semibold text-center"
                            placeholder="30"
                          />
                          <span className="text-[10px] text-slate-400">d</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-red-700 font-semibold">🔴 Crítico</span>
                          <Input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={editCritico}
                            onChange={e => setEditCritico(e.target.value.replace(/\D/g, '').slice(0, 3))}
                            className="w-14 h-7 text-xs font-semibold text-center"
                            placeholder="60"
                          />
                          <span className="text-[10px] text-slate-400">d</span>
                        </div>
                      </div>
                      {/* Disponibilidad alternativa */}
                      <div className="space-y-2 pt-1 border-t border-slate-100">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                          <CalendarSearch className="h-3 w-3" />
                          Disponibilidad alternativa
                        </p>
                        <div className="grid grid-cols-4 gap-3">
                          <div className="space-y-1">
                            <label className="text-[11px] text-slate-500">Días a mostrar</label>
                            <Input
                              type="number" min={1} max={5}
                              value={editAvailDays}
                              onChange={e => setEditAvailDays(e.target.value)}
                              className="h-7 text-xs"
                            />
                            <p className="text-[10px] text-slate-400">Alternativas (1–5)</p>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] text-slate-500">Buscar hasta</label>
                            <div className="flex items-center gap-1">
                              <Input
                                type="number" min={7} max={60}
                                value={editMaxSearch}
                                onChange={e => setEditMaxSearch(e.target.value)}
                                className="h-7 text-xs"
                              />
                              <span className="text-[10px] text-slate-400 flex-shrink-0">d</span>
                            </div>
                            <p className="text-[10px] text-slate-400">Días máx. de búsqueda</p>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] text-slate-500">Buffer urgencias</label>
                            <div className="flex items-center gap-1">
                              <Input
                                type="number" min={0} max={8} step={0.5}
                                value={editUrgencyBuf}
                                onChange={e => setEditUrgencyBuf(e.target.value)}
                                className="h-7 text-xs"
                              />
                              <span className="text-[10px] text-slate-400 flex-shrink-0">h</span>
                            </div>
                            <p className="text-[10px] text-slate-400">Horas reservadas</p>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] text-slate-500">Intervalo slots</label>
                            <Select value={editSlotInterval} onValueChange={setEditSlotInterval}>
                              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="15">15 min</SelectItem>
                                <SelectItem value="30">30 min</SelectItem>
                                <SelectItem value="60">60 min</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-[10px] text-slate-400">Granularidad de horarios</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3 items-end">
                          <div className="space-y-1">
                            <label className="text-[11px] text-slate-500">Inicio jornada</label>
                            <div className="flex items-center gap-1">
                              <Input
                                type="number" min={5} max={12}
                                value={editDayStart}
                                onChange={e => setEditDayStart(e.target.value)}
                                className="h-7 text-xs"
                              />
                              <span className="text-[10px] text-slate-400 flex-shrink-0">hs</span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] text-slate-500">Fin jornada</label>
                            <div className="flex items-center gap-1">
                              <Input
                                type="number" min={14} max={22}
                                value={editDayEnd}
                                onChange={e => setEditDayEnd(e.target.value)}
                                className="h-7 text-xs"
                              />
                              <span className="text-[10px] text-slate-400 flex-shrink-0">hs</span>
                            </div>
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer pb-1.5 select-none">
                            <input
                              type="checkbox"
                              checked={editIncludeSat}
                              onChange={e => setEditIncludeSat(e.target.checked)}
                              className="h-3.5 w-3.5 rounded border-slate-300 accent-blue-600"
                            />
                            <span className="text-[11px] text-slate-600 font-medium">Incluir sábados</span>
                          </label>
                        </div>
                      </div>

                      {formError && (
                        <div className="bg-red-50 border border-red-200 rounded-lg px-2 py-1 text-[11px] text-red-700">
                          ⚠️ {formError}
                        </div>
                      )}
                    </form>
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className={`h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 ${w.id === workshopId ? (w.type === 'BODYSHOP' ? 'bg-orange-500' : 'bg-blue-600') : 'bg-slate-100'}`}>
                          <Building2 className={`h-3.5 w-3.5 ${w.id === workshopId ? 'text-white' : 'text-slate-400'}`} />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{w.name}</p>
                          {w.id === workshopId && <span className="text-[10px] text-blue-600 font-medium">Taller activo</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{w.address ?? <span className="text-slate-300">Sin dirección</span>}</td>
                    <td className="px-4 py-3 text-center">
                      <TypeBadge type={w.type} />
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {w.dmsBranch
                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200" title={`Solo ve OTs de "${w.dmsBranch}"`}>
                            <Database className="h-3 w-3" />
                            {w.dmsBranch}
                          </span>
                        : <span className="text-slate-300">Sin filtro</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${w.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        {w.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {canEdit && (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => { startEdit(w); setShowForm(false); }} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700" title="Editar">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleDelete(w)} disabled={remove.isPending || workshops.length <= 1} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed" title={workshops.length <= 1 ? 'No se puede eliminar el único taller' : 'Eliminar'}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
            {workshops.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">No hay talleres registrados</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 mt-3">El tipo de taller determina qué módulos se muestran (agenda por slots vs. por ingreso de vehículo).</p>
    </div>
  );
}
