'use client';
import { useState, useMemo, Fragment } from 'react';
import { Plus, Pencil, Check, X, LayoutGrid, Search, Trash2, UserPlus } from 'lucide-react';
import { useTechnicians, useCreateTechnician, useUpdateTechnician } from '@/hooks/use-technicians';
import { useActiveWorkshop } from '@/hooks/use-active-workshop';
import { useRequirePermission } from '@/hooks/use-require-permission';
import { useModulePermission } from '@/hooks/use-module-permission';
import { useDmsAdvisors } from '@/hooks/use-dms-advisors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Technician } from '@/types';

// Procesos del bodyshop (Chapería / Preparación / Pintura).
const BODYSHOP_SPECIALTIES: { value: string; label: string }[] = [
  { value: 'CHAPERIA',    label: 'Chapería' },
  { value: 'PREPARACION', label: 'Preparación' },
  { value: 'PINTURA',     label: 'Pintura' },
];

// Roles predefinidos para talleres de mecánica.
// ASESOR = persona que recibe/entrega vehículos, su disponibilidad viene del DMS.
const MECHANIC_ROLES: { value: string; label: string }[] = [
  { value: 'ASESOR', label: 'Asesor de Recepción' },
];
const OTHER_ROLE = '__other__';

// Etiqueta visible para una specialty/rol guardada en DB.
function specialtyToText(value: string | null | undefined): string {
  if (!value) return '—';
  const v = value.trim().toUpperCase();
  if (v === 'ASESOR')                                            return 'Asesor de Recepción';
  if (v === 'CARROCERIA' || v === 'CHAPERIA' || v === 'BODYWORK') return 'Chapería';
  if (v === 'PREPARACION' || v === 'PREP')                       return 'Preparación';
  if (v === 'PINTURA' || v === 'PAINT')                          return 'Pintura';
  return value;
}
const NO_BOX  = '__none__';
const NO_SP   = '__nosp__';
const ALL     = '__all__';

export default function TechniciansSettingsPage() {
  useRequirePermission('settings');
  const { canEdit } = useModulePermission('settings');
  const { data: technicians = [] } = useTechnicians();
  const create = useCreateTechnician();
  const update = useUpdateTechnician();
  const { isBodyshop, workshop } = useActiveWorkshop();
  const dmsBranch = workshop?.dmsBranch ?? null;
  // Sin filtro de sucursal — carga TODOS los asesores para la config de técnicos.
  const { data: dmsAdvisors = [] } = useDmsAdvisors();

  const [editing, setEditing] = useState<Technician | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [filterSpecialty, setFilterSpecialty] = useState('');
  const [filterBox, setFilterBox] = useState('');

  // Derived box list from technicians data
  const allBoxes = useMemo(() => {
    const set = new Set<string>();
    technicians.forEach(t => { if (t.box) set.add(t.box); });
    return Array.from(set).sort();
  }, [technicians]);

  // Derived specialty list — values en DB (uppercase). El render usa specialtyLabel().
  const allSpecialties = useMemo(() => {
    const set = new Set<string>(isBodyshop ? BODYSHOP_SPECIALTIES.map(s => s.value) : []);
    technicians.forEach(t => { if (t.specialty) set.add(t.specialty); });
    return Array.from(set).sort();
  }, [technicians, isBodyshop]);

  // New form state
  const [newName, setNewName] = useState('');
  const [newHours, setNewHours] = useState('8');
  const [newSpecialty, setNewSpecialty] = useState('');
  const [newRoleSelect, setNewRoleSelect] = useState('');  // selector de rol predefinido
  const [newBox, setNewBox] = useState('');
  const [newDmsAdvisorCode, setNewDmsAdvisorCode] = useState('');

  // El specialty efectivo: si hay rol predefinido seleccionado, ese; si no, el texto libre.
  const newEffectiveSpecialty = newRoleSelect && newRoleSelect !== OTHER_ROLE
    ? newRoleSelect
    : newSpecialty;

  const filtered = useMemo(() => {
    return technicians.filter(t => {
      if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterSpecialty && t.specialty !== filterSpecialty) return false;
      if (filterBox) {
        if (filterBox === NO_BOX && t.box) return false;
        if (filterBox !== NO_BOX && t.box !== filterBox) return false;
      }
      return true;
    });
  }, [technicians, search, filterSpecialty, filterBox]);

  // Group by specialty when bodyshop
  const grouped = useMemo(() => {
    if (!isBodyshop) return { '': filtered };
    const groups: Record<string, Technician[]> = {};
    filtered.forEach(t => {
      const key = t.specialty ?? 'Sin proceso';
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    return groups;
  }, [filtered, isBodyshop]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    await create.mutateAsync({
      name: newName.trim(),
      dailyHours: parseFloat(newHours) || 8,
      specialty: newEffectiveSpecialty || null,
      box: newBox || null,
      dmsAdvisorCode: newEffectiveSpecialty === 'ASESOR' ? (newDmsAdvisorCode || null) : null,
    });
    setNewName(''); setNewHours('8'); setNewSpecialty(''); setNewRoleSelect(''); setNewBox(''); setNewDmsAdvisorCode('');
    setShowForm(false);
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    await update.mutateAsync({
      id: editing.id,
      data: {
        name: editing.name,
        dailyHours: editing.dailyHours,
        specialty: editing.specialty || null,
        box: editing.box || null,
        active: editing.active,
        dmsAdvisorCode: editing.dmsAdvisorCode || null,
      },
    });
    setEditing(null);
  }

  const specialtyLabel = isBodyshop ? 'Proceso' : 'Especialidad';

  return (
    <div className="h-full overflow-y-auto">
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">
              {isBodyshop ? 'Operarios' : 'Técnicos'}
            </h1>
            {isBodyshop && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                BODYSHOP
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {technicians.length} {isBodyshop ? 'operario' : 'técnico'}{technicians.length !== 1 ? 's' : ''} registrado{technicians.length !== 1 ? 's' : ''}
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 mr-1" /> Agregar
          </Button>
        )}
      </div>

      {/* ── Create Form ── */}
      {showForm && canEdit && (
        <form onSubmit={handleCreate} className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-[1fr_auto_1fr_1fr] gap-3 items-end">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Nombre</label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nombre completo" required autoFocus />
            </div>
            <div className="w-24 space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Hs/día</label>
              <Input type="number" value={newHours} onChange={e => setNewHours(e.target.value)} min="1" max="12" step="0.5" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Rol / {specialtyLabel}</label>
              <Select
                value={newRoleSelect || NO_SP}
                onValueChange={v => { setNewRoleSelect(v === NO_SP ? '' : v); setNewDmsAdvisorCode(''); }}
              >
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SP}>Sin rol</SelectItem>
                  {/* ASESOR siempre disponible, en cualquier tipo de taller */}
                  {MECHANIC_ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  {/* Procesos bodyshop — sólo visibles si aplica */}
                  {isBodyshop && BODYSHOP_SPECIALTIES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  <SelectItem value={OTHER_ROLE}>Otro (texto libre)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Bahía</label>
              <Select value={newBox || NO_BOX} onValueChange={v => setNewBox(v === NO_BOX ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Sin bahía" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_BOX}>Sin bahía</SelectItem>
                  {allBoxes.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Texto libre si elige "Otro" */}
          {newRoleSelect === OTHER_ROLE && (
            <div className="max-w-xs space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Especialidad (texto libre)</label>
              <Input value={newSpecialty} onChange={e => setNewSpecialty(e.target.value)} placeholder="Ej: Motor, Caja, Electricidad" autoFocus />
            </div>
          )}

          {/* Asesor DMS — aparece siempre que rol = ASESOR */}
          {newRoleSelect === 'ASESOR' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-indigo-700">Vincular con asesor del DMS</label>
              {dmsAdvisors.length > 0 ? (
                <Select value={newDmsAdvisorCode || NO_BOX} onValueChange={v => setNewDmsAdvisorCode(v === NO_BOX ? '' : v)}>
                  <SelectTrigger className="max-w-sm border-indigo-200">
                    <SelectValue placeholder="Seleccionar asesor del DMS..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_BOX}>Sin vincular</SelectItem>
                    {dmsAdvisors.map(a => (
                      <SelectItem key={`${a.sucursalIdis}-${a.code}`} value={a.code}>
                        {a.name}
                        <span className="ml-1 text-slate-400 text-xs">· suc {a.sucursalIdis}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-amber-600 py-1">Sin datos en cache DMS. La API sincroniza cada 5 min.</p>
              )}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button type="submit" size="sm" disabled={create.isPending}>Guardar</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { setShowForm(false); setNewRoleSelect(''); setNewDmsAdvisorCode(''); }}>Cancelar</Button>
          </div>
        </form>
      )}

      {/* ── Filters ── */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            className="pl-9 h-8 text-sm"
            placeholder="Buscar por nombre..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {allSpecialties.length > 0 && (
          <Select value={filterSpecialty || ALL} onValueChange={v => setFilterSpecialty(v === ALL ? '' : v)}>
            <SelectTrigger className="h-8 text-sm w-44"><SelectValue placeholder={`Todos los ${specialtyLabel.toLowerCase()}s`} /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {allSpecialties.map(s => <SelectItem key={s} value={s}>{specialtyToText(s)}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {allBoxes.length > 0 && (
          <Select value={filterBox || ALL} onValueChange={v => setFilterBox(v === ALL ? '' : v)}>
            <SelectTrigger className="h-8 text-sm w-40"><SelectValue placeholder="Todas las bahías" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              <SelectItem value={NO_BOX}>Sin bahía</SelectItem>
              {allBoxes.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {(search || filterSpecialty || filterBox) && (
          <button
            onClick={() => { setSearch(''); setFilterSpecialty(''); setFilterBox(''); }}
            className="text-xs text-slate-400 hover:text-slate-700"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-4 py-3 font-medium text-slate-700">Nombre</th>
              <th className="text-left px-4 py-3 font-medium text-slate-700">{specialtyLabel}</th>
              <th className="text-left px-4 py-3 font-medium text-slate-700">Bahía</th>
              <th className="text-center px-4 py-3 font-medium text-slate-700">Hs/día</th>
              <th className="text-left px-4 py-3 font-medium text-slate-700">Asesor DMS</th>
              <th className="text-center px-4 py-3 font-medium text-slate-700">Estado</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {Object.entries(grouped).map(([group, techs]) => (
              <Fragment key={group}>
                {isBodyshop && (
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <td colSpan={7} className="px-4 py-2">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{group}</span>
                      <span className="ml-2 text-xs text-slate-400">{techs.length} operario{techs.length !== 1 ? 's' : ''}</span>
                    </td>
                  </tr>
                )}
                {techs.map(tech => (
                  <tr key={tech.id} className="border-b border-slate-100 last:border-0">
                    {editing?.id === tech.id ? (
                      <td colSpan={7} className="p-3">
                        <form onSubmit={handleUpdate} className="space-y-2">
                          <div className="grid grid-cols-[1fr_1fr_1fr_auto_auto_auto_auto] gap-2 items-center">
                            <Input
                              value={editing.name}
                              onChange={e => setEditing({ ...editing, name: e.target.value })}
                              placeholder="Nombre"
                              autoFocus
                            />
                            <Select
                              value={
                                [...MECHANIC_ROLES, ...BODYSHOP_SPECIALTIES].some(r => r.value === editing.specialty)
                                  ? (editing.specialty ?? NO_SP)
                                  : (editing.specialty ? OTHER_ROLE : NO_SP)
                              }
                              onValueChange={v => {
                                if (v === NO_SP) setEditing({ ...editing, specialty: null, dmsAdvisorCode: null });
                                else if (v === OTHER_ROLE) setEditing({ ...editing, specialty: '', dmsAdvisorCode: null });
                                else setEditing({ ...editing, specialty: v });
                              }}
                            >
                              <SelectTrigger><SelectValue placeholder="Rol..." /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NO_SP}>Sin rol</SelectItem>
                                {MECHANIC_ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                                {isBodyshop && BODYSHOP_SPECIALTIES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                                <SelectItem value={OTHER_ROLE}>Otro (texto libre)</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select
                              value={editing.box ?? NO_BOX}
                              onValueChange={v => setEditing({ ...editing, box: v === NO_BOX ? null : v })}
                            >
                              <SelectTrigger><SelectValue placeholder="Sin bahía" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NO_BOX}>Sin bahía</SelectItem>
                                {allBoxes.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Input
                              type="number"
                              value={editing.dailyHours}
                              onChange={e => setEditing({ ...editing, dailyHours: parseFloat(e.target.value) || 8 })}
                              className="w-20"
                              min="1" max="12" step="0.5"
                            />
                            <Select
                              value={editing.active ? 'true' : 'false'}
                              onValueChange={v => setEditing({ ...editing, active: v === 'true' })}
                            >
                              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="true">Activo</SelectItem>
                                <SelectItem value="false">Inactivo</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button size="sm" type="submit" disabled={update.isPending}>
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="outline" type="button" onClick={() => setEditing(null)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          {/* Texto libre si rol = Otro (sin !isBodyshop guard) */}
                          {editing.specialty !== null &&
                           !MECHANIC_ROLES.some(r => r.value === editing.specialty) &&
                           !BODYSHOP_SPECIALTIES.some(s => s.value === editing.specialty) && (
                            <Input
                              value={editing.specialty ?? ''}
                              onChange={e => setEditing({ ...editing, specialty: e.target.value || null })}
                              placeholder="Especialidad (texto libre)"
                              className="max-w-xs"
                            />
                          )}
                          {/* DMS advisor — sin !isBodyshop guard */}
                          {editing.specialty?.toUpperCase() === 'ASESOR' && (
                            <div className="flex items-center gap-2">
                              <label className="text-xs font-medium text-indigo-700 whitespace-nowrap">Asesor DMS:</label>
                              {dmsAdvisors.length > 0 ? (
                                <Select
                                  value={editing.dmsAdvisorCode ?? NO_BOX}
                                  onValueChange={v => setEditing({ ...editing, dmsAdvisorCode: v === NO_BOX ? null : v })}
                                >
                                  <SelectTrigger className="w-60 border-indigo-200"><SelectValue placeholder="Sin vincular" /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value={NO_BOX}>Sin vincular</SelectItem>
                                    {dmsAdvisors.map(a => <SelectItem key={a.code} value={a.code}>{a.name}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="text-xs text-amber-600">{dmsBranch ? 'Sin cache DMS' : 'Configurá la sucursal DMS del taller'}</span>
                              )}
                            </div>
                          )}
                        </form>
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-medium text-slate-900">{tech.name}</td>
                        <td className="px-4 py-3">
                          {tech.specialty ? (
                            <SpecialtyBadge value={tech.specialty} />
                          ) : (
                            <span className="text-xs text-slate-400">Sin asignar</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {tech.box ? (
                            <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                              {tech.box}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">Sin bahía</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-slate-600">{tech.dailyHours}h</td>
                        <td className="px-4 py-3">
                          {tech.specialty?.toUpperCase() === 'ASESOR' ? (
                            tech.dmsAdvisorCode ? (
                              <span className="text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                                {dmsAdvisors.find(a => a.code === tech.dmsAdvisorCode)?.name ?? tech.dmsAdvisorCode}
                              </span>
                            ) : (
                              <span className="text-xs text-amber-600 font-medium">Sin vincular</span>
                            )
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge className={tech.active ? 'bg-green-100 text-green-700 hover:bg-green-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-100'}>
                            {tech.active ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </td>
                        {canEdit && (
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => setEditing(tech)}
                              className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-900"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        )}
                        {!canEdit && <td />}
                      </>
                    )}
                  </tr>
                ))}
              </Fragment>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">
                  {technicians.length === 0 ? 'No hay técnicos registrados' : 'Sin resultados para los filtros aplicados'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Box Management ── */}
      <BoxesSection boxes={allBoxes} technicians={technicians} onUpdate={update} canEdit={canEdit} />
    </div>
    </div>
  );
}

// ── Badge coloreado por proceso bodyshop ──────────────────────────────────────

function SpecialtyBadge({ value }: { value: string }) {
  // Acepta cualquier alias y muestra el label legible. Color por proceso del bodyshop.
  const v = value.trim().toUpperCase();
  const isBodywork = v === 'CARROCERIA' || v === 'CHAPERIA' || v === 'BODYWORK';
  const isPrep     = v === 'PREPARACION' || v === 'PREP';
  const isPaint    = v === 'PINTURA' || v === 'PAINT';
  const cls = isBodywork ? 'bg-blue-50 text-blue-700'
            : isPrep     ? 'bg-amber-50 text-amber-700'
            : isPaint    ? 'bg-purple-50 text-purple-700'
            :              'bg-slate-100 text-slate-700';
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium ${cls}`}>
      {specialtyToText(value)}
    </span>
  );
}

// ── Gestión de bahías ─────────────────────────────────────────────────────────

function BoxesSection({
  boxes,
  technicians,
  onUpdate,
  canEdit,
}: {
  boxes: string[];
  technicians: Technician[];
  onUpdate: ReturnType<typeof useUpdateTechnician>;
  canEdit: boolean;
}) {
  const [newBoxName, setNewBoxName] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingBox, setEditingBox] = useState<string | null>(null);
  const [editingBoxName, setEditingBoxName] = useState('');
  const [addingTechToBox, setAddingTechToBox] = useState<string | null>(null);
  const [selectedTechId, setSelectedTechId] = useState('');
  const [localBoxes, setLocalBoxes] = useState<string[]>([]);

  const allBoxes = useMemo(() => {
    const combined = new Set([...boxes, ...localBoxes]);
    return Array.from(combined).sort();
  }, [boxes, localBoxes]);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newBoxName.trim();
    if (!name || allBoxes.includes(name)) return;
    setLocalBoxes(prev => [...prev, name]);
    setNewBoxName('');
    setShowForm(false);
  }

  async function handleRename(oldName: string) {
    const newName = editingBoxName.trim();
    if (!newName || newName === oldName) { setEditingBox(null); return; }
    const affected = technicians.filter(t => t.box === oldName);
    await Promise.all(affected.map(t => onUpdate.mutateAsync({ id: t.id, data: { box: newName } })));
    if (localBoxes.includes(oldName)) {
      setLocalBoxes(prev => prev.map(b => b === oldName ? newName : b));
    }
    setEditingBox(null);
  }

  async function handleDelete(boxName: string) {
    const affected = technicians.filter(t => t.box === boxName);
    await Promise.all(affected.map(t => onUpdate.mutateAsync({ id: t.id, data: { box: null } })));
    setLocalBoxes(prev => prev.filter(b => b !== boxName));
  }

  async function handleRemoveTech(techId: string) {
    await onUpdate.mutateAsync({ id: techId, data: { box: null } });
  }

  async function handleAddTech(boxName: string) {
    if (!selectedTechId) return;
    await onUpdate.mutateAsync({ id: selectedTechId, data: { box: boxName } });
    setAddingTechToBox(null);
    setSelectedTechId('');
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-900">Bahías</h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Espacios físicos de trabajo — múltiples técnicos por bahía
          </p>
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 mr-1" /> Nueva bahía
          </Button>
        )}
      </div>

      {showForm && canEdit && (
        <form onSubmit={handleCreate} className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4 flex gap-3 items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-medium text-slate-700">Nombre de la bahía</label>
            <Input
              value={newBoxName}
              onChange={e => setNewBoxName(e.target.value)}
              placeholder="Ej: BOX-01, BAHIA-A"
              required
              autoFocus
            />
          </div>
          <Button type="submit" size="sm">Crear</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => { setShowForm(false); setNewBoxName(''); }}>
            Cancelar
          </Button>
        </form>
      )}

      <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
        {allBoxes.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-slate-400">No hay bahías registradas</p>
        )}

        {allBoxes.map(box => {
          const assigned = technicians.filter(t => t.box === box);
          const available = technicians.filter(t => t.box !== box && t.active);
          const isEditing = editingBox === box;
          const isAddingTech = addingTechToBox === box;

          return (
            <div key={box} className="p-4">
              {/* ── Row header: nombre + acciones ── */}
              <div className="flex items-center justify-between gap-3 mb-2">
                {isEditing ? (
                  <div className="flex gap-2 items-center flex-1">
                    <Input
                      value={editingBoxName}
                      onChange={e => setEditingBoxName(e.target.value)}
                      className="h-8 text-sm max-w-xs"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRename(box);
                        if (e.key === 'Escape') setEditingBox(null);
                      }}
                    />
                    <button
                      onClick={() => handleRename(box)}
                      disabled={onUpdate.isPending}
                      className="p-1.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-600"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setEditingBox(null)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-slate-800 text-sm">{box}</span>
                    <span className="text-xs text-slate-400">{assigned.length} técnico{assigned.length !== 1 ? 's' : ''}</span>
                  </div>
                )}

                {!isEditing && canEdit && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => { setAddingTechToBox(isAddingTech ? null : box); setSelectedTechId(''); }}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Agregar
                    </button>
                    <button
                      onClick={() => { setEditingBox(box); setEditingBoxName(box); }}
                      className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(box)}
                      disabled={onUpdate.isPending}
                      className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600"
                      title="Eliminar bahía y desasignar técnicos"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* ── Técnicos asignados (chips con X) ── */}
              <div className="flex flex-wrap gap-1.5 min-h-[24px]">
                {assigned.length === 0 && !isAddingTech && (
                  <span className="text-xs text-slate-400 italic">Sin técnicos asignados</span>
                )}
                {assigned.map(t => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-700 pl-2 pr-1 py-0.5 rounded-full"
                  >
                    {t.name}
                    {canEdit && (
                      <button
                        onClick={() => handleRemoveTech(t.id)}
                        disabled={onUpdate.isPending}
                        className="text-slate-400 hover:text-red-500 rounded-full"
                        title="Quitar de esta bahía"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>

              {/* ── Inline add tech select ── */}
              {isAddingTech && canEdit && (
                <div className="mt-2 flex gap-2 items-center">
                  <Select
                    value={selectedTechId}
                    onValueChange={setSelectedTechId}
                  >
                    <SelectTrigger className="h-8 text-sm w-56">
                      <SelectValue placeholder="Seleccionar técnico..." />
                    </SelectTrigger>
                    <SelectContent>
                      {available.length === 0 && (
                        <SelectItem value="__none__" disabled>No hay técnicos disponibles</SelectItem>
                      )}
                      {available.map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}{t.box ? ` (${t.box})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    disabled={!selectedTechId || onUpdate.isPending}
                    onClick={() => handleAddTech(box)}
                  >
                    Asignar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setAddingTechToBox(null); setSelectedTechId(''); }}
                  >
                    Cancelar
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
