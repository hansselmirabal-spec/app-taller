/**
 * PR2 (control-acceso-talleres-usuario) — WorkshopAccessGuard aplicado a
 * GET /budget-appointments. Ver appointments.controller.guard.spec.ts para
 * la justificación de por qué esto requiere supertest (guards no corren al
 * invocar el método del controller directo).
 */
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { BudgetAppointmentsController } from '../modules/budget-appointments/budget-appointments.controller';
import { BudgetAppointmentsService } from '../modules/budget-appointments/budget-appointments.service';
import { buildGuardTestApp, asUser, restrictedUser, UNRESTRICTED_USER } from './helpers/workshop-guard-http.helper';

describe('BudgetAppointmentsController — WorkshopAccessGuard (GET /budget-appointments)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await buildGuardTestApp(BudgetAppointmentsController, [
      { provide: BudgetAppointmentsService, useValue: { findByDate: jest.fn().mockResolvedValue([]) } },
    ]);
  });

  afterEach(async () => {
    await app.close();
  });

  it('usuario restringido sin acceso al workshopId pedido recibe 403', async () => {
    await request(app.getHttpServer())
      .get('/budget-appointments')
      .set(asUser(restrictedUser(['ws-1'])))
      .query({ workshopId: 'ws-2', date: '2026-08-20' })
      .expect(403);
  });

  it('usuario sin restricción (admin) pasa sin problema', async () => {
    await request(app.getHttpServer())
      .get('/budget-appointments')
      .set(asUser(UNRESTRICTED_USER))
      .query({ workshopId: 'ws-2', date: '2026-08-20' })
      .expect(200);
  });
});
