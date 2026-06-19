/**
 * Wrapper read-only para conexiones al DMS Condor.
 *
 * Setea SESSION TRANSACTION READ ONLY apenas se conecta. Cualquier intento de
 * INSERT/UPDATE/DELETE/CREATE/DROP en esa sesión recibe el error 1792 de MySQL:
 *   "Cannot execute statement in a READ ONLY transaction".
 *
 * Reemplaza `mysql.createConnection(DMS_CONFIG)` en TODOS los route handlers
 * que tocan el DMS. Defensa en profundidad: el comentario "DMS es solo lectura"
 * deja de ser disciplina y pasa a ser garantía del MySQL server.
 */
import * as mysql from 'mysql2/promise';

export const DMS_CONFIG = (): mysql.ConnectionOptions => ({
  host:           process.env.DMS_HOST,
  port:    Number(process.env.DMS_PORT ?? 3306),
  user:           process.env.DMS_USER,
  password:       process.env.DMS_PASSWORD,
  database:       process.env.DMS_DATABASE ?? 'controltiempo',
  connectTimeout: 10_000,
});

export async function getDmsConnection(): Promise<mysql.Connection> {
  const conn = await mysql.createConnection(DMS_CONFIG());
  // SESSION (no GLOBAL): solo afecta esta conexión, no toda la instancia.
  // READ ONLY: transactional read-only mode → INSERT/UPDATE/DELETE rechazados.
  await conn.query('SET SESSION TRANSACTION READ ONLY');
  return conn;
}
