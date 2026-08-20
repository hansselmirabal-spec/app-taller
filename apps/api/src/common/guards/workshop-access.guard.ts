import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { isUnrestrictedWorkshopAccess } from './workshop-access.util';

@Injectable()
export class WorkshopAccessGuard implements CanActivate {
  private readonly logger = new Logger(WorkshopAccessGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) return false;
    if (isUnrestrictedWorkshopAccess(user)) return true;

    const allowedIds: string[] = user.allowedWorkshopIds;

    // `params` cubre rutas como `seed-workshop/:workshopId` que no lo mandan
    // por query/body — sin este fallback el guard era un no-op ahí.
    const workshopId: string | undefined =
      request.query?.workshopId ?? request.body?.workshopId ?? request.params?.workshopId;

    if (!workshopId) return true;

    if (!allowedIds.includes(workshopId)) {
      // Nunca loguear la lista completa ni el email — solo cantidad, por privacidad.
      this.logger.warn(
        `Acceso denegado: userId=${user.id} role=${user.role} workshopId=${workshopId} allowedCount=${allowedIds.length}`,
      );
      throw new ForbiddenException('No tenés acceso a este taller');
    }

    return true;
  }
}
