import type { User, Permissions } from '@/types';
import { FULL_PERMISSIONS, RECEPTIONIST_PERMISSIONS } from './permissions';
import { apiLogout } from './api';

// El token JWT ya NO se guarda en localStorage: vive en una cookie httpOnly
// `auth_token` que setea el backend. JS no puede leerla → mitiga XSS.
// localStorage solo guarda el perfil de usuario y los permisos para que la UI
// pueda renderizar sin pegarle al backend en cada navegación.

export function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function getStoredPermissions(): Permissions | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('permissions');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/**
 * Guarda el perfil del usuario tras un login exitoso.
 * El token JWT NO se guarda acá: lo maneja el browser como cookie httpOnly.
 */
export function storeAuth(user: User) {
  localStorage.setItem('user', JSON.stringify(user));
  const perms = user.role === 'admin' ? FULL_PERMISSIONS : RECEPTIONIST_PERMISSIONS;
  const effectivePerms = user.permissions ?? perms;
  localStorage.setItem('permissions', JSON.stringify(effectivePerms));
}

/**
 * Cierra sesión: pide al backend que invalide la cookie httpOnly y limpia
 * los datos del usuario en localStorage.
 *
 * `apiLogout()` siempre resuelve (no throw) para que el flujo de logout no
 * quede bloqueado si el server está caído.
 */
export async function clearAuth() {
  await apiLogout();
  localStorage.removeItem('user');
  localStorage.removeItem('permissions');
  localStorage.removeItem('activeWorkshopId');
}

export function mustChangePassword(): boolean {
  return getStoredUser()?.mustChangePassword === true;
}

export function isAdmin(): boolean {
  return getStoredUser()?.role === 'admin';
}

export function isAdminOrManager(): boolean {
  const role = getStoredUser()?.role;
  return role === 'admin' || role === 'admin_taller';
}

export function getEffectivePermissions(): Permissions {
  const user = getStoredUser();
  if (!user) return {} as Permissions;
  if (user.role === 'admin' || user.role === 'admin_taller') return FULL_PERMISSIONS;
  return getStoredPermissions() ?? RECEPTIONIST_PERMISSIONS;
}
