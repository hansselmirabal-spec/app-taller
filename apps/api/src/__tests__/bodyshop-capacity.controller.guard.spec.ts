/**
 * PR2 (control-acceso-talleres-usuario) — WorkshopAccessGuard aplicado a
 * GET /capacity/bodyshop. Ver appointments.controller.guard.spec.ts.
 */
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { BodyshopCapacityController } from '../modules/bodyshop/bodyshop-capacity.controller';
import { BodyshopService } from '../modules/bodyshop/bodyshop.service';
import { buildGuardTestApp, asUser, restrictedUser, UNRESTRICTED_USER } from './helpers/workshop-guard-http.helper';

describe('BodyshopCapacityController — WorkshopAccessGuard (GET /capacity/bodyshop)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await buildGuardTestApp(BodyshopCapacityController, [
      { provide: BodyshopService, useValue: { getDayCapacity: jest.fn().mockResolvedValue({}) } },
    ]);
  });

  afterEach(async () => {
    await app.close();
  });

  it('usuario restringido sin acceso al workshopId pedido recibe 403', async () => {
    await request(app.getHttpServer())
      .get('/capacity/bodyshop')
      .set(asUser(restrictedUser(['ws-1'])))
      .query({ workshopId: 'ws-2', date: '2026-08-20' })
      .expect(403);
  });

  it('usuario sin restricción (admin) pasa sin problema', async () => {
    await request(app.getHttpServer())
      .get('/capacity/bodyshop')
      .set(asUser(UNRESTRICTED_USER))
      .query({ workshopId: 'ws-2', date: '2026-08-20' })
      .expect(200);
  });
});
