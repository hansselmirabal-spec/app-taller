/**
 * Tests del advisory lock en DmsSyncService.syncAll()
 *
 * Foco: verificar que cuando pg_try_advisory_lock devuelve false (otro proceso
 * tiene el lock), syncAll NO ejecuta el sync. Es el caso multireplica donde dos
 * pods k8s arrancan el cron en simultáneo.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { DmsSyncService } from '../modules/dms-sync/dms-sync.service';
import { DmsAdvisorSlot } from '../modules/dms-sync/dms-advisor-slot.entity';
import { DmsOtRow } from '../modules/dms-sync/dms-ot-row.entity';
import { DmsSyncState } from '../modules/dms-sync/dms-sync-state.entity';

function makeRepoMock() {
  return { upsert: jest.fn(), findOne: jest.fn(), save: jest.fn(), find: jest.fn(), createQueryBuilder: jest.fn() };
}

describe('DmsSyncService.syncAll() - advisory lock', () => {
  let service: DmsSyncService;
  let dataSourceMock: { query: jest.Mock; createQueryBuilder: jest.Mock };
  let syncAdvisorSlotsSpy: jest.SpyInstance;

  beforeEach(async () => {
    dataSourceMock = { query: jest.fn(), createQueryBuilder: jest.fn() };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        DmsSyncService,
        {
          provide: getRepositoryToken(DmsAdvisorSlot),
          useValue: makeRepoMock(),
        },
        {
          provide: getRepositoryToken(DmsOtRow),
          useValue: makeRepoMock(),
        },
        {
          provide: getRepositoryToken(DmsSyncState),
          useValue: makeRepoMock(),
        },
        { provide: getDataSourceToken(), useValue: dataSourceMock },
      ],
    }).compile();

    service = mod.get(DmsSyncService);
    // Stub del trabajo real: nos interesa ver SI se ejecuta, no lo que hace adentro.
    syncAdvisorSlotsSpy = jest.spyOn(service, 'syncAdvisorSlots').mockResolvedValue(undefined);
    // Stub OT rows sync so advisory lock tests stay focused
    jest.spyOn(service, 'maybeRunOtRowsSync').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('si obtiene el lock: ejecuta el sync de asesores y libera el lock', async () => {
    dataSourceMock.query
      .mockResolvedValueOnce([{ acquired: true }])  // pg_try_advisory_lock
      .mockResolvedValueOnce([]);                    // pg_advisory_unlock

    await service.syncAll();

    expect(syncAdvisorSlotsSpy).toHaveBeenCalledTimes(1);
    expect(dataSourceMock.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_try_advisory_lock'),
      [7426158],
    );
    expect(dataSourceMock.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_unlock'),
      [7426158],
    );
  });

  it('si NO obtiene el lock (otra réplica está sincronizando): NO ejecuta sync', async () => {
    dataSourceMock.query.mockResolvedValueOnce([{ acquired: false }]);

    await service.syncAll();

    expect(syncAdvisorSlotsSpy).not.toHaveBeenCalled();
    // Tampoco intenta liberar lo que no tiene
    expect(dataSourceMock.query).toHaveBeenCalledTimes(1);
  });

  it('si la query del lock falla: NO ejecuta sync (fail-safe)', async () => {
    dataSourceMock.query.mockRejectedValueOnce(new Error('DB connection lost'));

    await service.syncAll();

    expect(syncAdvisorSlotsSpy).not.toHaveBeenCalled();
  });

  it('si el sync explota: igual libera el lock (finally)', async () => {
    dataSourceMock.query
      .mockResolvedValueOnce([{ acquired: true }])
      .mockResolvedValueOnce([]);
    syncAdvisorSlotsSpy.mockRejectedValueOnce(new Error('DMS down'));

    await service.syncAll();

    // El error es atrapado, pero el unlock debe ejecutarse
    expect(dataSourceMock.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_unlock'),
      [7426158],
    );
  });

  it('si está corriendo en este mismo proceso (this.syncing): salta sin pedir lock', async () => {
    (service as any).syncing = true;

    await service.syncAll();

    // Ni siquiera consultó la DB
    expect(dataSourceMock.query).not.toHaveBeenCalled();
    expect(syncAdvisorSlotsSpy).not.toHaveBeenCalled();
  });

  it('two-tier: in-memory flag + advisory lock funcionan en orden', async () => {
    // 1ra invocación: toma el lock y arranca
    dataSourceMock.query
      .mockResolvedValueOnce([{ acquired: true }])  // 1er lock
      .mockResolvedValueOnce([])                     // 1er unlock (eventualmente)
      .mockResolvedValueOnce([{ acquired: true }])  // 2do lock (después)
      .mockResolvedValueOnce([]);                    // 2do unlock

    // Primera ejecución completa
    await service.syncAll();
    // Inmediatamente después podemos volver a sincronizar
    await service.syncAll();

    expect(syncAdvisorSlotsSpy).toHaveBeenCalledTimes(2);
  });
});

describe('DmsSyncService.getHealth() + escalamiento', () => {
  let service: DmsSyncService;
  let dataSourceMock: { query: jest.Mock };
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(async () => {
    dataSourceMock = { query: jest.fn() };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        DmsSyncService,
        { provide: getRepositoryToken(DmsAdvisorSlot), useValue: makeRepoMock() },
        { provide: getRepositoryToken(DmsOtRow),       useValue: makeRepoMock() },
        { provide: getRepositoryToken(DmsSyncState),   useValue: makeRepoMock() },
        { provide: getDataSourceToken(), useValue: dataSourceMock },
      ],
    }).compile();
    service = mod.get(DmsSyncService);
    jest.spyOn(service, 'maybeRunOtRowsSync').mockResolvedValue(undefined);
    loggerErrorSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('estado inicial: never-ran', () => {
    expect(service.getHealth()).toEqual({
      lastSyncAt: null,
      lastSuccessAt: null,
      lastError: null,
      consecutiveFailures: 0,
      status: 'never-ran',
    });
  });

  it('después de un sync OK: status=ok, contador=0', async () => {
    dataSourceMock.query
      .mockResolvedValueOnce([{ acquired: true }])
      .mockResolvedValueOnce([]);
    jest.spyOn(service, 'syncAdvisorSlots').mockResolvedValue(undefined);

    await service.syncAll();

    const h = service.getHealth();
    expect(h.status).toBe('ok');
    expect(h.consecutiveFailures).toBe(0);
    expect(h.lastError).toBeNull();
    expect(h.lastSuccessAt).not.toBeNull();
  });

  it('después de un sync que falla: status=degraded, contador=1', async () => {
    dataSourceMock.query
      .mockResolvedValueOnce([{ acquired: true }])
      .mockResolvedValueOnce([]);
    jest.spyOn(service, 'syncAdvisorSlots').mockRejectedValue(new Error('DMS down'));

    await service.syncAll();

    const h = service.getHealth();
    expect(h.status).toBe('degraded');
    expect(h.consecutiveFailures).toBe(1);
    expect(h.lastError).toContain('DMS down');
  });

  it('escala con [ALERT] al 3er fallo consecutivo', async () => {
    jest.spyOn(service, 'syncAdvisorSlots').mockRejectedValue(new Error('DMS down'));
    // 3 corridas fallidas
    for (let i = 0; i < 3; i++) {
      dataSourceMock.query
        .mockResolvedValueOnce([{ acquired: true }])
        .mockResolvedValueOnce([]);
      await service.syncAll();
    }

    expect(service.getHealth().consecutiveFailures).toBe(3);
    // El logger.error debe haberse llamado con [ALERT] al menos una vez (el 3er fallo)
    const alertCalls = loggerErrorSpy.mock.calls.filter(c => String(c[0]).includes('[ALERT]'));
    expect(alertCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('un sync OK después de fallos resetea el contador', async () => {
    const sync = jest.spyOn(service, 'syncAdvisorSlots');
    // Fallo
    dataSourceMock.query.mockResolvedValueOnce([{ acquired: true }]).mockResolvedValueOnce([]);
    sync.mockRejectedValueOnce(new Error('boom'));
    await service.syncAll();
    expect(service.getHealth().consecutiveFailures).toBe(1);
    // Éxito
    dataSourceMock.query.mockResolvedValueOnce([{ acquired: true }]).mockResolvedValueOnce([]);
    sync.mockResolvedValue(undefined);
    await service.syncAll();
    expect(service.getHealth().consecutiveFailures).toBe(0);
    expect(service.getHealth().status).toBe('ok');
  });
});
