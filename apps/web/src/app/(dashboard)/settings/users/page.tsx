'use client';
import { useState } from 'react';
import { Plus, Pencil, ShieldCheck, ShieldOff, KeyRound, X, Check, Tag, Building2, Mail, AlertTriangle } from 'lucide-react';
import { useRequirePermission } from '@/hooks/use-require-permission';
import { useUsers, useCreateUser, useUpdateUser } from '@/hooks/use-users';
import { useRoles } from '@/hooks/use-roles';
import { useWorkshops } from '@/hooks/use-workshops';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { isAdmin } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { User, Role, Workshop } from '@/types';

// ─── Role helpers ─────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  admin:        'Administrador',
  receptionist: 'Recepción',
  perito:       'Perito',
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
      role === 'admin'
        ? 'bg-purple-100 text-purple-700'
        : 'bg-blue-100 text-blue-700'
    }`}>
      {role === 'admin' ? <ShieldCheck className="h-3 w-3" /> : <ShieldOff className="h-3 w-3" />}
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

// ─── Workshop selector ────────────────────────────────────────────────────────

function WorkshopSelector({
  workshops,
  selected,
  isAdmin,
  onChange,
}: {
  workshops: Workshop[];
  selected: string[] | null;
  isAdmin: boolean;
  onChange: (ids: string[] | null) => void;
}) {
  const allSelected = !selected || selected.length === 0;

  function toggleAll() {
    onChange(null);
  }

  function toggle(id: string) {
    if (allSelected) {
      // Estaba "todos" → quitar este
      onChange(workshops.map(w => w.id).filter(wid => wid !== id));
      return;
    }
    const next = selected.includes(id)
      ? selected.filter(wid => wid !== id)
      : [...selected, id];
    onChange(next.length === workshops.length ? null : next);
  }

  if (isAdmin) {
    return (
      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
          <Building2 className="h-3 w-3" /> Talleres
        </label>
        <p className="text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
          Administrador tiene acceso a todos los talleres.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
        <Building2 className="h-3 w-3" /> Acceso a talleres
      </label>

      <div className="border border-slate-200 rounded-xl overflow-hidden">
        {/* Opción: todos */}
        <button
          type="button"
          onClick={toggleAll}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors border-b border-slate-100',
            allSelected ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-600',
          )}
        >
          <div className={cn(
            'h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors',
            allSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300',
          )}>
            {allSelected && <Check className="h-2.5 w-2.5 text-white" />}
          </div>
          <span className="font-medium">Todos los talleres</span>
        </button>

        {/* Talleres individuales */}
        {workshops.map((w, i) => {
          const checked = allSelected || (selected ?? []).includes(w.id);
          return (
            <button
              key={w.id}
              type="button"
              onClick={() => toggle(w.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors',
                i < workshops.length - 1 && 'border-b border-slate-100',
                checked && !allSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50',
              )}
            >
              <div className={cn(
                'h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                checked ? 'bg-blue-600 border-blue-600' : 'border-slate-300',
              )}>
                {checked && <Check className="h-2.5 w-2.5 text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-medium text-slate-800">{w.name}</span>
                {w.address && <span className="text-xs text-slate-400 ml-2">{w.address}</span>}
              </div>
              {w.type && (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                  w.type === 'BODYSHOP' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {w.type === 'BODYSHOP' ? 'CARR' : 'MEC'}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!allSelected && selected && selected.length === 0 && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Sin talleres seleccionados — el usuario no podrá acceder al sistema.
        </p>
      )}
    </div>
  );
}

// ─── Role selector helper ─────────────────────────────────────────────────────

function RoleSelector({
  systemRole,
  customRoleId,
  roles,
  onSystemRoleChange,
  onCustomRoleChange,
}: {
  systemRole: 'admin' | 'receptionist' | 'perito';
  customRoleId: string | null;
  roles: Role[];
  onSystemRoleChange: (r: 'admin' | 'receptionist' | 'perito') => void;
  onCustomRoleChange: (id: string | null) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-slate-600">Acceso base</label>
      <Select value={systemRole} onValueChange={v => { onSystemRoleChange(v as any); if (v === 'admin') onCustomRoleChange(null); }}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="receptionist">Recepción</SelectItem>
          <SelectItem value="perito">Perito</SelectItem>
          <SelectItem value="admin">Administrador (acceso total)</SelectItem>
        </SelectContent>
      </Select>

      {(systemRole === 'receptionist' || systemRole === 'perito') && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
            <Tag className="h-3 w-3" /> Rol personalizado
            <span className="font-normal text-slate-400">(opcional)</span>
          </label>
          <Select
            value={customRoleId ?? 'none'}
            onValueChange={v => onCustomRoleChange(v === 'none' ? null : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Usar permisos de Recepción" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Permisos de Recepción (default)</SelectItem>
              {roles.map(r => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {roles.length === 0 && (
            <p className="text-xs text-slate-400">
              No hay roles personalizados. Creá uno en{' '}
              <a href="/settings/roles" className="text-blue-500 underline">Roles y Permisos</a>.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Create form ──────────────────────────────────────────────────────────────

function CreateUserForm({ onClose }: { onClose: () => void }) {
  const create = useCreateUser();
  const { data: roles = [] }     = useRoles();
  const { data: workshops = [] } = useWorkshops();
  const [name, setName]                 = useState('');
  const [email, setEmail]               = useState('');
  const [role, setRole]                 = useState<'admin' | 'receptionist' | 'perito'>('receptionist');
  const [customRoleId, setCustomRoleId] = useState<string | null>(null);
  const [allowedWorkshopIds, setAllowedWorkshopIds] = useState<string[] | null>(null);
  const [error, setError]               = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await create.mutateAsync({ name, email, role, roleId: customRoleId, allowedWorkshopIds });
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Error al crear usuario.');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
        <Mail className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700">
          Se generará una contraseña temporal y se enviará al email del usuario. Al ingresar por primera vez, se le pedirá que la cambie.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Nombre completo</label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Juan Pérez" required />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Email</label>
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="juan@taller.com" required />
        </div>
      </div>

      <RoleSelector
        systemRole={role}
        customRoleId={customRoleId}
        roles={roles}
        onSystemRoleChange={r => { setRole(r); if (r === 'admin') setCustomRoleId(null); }}
        onCustomRoleChange={setCustomRoleId}
      />

      <WorkshopSelector
        workshops={workshops}
        selected={allowedWorkshopIds}
        isAdmin={role === 'admin'}
        onChange={setAllowedWorkshopIds}
      />

      {error && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button type="submit" size="sm" disabled={create.isPending}>
          {create.isPending ? 'Guardando...' : 'Crear usuario'}
        </Button>
      </div>
    </form>
  );
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

function EditUserModal({ user, onClose }: { user: User; onClose: () => void }) {
  const update = useUpdateUser();
  const { data: roles = [] }     = useRoles();
  const { data: workshops = [] } = useWorkshops();
  const [name, setName]                 = useState(user.name);
  const [role, setRole]                 = useState<'admin' | 'receptionist' | 'perito'>(user.role as 'admin' | 'receptionist' | 'perito');
  const [customRoleId, setCustomRoleId] = useState<string | null>(user.roleId ?? null);
  const [allowedWorkshopIds, setAllowedWorkshopIds] = useState<string[] | null>(user.allowedWorkshopIds ?? null);
  const [active, setActive]             = useState(user.active);
  const [newPassword, setNewPwd]        = useState('');
  const [showPwd, setShowPwd]           = useState(false);
  const [error, setError]               = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (showPwd && newPassword.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return; }
    try {
      await update.mutateAsync({
        id: user.id,
        data: {
          name, role, active, roleId: customRoleId, allowedWorkshopIds,
          ...(showPwd && newPassword ? { password: newPassword } : {}),
        },
      });
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Error al actualizar usuario.');
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Editar usuario</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Nombre completo</label>
            <Input value={name} onChange={e => setName(e.target.value)} required />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Email</label>
            <Input value={user.email} disabled className="bg-slate-50 text-slate-400" />
            <p className="text-xs text-slate-400">El email no se puede modificar.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <RoleSelector
              systemRole={role}
              customRoleId={customRoleId}
              roles={roles}
              onSystemRoleChange={r => { setRole(r); if (r === 'admin') setCustomRoleId(null); }}
              onCustomRoleChange={setCustomRoleId}
            />
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Estado</label>
              <Select value={active ? 'active' : 'inactive'} onValueChange={v => setActive(v === 'active')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Activo</SelectItem>
                  <SelectItem value="inactive">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <WorkshopSelector
            workshops={workshops}
            selected={allowedWorkshopIds}
            isAdmin={role === 'admin'}
            onChange={setAllowedWorkshopIds}
          />

          {/* Password change */}
          <div className="border border-slate-200 rounded-lg p-3 space-y-2">
            <button
              type="button"
              onClick={() => { setShowPwd(p => !p); setNewPwd(''); }}
              className="flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-blue-600 transition-colors"
            >
              <KeyRound className="h-3.5 w-3.5" />
              {showPwd ? 'Cancelar cambio de contraseña' : 'Cambiar contraseña'}
            </button>
            {showPwd && (
              <Input
                type="password"
                value={newPassword}
                onChange={e => setNewPwd(e.target.value)}
                placeholder="Nueva contraseña (mínimo 8 caracteres)"
                className="mt-1"
              />
            )}
          </div>

          {error && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={update.isPending}>
              {update.isPending ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UsersSettingsPage() {
  useRequirePermission('settings');
  const router   = useRouter();
  const [admin, setAdmin]           = useState(false);
  const [mounted, setMounted]       = useState(false);
  const { data: users = [], isLoading } = useUsers();
  const { data: workshops = [] }        = useWorkshops();
  const update   = useUpdateUser();

  const [showForm, setShowForm]     = useState(false);
  const [editing, setEditing]       = useState<User | null>(null);

  useEffect(() => {
    setMounted(true);
    const a = isAdmin();
    setAdmin(a);
    if (!a) router.replace('/dashboard');
  }, [router]);

  if (!mounted) return null;
  if (!admin) return null;

  function handleToggleActive(user: User) {
    if (!confirm(`¿${user.active ? 'Desactivar' : 'Activar'} al usuario "${user.name}"?`)) return;
    update.mutate({ id: user.id, data: { active: !user.active } });
  }

  const activeUsers   = users.filter(u => u.active);
  const inactiveUsers = users.filter(u => !u.active);

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <section>
        <div className="flex items-center justify-between mb-1">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Gestión de Usuarios</h1>
            <p className="text-xs text-slate-500 mt-0.5">{users.length} usuario{users.length !== 1 ? 's' : ''} registrado{users.length !== 1 ? 's' : ''}</p>
          </div>
          <Button size="sm" onClick={() => setShowForm(s => !s)}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo usuario
          </Button>
        </div>

        {showForm && (
          <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-700">Crear nuevo usuario</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <CreateUserForm onClose={() => setShowForm(false)} />
          </div>
        )}
      </section>

      {/* Active users */}
      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Activos ({activeUsers.length})
        </h2>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {activeUsers.map(user => (
              <UserRow
                key={user.id}
                user={user}
                workshops={workshops}
                onEdit={() => setEditing(user)}
                onToggleActive={() => handleToggleActive(user)}
              />
            ))}
            {activeUsers.length === 0 && (
              <p className="text-sm text-slate-400 italic py-4 text-center">Sin usuarios activos.</p>
            )}
          </div>
        )}
      </section>

      {/* Inactive users */}
      {inactiveUsers.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Inactivos ({inactiveUsers.length})
          </h2>
          <div className="space-y-2 opacity-60">
            {inactiveUsers.map(user => (
              <UserRow
                key={user.id}
                user={user}
                workshops={workshops}
                onEdit={() => setEditing(user)}
                onToggleActive={() => handleToggleActive(user)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Edit modal */}
      {editing && <EditUserModal user={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function UserRow({
  user,
  workshops,
  onEdit,
  onToggleActive,
}: {
  user: User;
  workshops: Workshop[];
  onEdit: () => void;
  onToggleActive: () => void;
}) {
  return (
    <div className="flex items-center gap-4 bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-slate-300 transition-colors">
      {/* Avatar */}
      <div className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${
        user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
      }`}>
        {user.name.charAt(0).toUpperCase()}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-900 text-sm">{user.name}</span>
          {!user.active && (
            <span className="text-xs bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded font-medium">inactivo</span>
          )}
          {user.mustChangePassword && (
            <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
              <AlertTriangle className="h-3 w-3" /> Pendiente cambio de contraseña
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 truncate">{user.email}</p>
        {/* Workshop badges */}
        {user.role !== 'admin' && user.allowedWorkshopIds && user.allowedWorkshopIds.length > 0 && (
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {user.allowedWorkshopIds.map(wid => {
              const w = workshops.find(x => x.id === wid);
              return w ? (
                <span key={wid} className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                  <Building2 className="h-2.5 w-2.5" />{w.name}
                </span>
              ) : null;
            })}
          </div>
        )}
      </div>

      {/* Role badges */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <RoleBadge role={user.role} />
        {user.customRole && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
            <Tag className="h-2.5 w-2.5" />
            {user.customRole.name}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={onEdit}
          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          title="Editar"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onToggleActive}
          className={`p-1.5 rounded-lg transition-colors ${
            user.active
              ? 'text-slate-400 hover:text-red-500 hover:bg-red-50'
              : 'text-slate-400 hover:text-green-600 hover:bg-green-50'
          }`}
          title={user.active ? 'Desactivar' : 'Activar'}
        >
          {user.active ? <ShieldOff className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
