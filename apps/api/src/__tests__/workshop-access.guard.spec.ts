import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { WorkshopAccessGuard } from '../common/guards/workshop-access.guard';

function makeContext(user: any, query: any = {}, body: any = {}, params: any = {}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user, query, body, params }) }),
    getHandler: () => () => undefined,
    getClass: () => function StubClass() { /* stub */ },
  } as unknown as ExecutionContext;
}

describe('WorkshopAccessGuard', () => {
  let guard: WorkshopAccessGuard;

  beforeEach(() => {
    guard = new WorkshopAccessGuard();
  });

  it('admin_taller pasa siempre, incluso con allowedWorkshopIds restringido', () => {
    const ctx = makeContext(
      { id: 'u1', role: 'admin_taller', allowedWorkshopIds: ['ws-1'] },
      { workshopId: 'ws-2' },
    );

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('admin pasa siempre (regresión)', () => {
    const ctx = makeContext(
      { id: 'u1', role: 'admin', allowedWorkshopIds: ['ws-1'] },
      { workshopId: 'ws-2' },
    );

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allowedWorkshopIds null permite acceso (sin restricción) (regresión)', () => {
    const ctx = makeContext(
      { id: 'u1', role: 'receptionist', allowedWorkshopIds: null },
      { workshopId: 'ws-2' },
    );

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allowedWorkshopIds vacío ([]) permite acceso (sin restricción) (regresión)', () => {
    const ctx = makeContext(
      { id: 'u1', role: 'receptionist', allowedWorkshopIds: [] },
      { workshopId: 'ws-2' },
    );

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('sin workshopId en query/body permite el paso (regresión)', () => {
    const ctx = makeContext(
      { id: 'u1', role: 'receptionist', allowedWorkshopIds: ['ws-1'] },
      {},
      {},
    );

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('workshopId fuera de la lista lanza ForbiddenException y loguea la denegación sin PII', () => {
    const warnSpy = jest.spyOn((guard as any).logger, 'warn').mockImplementation(() => undefined);

    const ctx = makeContext(
      { id: 'u1', role: 'receptionist', allowedWorkshopIds: ['ws-1', 'ws-3'], email: 'user@taller.com' },
      { workshopId: 'ws-2' },
    );

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    const loggedMessage = warnSpy.mock.calls[0].join(' ');
    expect(loggedMessage).toContain('u1');
    expect(loggedMessage).toContain('receptionist');
    expect(loggedMessage).toContain('ws-2');
    expect(loggedMessage).toContain('2'); // allowed-list count
    expect(loggedMessage).not.toContain('ws-1');
    expect(loggedMessage).not.toContain('ws-3');
    expect(loggedMessage).not.toContain('user@taller.com');
  });

  // PR2 — rutas con `workshopId` como route param (ej. seed-workshop/:workshopId)
  // no eran cubiertas: el guard solo leía query/body. Ver design.md "Open Questions".
  it('lee workshopId de route params cuando no está en query/body y permite si está en la lista', () => {
    const ctx = makeContext(
      { id: 'u1', role: 'receptionist', allowedWorkshopIds: ['ws-1'] },
      {},
      {},
      { workshopId: 'ws-1' },
    );

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('workshopId de route params fuera de la lista lanza ForbiddenException', () => {
    const ctx = makeContext(
      { id: 'u1', role: 'receptionist', allowedWorkshopIds: ['ws-1'] },
      {},
      {},
      { workshopId: 'ws-2' },
    );

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
