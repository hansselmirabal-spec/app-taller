/**
 * Tests de lib/auth.ts — el token JWT vive en cookie httpOnly (no leíble desde JS).
 * localStorage solo guarda perfil (user) y permissions efectivos para la UI.
 */

// Mock de fetch para que apiLogout no rompa los tests de clearAuth.
const fetchMock = jest.fn().mockResolvedValue({ ok: true });
(global as any).fetch = fetchMock;

import {
  storeAuth, clearAuth, mustChangePassword, isAdmin,
  getStoredUser, getStoredPermissions, getEffectivePermissions,
} from '../lib/auth';
import { FULL_PERMISSIONS, RECEPTIONIST_PERMISSIONS } from '../lib/permissions';

const adminUser: any = {
  id: 'u1', name: 'Admin', email: 'admin@taller.com',
  role: 'admin', active: true, mustChangePassword: false,
};

const receptionistUser: any = {
  id: 'u2', name: 'Recep', email: 'r@taller.com',
  role: 'receptionist', active: true, mustChangePassword: true,
};

describe('lib/auth.ts', () => {
  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockClear();
  });

  // ── storeAuth ────────────────────────────────────────────────────────────────

  describe('storeAuth()', () => {
    it('guarda user y permissions en localStorage (NO el token: vive en cookie httpOnly)', () => {
      storeAuth(adminUser);

      expect(localStorage.getItem('user')).not.toBeNull();
      expect(JSON.parse(localStorage.getItem('user')!)).toEqual(adminUser);
      expect(JSON.parse(localStorage.getItem('permissions')!)).toEqual(FULL_PERMISSIONS);
      // El token no debe estar en localStorage (mitiga XSS)
      expect(localStorage.getItem('token')).toBeNull();
    });

    it('admin recibe FULL_PERMISSIONS por defecto', () => {
      storeAuth(adminUser);
      expect(JSON.parse(localStorage.getItem('permissions')!)).toEqual(FULL_PERMISSIONS);
    });

    it('receptionist recibe RECEPTIONIST_PERMISSIONS por defecto', () => {
      storeAuth(receptionistUser);
      expect(JSON.parse(localStorage.getItem('permissions')!)).toEqual(RECEPTIONIST_PERMISSIONS);
    });

    it('si user.permissions viene en payload, las usa (custom role)', () => {
      const custom = { capacity: { view: true, edit: true }, dashboard: { view: true, edit: false } };
      storeAuth({ ...receptionistUser, permissions: custom } as any);

      expect(JSON.parse(localStorage.getItem('permissions')!)).toEqual(custom);
    });
  });

  // ── clearAuth ────────────────────────────────────────────────────────────────

  describe('clearAuth()', () => {
    it('borra user, permissions y activeWorkshopId; pide al backend invalidar la cookie', async () => {
      localStorage.setItem('user', JSON.stringify(adminUser));
      localStorage.setItem('permissions', JSON.stringify(FULL_PERMISSIONS));
      localStorage.setItem('activeWorkshopId', 'ws-1');

      await clearAuth();

      expect(localStorage.getItem('user')).toBeNull();
      expect(localStorage.getItem('permissions')).toBeNull();
      expect(localStorage.getItem('activeWorkshopId')).toBeNull();
      // Backend logout fue llamado
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/auth/logout'),
        expect.objectContaining({ method: 'POST', credentials: 'include' }),
      );
    });

    it('si el endpoint logout falla, igual limpia localStorage local', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network down'));
      localStorage.setItem('user', JSON.stringify(adminUser));

      await clearAuth();

      expect(localStorage.getItem('user')).toBeNull();
    });
  });

  // ── isAdmin / mustChangePassword ────────────────────────────────────────────

  describe('isAdmin() / mustChangePassword()', () => {
    it('isAdmin true cuando role=admin', () => {
      storeAuth(adminUser);
      expect(isAdmin()).toBe(true);
    });

    it('isAdmin false cuando role=receptionist', () => {
      storeAuth(receptionistUser);
      expect(isAdmin()).toBe(false);
    });

    it('isAdmin false cuando no hay user en localStorage', () => {
      expect(isAdmin()).toBe(false);
    });

    it('mustChangePassword true cuando flag está en true', () => {
      storeAuth(receptionistUser);
      expect(mustChangePassword()).toBe(true);
    });

    it('mustChangePassword false cuando flag está en false', () => {
      storeAuth(adminUser);
      expect(mustChangePassword()).toBe(false);
    });

    it('mustChangePassword false cuando no hay user', () => {
      expect(mustChangePassword()).toBe(false);
    });
  });

  // ── getStoredUser ────────────────────────────────────────────────────────────

  describe('getStoredUser()', () => {
    it('retorna null si no hay user', () => {
      expect(getStoredUser()).toBeNull();
    });

    it('retorna null si el JSON está corrupto (no rompe)', () => {
      localStorage.setItem('user', 'not-valid-json{');
      expect(getStoredUser()).toBeNull();
    });

    it('retorna el user parseado correctamente', () => {
      storeAuth(adminUser);
      expect(getStoredUser()).toEqual(adminUser);
    });
  });

  // ── getEffectivePermissions ─────────────────────────────────────────────────

  describe('getEffectivePermissions()', () => {
    it('admin siempre devuelve FULL_PERMISSIONS, ignorando lo guardado', () => {
      storeAuth(adminUser);
      localStorage.setItem('permissions', JSON.stringify({ capacity: { view: false, edit: false } }));

      expect(getEffectivePermissions()).toEqual(FULL_PERMISSIONS);
    });

    it('receptionist usa permisos guardados', () => {
      const custom = { capacity: { view: true, edit: true } };
      storeAuth({ ...receptionistUser, permissions: custom } as any);

      expect(getEffectivePermissions()).toEqual(custom);
    });

    it('receptionist sin permisos guardados cae en RECEPTIONIST_PERMISSIONS', () => {
      storeAuth(receptionistUser);
      localStorage.removeItem('permissions');

      expect(getEffectivePermissions()).toEqual(RECEPTIONIST_PERMISSIONS);
    });

    it('sin user devuelve objeto vacío', () => {
      expect(getEffectivePermissions()).toEqual({});
    });
  });
});
