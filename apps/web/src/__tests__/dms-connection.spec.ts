/**
 * Test del wrapper read-only del DMS.
 * Verifica que TODA conexión al DMS ejecute SET SESSION TRANSACTION READ ONLY
 * apenas se establece — defensa en profundidad contra escrituras accidentales.
 */

const queryMock = jest.fn().mockResolvedValue([]);
const createConnectionMock = jest.fn(async () => ({
  query: queryMock,
  end: jest.fn(),
}));

jest.mock('mysql2/promise', () => ({
  __esModule: true,
  default: { createConnection: (...args: any[]) => createConnectionMock(...args) },
  createConnection: (...args: any[]) => createConnectionMock(...args),
}));

import { getDmsConnection, DMS_CONFIG } from '../lib/dms-connection';

describe('getDmsConnection()', () => {
  beforeEach(() => {
    queryMock.mockClear();
    createConnectionMock.mockClear();
  });

  it('crea la conexión con el DMS_CONFIG', async () => {
    await getDmsConnection();
    expect(createConnectionMock).toHaveBeenCalledTimes(1);
    expect(createConnectionMock).toHaveBeenCalledWith(DMS_CONFIG());
  });

  it('SIEMPRE ejecuta SET SESSION TRANSACTION READ ONLY apenas se conecta', async () => {
    await getDmsConnection();

    expect(queryMock).toHaveBeenCalledWith('SET SESSION TRANSACTION READ ONLY');
    // Y debe ser la primera (y única, hasta que el caller haga otras queries) ejecución
    expect(queryMock.mock.calls[0][0]).toBe('SET SESSION TRANSACTION READ ONLY');
  });

  it('devuelve la conexión lista para usar (con métodos query y end)', async () => {
    const conn = await getDmsConnection();
    expect(typeof conn.query).toBe('function');
    expect(typeof conn.end).toBe('function');
  });

  it('si SET READ ONLY falla, propaga el error (no devuelve conexión escribible)', async () => {
    queryMock.mockRejectedValueOnce(new Error('SET failed'));

    await expect(getDmsConnection()).rejects.toThrow(/SET failed/);
  });
});

describe('DMS_CONFIG()', () => {
  const originals = {
    DMS_HOST: process.env.DMS_HOST,
    DMS_PORT: process.env.DMS_PORT,
    DMS_USER: process.env.DMS_USER,
    DMS_PASSWORD: process.env.DMS_PASSWORD,
    DMS_DATABASE: process.env.DMS_DATABASE,
  };

  afterEach(() => {
    for (const [k, v] of Object.entries(originals)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('usa env vars cuando están seteadas', () => {
    process.env.DMS_HOST = 'dms.example.com';
    process.env.DMS_PORT = '3307';
    process.env.DMS_USER = 'reader';
    process.env.DMS_PASSWORD = 'secret';
    process.env.DMS_DATABASE = 'midb';

    const config = DMS_CONFIG();

    expect(config.host).toBe('dms.example.com');
    expect(config.port).toBe(3307);
    expect(config.user).toBe('reader');
    expect(config.password).toBe('secret');
    expect(config.database).toBe('midb');
    expect(config.connectTimeout).toBe(10_000);
  });

  it('si DMS_DATABASE falta, default a controltiempo', () => {
    delete process.env.DMS_DATABASE;
    expect(DMS_CONFIG().database).toBe('controltiempo');
  });

  it('si DMS_PORT falta, default a 3306', () => {
    delete process.env.DMS_PORT;
    expect(DMS_CONFIG().port).toBe(3306);
  });

  it('NO tiene defaults para credenciales sensibles (host/user/password)', () => {
    delete process.env.DMS_HOST;
    delete process.env.DMS_USER;
    delete process.env.DMS_PASSWORD;

    const config = DMS_CONFIG();
    // Sin defaults: si no están en env, llegan como undefined → mysql falla
    // explícito en lugar de conectar a algún host accidental.
    expect(config.host).toBeUndefined();
    expect(config.user).toBeUndefined();
    expect(config.password).toBeUndefined();
  });
});
