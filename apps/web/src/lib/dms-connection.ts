/**
 * DMS connection wrapper — SQL Server (mssql).
 *
 * Target database: MYSQL_DW on SQL Server 2016 at DMS_HOST.
 * This is READ-ONLY by convention — never generate INSERT/UPDATE/DELETE.
 *
 * Replaces the old mysql2 wrapper. Use getDmsPool() for all new code.
 * getDmsConnection() is kept as a deprecated stub so old imports don't break
 * at build time (they will 500 at runtime, same as before the migration).
 */
import * as sql from 'mssql';
import type * as mysql from 'mysql2/promise';

const getDmsConfig = (): sql.config => ({
  server:   process.env.DMS_HOST ?? '',
  port:     Number(process.env.DMS_PORT ?? 1433),
  user:     process.env.DMS_USER,
  password: process.env.DMS_PASSWORD,
  database: process.env.DMS_DATABASE ?? 'MYSQL_DW',
  options: {
    encrypt:                false,
    trustServerCertificate: true,
  },
  connectionTimeout: 10_000,
  requestTimeout:    30_000,
});

/**
 * Opens a new SQL Server connection pool and resolves when connected.
 * Callers are responsible for calling pool.close() in a finally block.
 */
export async function getDmsPool(): Promise<sql.ConnectionPool> {
  const pool = new sql.ConnectionPool(getDmsConfig());
  await pool.connect();
  return pool;
}

/**
 * @deprecated Use getDmsPool() instead.
 * Kept only to avoid build failures on routes not yet migrated.
 * Any call to this function will throw at runtime.
 */
export async function getDmsConnection(): Promise<mysql.Connection> {
  throw new Error(
    'getDmsConnection() is deprecated. Migrate this route to use getDmsPool() with mssql.',
  );
}
