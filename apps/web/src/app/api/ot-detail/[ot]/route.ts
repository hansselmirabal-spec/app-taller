import { NextRequest, NextResponse } from 'next/server';
import * as sql from 'mssql';
import { getDmsPool } from '@/lib/dms-connection';
import { resolveEstado } from '@/lib/ot-estados';

export interface StatusHistoryEntry {
  estado: string;
  desde:  string;
  hasta:  string | null;
  dias:   number;
  horas:  number;
}

export interface OtDetail {
  ot:                     number;
  codCliente:             string;
  nombreCliente:          string;
  chasis:                 string;
  modelo:                 string;
  estadoOt:               string;
  estadoIdis:             string;
  estadoFinanciero:       string;
  asesor:                 string;
  sucursal:               string;
  tipoServicio:           string;
  montoTotal:             number;
  observaciones:          string;
  diasIngreso:            number;
  diasEnEstado:           number;
  tiempoEntrega:          string | null;
  fechaIngreso:           string | null;
  horaIngreso:            string | null;
  fechaCompromisoCliente: string | null;
  fechaCompromisoTaller:  string | null;
  fechaCompromisoIdis:    string | null;
  fechaFinTaller:         string | null;
  fechaFinalizado:        string | null;
  fechaSalida:            string | null;
  fechaRenegociacion:     string | null;
  fechaFactura:           string | null;
  statusHistory:          StatusHistoryEntry[];
}

const toDate = (v: unknown): string | null =>
  v ? new Date(v as string).toISOString().split('T')[0] : null;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ot: string }> },
) {
  const { ot: otParam } = await params;
  const otNum = Number(otParam);
  if (!Number.isInteger(otNum) || otNum <= 0) {
    return NextResponse.json({ error: 'OT inválida' }, { status: 400 });
  }

  let pool: sql.ConnectionPool | null = null;
  try {
    pool = await getDmsPool();

    const mainResult = await pool.request()
      .input('otNum', sql.Int, otNum)
      .query<any>(`
        SELECT TOP 1
          m.nroot                                    AS OT,
          ISNULL(m.codcliente, '')                   AS CODCLIENTE,
          ISNULL(m.nombrecliente, '')                AS NOMBRECLIENTE,
          ISNULL(m.chasis, '')                       AS CHASIS,
          ISNULL(m.modelo, '')                       AS MODELO,
          ISNULL(m.EstadoTaller, m.EstadoOT)         AS ESTADOOT,
          ISNULL(m.EstadoOT, '')                     AS ESTADOIDIS,
          ISNULL(m.Estadofinanciero, '')             AS ESTADOFINANCIERO,
          ISNULL(m.asesor, '')                       AS ASESOR,
          d.Descripcion                              AS SUCURSAL,
          ISNULL(ts.descripcion, '')                 AS TipoServicio,
          ISNULL(CAST(m.monto AS FLOAT), 0)          AS MONTOTOTAL,
          DATEDIFF(DAY, m.fechaingreso, GETDATE())   AS DIASINGRESO,
          ISNULL(m.observaciones, '')                AS OBSERVACIONES,
          NULL                                       AS TIEMPODEENTREGA,
          m.fechaingreso,
          m.horaingreso,
          m.fechacompromisoCliente                   AS FechaCompromisoClienteMaster,
          NULL                                       AS FechaCompromisoTaller,
          NULL                                       AS FechacompromisoIDIS,
          NULL                                       AS FechaFinTaller,
          m.fecha_cierre_ot                          AS FechaFinalizado,
          NULL                                       AS FECHASALIDA,
          NULL                                       AS FechaRenegociacion,
          NULL                                       AS fechafactura
        FROM MYSQL_DW.dbo.MasterOT_Condor m
        INNER JOIN MYSQL_DW.dbo.controltiempo_DimSucursal d ON d.IdSucursal = m.taller
        LEFT  JOIN MYSQL_DW.dbo.controltiempo_DimTipoServicio ts ON ts.idtipo_servicio = m.idtiposervicio
        WHERE m.nroot = @otNum
      `);

    if (mainResult.recordset.length === 0) {
      return NextResponse.json({ error: 'OT no encontrada' }, { status: 404 });
    }

    const r = mainResult.recordset[0];
    const fechaIngresoIso = toDate(r.fechaingreso);
    const horaIngresoRaw  = r.horaingreso ? String(r.horaingreso).trim() || null : null;

    const diasCalc = fechaIngresoIso
      ? Math.floor((Date.now() - new Date(fechaIngresoIso + 'T00:00:00Z').getTime()) / 86_400_000)
      : 0;

    // Status history — tables may not exist in SQL Server; fail gracefully
    let statusHistory: StatusHistoryEntry[] = [];
    try {
      const histResult = await pool.request()
        .input('otNum2', sql.Int, otNum)
        .query<any>(`
          SELECT mh.idestado_ot, e.descripcion AS estado, mh.insert_date
          FROM MYSQL_DW.dbo.ot_master_historial mh
          LEFT JOIN MYSQL_DW.dbo.estados_ot e ON e.idestadoot = mh.idestado_ot
          WHERE mh.idmaster = (SELECT TOP 1 idmaster FROM MYSQL_DW.dbo.ot_master WHERE nroot = @otNum2)
          ORDER BY mh.insert_date ASC
        `);
      const now = Date.now();
      statusHistory = histResult.recordset.map((h: any, i: number) => {
        const desde    = new Date(h.insert_date as string);
        const hastaRaw = histResult.recordset[i + 1]?.insert_date;
        const hasta    = hastaRaw ? new Date(hastaRaw as string) : null;
        const totalMin = Math.floor(((hasta ? hasta.getTime() : now) - desde.getTime()) / 60_000);
        return {
          estado: String(h.estado ?? h.idestado_ot ?? '').trim(),
          desde:  desde.toISOString().slice(0, 16).replace('T', ' '),
          hasta:  hasta ? hasta.toISOString().slice(0, 16).replace('T', ' ') : null,
          dias:   Math.floor(totalMin / 1440),
          horas:  Math.floor((totalMin % 1440) / 60),
        };
      });
    } catch (e: any) {
      console.error('[ot-detail] statusHistory lookup failed:', e?.message ?? e);
    }

    const detail: OtDetail = {
      ot:                     Number(r.OT),
      codCliente:             String(r.CODCLIENTE).trim(),
      nombreCliente:          String(r.NOMBRECLIENTE).trim(),
      chasis:                 String(r.CHASIS).trim(),
      modelo:                 String(r.MODELO).trim(),
      estadoOt:               resolveEstado(String(r.ESTADOOT).trim()),
      estadoIdis:             String(r.ESTADOIDIS).trim(),
      estadoFinanciero:       String(r.ESTADOFINANCIERO).trim(),
      asesor:                 String(r.ASESOR).trim(),
      sucursal:               String(r.SUCURSAL ?? '').trim(),
      tipoServicio:           String(r.TipoServicio).trim(),
      montoTotal:             Number(r.MONTOTOTAL ?? 0),
      observaciones:          String(r.OBSERVACIONES).trim(),
      diasIngreso:            Math.max(0, diasCalc),
      diasEnEstado:           Number(r.DIASINGRESO ?? 0),
      tiempoEntrega:          r.TIEMPODEENTREGA ? String(r.TIEMPODEENTREGA).trim() : null,
      fechaIngreso:           fechaIngresoIso,
      horaIngreso:            horaIngresoRaw,
      fechaCompromisoCliente: toDate(r.FechaCompromisoClienteMaster),
      fechaCompromisoTaller:  toDate(r.FechaCompromisoTaller),
      fechaCompromisoIdis:    toDate(r.FechacompromisoIDIS),
      fechaFinTaller:         toDate(r.FechaFinTaller),
      fechaFinalizado:        toDate(r.FechaFinalizado),
      fechaSalida:            toDate(r.FECHASALIDA),
      fechaRenegociacion:     toDate(r.FechaRenegociacion),
      fechaFactura:           toDate(r.fechafactura),
      statusHistory,
    };

    return NextResponse.json(detail, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err: any) {
    console.error('[ot-detail]', err.message);
    return NextResponse.json({ error: 'Error al conectar con DMS' }, { status: 500 });
  } finally {
    await pool?.close();
  }
}
