// Mock fetch para que apiLogout no rompa los tests de clearAuth.
(global as any).fetch = jest.fn().mockResolvedValue({ ok: true });

import { getEffectivePermissions, storeAuth, clearAuth } from '../lib/auth';
import { FULL_PERMISSIONS, RECEPTIONIST_PERMISSIONS } from '../lib/permissions';
import type { User, Permissions } from '../types';

const adminUser: User = {
  id: 'u1',
  name: 'Admin',
  email: 'admin@taller.com',
  role: 'admin',
  active: true,
};

const receptionistUser: User = {
  id: 'u2',
  name: 'Recep',
  email: 'recep@taller.com',
  role: 'receptionist',
  active: true,
};

const customPermissions: Permissions = {
  dashboard:    { view: true,  edit: false },
  capacity:     { view: false, edit: false },
  appointments: { view: true,  edit: true  },
  kanban:       { view: false, edit: false },
  reports:      { view: false, edit: false },
  settings:     { view: false, edit: false },
  presupuesto:  { view: false, edit: false },
};

// jsdom provides localStorage — reset between tests
beforeEach(() => {
  localStorage.clear();
});

describe('getEffectivePermissions()', () => {
  it('retorna FULL_PERMISSIONS para usuario admin', () => {
    storeAuth(adminUser);
    const perms = getEffectivePermissions();
    expect(perms).toEqual(FULL_PERMISSIONS);
  });

  it('retorna permissions almacenadas para usuario no-admin', () => {
    storeAuth({ ...receptionistUser, permissions: customPermissions } as any);
    const perms = getEffectivePermissions();
    expect(perms).toEqual(customPermissions);
  });

  it('retorna RECEPTIONIST_PERMISSIONS cuando no hay permissions almacenadas y es recepcionista', () => {
    // storeAuth sin permissions en user usa RECEPTIONIST_PERMISSIONS por defecto
    storeAuth(receptionistUser);
    const perms = getEffectivePermissions();
    expect(perms).toEqual(RECEPTIONIST_PERMISSIONS);
  });

  it('retorna objeto vacio cuando no hay usuario almacenado', () => {
    const perms = getEffectivePermissions();
    expect(perms).toEqual({});
  });

  it('admin siempre obtiene FULL_PERMISSIONS aunque haya permissions custom en localStorage', () => {
    // Guardamos user admin con permissions custom — debe ignorarlas y devolver FULL
    localStorage.setItem('user', JSON.stringify(adminUser));
    localStorage.setItem('permissions', JSON.stringify(customPermissions));
    const perms = getEffectivePermissions();
    expect(perms).toEqual(FULL_PERMISSIONS);
  });
});

describe('storeAuth()', () => {
  it('guarda user y permissions en localStorage (NO el token: vive en cookie httpOnly)', () => {
    storeAuth(adminUser);
    expect(localStorage.getItem('token')).toBeNull();
    expect(JSON.parse(localStorage.getItem('user')!).id).toBe('u1');
    expect(localStorage.getItem('permissions')).toBeTruthy();
  });
});

describe('clearAuth()', () => {
  it('elimina user y permissions; llama al backend para invalidar la cookie', async () => {
    storeAuth(adminUser);
    await clearAuth();
    expect(localStorage.getItem('user')).toBeNull();
    expect(localStorage.getItem('permissions')).toBeNull();
  });
});
