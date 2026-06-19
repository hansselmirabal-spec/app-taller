/**
 * Tests del wrapper http() en lib/api.ts.
 *
 * Tras la migración a cookie httpOnly, el comportamiento del 401 cambió:
 *   - 401 en /auth/login         → "Credenciales inválidas" (mensaje del backend)
 *   - 401 en cualquier otro path → "Sesión expirada"
 * Ya no se distingue por presencia de token en localStorage (no hay token ahí).
 *
 * El http() ahora envía credentials:'include' para que el browser mande la cookie.
 */

process.env.NEXT_PUBLIC_MOCK_MODE = 'false';
process.env.NEXT_PUBLIC_API_URL = 'http://test-api/api/v1';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((k: string) => store[k] ?? null),
    setItem: jest.fn((k: string, v: string) => { store[k] = v; }),
    removeItem: jest.fn((k: string) => { delete store[k]; }),
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });

const fetchMock = jest.fn();
(global as any).fetch = fetchMock;

import { login, forgotPassword, resetPassword, getWorkshops } from '../lib/api';

function fetchResponse(status: number, body: any, contentType = 'application/json'): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h: string) => h.toLowerCase() === 'content-type' ? contentType : null },
    json: async () => body,
    text: async () => typeof body === 'string' ? body : JSON.stringify(body),
  } as unknown as Response;
}

function fetchTextResponse(status: number, text: string, contentType = 'text/html'): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h: string) => h.toLowerCase() === 'content-type' ? contentType : null },
    json: async () => { throw new Error('not json'); },
    text: async () => text,
  } as unknown as Response;
}

describe('lib/api.ts → http()', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    localStorageMock.clear();
  });

  // ── 401 — distinción por path ────────────────────────────────────────────────

  describe('Manejo de 401', () => {
    it('en /auth/login: 401 = "Credenciales inválidas" (mensaje del backend)', async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse(401, { error: 'Credenciales inválidas' }));

      await expect(login('admin@taller.com', 'pass-mala')).rejects.toThrow(/credenciales inv/i);
      // No debe interpretarse como "sesión expirada"
      await expect(login('admin@taller.com', 'pass-mala')).rejects.not.toThrow(/sesión expir/i);
    });

    it('en endpoints autenticados: 401 = "Sesión expirada" (cookie inválida/vencida)', async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse(401, { error: 'Unauthorized' }));

      await expect(getWorkshops()).rejects.toThrow(/sesión expir/i);
    });

    it('en /auth/login sin body: mensaje genérico "Credenciales inválidas"', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: { get: () => 'application/json' },
        json: async () => { throw new Error('no body'); },
        text: async () => '',
      } as unknown as Response);

      await expect(login('x@x.com', 'pass')).rejects.toThrow(/credenciales inv/i);
    });

    it('en /auth/login: usa mensaje del backend si viene', async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse(401, { error: 'Cuenta bloqueada' }));

      await expect(login('x@x.com', 'pass')).rejects.toThrow(/cuenta bloqueada/i);
    });
  });

  // ── Otros códigos ────────────────────────────────────────────────────────────

  describe('Otros códigos de error', () => {
    it('403 → "No tenés permisos"', async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse(403, { error: 'Forbidden' }));

      await expect(getWorkshops()).rejects.toThrow(/no tenés permisos/i);
    });

    it('404 → "recurso solicitado no fue encontrado"', async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse(404, {}));

      await expect(getWorkshops()).rejects.toThrow(/no fue encontrado/i);
    });

    it('500 sin body útil → mensaje "Error 500 del servidor"', async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse(500, {}));

      await expect(getWorkshops()).rejects.toThrow(/error 500 del servidor/i);
    });

    it('400 → mensaje del backend (validación)', async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse(400, {
        error: 'Las horas de chapería deben ser un número.',
      }));

      await expect(login('x@x.com', 'pass')).rejects.toThrow(/horas de chapería/i);
    });

    it('Error de red (fetch rechaza) → mensaje "no se puede conectar"', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('Network error'));

      await expect(login('x@x.com', 'pass')).rejects.toThrow(/no se puede conectar/i);
    });

    it('500 con HTML (proxy/nginx error) → usa el text como mensaje', async () => {
      fetchMock.mockResolvedValueOnce(fetchTextResponse(502, '502 Bad Gateway', 'text/html'));

      await expect(login('x@x.com', 'pass')).rejects.toThrow(/502 bad gateway/i);
    });

    it('500 con HTML demasiado largo → cae al genérico (no spamea el mensaje)', async () => {
      const bigHtml = '<html>' + 'x'.repeat(500) + '</html>';
      fetchMock.mockResolvedValueOnce(fetchTextResponse(503, bigHtml, 'text/html'));

      await expect(login('x@x.com', 'pass')).rejects.toThrow(/error 503 del servidor/i);
    });
  });

  // ── Cookie auth ──────────────────────────────────────────────────────────────

  describe('Cookie auth', () => {
    it('siempre manda credentials:"include" para que el browser envíe la cookie', async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse(200, { data: [] }));

      await getWorkshops();

      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(init.credentials).toBe('include');
    });

    it('NO setea Authorization header (el token vive en cookie httpOnly)', async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse(200, { data: [] }));

      await getWorkshops();

      const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBeUndefined();
    });

    it('NO lee localStorage para obtener el token', async () => {
      localStorageMock.setItem('token', 'jwt-cualquiera-de-localStorage');
      fetchMock.mockResolvedValueOnce(fetchResponse(200, { data: [] }));

      await getWorkshops();

      // Aunque haya un "token" residual en localStorage, no se manda como Bearer.
      const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBeUndefined();
    });
  });

  // ── Forgot/Reset password ────────────────────────────────────────────────────

  describe('forgotPassword/resetPassword', () => {
    it('forgotPassword hace POST a /auth/forgot-password con email', async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse(200, { data: { message: 'ok' } }));

      await forgotPassword('admin@taller.com');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain('/auth/forgot-password');
      expect((init as RequestInit).method).toBe('POST');
      expect(JSON.parse((init as RequestInit).body as string)).toEqual({ email: 'admin@taller.com' });
    });

    it('resetPassword hace POST a /auth/reset-password con token y newPassword', async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse(200, { data: { message: 'ok' } }));

      await resetPassword('tok-123', 'NuevaPass1');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain('/auth/reset-password');
      expect(JSON.parse((init as RequestInit).body as string)).toEqual({
        token: 'tok-123',
        newPassword: 'NuevaPass1',
      });
    });

    it('forgotPassword NO arroja si el backend responde 200', async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse(200, {
        data: { message: 'Si el email existe...' },
      }));

      await expect(forgotPassword('cualquiera@x.com')).resolves.toBeDefined();
    });
  });
});
