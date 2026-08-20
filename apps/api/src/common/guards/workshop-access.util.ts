import type { UserAccessContext } from '../../modules/users/users.service';

// Único lugar que define "sin restricción de taller" — admin/admin_taller,
// o allowedWorkshopIds null/undefined/vacío. WorkshopAccessGuard (chequeo de
// un workshopId puntual) y WorkshopsService (filtrado de la colección) deben
// usar exactamente este criterio; duplicarlo en cada lugar es lo que
// permitió que ambos divergieran silenciosamente antes de esta extracción.
export function isUnrestrictedWorkshopAccess(user: Pick<UserAccessContext, 'role' | 'allowedWorkshopIds'>): boolean {
  if (user.role === 'admin' || user.role === 'admin_taller') return true;
  const ids = user.allowedWorkshopIds;
  return !Array.isArray(ids) || ids.length === 0;
}
