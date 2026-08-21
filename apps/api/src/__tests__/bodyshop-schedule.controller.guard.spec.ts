/**
 * workshop-access-guard-endpoints-faltantes — WorkshopAccessGuard aplicado a
 * POST /bodyshop/simulate-schedule. Ver appointments.controller.guard.spec.ts
 * para la justificación de por qué esto requiere supertest (guards no corren
 * al invocar el método del controller directo).
 */
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { BodyshopScheduleController } from '../modules/bodyshop/bodyshop-schedule.controller';
import { BodyshopScheduleService } from '../modules/bodyshop/bodyshop-schedule.service';
import { buildGuardTestApp, asUser, restrictedUser, UNRESTRICTED_USER } from './helpers/workshop-guard-http.helper';

describe('BodyshopScheduleController — WorkshopAccessGuard (POST /bodyshop/simulate-schedule)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await buildGuardTestApp(BodyshopScheduleController, [
      { provide: BodyshopScheduleService, useValue: { simulate: jest.fn().mockResolvedValue([]) } },
    ]);
  });

  afterEach(async () => {
    await app.close();
  });

  it('usuario restringido sin acceso al workshopId pedido en el body recibe 403', async () => {
    await request(app.getHttpServer())
      .post('/bodyshop/simulate-schedule')
      .set(asUser(restrictedUser(['ws-1'])))
      .send({ workshopId: 'ws-2', bodyworkHours: 1, prepHours: 1, paintHours: 1, startDate: '2026-08-20' })
      .expect(403);
  });

  it('usuario sin restricción (admin) pasa sin problema', async () => {
    await request(app.getHttpServer())
      .post('/bodyshop/simulate-schedule')
      .set(asUser(UNRESTRICTED_USER))
      .send({ workshopId: 'ws-2', bodyworkHours: 1, prepHours: 1, paintHours: 1, startDate: '2026-08-20' })
      .expect(201);
  });
});
