'use client';
import { useState } from 'react';
import { useRequirePermission } from '@/hooks/use-require-permission';
import { useModulePermission } from '@/hooks/use-module-permission';
import {
  useBodyshopCatalogGroups, useBodyshopCatalogProcesses, useBodyshopCatalogGrades,
  useCreateBodyshopGroup,  useUpdateBodyshopGroup,  useDeleteBodyshopGroup,
  useCreateBodyshopPiece,  useUpdateBodyshopPiece,  useDeleteBodyshopPiece,
  useCreateBodyshopProcess, useUpdateBodyshopProcess, useDeleteBodyshopProcess,
  useCreateBodyshopGrade,  useUpdateBodyshopGrade,  useDeleteBodyshopGrade,
} from '@/hooks/use-bodyshop-catalog';
import { ChevronDown, ChevronRight, Layers, Workflow, Star, Plus, Pencil, Trash2, X, Check, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BodyshopCatalogGroup, BodyshopCatalogProcess, BodyshopCatalogGrade, BodyshopCatalogPiece } from '@/types';

// ─── Shared inline editor ─────────────────────────────────────────────────────

function InlineInput({ value, onChange, placeholder, className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  return (
    <input
      className={cn('border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500', className)}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus
    />
  );
}

function ActionBtn({ onClick, title, variant, children }: {
  onClick: () => void; title?: string; variant: 'confirm' | 'cancel' | 'edit' | 'delete';
  children: React.ReactNode;
}) {
  const cls = {
    confirm: 'text-green-600 hover:text-green-800',
    cancel:  'text-slate-400 hover:text-slate-600',
    edit:    'text-slate-400 hover:text-blue-600',
    delete:  'text-slate-400 hover:text-red-600',
  }[variant];
  return (
    <button onClick={onClick} title={title} className={cn('p-1 rounded transition-colors', cls)}>
      {children}
    </button>
  );
}

// ─── Info panel ──────────────────────────────────────────────────────────────

function InfoPanel({ items }: { items: { label: string; desc: string }[] }) {
  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 mb-5">
      <div className="flex gap-2 mb-2">
        <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Referencia</span>
      </div>
      <ul className="space-y-1.5 pl-6">
        {items.map(({ label, desc }) => (
          <li key={label} className="text-xs text-slate-700">
            <span className="font-semibold text-slate-800">{label}:</span>{' '}{desc}
          </li>
        ))}
      </ul>
    </div>
  );
}

const INFO_GROUPS = [
  { label: 'Grupo',  desc: 'Categoría estructural del vehículo (ej. Puertas, Frente, Laterales). Agrupa piezas relacionadas para organizar presupuestos y órdenes de trabajo.' },
  { label: 'Pieza',  desc: 'Componente específico de la carrocería (ej. Puerta delantera izquierda). Se selecciona al registrar un ingreso para indicar qué partes son afectadas.' },
  { label: 'Código', desc: 'Identificador numérico corto. Se usa en reportes e integración con sistemas externos. Debe ser único dentro de su categoría.' },
];

const INFO_PROCESSES = [
  { label: 'Proceso',     desc: 'Operación técnica que se aplica sobre una pieza (ej. Reparar, Pintar, Sustituir). Define el tipo de trabajo a realizar.' },
  { label: 'Orden',       desc: 'Número que determina la secuencia de ejecución. Un proceso con orden 10 se realiza antes que uno con orden 40. Permite al sistema ordenar las tareas en la hoja de trabajo.' },
  { label: 'Cálculo',     desc: 'Las horas estimadas de un ingreso se calculan sumando los tiempos de cada proceso aplicado: HorasTotal = Σ (HorasBase × FactorGrado) por proceso.' },
];

const INFO_GRADES = [
  { label: 'Grado',       desc: 'Nivel de severidad del daño en una pieza. Clasifica si la afectación es leve, media, grave, o si requiere sustitución directa.' },
  { label: 'Factor (%)',  desc: 'Porcentaje que multiplica las horas base del proceso. Un factor de 25% sobre una reparación de 4h da 1h efectiva. Si no aplica (ej. Sustitución), se deja vacío y se usan las horas completas.' },
  { label: 'Cálculo',     desc: 'HorasEfectivas = HorasBase × (Factor / 100). Ejemplo: Puerta — Reparar 4h — Grado Leve 25% → 1h. Grado sin factor → 4h completas.' },
];

// ─── Grupos y Piezas ──────────────────────────────────────────────────────────

type PieceEdit = { id: string; code: string; label: string; groupId: string | null } | null;
type GroupEdit = { id: string; code: string; label: string } | null;

function GroupsTab({ canEdit }: { canEdit: boolean }) {
  const { data: groups = [], isLoading } = useBodyshopCatalogGroups();
  const createGroup   = useCreateBodyshopGroup();
  const updateGroup   = useUpdateBodyshopGroup();
  const deleteGroup   = useDeleteBodyshopGroup();
  const createPiece   = useCreateBodyshopPiece();
  const updatePiece   = useUpdateBodyshopPiece();
  const deletePiece   = useDeleteBodyshopPiece();

  const [open, setOpen]           = useState<Set<string>>(new Set());
  const [editGroup, setEditGroup] = useState<GroupEdit>(null);
  const [newGroup, setNewGroup]   = useState<{ code: string; label: string } | null>(null);
  const [editPiece, setEditPiece] = useState<PieceEdit>(null);
  const [newPiece, setNewPiece]   = useState<{ groupId: string; code: string; label: string } | null>(null);

  function toggleGroup(id: string) {
    setOpen(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function handleSaveGroup() {
    if (!editGroup) return;
    await updateGroup.mutateAsync({ id: editGroup.id, code: editGroup.code, label: editGroup.label });
    setEditGroup(null);
  }

  async function handleCreateGroup() {
    if (!newGroup?.code || !newGroup?.label) return;
    await createGroup.mutateAsync(newGroup);
    setNewGroup(null);
  }

  async function handleDeleteGroup(id: string) {
    if (!confirm('¿Eliminar grupo? Se eliminarán todas sus piezas.')) return;
    await deleteGroup.mutateAsync(id);
  }

  async function handleSavePiece() {
    if (!editPiece) return;
    await updatePiece.mutateAsync({ id: editPiece.id, code: editPiece.code, label: editPiece.label, groupId: editPiece.groupId });
    setEditPiece(null);
  }

  async function handleCreatePiece() {
    if (!newPiece?.code || !newPiece?.label) return;
    await createPiece.mutateAsync({ code: newPiece.code, label: newPiece.label, groupId: newPiece.groupId });
    setNewPiece(null);
  }

  async function handleDeletePiece(id: string) {
    if (!confirm('¿Eliminar pieza?')) return;
    await deletePiece.mutateAsync(id);
  }

  if (isLoading) return <div className="py-12 text-center text-sm text-slate-400">Cargando...</div>;

  return (
    <div>
      <InfoPanel items={INFO_GROUPS} />
    <div className="space-y-2">
      {/* Nueva fila de grupo */}
      {canEdit && newGroup ? (
        <div className="border border-blue-300 rounded-lg px-4 py-3 bg-blue-50 flex items-center gap-2">
          <InlineInput value={newGroup.code} onChange={v => setNewGroup(g => g && ({ ...g, code: v }))} placeholder="Cód." className="w-16" />
          <InlineInput value={newGroup.label} onChange={v => setNewGroup(g => g && ({ ...g, label: v }))} placeholder="Nombre del grupo" className="flex-1" />
          <ActionBtn variant="confirm" onClick={handleCreateGroup} title="Guardar"><Check className="h-4 w-4" /></ActionBtn>
          <ActionBtn variant="cancel" onClick={() => setNewGroup(null)} title="Cancelar"><X className="h-4 w-4" /></ActionBtn>
        </div>
      ) : canEdit ? (
        <button
          onClick={() => setNewGroup({ code: '', label: '' })}
          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
        >
          <Plus className="h-4 w-4" /> Nuevo grupo
        </button>
      ) : null}

      {groups.map(group => {
        const isOpen = open.has(group.id);
        const isEditing = editGroup?.id === group.id;

        return (
          <div key={group.id} className="border border-slate-200 rounded-lg overflow-hidden">
            {/* Group header */}
            <div className="flex items-center gap-2 px-3 py-3 bg-white hover:bg-slate-50">
              <button onClick={() => toggleGroup(group.id)} className="flex items-center gap-3 flex-1 text-left">
                {isOpen ? <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />}
                {isEditing ? (
                  <>
                    <InlineInput value={editGroup.code} onChange={v => setEditGroup(g => g && ({ ...g, code: v }))} className="w-16" />
                    <InlineInput value={editGroup.label} onChange={v => setEditGroup(g => g && ({ ...g, label: v }))} className="flex-1" />
                  </>
                ) : (
                  <>
                    <span className="inline-flex items-center justify-center h-6 w-10 rounded bg-blue-100 text-blue-700 text-xs font-mono font-semibold flex-shrink-0">
                      {group.code}
                    </span>
                    <span className="flex-1 text-sm font-medium text-slate-800">{group.label}</span>
                    <span className="text-xs text-slate-400">{group.pieces.length} pieza{group.pieces.length !== 1 ? 's' : ''}</span>
                  </>
                )}
              </button>
              {canEdit && (
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  {isEditing ? (
                    <>
                      <ActionBtn variant="confirm" onClick={handleSaveGroup}><Check className="h-4 w-4" /></ActionBtn>
                      <ActionBtn variant="cancel" onClick={() => setEditGroup(null)}><X className="h-4 w-4" /></ActionBtn>
                    </>
                  ) : (
                    <>
                      <ActionBtn variant="edit" onClick={() => { setEditGroup({ id: group.id, code: group.code, label: group.label }); setOpen(p => new Set([...p, group.id])); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </ActionBtn>
                      <ActionBtn variant="delete" onClick={() => handleDeleteGroup(group.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </ActionBtn>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Pieces list */}
            {isOpen && (
              <div className="border-t border-slate-100 bg-slate-50 divide-y divide-slate-100">
                {group.pieces.map(piece => {
                  const isEditingPiece = editPiece?.id === piece.id;
                  return (
                    <div key={piece.id} className="flex items-center gap-2 px-4 py-2.5 pl-11">
                      {isEditingPiece ? (
                        <>
                          <InlineInput value={editPiece.code} onChange={v => setEditPiece(p => p && ({ ...p, code: v }))} className="w-14" />
                          <InlineInput value={editPiece.label} onChange={v => setEditPiece(p => p && ({ ...p, label: v }))} className="flex-1" />
                          <ActionBtn variant="confirm" onClick={handleSavePiece}><Check className="h-4 w-4" /></ActionBtn>
                          <ActionBtn variant="cancel" onClick={() => setEditPiece(null)}><X className="h-4 w-4" /></ActionBtn>
                        </>
                      ) : (
                        <>
                          <span className="inline-flex items-center justify-center h-5 w-8 rounded bg-slate-200 text-slate-600 text-xs font-mono flex-shrink-0">
                            {piece.code}
                          </span>
                          <span className="flex-1 text-sm text-slate-700">{piece.label}</span>
                          {canEdit && (
                            <div className="flex items-center gap-0.5">
                              <ActionBtn variant="edit" onClick={() => setEditPiece({ id: piece.id, code: piece.code, label: piece.label, groupId: piece.groupId })}>
                                <Pencil className="h-3.5 w-3.5" />
                              </ActionBtn>
                              <ActionBtn variant="delete" onClick={() => handleDeletePiece(piece.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </ActionBtn>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}

                {/* Nueva pieza inline */}
                {canEdit && newPiece?.groupId === group.id ? (
                  <div className="flex items-center gap-2 px-4 py-2.5 pl-11 bg-blue-50">
                    <InlineInput value={newPiece.code} onChange={v => setNewPiece(p => p && ({ ...p, code: v }))} placeholder="Cód." className="w-14" />
                    <InlineInput value={newPiece.label} onChange={v => setNewPiece(p => p && ({ ...p, label: v }))} placeholder="Nombre de la pieza" className="flex-1" />
                    <ActionBtn variant="confirm" onClick={handleCreatePiece}><Check className="h-4 w-4" /></ActionBtn>
                    <ActionBtn variant="cancel" onClick={() => setNewPiece(null)}><X className="h-4 w-4" /></ActionBtn>
                  </div>
                ) : canEdit ? (
                  <button
                    onClick={() => setNewPiece({ groupId: group.id, code: '', label: '' })}
                    className="flex items-center gap-2 w-full pl-11 py-2 text-xs text-blue-500 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> Agregar pieza
                  </button>
                ) : group.pieces.length === 0 ? (
                  <p className="px-11 py-3 text-xs text-slate-400 italic">Sin piezas</p>
                ) : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
    </div>
  );
}

// ─── Procesos ─────────────────────────────────────────────────────────────────

function ProcessesTab({ canEdit }: { canEdit: boolean }) {
  const { data: processes = [], isLoading } = useBodyshopCatalogProcesses();
  const createProcess = useCreateBodyshopProcess();
  const updateProcess = useUpdateBodyshopProcess();
  const deleteProcess = useDeleteBodyshopProcess();

  const [editId, setEditId]     = useState<string | null>(null);
  const [editData, setEditData] = useState<{ code: string; label: string; order: string }>({ code: '', label: '', order: '' });
  const [isNew, setIsNew]       = useState(false);

  function startEdit(p: BodyshopCatalogProcess) {
    setIsNew(false);
    setEditId(p.id);
    setEditData({ code: p.code, label: p.label, order: String(p.order) });
  }

  function startNew() {
    setIsNew(true);
    setEditId('__new__');
    setEditData({ code: '', label: '', order: '' });
  }

  async function handleSave() {
    if (!editData.code || !editData.label) return;
    const order = parseInt(editData.order) || 0;
    if (isNew) {
      await createProcess.mutateAsync({ code: editData.code, label: editData.label, order });
    } else if (editId) {
      await updateProcess.mutateAsync({ id: editId, code: editData.code, label: editData.label, order });
    }
    setEditId(null);
    setIsNew(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar proceso?')) return;
    await deleteProcess.mutateAsync(id);
  }

  if (isLoading) return <div className="py-12 text-center text-sm text-slate-400">Cargando...</div>;

  return (
    <div className="space-y-3">
      <InfoPanel items={INFO_PROCESSES} />
      {canEdit && (
        <div className="flex justify-end">
          <button
            onClick={startNew}
            className="flex items-center gap-2 text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" /> Nuevo proceso
          </button>
        </div>
      )}

      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-20">Código</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Proceso</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-20">Orden</th>
              {canEdit && <th className="w-20" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {/* Nueva fila */}
            {isNew && (
              <tr className="bg-blue-50">
                <td className="px-4 py-2"><InlineInput value={editData.code} onChange={v => setEditData(d => ({ ...d, code: v }))} placeholder="00" className="w-16" /></td>
                <td className="px-4 py-2"><InlineInput value={editData.label} onChange={v => setEditData(d => ({ ...d, label: v }))} placeholder="Nombre del proceso" className="w-full" /></td>
                <td className="px-4 py-2 text-right"><InlineInput value={editData.order} onChange={v => setEditData(d => ({ ...d, order: v }))} placeholder="0" className="w-16 text-right" /></td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-end gap-0.5">
                    <ActionBtn variant="confirm" onClick={handleSave}><Check className="h-4 w-4" /></ActionBtn>
                    <ActionBtn variant="cancel" onClick={() => setEditId(null)}><X className="h-4 w-4" /></ActionBtn>
                  </div>
                </td>
              </tr>
            )}
            {processes.map(proc => {
              const editing = editId === proc.id && !isNew;
              return (
                <tr key={proc.id} className={cn('hover:bg-slate-50 transition-colors', editing && 'bg-blue-50')}>
                  <td className="px-4 py-3">
                    {editing
                      ? <InlineInput value={editData.code} onChange={v => setEditData(d => ({ ...d, code: v }))} className="w-16" />
                      : <span className="inline-flex items-center justify-center h-6 w-10 rounded bg-violet-100 text-violet-700 text-xs font-mono font-semibold">{proc.code}</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    {editing
                      ? <InlineInput value={editData.label} onChange={v => setEditData(d => ({ ...d, label: v }))} className="w-full" />
                      : <span className="text-slate-800 font-medium">{proc.label}</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editing
                      ? <InlineInput value={editData.order} onChange={v => setEditData(d => ({ ...d, order: v }))} className="w-16 text-right" />
                      : <span className="text-slate-500 font-mono text-xs">{proc.order}</span>
                    }
                  </td>
                  {canEdit && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-0.5">
                        {editing ? (
                          <>
                            <ActionBtn variant="confirm" onClick={handleSave}><Check className="h-4 w-4" /></ActionBtn>
                            <ActionBtn variant="cancel" onClick={() => setEditId(null)}><X className="h-4 w-4" /></ActionBtn>
                          </>
                        ) : (
                          <>
                            <ActionBtn variant="edit" onClick={() => startEdit(proc)}><Pencil className="h-3.5 w-3.5" /></ActionBtn>
                            <ActionBtn variant="delete" onClick={() => handleDelete(proc.id)}><Trash2 className="h-3.5 w-3.5" /></ActionBtn>
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Grados ───────────────────────────────────────────────────────────────────

function factorColor(pct: number): string {
  if (pct <= 25) return 'bg-green-100 text-green-700';
  if (pct <= 50) return 'bg-yellow-100 text-yellow-700';
  return 'bg-orange-100 text-orange-700';
}

function GradesTab({ canEdit }: { canEdit: boolean }) {
  const { data: grades = [], isLoading } = useBodyshopCatalogGrades();
  const createGrade = useCreateBodyshopGrade();
  const updateGrade = useUpdateBodyshopGrade();
  const deleteGrade = useDeleteBodyshopGrade();

  const [editId, setEditId]     = useState<string | null>(null);
  const [editData, setEditData] = useState<{ code: string; label: string; factor: string }>({ code: '', label: '', factor: '' });
  const [isNew, setIsNew]       = useState(false);

  function startEdit(g: BodyshopCatalogGrade) {
    setIsNew(false);
    setEditId(g.id);
    // Mostrar en % para edición (0.25 → "25")
    setEditData({ code: g.code, label: g.label, factor: g.factor != null ? String(Math.round(Number(g.factor) * 100)) : '' });
  }

  function startNew() {
    setIsNew(true);
    setEditId('__new__');
    setEditData({ code: '', label: '', factor: '' });
  }

  async function handleSave() {
    if (!editData.code || !editData.label) return;
    // El usuario ingresa porcentaje (ej. 25), guardamos como decimal (0.25)
    const pct = editData.factor !== '' ? parseFloat(editData.factor) : NaN;
    const factor = !isNaN(pct) ? Math.round(pct) / 100 : null;
    if (isNew) {
      await createGrade.mutateAsync({ code: editData.code, label: editData.label, factor });
    } else if (editId) {
      await updateGrade.mutateAsync({ id: editId, code: editData.code, label: editData.label, factor });
    }
    setEditId(null);
    setIsNew(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar grado?')) return;
    await deleteGrade.mutateAsync(id);
  }

  if (isLoading) return <div className="py-12 text-center text-sm text-slate-400">Cargando...</div>;

  return (
    <div className="space-y-3">
      <InfoPanel items={INFO_GRADES} />
      {canEdit && (
        <div className="flex justify-end">
          <button
            onClick={startNew}
            className="flex items-center gap-2 text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" /> Nuevo grado
          </button>
        </div>
      )}

      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-20">Código</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Grado</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Factor (%)</th>
              {canEdit && <th className="w-20" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isNew && (
              <tr className="bg-blue-50">
                <td className="px-4 py-2"><InlineInput value={editData.code} onChange={v => setEditData(d => ({ ...d, code: v }))} placeholder="00" className="w-16" /></td>
                <td className="px-4 py-2"><InlineInput value={editData.label} onChange={v => setEditData(d => ({ ...d, label: v }))} placeholder="Nombre del grado" className="w-full" /></td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <InlineInput value={editData.factor} onChange={v => setEditData(d => ({ ...d, factor: v }))} placeholder="25" className="w-16 text-right" />
                    <span className="text-xs text-slate-500">%</span>
                  </div>
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-end gap-0.5">
                    <ActionBtn variant="confirm" onClick={handleSave}><Check className="h-4 w-4" /></ActionBtn>
                    <ActionBtn variant="cancel" onClick={() => setEditId(null)}><X className="h-4 w-4" /></ActionBtn>
                  </div>
                </td>
              </tr>
            )}
            {grades.length === 0 && !isNew && (
              <tr>
                <td colSpan={canEdit ? 4 : 3} className="px-4 py-10 text-center text-sm text-slate-400">
                  No hay grados registrados
                </td>
              </tr>
            )}
            {grades.map(grade => {
              const editing = editId === grade.id && !isNew;
              const pct = grade.factor != null ? Math.round(Number(grade.factor) * 100) : null;
              return (
                <tr key={grade.id} className={cn('hover:bg-slate-50 transition-colors', editing && 'bg-blue-50')}>
                  <td className="px-4 py-3">
                    {editing
                      ? <InlineInput value={editData.code} onChange={v => setEditData(d => ({ ...d, code: v }))} className="w-16" />
                      : <span className="inline-flex items-center justify-center h-6 w-10 rounded bg-rose-100 text-rose-700 text-xs font-mono font-semibold">{grade.code}</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    {editing
                      ? <InlineInput value={editData.label} onChange={v => setEditData(d => ({ ...d, label: v }))} className="w-full" />
                      : <span className="text-slate-800 font-medium">{grade.label}</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editing ? (
                      <div className="flex items-center justify-end gap-1">
                        <InlineInput value={editData.factor} onChange={v => setEditData(d => ({ ...d, factor: v }))} className="w-16 text-right" />
                        <span className="text-xs text-slate-500">%</span>
                      </div>
                    ) : pct != null
                        ? <span className={cn('inline-flex items-center justify-center h-6 px-2 rounded text-xs font-semibold font-mono', factorColor(pct))}>{pct}%</span>
                        : <span className="text-xs text-slate-400 italic">—</span>
                    }
                  </td>
                  {canEdit && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-0.5">
                        {editing ? (
                          <>
                            <ActionBtn variant="confirm" onClick={handleSave}><Check className="h-4 w-4" /></ActionBtn>
                            <ActionBtn variant="cancel" onClick={() => setEditId(null)}><X className="h-4 w-4" /></ActionBtn>
                          </>
                        ) : (
                          <>
                            <ActionBtn variant="edit" onClick={() => startEdit(grade)}><Pencil className="h-3.5 w-3.5" /></ActionBtn>
                            <ActionBtn variant="delete" onClick={() => handleDelete(grade.id)}><Trash2 className="h-3.5 w-3.5" /></ActionBtn>
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'groups' | 'processes' | 'grades';

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: 'groups',    label: 'Grupos y Piezas', icon: Layers   },
  { id: 'processes', label: 'Procesos',         icon: Workflow },
  { id: 'grades',    label: 'Grados',           icon: Star     },
];

export default function BodyshopCatalogPage() {
  useRequirePermission('settings');
  const { canEdit } = useModulePermission('settings');
  const [tab, setTab] = useState<Tab>('groups');

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Catálogo de Chapería</h1>
          <p className="text-sm text-slate-500 mt-1">Grupos, piezas, procesos y grados de trabajo.</p>
        </div>

        <div className="flex gap-1 p-1 bg-slate-100 rounded-lg mb-6 w-fit">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
                tab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {tab === 'groups'    && <GroupsTab    canEdit={canEdit} />}
        {tab === 'processes' && <ProcessesTab canEdit={canEdit} />}
        {tab === 'grades'    && <GradesTab    canEdit={canEdit} />}
      </div>
    </div>
  );
}
