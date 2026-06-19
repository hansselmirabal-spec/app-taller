import { resolveCorsOrigins } from '../common/config/cors-origin';

describe('resolveCorsOrigins()', () => {
  const ORIGINAL_ENV = process.env.FRONTEND_URL;
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = ORIGINAL_ENV;
  });

  describe('en development/test', () => {
    it('cae al fallback localhost si FRONTEND_URL no está seteado', () => {
      delete process.env.FRONTEND_URL;
      expect(resolveCorsOrigins(false)).toEqual(['http://localhost:3000']);
    });

    it('acepta cualquier origen seteado (incluso http o localhost)', () => {
      process.env.FRONTEND_URL = 'http://localhost:3003';
      expect(resolveCorsOrigins(false)).toEqual(['http://localhost:3003']);
    });

    it('acepta múltiples orígenes separados por coma', () => {
      process.env.FRONTEND_URL = 'http://localhost:3000, http://localhost:3003';
      expect(resolveCorsOrigins(false)).toEqual(['http://localhost:3000', 'http://localhost:3003']);
    });
  });

  describe('en production', () => {
    it('fail-fast si FRONTEND_URL no está seteado', () => {
      delete process.env.FRONTEND_URL;
      expect(() => resolveCorsOrigins(true)).toThrow(/obligatorio en production/i);
    });

    it('fail-fast si FRONTEND_URL está vacío', () => {
      process.env.FRONTEND_URL = '   ';
      expect(() => resolveCorsOrigins(true)).toThrow(/obligatorio en production/i);
    });

    it('fail-fast si no usa https', () => {
      process.env.FRONTEND_URL = 'http://taller.condor.com.py';
      expect(() => resolveCorsOrigins(true)).toThrow(/debe empezar con https/i);
    });

    it('fail-fast si apunta a localhost', () => {
      process.env.FRONTEND_URL = 'https://localhost:3000';
      expect(() => resolveCorsOrigins(true)).toThrow(/no puede apuntar a localhost/i);
    });

    it('fail-fast si apunta a 127.0.0.1', () => {
      process.env.FRONTEND_URL = 'https://127.0.0.1';
      expect(() => resolveCorsOrigins(true)).toThrow(/no puede apuntar a localhost/i);
    });

    it('acepta un origen https válido', () => {
      process.env.FRONTEND_URL = 'https://taller.condor.com.py';
      expect(resolveCorsOrigins(true)).toEqual(['https://taller.condor.com.py']);
    });

    it('acepta múltiples orígenes https separados por coma', () => {
      process.env.FRONTEND_URL = 'https://app.condor.com.py,https://staff.condor.com.py';
      expect(resolveCorsOrigins(true)).toEqual([
        'https://app.condor.com.py',
        'https://staff.condor.com.py',
      ]);
    });

    it('rechaza si UNO de los orígenes múltiples es inválido', () => {
      process.env.FRONTEND_URL = 'https://app.condor.com.py,http://staff.condor.com.py';
      expect(() => resolveCorsOrigins(true)).toThrow(/debe empezar con https/i);
    });
  });
});
