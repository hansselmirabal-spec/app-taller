/**
 * PR2 (control-acceso-talleres-usuario) — WorkshopAccessGuard aplicado a
 * GET /bodyshop/catalog/matrix. Ver appointments.controller.guard.spec.ts.
 */
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { BodyshopCatalogController } from '../modules/bodyshop/bodyshop-catalog.controller';
import { BodyshopCatalogService } from '../modules/bodyshop/bodyshop-catalog.service';
import { buildGuardTestApp, asUser, restrictedUser, UNRESTRICTED_USER } from './helpers/workshop-guard-http.helper';

describe('BodyshopCatalogController — WorkshopAccessGuard (GET /bodyshop/catalog/matrix)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await buildGuardTestApp(BodyshopCatalogController, [
      { provide: BodyshopCatalogService, useValue: { getMatrix: jest.fn().mockResolvedValue({}) } },
    ]);
  });

  afterEach(async () => {
    await app.close();
  });

  it('usuario restringido sin acceso al workshopId pedido recibe 403', async () => {
    await request(app.getHttpServer())
      .get('/bodyshop/catalog/matrix')
      .set(asUser(restrictedUser(['ws-1'])))
      .query({ pieceId: 'p1', processId: 'pr1', gradeId: 'g1', workshopId: 'ws-2' })
      .expect(403);
  });

  it('usuario sin restricción (admin) pasa sin problema', async () => {
    await request(app.getHttpServer())
      .get('/bodyshop/catalog/matrix')
      .set(asUser(UNRESTRICTED_USER))
      .query({ pieceId: 'p1', processId: 'pr1', gradeId: 'g1', workshopId: 'ws-2' })
      .expect(200);
  });
});
