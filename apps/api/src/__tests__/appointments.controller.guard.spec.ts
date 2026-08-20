/**
 * PR2 (control-acceso-talleres-usuario) — WorkshopAccessGuard aplicado a
 * GET /appointments. Usa supertest porque los guards solo corren en el
 * pipeline HTTP real, no al invocar el método del controller directo.
 */
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppointmentsController } from '../modules/appointments/appointments.controller';
import { AppointmentsService } from '../modules/appointments/appointments.service';
import { WorkshopsService } from '../modules/workshops/workshops.service';
import { buildGuardTestApp, asUser, restrictedUser, UNRESTRICTED_USER } from './helpers/workshop-guard-http.helper';

describe('AppointmentsController — WorkshopAccessGuard (GET /appointments)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await buildGuardTestApp(AppointmentsController, [
      { provide: AppointmentsService, useValue: { findByDate: jest.fn().mockResolvedValue([]) } },
      { provide: WorkshopsService, useValue: { findOne: jest.fn().mockResolvedValue({ name: 'WS' }) } },
    ]);
  });

  afterEach(async () => {
    await app.close();
  });

  it('usuario restringido sin acceso al workshopId pedido recibe 403', async () => {
    await request(app.getHttpServer())
      .get('/appointments')
      .set(asUser(restrictedUser(['ws-1'])))
      .query({ date: '2026-08-20', workshopId: 'ws-2' })
      .expect(403);
  });

  it('usuario sin restricción (admin) pasa sin problema', async () => {
    await request(app.getHttpServer())
      .get('/appointments')
      .set(asUser(UNRESTRICTED_USER))
      .query({ date: '2026-08-20', workshopId: 'ws-2' })
      .expect(200);
  });
});
