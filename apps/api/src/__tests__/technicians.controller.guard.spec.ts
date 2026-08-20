/**
 * PR2 (control-acceso-talleres-usuario) — WorkshopAccessGuard aplicado a
 * GET /technicians. Ver appointments.controller.guard.spec.ts.
 */
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TechniciansController } from '../modules/technicians/technicians.controller';
import { TechniciansService } from '../modules/technicians/technicians.service';
import { WorkshopsService } from '../modules/workshops/workshops.service';
import { buildGuardTestApp, asUser, restrictedUser, UNRESTRICTED_USER } from './helpers/workshop-guard-http.helper';

describe('TechniciansController — WorkshopAccessGuard (GET /technicians)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await buildGuardTestApp(TechniciansController, [
      { provide: TechniciansService, useValue: { findAll: jest.fn().mockResolvedValue([]) } },
      { provide: WorkshopsService, useValue: { findOne: jest.fn().mockResolvedValue({ name: 'WS' }) } },
    ]);
  });

  afterEach(async () => {
    await app.close();
  });

  it('usuario restringido sin acceso al workshopId pedido recibe 403', async () => {
    await request(app.getHttpServer())
      .get('/technicians')
      .set(asUser(restrictedUser(['ws-1'])))
      .query({ workshopId: 'ws-2' })
      .expect(403);
  });

  it('usuario sin restricción (admin) pasa sin problema', async () => {
    await request(app.getHttpServer())
      .get('/technicians')
      .set(asUser(UNRESTRICTED_USER))
      .query({ workshopId: 'ws-2' })
      .expect(200);
  });
});
