/**
 * Helper compartido para los specs de PR2 (rollout de WorkshopAccessGuard a
 * 6 controllers). Levanta una app Nest real (supertest) con el guard
 * genuino montado — a diferencia de los specs que llaman al controller
 * directo, acá el pipeline de guards SÍ corre, que es lo único que puede
 * probar un 403 real.
 */
import { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../../modules/auth/jwt-auth.guard';

export type FakeUser = { id: string; role: string; allowedWorkshopIds: string[] | null };

export const UNRESTRICTED_USER: FakeUser = { id: 'u-admin', role: 'admin', allowedWorkshopIds: null };

export const restrictedUser = (allowedWorkshopIds: string[]): FakeUser => ({
  id: 'u-restricted',
  role: 'receptionist',
  allowedWorkshopIds,
});

class FakeJwtAuthGuard {
  canActivate(context: any): boolean {
    const req = context.switchToHttp().getRequest();
    const header = req.headers['x-test-user'];
    req.user = header ? JSON.parse(header) : UNRESTRICTED_USER;
    return true;
  }
}

export async function buildGuardTestApp(controller: Type<any>, providers: any[]): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ controllers: [controller], providers })
    .overrideGuard(JwtAuthGuard)
    .useClass(FakeJwtAuthGuard)
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

export const asUser = (user: FakeUser) => ({ 'x-test-user': JSON.stringify(user) });
