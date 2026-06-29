import { NextRequest, NextResponse } from 'next/server';
import * as sql from 'mssql';
import { getDmsPool } from '@/lib/dms-connection';

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('plate')?.toUpperCase().trim();
  if (!raw || raw.length < 3) {
    return NextResponse.json({ error: 'plate required (min 3 chars)' }, { status: 400 });
  }

  let pool: sql.ConnectionPool | null = null;
  try {
    pool = await getDmsPool();

    const result = await pool.request()
      .input('plate', sql.VarChar(20), raw)
      .query<any>(`
        SELECT TOP 1
          ISNULL(UPPER(LTRIM(RTRIM(m.chapa))),  '') AS Chapa,
          ISNULL(m.chasis,        '')               AS Chasis,
          ISNULL(m.modelo,        '')               AS Modelo,
          ISNULL(m.nombrecliente, '')               AS NombreCliente
        FROM MYSQL_DW.dbo.MasterOT_Condor m
        WHERE UPPER(LTRIM(RTRIM(m.chapa)))  = @plate
           OR UPPER(LTRIM(RTRIM(m.chasis))) = @plate
        ORDER BY m.fechaingreso DESC
      `);

    if (result.recordset.length === 0) {
      return NextResponse.json({ found: false }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const r = result.recordset[0];
    return NextResponse.json({
      found:        true,
      plate:        String(r.Chapa).trim() || raw,
      chassis:      String(r.Chasis).trim(),
      model:        String(r.Modelo).trim(),
      customerName: String(r.NombreCliente).trim(),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: any) {
    console.error('[vehicle-lookup]', err.message);
    return NextResponse.json({ error: 'DMS unavailable' }, { status: 500 });
  } finally {
    await pool?.close();
  }
}
