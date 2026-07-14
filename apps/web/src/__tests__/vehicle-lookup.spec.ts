/**
 * Tests del route handler /api/vehicle-lookup.
 * Hoy es un proxy al backend NestJS (GET /api/v1/dms/vehicle-lookup), que a su vez
 * lee de la tabla materializada dms_ot_rows (sin tocar DMS en vivo por request).
 */

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

jest.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'auth_token' ? { value: 'test-token' } : undefined),
  }),
}));

jest.mock('next/server', () => ({
  NextRequest: class {},
  NextResponse: {
    json: (body: any, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      body,
      json: async () => body,
    }),
  },
}));

function makeRequest(params: Record<string, string>) {
  const url = new URL('http://localhost/api/vehicle-lookup?' + new URLSearchParams(params).toString());
  return { nextUrl: url } as any;
}

import { GET } from '../app/api/vehicle-lookup/route';

describe('GET /api/vehicle-lookup', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('400 cuando no se envía plate', async () => {
    const res: any = await GET(makeRequest({}));
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('400 cuando plate tiene menos de 3 caracteres', async () => {
    const res: any = await GET(makeRequest({ plate: 'AB' }));
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('busca por plate y devuelve vehicle + customer normalizado', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        found: true,
        vehicle:  { plate: 'AAVF055', chassis: 'AAVF055', vehicleType: 'GLE 450 D 4' },
        customer: { customerName: 'SEGOVIA, RAFAEL', customerNumber: '88397' },
      }),
    });

    const res: any = await GET(makeRequest({ plate: 'aavf055' }));

    expect(res.status).toBe(200);
    expect(res.body.found).toBe(true);
    expect(res.body.vehicle.plate).toBe('AAVF055');
    expect(res.body.vehicle.vehicleType).toBe('GLE 450 D 4');
    expect(res.body.customer.customerName).toBe('SEGOVIA, RAFAEL');
    expect(res.body.customer.customerNumber).toBe('88397');

    // Reenvía el token de la cookie auth_token como Bearer al backend
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/api/v1/dms/vehicle-lookup?plate=AAVF055');
    expect(init.headers.Authorization).toBe('Bearer test-token');
  });

  it('found:false (200) cuando el backend no encuentra el vehículo', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ found: false }) });

    const res: any = await GET(makeRequest({ plate: 'NOEXISTE' }));

    expect(res.status).toBe(200);
    expect(res.body.found).toBe(false);
  });

  it('500 cuando el backend no responde OK', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });

    const res: any = await GET(makeRequest({ plate: 'AAA111' }));

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DMS unavailable');
  });

  it('normaliza el input a mayúsculas y sin espacios', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ found: false }) });

    await GET(makeRequest({ plate: '  aavf055  ' }));

    const [url] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('plate=AAVF055');
  });
});
