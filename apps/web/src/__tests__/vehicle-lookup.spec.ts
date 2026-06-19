/**
 * Tests del route handler /api/vehicle-lookup.
 * Mockean mysql2/promise y next/server para correr en jsdom sin dependencias reales.
 */

const mockExecute = jest.fn();
// El wrapper getDmsConnection llama conn.query('SET SESSION TRANSACTION READ ONLY')
// apenas conecta. El mock acepta esa query como no-op para que el route handler funcione.
const mockQuery = jest.fn().mockResolvedValue([]);
const mockEnd = jest.fn();
const mockCreateConnection = jest.fn(async () => ({
  execute: mockExecute,
  query: mockQuery,
  end: mockEnd,
}));

jest.mock('mysql2/promise', () => ({
  __esModule: true,
  default: { createConnection: (...args: any[]) => mockCreateConnection(...args) },
  createConnection: (...args: any[]) => mockCreateConnection(...args),
}));

jest.mock('next/server', () => ({
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
    mockExecute.mockReset();
    mockEnd.mockReset();
    mockCreateConnection.mockClear();
  });

  it('400 cuando no se envía plate ni chassis', async () => {
    const res: any = await GET(makeRequest({}));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Debe ingresar chapa o chasis');
    expect(mockCreateConnection).not.toHaveBeenCalled();
  });

  it('busca por plate y devuelve vehicle + customer normalizado', async () => {
    mockExecute.mockResolvedValueOnce([[{
      NombreCliente: '  SEGOVIA, RAFAEL ',
      NroCliente: '88397',
      cedula: '1042971',
      ruc: '0',  // valor "vacío"
      Telefono: '0/0981307018',
      Vehiculo: 'GLE 450 D 4',
      Chasis: 'W1N1673331B398033',
      Matricula: 'AAVF055',
      Motor: 'M256',
      Kilometraje: 12000,
      KilometrajeActual: 13500,
      FechaMatricula: '2024-01-10',
      FechaUltimoServicio: '2026-03-01',
      nombre_titular: '',
      cedula_titular: '',
      ruc_titular: '',
      telefono_titular: '',
      Localidad: 'ASUNCION',
      direccion_encuesta: '11ASUNCION-CENTRO - WASHINGTON 793',
      tel_oficina_encuesta: '021555555',
      celular_encuesta: '0985123456',
    }]]);

    const res: any = await GET(makeRequest({ plate: 'aavf055' }));

    expect(res.status).toBe(200);
    expect(res.body.found).toBe(true);

    // Vehicle
    expect(res.body.vehicle.plate).toBe('AAVF055');
    expect(res.body.vehicle.chassis).toBe('W1N1673331B398033');
    expect(res.body.vehicle.vehicleType).toBe('GLE 450 D 4');

    // Customer: cleanPhone limpia "0/" prefix
    expect(res.body.customer.customerName).toBe('SEGOVIA, RAFAEL');
    expect(res.body.customer.telPrincipal).toBe('0981307018');

    // ruc='0' es EMPTY_VALUE, debería quedar vacío
    expect(res.body.customer.ruc).toBe('');

    // address: cleanAddress quita "CODLOCALIDAD - " prefix
    expect(res.body.customer.address).toBe('WASHINGTON 793');
    expect(res.body.customer.telOficina).toBe('021555555');
    expect(res.body.customer.celular).toBe('0985123456');

    // Conexión cerrada
    expect(mockEnd).toHaveBeenCalled();
  });

  it('search por chassis usa el campo Chasis en el WHERE', async () => {
    mockExecute.mockResolvedValueOnce([[{
      NombreCliente: 'X', NroCliente: '1', cedula: '', ruc: '', Telefono: '',
      Vehiculo: '', Chasis: 'W1N123', Matricula: 'XXX',
      Motor: '', Kilometraje: '', KilometrajeActual: '', FechaMatricula: '', FechaUltimoServicio: '',
      nombre_titular: '', cedula_titular: '', ruc_titular: '', telefono_titular: '',
      Localidad: '', direccion_encuesta: null, tel_oficina_encuesta: null, celular_encuesta: null,
    }]]);

    await GET(makeRequest({ chassis: 'w1n123' }));

    const sqlCall = mockExecute.mock.calls[0];
    expect(sqlCall[0]).toContain('UPPER(TRIM(a.Chasis))');
    expect(sqlCall[1][0]).toBe('W1N123');
  });

  it('fallback: si no hay match en agendamiento busca en agendamiento_lavadero', async () => {
    mockExecute
      .mockResolvedValueOnce([[]])  // primera query agendamiento → vacío
      .mockResolvedValueOnce([[{    // segunda query lavadero → encontrado
        chapa: 'XYZ001', chasis: 'CHAS999', nombrecliente: 'MARIA TEST', nrocliente: '12345', modelo: 'COROLLA',
      }]])
      .mockResolvedValueOnce([[{    // tercera query enriquecimiento por NroCliente
        NombreCliente: 'MARIA TEST',
        cedula: '4567890',
        ruc: '',
        Telefono: '0981111111',
        nombre_titular: '',
        cedula_titular: '',
        ruc_titular: '',
        telefono_titular: '',
        Localidad: 'LUQUE',
        direccion_encuesta: null,
        tel_oficina_encuesta: null,
        celular_encuesta: null,
      }]]);

    const res: any = await GET(makeRequest({ plate: 'XYZ001' }));

    expect(res.status).toBe(200);
    expect(res.body.found).toBe(true);
    expect(res.body.vehicle.plate).toBe('XYZ001');
    expect(res.body.vehicle.vehicleType).toBe('COROLLA');
    expect(res.body.customer.customerName).toBe('MARIA TEST');
    expect(res.body.customer.cedula).toBe('4567890');
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it('404 cuando no se encuentra ni en agendamiento ni en lavadero', async () => {
    mockExecute
      .mockResolvedValueOnce([[]])  // agendamiento vacío
      .mockResolvedValueOnce([[]]); // lavadero vacío

    const res: any = await GET(makeRequest({ plate: 'NOEXISTE' }));

    expect(res.status).toBe(404);
    expect(res.body.found).toBe(false);
    expect(mockEnd).toHaveBeenCalled();
  });

  it('500 cuando la conexión al DMS falla', async () => {
    mockCreateConnection.mockRejectedValueOnce(new Error('ETIMEDOUT'));

    const res: any = await GET(makeRequest({ plate: 'AAA111' }));

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Error al conectar con DMS');
  });

  it('cierra la conexión incluso si la query lanza error', async () => {
    mockExecute.mockRejectedValueOnce(new Error('SQL error'));

    const res: any = await GET(makeRequest({ plate: 'AAA111' }));

    expect(res.status).toBe(500);
    expect(mockEnd).toHaveBeenCalled();
  });

  it('normaliza input UPPER(TRIM(...)) — chapa con minúscula y espacios', async () => {
    mockExecute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);

    await GET(makeRequest({ plate: '  aavf055  ' }));

    expect(mockExecute.mock.calls[0][1][0]).toBe('AAVF055');
  });
});
