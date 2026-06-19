import type { ModuleId, ModulePermission, Permissions } from '@/types';

export type { ModuleId, ModulePermission, Permissions };

export interface ModuleDef {
  id: ModuleId;
  label: string;
  description: string;
}

export const ALL_MODULES: ModuleDef[] = [
  { id: 'dashboard',    label: 'Panel de Control',        description: 'Métricas y widgets de resumen' },
  { id: 'capacity',     label: 'Calendario de Capacidad', description: 'Gestión de ausencias y feriados' },
  { id: 'appointments', label: 'Agenda y Turnos',         description: 'Crear, ver y editar turnos' },
  { id: 'kanban',       label: 'Seguimiento (Kanban)',     description: 'Tablero de estado de trabajos' },
  { id: 'reports',      label: 'Reportería',              description: 'Análisis y estadísticas' },
  { id: 'settings',     label: 'Configuraciones',         description: 'Técnicos, servicios, talleres' },
  { id: 'presupuesto',  label: 'Presupuestos',            description: 'Agenda de presupuestos (perito)' },
];

export const FULL_PERMISSIONS: Permissions = Object.fromEntries(
  ALL_MODULES.map(m => [m.id, { view: true, edit: true }])
) as Permissions;

export const RECEPTIONIST_PERMISSIONS: Permissions = {
  dashboard:    { view: true,  edit: false },
  capacity:     { view: true,  edit: false },
  appointments: { view: true,  edit: true  },
  kanban:       { view: true,  edit: false },
  reports:      { view: false, edit: false },
  settings:     { view: false, edit: false },
  presupuesto:  { view: false, edit: false },
};

export function emptyPermissions(): Permissions {
  return Object.fromEntries(
    ALL_MODULES.map(m => [m.id, { view: false, edit: false }])
  ) as Permissions;
}

export function can(permissions: Permissions | undefined, module: ModuleId, action: 'view' | 'edit'): boolean {
  if (!permissions) return false;
  return permissions[module]?.[action] ?? false;
}
