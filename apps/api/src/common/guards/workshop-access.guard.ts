import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class WorkshopAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) return false;
    if (user.role === 'admin') return true;
    if (user.allowedWorkshopIds === null || user.allowedWorkshopIds === undefined) return true;

    const allowedIds: string[] = user.allowedWorkshopIds;
    if (!Array.isArray(allowedIds) || allowedIds.length === 0) return true;

    const workshopId: string | undefined =
      request.query?.workshopId ?? request.body?.workshopId;

    if (!workshopId) return true;

    if (!allowedIds.includes(workshopId)) {
      throw new ForbiddenException('No tenés acceso a este taller');
    }

    return true;
  }
}
