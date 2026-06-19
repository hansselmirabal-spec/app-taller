import { can, FULL_PERMISSIONS, RECEPTIONIST_PERMISSIONS, emptyPermissions } from '../lib/permissions';
import type { Permissions } from '../types';

describe('can()', () => {
  it('retorna true cuando el permiso existe y esta habilitado (view)', () => {
    expect(can(FULL_PERMISSIONS, 'dashboard', 'view')).toBe(true);
  });

  it('retorna true cuando el permiso de edit existe y esta habilitado', () => {
    expect(can(FULL_PERMISSIONS, 'appointments', 'edit')).toBe(true);
  });

  it('retorna false cuando el modulo esta ausente en permissions', () => {
    const partial = { dashboard: { view: true, edit: true } } as unknown as Permissions;
    expect(can(partial, 'capacity', 'view')).toBe(false);
  });

  it('retorna false cuando edit=false y action es edit', () => {
    expect(can(RECEPTIONIST_PERMISSIONS, 'capacity', 'edit')).toBe(false);
  });

  it('retorna false cuando view=false y action es view', () => {
    expect(can(RECEPTIONIST_PERMISSIONS, 'reports', 'view')).toBe(false);
  });

  it('retorna false cuando permissions es undefined', () => {
    expect(can(undefined, 'dashboard', 'view')).toBe(false);
  });

  it('recepcionista puede ver appointments', () => {
    expect(can(RECEPTIONIST_PERMISSIONS, 'appointments', 'view')).toBe(true);
  });

  it('recepcionista puede editar appointments', () => {
    expect(can(RECEPTIONIST_PERMISSIONS, 'appointments', 'edit')).toBe(true);
  });

  it('recepcionista no puede ver settings', () => {
    expect(can(RECEPTIONIST_PERMISSIONS, 'settings', 'view')).toBe(false);
  });

  it('emptyPermissions retorna false para todos los modulos', () => {
    const empty = emptyPermissions();
    expect(can(empty, 'dashboard', 'view')).toBe(false);
    expect(can(empty, 'dashboard', 'edit')).toBe(false);
    expect(can(empty, 'appointments', 'edit')).toBe(false);
  });
});
