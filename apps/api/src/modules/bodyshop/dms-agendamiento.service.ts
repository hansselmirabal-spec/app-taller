import { Injectable, Logger } from '@nestjs/common';
import * as sql from 'mssql';

export interface DmsAppointmentPayload {
  title: string;
  startDate: string;      // YYYY-MM-DD
  startTime: string;      // HH:mm:ss
  endTime: string;        // HH:mm:ss
  advisorId: string;
  idSucursal?: string | number | null;
  customerName: string;
  phone: string;
  vehicle: string;
  description: string;
}

export interface DmsPushResult {
  success: boolean;
  dmsId?: string;
  error?: string;
}

export interface DmsSucursal {
  id: string;
  nombre: string;
}

export interface DmsAsesor {
  codigo: string;
  nombre: string;
  sucursalId: string | null;
}

@Injectable()
export class DmsAgendamientoService {
  private readonly logger = new Logger(DmsAgendamientoService.name);
  private readonly url: string;

  constructor() {
    this.url = process.env.DMS_AGENDAMIENTO_URL ?? '';
  }

  private getDmsConfig(): sql.config {
    return {
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
    };
  }

  private async getDmsPool(): Promise<sql.ConnectionPool> {
    const pool = new sql.ConnectionPool(this.getDmsConfig());
    await pool.connect();
    return pool;
  }

  async getSucursales(): Promise<DmsSucursal[]> {
    let pool: sql.ConnectionPool | null = null;
    try {
      pool = await this.getDmsPool();
      // Join agendamiento_asesor.IdSucursalIDIS ↔ DimSucursal to get display names.
      const result = await pool.request().query(`
        SELECT DISTINCT
          a.IdSucursalIDIS AS id,
          ISNULL(s.Descripcion, CONCAT('Sucursal ', a.IdSucursalIDIS)) AS nombre
        FROM dbo.agendamiento_asesor a
        LEFT JOIN dbo.controltiempo_DimSucursal s ON s.IdSucursal = TRY_CAST(a.IdSucursalIDIS AS INT)
        WHERE a.Estado = 1
          AND a.IdSucursalIDIS IS NOT NULL
          AND LTRIM(RTRIM(a.IdSucursalIDIS)) <> ''
        ORDER BY nombre
      `);
      return (result.recordset as any[]).map(r => ({
        id:     String(r.id),
        nombre: String(r.nombre),
      }));
    } catch (err: any) {
      this.logger.warn(`getSucursales error: ${err.message}`);
      return [];
    } finally {
      await pool?.close();
    }
  }

  async getAsesores(sucursalId?: string | null): Promise<DmsAsesor[]> {
    let pool: sql.ConnectionPool | null = null;
    try {
      pool = await this.getDmsPool();
      const request = pool.request();
      let querySql: string;

      if (sucursalId) {
        request.input('sucursalId', sql.NVarChar(100), sucursalId);
        querySql = `
          SELECT CodigoIDIS AS codigo, Nombre AS nombre, IdSucursalIDIS AS sucursalId
          FROM dbo.agendamiento_asesor
          WHERE Estado = 1 AND IdSucursalIDIS = @sucursalId
          ORDER BY Nombre
        `;
      } else {
        querySql = `
          SELECT CodigoIDIS AS codigo, Nombre AS nombre, IdSucursalIDIS AS sucursalId
          FROM dbo.agendamiento_asesor
          WHERE Estado = 1
          ORDER BY Nombre
        `;
      }

      const result = await request.query(querySql);
      const seen = new Set<string>();
      return (result.recordset as any[])
        .filter(r => r.codigo)
        .map(r => ({
          codigo:     String(r.codigo).trim(),
          nombre:     String(r.nombre).trim(),
          sucursalId: r.sucursalId != null ? String(r.sucursalId) : null,
        }))
        .filter(r => {
          if (seen.has(r.codigo)) return false;
          seen.add(r.codigo);
          return true;
        });
    } catch (err: any) {
      this.logger.warn(`getAsesores error: ${err.message}`);
      return [];
    } finally {
      await pool?.close();
    }
  }

  async push(payload: DmsAppointmentPayload): Promise<DmsPushResult> {
    if (!this.url) {
      this.logger.warn('DMS_AGENDAMIENTO_URL no configurada — push omitido');
      return { success: false, error: 'URL no configurada' };
    }

    const body = JSON.stringify({
      title:         payload.title,
      start_date:    payload.startDate,
      start_time:    payload.startTime,
      end_time:      payload.endTime,
      IdAsesor:      payload.advisorId,
      category:      1,
      IdSucursal:    payload.idSucursal ? Number(payload.idSucursal) : undefined,
      NombreCliente: payload.customerName,
      Telefono:      payload.phone,
      Vehiculo:      payload.vehicle,
      description:   payload.description,
    });

    try {
      const res  = await fetch(this.url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(8_000),
      });
      const json = await res.json() as any;

      if (json?.success) {
        this.logger.log(`DMS push OK — dmsId=${json.id} chapa=${payload.vehicle}`);
        return { success: true, dmsId: String(json.id) };
      }

      this.logger.warn(`DMS push rechazado: ${JSON.stringify(json)}`);
      return { success: false, error: json?.message ?? 'Respuesta inesperada del DMS' };

    } catch (err: any) {
      this.logger.error(`DMS push error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /** Calcula end_time = startTime + totalHours, sin pasar de 18:00. */
  static calcEndTime(startTime: string, totalHours: number): string {
    const [h, m] = startTime.split(':').map(Number);
    const startMin = h * 60 + m;
    const endMin   = Math.min(startMin + Math.round(totalHours * 60), 18 * 60);
    const eh = Math.floor(endMin / 60).toString().padStart(2, '0');
    const em = (endMin % 60).toString().padStart(2, '0');
    return `${eh}:${em}:00`;
  }
}
