/**
 * workshop-access-guard-endpoints-faltantes — WorkshopAccessGuard aplicado a
 * GET /bodyshop/tech-availability. Ver appointments.controller.guard.spec.ts
 * para la justificación de por qué esto requiere supertest (guards no corren
 * al invocar el método del controller directo).
 */
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { BodyshopController } from '../modules/bodyshop/bodyshop.controller';
import { BodyshopService } from '../modules/bodyshop/bodyshop.service';
import { buildGuardTestApp, asUser, restrictedUser, UNRESTRICTED_USER } from './helpers/workshop-guard-http.helper';

describe('BodyshopController — WorkshopAccessGuard (GET /bodyshop/tech-availability)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await buildGuardTestApp(BodyshopController, [
      { provide: BodyshopService, useValue: { getTechnicianAvailability: jest.fn().mockResolvedValue([]) } },
    ]);
  });

  afterEach(async () => {
    await app.close();
  });

  it('usuario restringido sin acceso al workshopId pedido recibe 403', async () => {
    await request(app.getHttpServer())
      .get('/bodyshop/tech-availability')
      .set(asUser(restrictedUser(['ws-1'])))
      .query({ workshopId: 'ws-2', date: '2026-08-20' })
      .expect(403);
  });

  it('usuario sin restricción (admin) pasa sin problema', async () => {
    await request(app.getHttpServer())
      .get('/bodyshop/tech-availability')
      .set(asUser(UNRESTRICTED_USER))
      .query({ workshopId: 'ws-2', date: '2026-08-20' })
      .expect(200);
  });
});
