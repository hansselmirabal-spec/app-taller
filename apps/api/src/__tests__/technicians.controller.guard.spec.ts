/**
 * PR2 (control-acceso-talleres-usuario) — WorkshopAccessGuard aplicado a
 * GET /technicians. Ver appointments.controller.guard.spec.ts.
 *
 * workshop-access-guard-endpoints-faltantes agrega los casos de autorización
 * por `workshopName` (`resolveWorkshopName` / `assertWorkshopNameAllowed`),
 * que no pasan por `WorkshopAccessGuard` (solo chequea `workshopId`).
 */
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TechniciansController } from '../modules/technicians/technicians.controller';
import { TechniciansService } from '../modules/technicians/technicians.service';
import { WorkshopsService } from '../modules/workshops/workshops.service';
import { buildGuardTestApp, asUser, restrictedUser, UNRESTRICTED_USER } from './helpers/workshop-guard-http.helper';

const WORKSHOP_A = { id: 'ws-1', name: 'Taller A' };
const WORKSHOP_B = { id: 'ws-2', name: 'Taller B' };

describe('TechniciansController — WorkshopAccessGuard (GET /technicians)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await buildGuardTestApp(TechniciansController, [
      { provide: TechniciansService, useValue: { findAll: jest.fn().mockResolvedValue([]) } },
      {
        provide: WorkshopsService,
        useValue: {
          findOne: jest.fn().mockResolvedValue({ name: 'WS' }),
          findAll: jest.fn().mockResolvedValue([WORKSHOP_A]),
        },
      },
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

  it('usuario restringido consultando por workshopName dentro de su acceso pasa sin problema', async () => {
    await request(app.getHttpServer())
      .get('/technicians')
      .set(asUser(restrictedUser(['ws-1'])))
      .query({ workshopName: WORKSHOP_A.name })
      .expect(200);
  });

  it('usuario restringido consultando por workshopName fuera de su acceso recibe 403', async () => {
    await request(app.getHttpServer())
      .get('/technicians')
      .set(asUser(restrictedUser(['ws-1'])))
      .query({ workshopName: WORKSHOP_B.name })
      .expect(403);
  });

  it('usuario restringido con workshopId permitido pero workshopName no permitido recibe 403 (precedencia de name)', async () => {
    await request(app.getHttpServer())
      .get('/technicians')
      .set(asUser(restrictedUser(['ws-1'])))
      .query({ workshopId: WORKSHOP_A.id, workshopName: WORKSHOP_B.name })
      .expect(403);
  });

  it('usuario admin consultando por workshopName pasa sin problema', async () => {
    await request(app.getHttpServer())
      .get('/technicians')
      .set(asUser(UNRESTRICTED_USER))
      .query({ workshopName: WORKSHOP_B.name })
      .expect(200);
  });
});
