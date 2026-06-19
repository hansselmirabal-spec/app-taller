import { NextRequest, NextResponse } from 'next/server';
import mysql from 'mysql2/promise';
import { getDmsConnection } from '@/lib/dms-connection';
import { resolveEstado } from '@/lib/ot-estados';

export interface StatusHistoryEntry {
  estado: string;
  desde: string;
  hasta: string | null;
  dias: number;
  horas: number;
}

export interface OtDetail {
  ot: number;
  codCliente: string;
  nombreCliente: string;
  chasis: string;
  modelo: string;
  estadoOt: string;
  estadoIdis: string;
  estadoFinanciero: string;
  asesor: string;
  sucursal: string;
  tipoServicio: string;
  montoTotal: number;
  observaciones: string;
  diasIngreso: number;
  diasEnEstado: number;
  tiempoEntrega: string | null;
  // fechas
  fechaIngreso: string | null;
  horaIngreso: string | null;
  fechaCompromisoCliente: string | null;
  fechaCompromisoTaller: string | null;
  fechaCompromisoIdis: string | null;
  fechaFinTaller: string | null;
  fechaFinalizado: string | null;
  fechaSalida: string | null;
  fechaRenegociacion: string | null;
  fechaFactura: string | null;
  statusHistory: StatusHistoryEntry[];
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

  let connection: mysql.Connection | null = null;
  try {
    connection = await getDmsConnection();
    const [rows] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT
        OT, CODCLIENTE,
        TRIM(NOMBRECLIENTE)         AS NOMBRECLIENTE,
        TRIM(CHASIS)                AS CHASIS,
        TRIM(MODELO)                AS MODELO,
        ESTADOOT, ESTADOIDIS, ESTADOFINANCIERO,
        TRIM(ASESOR)                AS ASESOR,
        TRIM(SUCURSAL)              AS SUCURSAL,
        TRIM(TipoServicio)          AS TipoServicio,
        MONTOTOTAL,
        DIASINGRESO,
        TRIM(OBSERVACIONES)         AS OBSERVACIONES,
        TRIM(TIEMPODEENTREGA)       AS TIEMPODEENTREGA,
        fechaingreso,
        FechaCompromisoClienteMaster,
        FechaCompromisoTaller,
        FechacompromisoIDIS,
        FechaFinTaller,
        FechaFinalizado,
        FECHASALIDA,
        FechaRenegociacion,
        fechafactura
      FROM v_maestro_ot_condor
      WHERE OT = ?
      LIMIT 1`,
      [otNum],
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: 'OT no encontrada' }, { status: 404 });
    }

    const r = rows[0];
    const fechaIngresoIso = toDate(r.fechaingreso);

    // Lookup separado para hora de ingreso — en otra vista que puede no existir.
    // Si falla no interrumpe el detalle principal.
    let horaIngresoRaw: string | null = null;
    try {
      const [tRows] = await connection.execute<mysql.RowDataPacket[]>(
        `SELECT MIN(horaingreso) AS horaingreso FROM v_maestro_ot_filtros WHERE nroot = ? AND horaingreso IS NOT NULL AND TRIM(horaingreso) <> ''`,
        [otNum],
      );
      if (tRows.length > 0) horaIngresoRaw = tRows[0].horaingreso ?? null;
    } catch (e: any) {
      console.error('[ot-detail] horaIngreso lookup failed:', e?.message ?? e);
    }
    const diasCalc = fechaIngresoIso
      ? Math.floor(
          (Date.now() - new Date(fechaIngresoIso + 'T00:00:00Z').getTime()) / 86_400_000,
        )
      : 0;

    // Historial de estados
    let statusHistory: StatusHistoryEntry[] = [];
    try {
      const [histRows] = await connection.execute<mysql.RowDataPacket[]>(
        `SELECT mh.idestado_ot, e.descripcion AS estado, mh.insert_date
         FROM ot_master_historial mh
         LEFT JOIN estados_ot e ON e.idestadoot = mh.idestado_ot
         WHERE mh.idmaster = (SELECT idmaster FROM ot_master WHERE nroot = ? LIMIT 1)
         ORDER BY mh.insert_date ASC`,
        [otNum],
      );
      const now = Date.now();
      statusHistory = histRows.map((h, i) => {
        const desde = new Date(h.insert_date as string);
        const hastaRaw = histRows[i + 1]?.insert_date;
        const hasta = hastaRaw ? new Date(hastaRaw as string) : null;
        const msElapsed = (hasta ? hasta.getTime() : now) - desde.getTime();
        const totalMinutes = Math.floor(msElapsed / 60_000);
        return {
          estado: String(h.estado ?? h.idestado_ot ?? '').trim(),
          desde:  desde.toISOString().slice(0, 16).replace('T', ' '),
          hasta:  hasta ? hasta.toISOString().slice(0, 16).replace('T', ' ') : null,
          dias:   Math.floor(totalMinutes / 1440),
          horas:  Math.floor((totalMinutes % 1440) / 60),
        };
      });
    } catch (e: any) {
      console.error('[ot-detail] statusHistory lookup failed:', e?.message ?? e);
    }

    const detail: OtDetail = {
      ot:                     Number(r.OT),
      codCliente:             String(r.CODCLIENTE ?? '').trim(),
      nombreCliente:          String(r.NOMBRECLIENTE ?? '').trim(),
      chasis:                 String(r.CHASIS ?? '').trim(),
      modelo:                 String(r.MODELO ?? '').trim(),
      estadoOt:               resolveEstado(String(r.ESTADOOT ?? '').trim()),
      estadoIdis:             String(r.ESTADOIDIS ?? '').trim(),
      estadoFinanciero:       String(r.ESTADOFINANCIERO ?? '').trim(),
      asesor:                 String(r.ASESOR ?? '').trim(),
      sucursal:               String(r.SUCURSAL ?? '').trim(),
      tipoServicio:           String(r.TipoServicio ?? '').trim(),
      montoTotal:             Number(r.MONTOTOTAL ?? 0),
      observaciones:          String(r.OBSERVACIONES ?? '').trim(),
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
    await connection?.end();
  }
}
