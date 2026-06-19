import { NextResponse } from 'next/server';
import mysql from 'mysql2/promise';
import { getDmsConnection } from '@/lib/dms-connection';

const CACHE_TTL_MS = 5 * 60_000;
let cache: { ts: number; payload: unknown } | null = null;

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.payload);
  }

  let connection: mysql.Connection | null = null;
  try {
    connection = await getDmsConnection();
    const [rows] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT TRIM(CONVERT(SUCURSAL USING utf8mb4)) AS sucursal, COUNT(*) AS total
       FROM v_maestro_ot_condor
       WHERE SUCURSAL IS NOT NULL
       GROUP BY TRIM(CONVERT(SUCURSAL USING utf8mb4))
       HAVING sucursal <> ''
       ORDER BY total DESC`,
    );

    const branches = rows.map(r => ({
      name:  String(r.sucursal),
      total: Number(r.total ?? 0),
    }));

    const payload = { data: branches, cachedAt: new Date().toISOString() };
    cache = { ts: Date.now(), payload };
    return NextResponse.json(payload);
  } catch (err: any) {
    console.error('[dms-branches]', err.message);
    return NextResponse.json({ error: 'Error al consultar sucursales del DMS' }, { status: 500 });
  } finally {
    await connection?.end();
  }
}
