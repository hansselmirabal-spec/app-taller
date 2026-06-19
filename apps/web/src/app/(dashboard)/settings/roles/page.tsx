'use client';
import { useState } from 'react';
import { Plus, Pencil, Trash2, ShieldCheck, Eye, PencilLine, X, Check, Copy } from 'lucide-react';
import { useRequirePermission } from '@/hooks/use-require-permission';
import { useRoles, useCreateRole, useUpdateRole, useDeleteRole } from '@/hooks/use-roles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ALL_MODULES, emptyPermissions, RECEPTIONIST_PERMISSIONS } from '@/lib/permissions';
import { isAdmin } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { Role, Permissions, ModuleId } from '@/types';
import { cn } from '@/lib/utils';

// ─── Permission matrix editor ─────────────────────────────────────────────────

function PermissionMatrix({
  permissions,
  onChange,
}: {
  permissions: Permissions;
  onChange: (p: Permissions) => void;
}) {
  function toggle(module: ModuleId, action: 'view' | 'edit') {
    const current = permissions[module] ?? { view: false, edit: false };
    const next = { ...current, [action]: !current[action] };
    // Si se activa edit, también se activa view automáticamente
    if (action === 'edit' && next.edit) next.view = true;
    // Si se desactiva view, también se desactiva edit
    if (action === 'view' && !next.view) next.edit = false;
    onChange({ ...permissions, [module]: next });
  }

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[1fr_80px_80px] bg-slate-50 border-b border-slate-200 px-4 py-2.5">
        <span className="text-xs font-semibold text-slate-500">Módulo</span>
        <span className="text-xs font-semibold text-slate-500 text-center">Ver</span>
        <span className="text-xs font-semibold text-slate-500 text-center">Editar</span>
      </div>

      {ALL_MODULES.map((mod, i) => {
        const perm = permissions[mod.id] ?? { view: false, edit: false };
        return (
          <div
            key={mod.id}
            className={cn(
              'grid grid-cols-[1fr_80px_80px] px-4 py-3 items-center',
              i < ALL_MODULES.length - 1 && 'border-b border-slate-100',
            )}
          >
            <div>
              <p className="text-sm font-medium text-slate-800">{mod.label}</p>
              <p className="text-xs text-slate-400">{mod.description}</p>
            </div>

            {/* View toggle */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => toggle(mod.id, 'view')}
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center transition-all',
                  perm.view
                    ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                    : 'bg-slate-100 text-slate-300 hover:bg-slate-200',
                )}
              >
                <Eye className="h-4 w-4" />
              </button>
            </div>

            {/* Edit toggle */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => toggle(mod.id, 'edit')}
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center transition-all',
                  perm.edit
                    ? 'bg-orange-100 text-orange-600 hover:bg-orange-200'
                    : 'bg-slate-100 text-slate-300 hover:bg-slate-200',
                )}
              >
                <PencilLine className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Role form modal ──────────────────────────────────────────────────────────

function RoleModal({
  initial,
  onClose,
}: {
  initial?: Role;
  onClose: () => void;
}) {
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const [name, setName] = useState(initial?.name ?? '');
  const [permissions, setPermissions] = useState<Permissions>(
    initial?.permissions ?? emptyPermissions()
  );
  const [error, setError] = useState('');

  const isPending = createRole.isPending || updateRole.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('El nombre del rol es obligatorio.'); return; }
    try {
      if (initial) {
        await updateRole.mutateAsync({ id: initial.id, data: { name, permissions } });
      } else {
        await createRole.mutateAsync({ name, permissions });
      }
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Error al guardar el rol.');
    }
  }

  function applyPreset(preset: Permissions) {
    setPermissions(preset);
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
          <DialogTitle className="text-base">
            {initial ? 'Editar rol' : 'Nuevo rol'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {/* Name */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Nombre del rol</label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ej: Mecánico, Supervisor, Auditor..."
                required
              />
            </div>

            {/* Presets */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-600">Plantillas rápidas</p>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => applyPreset(emptyPermissions())}
                  className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  Sin acceso
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset(RECEPTIONIST_PERMISSIONS)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  <Copy className="h-3 w-3 inline mr-1" />
                  Igual a Recepción
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset(Object.fromEntries(ALL_MODULES.map(m => [m.id, { view: true, edit: false }])) as Permissions)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  Solo lectura
                </button>
              </div>
            </div>

            {/* Matrix */}
            <div className="space-y-2">
              <div className="flex items-center gap-4">
                <p className="text-xs font-medium text-slate-600 flex-1">Permisos por módulo</p>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><Eye className="h-3 w-3 text-blue-400" /> Ver</span>
                  <span className="flex items-center gap-1"><PencilLine className="h-3 w-3 text-orange-400" /> Editar</span>
                </div>
              </div>
              <PermissionMatrix permissions={permissions} onChange={setPermissions} />
            </div>

            {error && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
          </div>

          <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 flex-shrink-0">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? 'Guardando...' : initial ? 'Guardar cambios' : 'Crear rol'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Role card ────────────────────────────────────────────────────────────────

function RoleCard({ role, onEdit }: { role: Role; onEdit: () => void }) {
  const deleteRole = useDeleteRole();
  const visibleModules = ALL_MODULES.filter(m => role.permissions[m.id]?.view);
  const editableModules = ALL_MODULES.filter(m => role.permissions[m.id]?.edit);

  function handleDelete() {
    if (!confirm(`¿Eliminar el rol "${role.name}"? Los usuarios asignados quedarán con los permisos de Recepción.`)) return;
    deleteRole.mutate(role.id);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
          <ShieldCheck className="h-4.5 w-4.5 text-indigo-600" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-900 text-sm">{role.name}</h3>
            {!role.active && (
              <span className="text-xs bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded font-medium">inactivo</span>
            )}
          </div>

          <div className="mt-2 space-y-1.5">
            {visibleModules.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Sin acceso a ningún módulo</p>
            ) : (
              <>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Eye className="h-3 w-3 text-blue-400 flex-shrink-0" />
                  {visibleModules.map(m => (
                    <span key={m.id} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                      {m.label}
                    </span>
                  ))}
                </div>
                {editableModules.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <PencilLine className="h-3 w-3 text-orange-400 flex-shrink-0" />
                    {editableModules.map(m => (
                      <span key={m.id} className="text-xs bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded font-medium">
                        {m.label}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="Editar"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleDelete}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Eliminar"
            disabled={deleteRole.isPending}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RolesSettingsPage() {
  useRequirePermission('settings');
  const router = useRouter();
  const [admin, setAdmin]   = useState(false);
  const [mounted, setMounted] = useState(false);
  const { data: roles = [], isLoading } = useRoles();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing]       = useState<Role | null>(null);

  useEffect(() => {
    setMounted(true);
    const a = isAdmin();
    setAdmin(a);
    if (!a) router.replace('/dashboard');
  }, [router]);

  if (!mounted) return null;
  if (!admin) return null;

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Roles y Permisos</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Definí qué módulos puede ver o editar cada rol.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nuevo rol
        </Button>
      </div>

      {/* Sistema roles info */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Roles del sistema</p>
        <div className="space-y-2">
          {[
            { name: 'Administrador', desc: 'Acceso total a todos los módulos. No se puede restringir.' },
            { name: 'Recepción (default)', desc: 'Dashboard, Capacidad (solo ver), Agenda y Turnos, Seguimiento (solo ver).' },
          ].map(r => (
            <div key={r.name} className="flex items-start gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-xs font-semibold text-slate-700">{r.name}</span>
                <span className="text-xs text-slate-400"> — {r.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Custom roles */}
      <section>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Roles personalizados ({roles.length})
        </p>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map(i => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}
          </div>
        ) : roles.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
            <ShieldCheck className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400 font-medium">No hay roles personalizados</p>
            <p className="text-xs text-slate-400 mt-1">Creá un rol para controlar el acceso por módulo.</p>
            <Button size="sm" variant="outline" className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" /> Crear primer rol
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {roles.map(role => (
              <RoleCard key={role.id} role={role} onEdit={() => setEditing(role)} />
            ))}
          </div>
        )}
      </section>

      {showCreate && <RoleModal onClose={() => setShowCreate(false)} />}
      {editing   && <RoleModal initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
