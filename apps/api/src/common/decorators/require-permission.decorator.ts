import { SetMetadata } from '@nestjs/common';

export type ModuleKey = 'dashboard' | 'capacity' | 'appointments' | 'kanban' | 'reports' | 'settings' | 'presupuesto';
export type PermissionAction = 'view' | 'edit';

export const PERMISSION_KEY = 'requiredPermission';

export const RequirePermission = (module: ModuleKey, action: PermissionAction) =>
  SetMetadata(PERMISSION_KEY, { module, action });
