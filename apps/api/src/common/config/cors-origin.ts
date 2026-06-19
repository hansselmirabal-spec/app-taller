/**
 * Resuelve y valida los origenes permitidos de CORS.
 */
export function resolveCorsOrigins(isProd: boolean): string[] {
  const raw = process.env.FRONTEND_URL?.trim();
  if (!raw) {
    if (isProd) {
      throw new Error(
        'FRONTEND_URL no esta configurado. Es obligatorio en production. ' +
        'Ejemplo: FRONTEND_URL=https://taller.tudominio.com',
      );
    }
    return ['http://localhost:3000'];
  }
  const origins = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (isProd) {
    for (const o of origins) {
      if (/localhost|127\.0\.0\.1/i.test(o)) {
        throw new Error(
          'FRONTEND_URL en production no puede apuntar a localhost: "' + o + '".',
        );
      }
    }
  }
  return origins;
}
