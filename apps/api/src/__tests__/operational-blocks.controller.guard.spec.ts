/**
 * PR2 (control-acceso-talleres-usuario) — WorkshopAccessGuard aplicado a
 * GET /operational-blocks. Ver appointments.controller.guard.spec.ts.
 */
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { OperationalBlocksController } from '../modules/capacity/operational-blocks.controller';
import { OperationalBlocksService } from '../modules/capacity/operational-blocks.service';
import { buildGuardTestApp, asUser, restrictedUser, UNRESTRICTED_USER } from './helpers/workshop-guard-http.helper';

describe('OperationalBlocksController — WorkshopAccessGuard (GET /operational-blocks)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await buildGuardTestApp(OperationalBlocksController, [
      { provide: OperationalBlocksService, useValue: { findByDate: jest.fn().mockResolvedValue([]) } },
    ]);
  });

  afterEach(async () => {
    await app.close();
  });

  it('usuario restringido sin acceso al workshopId pedido recibe 403', async () => {
    await request(app.getHttpServer())
      .get('/operational-blocks')
      .set(asUser(restrictedUser(['ws-1'])))
      .query({ workshopId: 'ws-2', date: '2026-08-20' })
      .expect(403);
  });

  it('usuario sin restricción (admin) pasa sin problema', async () => {
    await request(app.getHttpServer())
      .get('/operational-blocks')
      .set(asUser(UNRESTRICTED_USER))
      .query({ workshopId: 'ws-2', date: '2026-08-20' })
      .expect(200);
  });
});
