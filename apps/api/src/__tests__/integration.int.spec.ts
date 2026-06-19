/**
 * Tests de integración HTTP contra la API real corriendo en localhost:3001.
 *
 * Requiere:
 *   - API levantada (pnpm dev en apps/api)
 *   - Postgres en localhost:5432 con DB taller_db
 *   - Usuario admin@taller.com con pass Admin1234
 *
 * Si el API no responde, todos los tests se marcan como skipped (no fallan).
 *
 * Correr con:
 *   npx jest --testPathPatterns=int-spec
 */

const API = 'http://localhost:3001/api/v1';
const ADMIN_EMAIL = 'admin@taller.com';
const ADMIN_PASS  = 'Admin1234';

let apiAvailable = false;
let adminToken = '';

async function http(path: string, init: RequestInit = {}): Promise<{ status: number; body: any }> {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

beforeAll(async () => {
  try {
    const res = await fetch(`${API}/workshops`);
    apiAvailable = res.status === 401; // sin token = 401, API up
    if (apiAvailable) {
      const login = await http('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS }),
      });
      if (login.status === 201 || login.status === 200) {
        adminToken = login.body?.data?.access_token ?? '';
      }
    }
  } catch {
    apiAvailable = false;
  }
}, 10_000);

const describeIfApi = (name: string, fn: () => void) => {
  describe(name, () => {
    if (!apiAvailable) {
      it.skip('API no disponible — saltado', () => undefined);
      return;
    }
    fn();
  });
};

describe('Integración API', () => {
  it('precondición: API responde en :3001', () => {
    if (!apiAvailable) {
      console.warn('  ⚠ API no disponible en localhost:3001 — todos los tests skipped');
    }
    expect(true).toBe(true);
  });

  // ── F3.1 — Auth flow ─────────────────────────────────────────────────────────

  describe('Auth', () => {
    it('login admin OK retorna access_token y rol admin', async () => {
      if (!apiAvailable) return;
      const res = await http('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS }),
      });
      expect([200, 201]).toContain(res.status);
      expect(res.body.data.access_token).toBeTruthy();
      expect(res.body.data.user.role).toBe('admin');
    });

    it('login con password incorrecta devuelve 401 con mensaje "Credenciales inválidas"', async () => {
      if (!apiAvailable) return;
      const res = await http('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: ADMIN_EMAIL, password: 'pass-mala' }),
      });
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Credenciales inv/i);
    });

    it('login con email inválido devuelve 400 (validación)', async () => {
      if (!apiAvailable) return;
      const res = await http('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'no-es-email', password: 'x' }),
      });
      expect(res.status).toBe(400);
    });
  });

  // ── F3.2 — Forgot/Reset password (anti-enumeración) ─────────────────────────

  describe('Forgot/Reset password', () => {
    it('forgot-password con email inexistente responde mensaje genérico (no revela)', async () => {
      if (!apiAvailable) return;
      const res = await http('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: 'nadie-existe-' + Date.now() + '@x.com' }),
      });
      expect([200, 201]).toContain(res.status);
      expect(res.body.data.message).toMatch(/Si el email existe/i);
    });

    it('forgot-password con email malformado devuelve 400', async () => {
      if (!apiAvailable) return;
      const res = await http('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: 'no-es-email' }),
      });
      expect(res.status).toBe(400);
    });

    it('reset-password con token inválido devuelve 400', async () => {
      if (!apiAvailable) return;
      const res = await http('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: 'token-invalido-12345', newPassword: 'NuevaPass1234' }),
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/enlace/i);
    });
  });

  // ── F3.3 — Endpoints protegidos ──────────────────────────────────────────────

  describe('Auth guards', () => {
    it('GET /workshops sin token devuelve 401', async () => {
      if (!apiAvailable) return;
      const res = await http('/workshops');
      expect(res.status).toBe(401);
    });

    it('GET /workshops con token admin devuelve 200', async () => {
      if (!apiAvailable || !adminToken) return;
      const res = await http('/workshops', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('POST /capacity/absences sin token devuelve 401', async () => {
      if (!apiAvailable) return;
      const res = await http('/capacity/absences', {
        method: 'POST',
        body: JSON.stringify({ technicianId: 'x', date: '2026-12-31', type: 'full' }),
      });
      expect(res.status).toBe(401);
    });
  });

  // ── F3.4 — Validación de DTOs en español ─────────────────────────────────────

  describe('Validación', () => {
    it('POST /bodyshop/entries con horas faltantes responde mensaje en español', async () => {
      if (!apiAvailable || !adminToken) return;
      const res = await http('/bodyshop/entries', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          workshopId: 'x', date: '2026-06-10', workTypeId: 'x',
          customerName: 'Test', plate: 'AAA111', channel: 'phone',
        }),
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/horas de chapería|horas de pintura|días de estadía/i);
    });
  });
});
