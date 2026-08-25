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

  // ── F3.5 — Kanban: devolución a proceso anterior (multi-hop, cascada real) ──
  // Nota: `describeIfApi` (arriba) evalúa `apiAvailable` en el momento en que
  // Jest COLECTA los describes, antes de que corra el `beforeAll` de este
  // archivo — así que siempre vería `false`. Por eso, igual que el resto del
  // archivo, el guard `if (!apiAvailable) return;` va DENTRO de cada `it`
  // (que sí corre después de los hooks), no en el describe.

  describe('Kanban — devolución multi-proceso (cascada)', () => {
    let workshopId = '';
    let technicianId = '';

    beforeAll(async () => {
      if (!apiAvailable || !adminToken) return;
      const ws = await http('/workshops', { headers: { Authorization: `Bearer ${adminToken}` } });
      workshopId = (ws.body.data ?? []).find((w: any) => w.type === 'BODYSHOP')?.id ?? '';
      if (!workshopId) return;
      const techs = await http(`/technicians?workshopId=${workshopId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      technicianId = (techs.body.data ?? []).find((t: any) => t.active)?.id ?? '';
    });

    // Día hábil futuro (evita domingo y colisiones con datos de otros tests/seeds).
    function futureWeekday(daysAhead: number): string {
      const d = new Date();
      d.setDate(d.getDate() + daysAhead);
      while (d.getDay() === 0) d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10);
    }

    async function createBodyshopEntry(date: string, plate: string): Promise<string> {
      const res = await http('/bodyshop/entries', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          workshopId, date, customerName: 'Integración devolución multi-proceso',
          plate, channel: 'phone', bodyworkHours: 1, prepHours: 1, paintHours: 1, pieceCount: 1,
        }),
      });
      expect(res.status).toBe(201);
      return res.body.data.id as string;
    }

    async function getCard(entryId: string, date: string): Promise<any> {
      const board = await http(`/tracking/board?date=${date}&workshopId=${workshopId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const cards = (board.body.data?.columns ?? []).flatMap((col: any) => col.cards ?? []);
      // buildCard() arma `id` como `${sourceType}:${sourceId}` — el entryId real vive en `sourceId`.
      return cards.find((c: any) => c.sourceId === entryId);
    }

    async function completeProcess(logId: string) {
      return http(`/tracking/process/${logId}/complete`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({}),
      });
    }

    // AGENDA nace 'in_progress'; completarla promueve BODYWORK a 'in_progress'
    // automáticamente (resolver unificado de completeProcess), y así en
    // cadena — no hace falta /start para este primer tramo.
    async function advanceToPaint(entryId: string, date: string): Promise<any> {
      let card = await getCard(entryId, date);
      expect(card?.currentProcess?.processCode).toBe('AGENDA');

      let res = await completeProcess(card.currentProcess.logId);
      expect(res.status).toBe(200);
      card = await getCard(entryId, date);
      expect(card?.currentProcess?.processCode).toBe('BODYWORK');

      res = await completeProcess(card.currentProcess.logId);
      expect(res.status).toBe(200);
      card = await getCard(entryId, date);
      expect(card?.currentProcess?.processCode).toBe('PREP');

      res = await completeProcess(card.currentProcess.logId);
      expect(res.status).toBe(200);
      card = await getCard(entryId, date);
      expect(card?.currentProcess?.processCode).toBe('PAINT');

      return card;
    }

    it('devuelve de PAINT a BODYWORK salteando PREP y confirma la reactivación en cascada (PREP → PAINT)', async () => {
      if (!apiAvailable || !adminToken || !workshopId || !technicianId) return;

      const date = futureWeekday(60);
      const entryId = await createBodyshopEntry(date, `RETM${Date.now().toString().slice(-6)}`);
      const paintCard = await advanceToPaint(entryId, date);

      // Contrato: PAINT (orderIndex 3) ve PREP y BODYWORK como destinos válidos, más cercano primero.
      expect(paintCard.currentProcess.canReturn).toBe(true);
      expect(
        paintCard.currentProcess.availableReturnTargets.map((t: any) => t.processCode),
      ).toEqual(['PREP', 'BODYWORK']);

      const paintLogId = paintCard.currentProcess.logId;

      const ret = await http(`/tracking/process/${paintLogId}/return`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          targetProcessCode: 'BODYWORK',
          reason: 'Retrabajo QA — devolución integración',
          technicianId,
        }),
      });
      expect(ret.status).toBe(200);

      const afterReturn = await getCard(entryId, date);
      expect(afterReturn.currentProcess.processCode).toBe('BODYWORK');
      expect(afterReturn.currentProcess.status).toBe('in_progress');

      // D2: PREP saltado gana una pasada NUEVA 'returned'; la 'completed' original queda como historia.
      const allPasses = await http(`/tracking/card/bodyshop/${entryId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const passes = allPasses.body.data as any[];
      expect(passes.filter(p => p.processCode === 'PAINT' && p.status === 'returned')).toHaveLength(1);
      expect(passes.filter(p => p.processCode === 'PREP' && p.status === 'returned')).toHaveLength(1);
      expect(passes.filter(p => p.processCode === 'PREP' && p.status === 'completed')).toHaveLength(1);

      // Completar BODYWORK (destino) reactiva PREP como 'pending' — resolver unificado de completeProcess().
      const bwComplete = await completeProcess(afterReturn.currentProcess.logId);
      expect(bwComplete.status).toBe(200);
      expect(bwComplete.body.data.next?.processCode).toBe('PREP');
      expect(bwComplete.body.data.next?.status).toBe('pending');

      const prepLogId = bwComplete.body.data.next.id as string;
      const prepStart = await http(`/tracking/process/${prepLogId}/start`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ technicianId }),
      });
      expect(prepStart.status).toBe(200);

      // Completar PREP reactiva PAINT como 'pending' — el tramo encadenado que la exploración marcó sin cubrir.
      const prepComplete = await completeProcess(prepLogId);
      expect(prepComplete.status).toBe(200);
      expect(prepComplete.body.data.next?.processCode).toBe('PAINT');
      expect(prepComplete.body.data.next?.status).toBe('pending');
    });

    it('PATCH .../return con targetProcessCode inválido o faltante responde 400', async () => {
      if (!apiAvailable || !adminToken || !workshopId || !technicianId) return;

      const date = futureWeekday(67);
      const entryId = await createBodyshopEntry(date, `RETN${Date.now().toString().slice(-6)}`);
      const paintCard = await advanceToPaint(entryId, date);
      const paintLogId = paintCard.currentProcess.logId;

      // AGENDA nunca es un destino válido (listAvailableMothers() lo excluye siempre).
      const invalidTarget = await http(`/tracking/process/${paintLogId}/return`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          targetProcessCode: 'AGENDA',
          reason: 'Motivo de prueba',
          technicianId,
        }),
      });
      expect(invalidTarget.status).toBe(400);

      const missingTarget = await http(`/tracking/process/${paintLogId}/return`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          reason: 'Motivo de prueba',
          technicianId,
        }),
      });
      expect(missingTarget.status).toBe(400);
    });
  });
});
