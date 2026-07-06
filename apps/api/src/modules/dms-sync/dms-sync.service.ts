import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as sql from 'mssql';
import { DmsSnapshot } from './dms-snapshot.entity';
import { DmsAdvisorSlot } from './dms-advisor-slot.entity';
import { DmsOtRow } from './dms-ot-row.entity';
import { DmsSyncState } from './dms-sync-state.entity';

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
  requestTimeout:    60_000,
});

/**
 * Opens a new SQL Server connection pool. Caller must close it in a finally block.
 * DMS is READ-ONLY — never issue INSERT/UPDATE/DELETE.
 */
async function getDmsPool(): Promise<sql.ConnectionPool> {
  const pool = new sql.ConnectionPool(getDmsConfig());
  await pool.connect();
  return pool;
}

const HARD_LIMIT = 10_000;

// OT rows sync interval: default 30 minutes (1_800_000 ms). Override via DMS_SYNC_INTERVAL_MS.
const OT_SYNC_INTERVAL_MS = Number(process.env.DMS_SYNC_INTERVAL_MS ?? 1_800_000);

// Delay before the first OT rows sync tick after startup (60 seconds).
const OT_STARTUP_DELAY_MS = 60_000;

// Combinaciones de scope que el worker pre-genera. Cubren los rangos más usados
// del frontend. Combinaciones raras (ej: filtro por tipo) caen al fallback.
const PRESET_SCOPES = [
  { days: 90,  soloAbiertas: true },
  { days: 365, soloAbiertas: true },
];

interface OtSeguimientoSnapshot {
  data: any[];
  summary: Record<string, number>;
  total: number;
  truncated: boolean;
  days: number;
  cachedAt: string;
}

// ID arbitrario único para el advisory lock de Postgres. Tiene que ser estable
// entre réplicas (mismo número en todos los pods). Cualquier int64 fijo sirve.
const SYNC_LOCK_KEY = 7426158;

// Si fallan N syncs consecutivos, escalamos. Threshold 3 = ~15 min sin datos
// (cron cada 5 min × 3 = 15 min).
const ALERT_THRESHOLD = 3;

export interface DmsSyncHealth {
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  status: 'ok' | 'degraded' | 'never-ran';
}

@Injectable()
export class DmsSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DmsSyncService.name);
  private syncing = false;

  // Estado observable para /dms-sync/status y para detectar caídas continuas.
  private lastSyncAt: Date | null = null;
  private lastSuccessAt: Date | null = null;
  private lastError: string | null = null;
  private consecutiveFailures = 0;

  // Tracks when we last ran syncOtRows() successfully. Used to gate the next run
  // based on OT_SYNC_INTERVAL_MS without changing the existing cron cadence.
  private lastOtSyncAt: Date | null = null;
  // True after the initial 60s startup delay has elapsed for OT sync.
  private otSyncReady = false;

  constructor(
    @InjectRepository(DmsSnapshot)
    private snapshotRepo: Repository<DmsSnapshot>,
    @InjectRepository(DmsAdvisorSlot)
    private advisorSlotRepo: Repository<DmsAdvisorSlot>,
    @InjectRepository(DmsOtRow)
    private otRowRepo: Repository<DmsOtRow>,
    @InjectRepository(DmsSyncState)
    private stateRepo: Repository<DmsSyncState>,
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  /** Estado actual del worker para que monitoring/UI lo consulte. */
  getHealth(): DmsSyncHealth {
    const status: DmsSyncHealth['status'] =
      this.lastSyncAt === null ? 'never-ran'
        : this.consecutiveFailures > 0 ? 'degraded'
        : 'ok';
    return {
      lastSyncAt:    this.lastSyncAt?.toISOString()    ?? null,
      lastSuccessAt: this.lastSuccessAt?.toISOString() ?? null,
      lastError: this.lastError,
      consecutiveFailures: this.consecutiveFailures,
      status,
    };
  }

  // Sync inicial al arrancar — sin esperar 5 min al primer cron tick.
  async onApplicationBootstrap() {
    if (!process.env.DMS_HOST) {
      this.logger.warn('DMS_HOST no configurado, salteando sync inicial');
      return;
    }
    this.logger.log('Sync inicial del DMS al arrancar...');
    void this.syncAll().catch(err => this.logger.error('Sync inicial falló', err));

    // OT rows sync must wait 60 seconds after startup before the first tick.
    setTimeout(() => {
      this.otSyncReady = true;
      this.logger.log('OT rows sync habilitado (60s startup delay transcurrido)');
    }, OT_STARTUP_DELAY_MS);
  }

  // Cron principal: cada 5 minutos refresca todos los presets.
  // Protección de concurrencia en 2 capas:
  //   1. Flag in-memory `this.syncing` evita solapamiento dentro del mismo proceso.
  //   2. Postgres advisory lock evita que múltiples réplicas (k8s) sincronicen a la vez.
  //      pg_try_advisory_lock devuelve true si lo obtuvo, false si otro proceso ya lo tiene.
  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncAll() {
    if (this.syncing) {
      this.logger.warn('Sync anterior aún en curso en este proceso, salteando este tick');
      return;
    }

    // Lock distribuido: si otra réplica ya está sincronizando, salimos.
    const acquired = await this.tryAcquireLock();
    if (!acquired) {
      this.logger.log('Otra réplica está ejecutando el sync, salteando este tick');
      return;
    }

    this.syncing = true;
    const t0 = Date.now();
    this.lastSyncAt = new Date();
    try {
      // OT seguimiento y advisor slots corren en paralelo — son conexiones DMS independientes.
      await Promise.all([
        ...PRESET_SCOPES.map(p => this.syncOtSeguimiento(p.days, p.soloAbiertas)),
        this.syncAdvisorSlots(),
      ]);
      // Sync OK: reset contador de fallos.
      this.lastSuccessAt = new Date();
      this.lastError = null;
      this.consecutiveFailures = 0;
      this.logger.log(`Sync completo en ${Date.now() - t0}ms (${PRESET_SCOPES.length + 1} scopes)`);
    } catch (err: any) {
      this.consecutiveFailures += 1;
      this.lastError = err.message;
      this.logger.error(
        `Sync general falló (${this.consecutiveFailures} consecutivos): ${err.message}`,
        err.stack,
      );
      // Escalar si pasamos el threshold. El marker [ALERT] permite que el log
      // collector (Datadog/Loki/CloudWatch) dispare notificación a oncall.
      if (this.consecutiveFailures >= ALERT_THRESHOLD) {
        this.logger.error(
          `[ALERT] DMS sync falló ${this.consecutiveFailures} veces consecutivas. ` +
          `Último éxito: ${this.lastSuccessAt?.toISOString() ?? 'nunca'}. ` +
          `Operación de OTs degradada — verificar conectividad al DMS.`,
        );
      }
    } finally {
      this.syncing = false;
      await this.releaseLock();
    }

    // OT rows sync runs independently with its own cadence and error isolation.
    // A failure here must NOT affect the advisor-slot path above.
    await this.maybeRunOtRowsSync();
  }

  private async tryAcquireLock(): Promise<boolean> {
    try {
      const rows = await this.dataSource.query(
        'SELECT pg_try_advisory_lock($1) AS acquired',
        [SYNC_LOCK_KEY],
      );
      return rows[0]?.acquired === true;
    } catch (err: any) {
      // Si el lock falla por algo inesperado, mejor no sincronizar que duplicar carga.
      this.logger.error(`No se pudo obtener advisory lock: ${err.message}`);
      return false;
    }
  }

  private async releaseLock(): Promise<void> {
    try {
      await this.dataSource.query('SELECT pg_advisory_unlock($1)', [SYNC_LOCK_KEY]);
    } catch (err: any) {
      // Liberar el lock no es crítico (Postgres lo libera al cerrar la sesión),
      // pero loguear si falla para debug.
      this.logger.warn(`No se pudo liberar advisory lock: ${err.message}`);
    }
  }

  // Sincroniza un scope específico de ot-seguimiento.
  // Conecta a MYSQL_DW (SQL Server) y consulta MasterOT_Condor.
  async syncOtSeguimiento(days: number, soloAbiertas: boolean): Promise<void> {
    const scope = `days=${days}|abiertas=${soloAbiertas ? 1 : 0}`;
    let pool: sql.ConnectionPool | null = null;
    try {
      pool = await getDmsPool();

      const request = pool.request();

      // In SQL Server: EstadoOT = 'Abierto' replaces the long IN(...) list.
      const conditions: string[] = [];
      if (soloAbiertas) {
        conditions.push("m.EstadoOT = 'Abierto'");
      }
      if (days > 0) {
        conditions.push('m.fechaingreso >= DATEADD(DAY, -@days, CAST(GETDATE() AS DATE))');
        request.input('days', sql.Int, days);
      }
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await request.query(`
        SELECT TOP (${HARD_LIMIT})
          m.nroot                                                              AS OT,
          LTRIM(RTRIM(m.nrocliente))                                           AS CODCLIENTE,
          LTRIM(RTRIM(m.nombrecliente))                                        AS NOMBRECLIENTE,
          LTRIM(RTRIM(m.chasis))                                               AS CHASIS,
          LTRIM(RTRIM(m.modelo))                                               AS MODELO,
          LTRIM(RTRIM(m.EstadoTaller))                                         AS ESTADOOT,
          ''                                                                   AS ESTADOIDIS,
          LTRIM(RTRIM(m.Estadofinanciero))                                     AS ESTADOFINANCIERO,
          LTRIM(RTRIM(m.asesor))                                               AS ASESOR,
          LTRIM(RTRIM(s.Descripcion))                                          AS SUCURSAL,
          DATEDIFF(DAY, m.fechaingreso, GETDATE())                             AS DIASINGRESO,
          m.fechaingreso,
          m.fechacompromisoCliente                                             AS FechaCompromisoClienteMaster,
          m.fecha_compromiso_taller                                            AS FechaCompromisoTaller,
          COALESCE(m.fecha_cierre_ot, m.fecha_fin_taller)                      AS FechaFinalizado,
          CAST(m.monto AS FLOAT)                                               AS MONTOTOTAL,
          LTRIM(RTRIM(m.observaciones))                                        AS OBSERVACIONES,
          ISNULL(LTRIM(RTRIM(ts.abreviatura)), '')                             AS TipoServicio,
          m.horaingreso
        FROM dbo.MasterOT_Condor m
        LEFT JOIN dbo.controltiempo_DimSucursal s ON s.IdSucursal = m.taller
        LEFT JOIN dbo.controltiempo_DimTipoServicio ts ON ts.idtipo_servicio = m.idtiposervicio
        ${whereClause}
        ORDER BY m.fechaingreso DESC
      `);

      const rows = result.recordset as any[];

      const data = rows.map(r => {
        const fechaIngresoIso = r.fechaingreso
          ? new Date(r.fechaingreso).toISOString().split('T')[0]
          : null;
        // DIASINGRESO del DMS mide días desde el último cambio de estado, no desde el ingreso real.
        // Recalculamos desde fechaingreso para consistencia con el endpoint Next.js.
        const diasCalc = fechaIngresoIso
          ? Math.floor((Date.now() - new Date(fechaIngresoIso + 'T00:00:00Z').getTime()) / 86_400_000)
          : 0;
        return {
          ot:                     Number(r.OT),
          codCliente:             String(r.CODCLIENTE ?? '').trim(),
          nombreCliente:          String(r.NOMBRECLIENTE ?? '').trim(),
          chasis:                 String(r.CHASIS ?? '').trim(),
          modelo:                 String(r.MODELO ?? '').trim(),
          estadoOt:               String(r.ESTADOOT ?? '').trim(),
          estadoIdis:             String(r.ESTADOIDIS ?? '').trim(),
          estadoFinanciero:       String(r.ESTADOFINANCIERO ?? '').trim(),
          asesor:                 String(r.ASESOR ?? '').trim(),
          sucursal:               String(r.SUCURSAL ?? '').trim(),
          diasIngreso:            Math.max(0, diasCalc),
          diasEnEstado:           Number(r.DIASINGRESO ?? 0),
          fechaIngreso:           fechaIngresoIso,
          horaIngreso:            r.horaingreso ? String(r.horaingreso).trim() || null : null,
          fechaCompromisoCliente: r.FechaCompromisoClienteMaster ? new Date(r.FechaCompromisoClienteMaster).toISOString().split('T')[0] : null,
          fechaCompromisoTaller:  r.FechaCompromisoTaller        ? new Date(r.FechaCompromisoTaller).toISOString().split('T')[0]        : null,
          fechaFinalizado:        r.FechaFinalizado               ? new Date(r.FechaFinalizado).toISOString().split('T')[0]               : null,
          montoTotal:             Number(r.MONTOTOTAL ?? 0),
          observaciones:          String(r.OBSERVACIONES ?? '').trim(),
          tipoServicio:           String(r.TipoServicio ?? '').trim(),
        };
      });

      // Conteo por estado desde los datos reales (no desde la lista fija).
      // Así aparecen estados nuevos del DMS sin necesidad de actualizar el código.
      const summary: Record<string, number> = {};
      for (const row of data) {
        const k = row.estadoOt;
        summary[k] = (summary[k] ?? 0) + 1;
      }

      const payload: OtSeguimientoSnapshot = {
        data,
        summary,
        total: data.length,
        truncated: data.length === HARD_LIMIT,
        days,
        cachedAt: new Date().toISOString(),
      };

      await this.upsertSnapshot('ot-seguimiento', scope, payload);
      this.logger.log(`OK ot-seguimiento ${scope} → ${data.length} OTs`);
    } catch (err: any) {
      this.logger.error(`Falló sync ot-seguimiento ${scope}: ${err.message}`);
      await this.markSnapshotError('ot-seguimiento', scope, err.message);
      throw err;
    } finally {
      await pool?.close();
    }
  }

  // ── Sincronización de disponibilidad de asesores DMS ────────────────────────
  // Extrae disponibilidad POR ASESOR de la tabla `agendamiento` del DMS.
  // Ventana: hoy → hoy + 20 días. Nunca escribe ni modifica nada en el DMS.
  // Cada fila = un asesor × un slot de 30 min con su estado de ocupación.
  //
  // NOTE: agendamiento/agendamiento_asesor tables queried via SQL Server syntax.
  // These tables must exist in MYSQL_DW for this sync to succeed.
  async syncAdvisorSlots(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    let pool: sql.ConnectionPool | null = null;
    try {
      pool = await getDmsPool();

      // GROUP BY (fecha, sucursal, categoría, tramo, asesor) — una fila por asesor por slot.
      // is_occupied = 1 si el asesor tiene un cliente con estado Agendado (1) o Reagendado (4).
      const result = await pool.request().query(`
        SELECT
          CAST(a.start_date AS DATE)                                 AS slot_date,
          aa.IdSucursalIDIS                                          AS sucursal_idis,
          a.category                                                 AS category_id,
          a.start_time                                               AS time_start,
          MIN(a.end_time)                                            AS time_end,
          a.IdAsesor                                                 AS advisor_code,
          aa.Nombre                                                  AS advisor_name,
          MAX(CASE
            WHEN a.NombreCliente IS NOT NULL
             AND a.IdEstadoAgendamiento IN (1, 4)
            THEN 1 ELSE 0
          END)                                                       AS is_occupied
        FROM dbo.agendamiento a
        INNER JOIN dbo.agendamiento_asesor aa
               ON aa.CodigoIDIS = a.IdAsesor
              AND aa.Estado = 1
        WHERE CAST(a.start_date AS DATE)
              BETWEEN CAST(GETDATE() AS DATE) AND DATEADD(DAY, 20, CAST(GETDATE() AS DATE))
          AND a.category IN (1, 2)
          AND (
            a.NombreCliente IS NULL
            OR a.IdEstadoAgendamiento IN (1, 4)
          )
          AND aa.IdSucursalIDIS IS NOT NULL
          AND LTRIM(RTRIM(aa.IdSucursalIDIS)) <> ''
        GROUP BY CAST(a.start_date AS DATE), aa.IdSucursalIDIS, a.category, a.start_time, a.IdAsesor, aa.Nombre
        ORDER BY slot_date, sucursal_idis, time_start, advisor_code
      `);

      const rows = result.recordset as any[];

      if (rows.length === 0) {
        this.logger.warn('syncAdvisorSlots: DMS no devolvió filas. ¿Tabla agendamiento vacía?');
        return;
      }

      const now = new Date();

      await this.dataSource.query(
        `DELETE FROM dms_advisor_slots WHERE date < $1`,
        [today],
      );

      const BATCH = 500;
      const values = rows.map(r => ({
        date:        r.slot_date instanceof Date
                       ? r.slot_date.toISOString().split('T')[0]
                       : String(r.slot_date).split('T')[0],
        sucursalIdis: String(r.sucursal_idis).trim(),
        categoryId:   Number(r.category_id),
        timeStart:    String(r.time_start),
        timeEnd:      String(r.time_end),
        advisorCode:  String(r.advisor_code).trim(),
        advisorName:  String(r.advisor_name ?? '').trim(),
        isOccupied:   Number(r.is_occupied) === 1,
        syncedAt:     now,
      }));

      for (let i = 0; i < values.length; i += BATCH) {
        await this.dataSource
          .createQueryBuilder()
          .insert()
          .into(DmsAdvisorSlot)
          .values(values.slice(i, i + BATCH))
          .orUpdate(
            ['time_end', 'advisor_name', 'is_occupied', 'synced_at'],
            ['date', 'sucursal_idis', 'category_id', 'time_start', 'advisor_code'],
          )
          .execute();
      }

      this.logger.log(`OK advisor-slots → ${rows.length} filas per-asesor (hoy + 20d)`);
    } catch (err: any) {
      this.logger.error(`Falló sync advisor-slots: ${err.message}`);
      throw err;
    } finally {
      await pool?.close();
    }
  }

  // ── Acceso para servicios externos ───────────────────────────────────────────

  // Devuelve slots agrupados por asesor para una fecha.
  // sucursalIdis opcional: si se omite, devuelve todos los asesores de todas las sucursales.
  async getAdvisorSlotsByDate(
    date: string,
    sucursalIdis: string | undefined,
    categoryId = 1,
  ): Promise<{ advisorCode: string; advisorName: string; sucursalId: string; freeSlots: number; slots: { timeStart: string; timeEnd: string; isOccupied: boolean }[] }[]> {
    const where: Record<string, unknown> = { date, categoryId };
    if (sucursalIdis) where['sucursalIdis'] = sucursalIdis;
    const rows = await this.advisorSlotRepo.find({
      where,
      order: { advisorName: 'ASC', timeStart: 'ASC' },
    } as any);

    const advisors = new Map<string, { name: string; sucursalId: string; slots: Map<string, { timeStart: string; timeEnd: string; isOccupied: boolean }> }>();
    for (const row of rows) {
      const code = String(row.advisorCode ?? '').trim();
      if (!code) continue;
      if (!advisors.has(code)) {
        advisors.set(code, { name: String(row.advisorName ?? '').trim(), sucursalId: row.sucursalIdis, slots: new Map() });
      }
      const entry = advisors.get(code)!;
      const existing = entry.slots.get(row.timeStart);
      if (existing) {
        // Mismo slot en otra sucursal: si alguna lo marca como ocupado, queda ocupado
        if (row.isOccupied) existing.isOccupied = true;
      } else {
        entry.slots.set(row.timeStart, {
          timeStart:  row.timeStart,
          timeEnd:    row.timeEnd,
          isOccupied: row.isOccupied,
        });
      }
    }

    return Array.from(advisors.entries()).map(([code, data]) => {
      const slots = Array.from(data.slots.values()).sort((a, b) => a.timeStart.localeCompare(b.timeStart));
      return {
        advisorCode: code,
        advisorName: data.name,
        sucursalId:  data.sucursalId,
        freeSlots:   slots.filter(s => !s.isOccupied).length,
        slots,
      };
    });
  }

  // Lista asesores distintos en cache.
  // Si sucursalIdis se pasa, filtra por esa sucursal.
  // Sin parámetro (o vacío) devuelve todos — útil para la config de técnicos.
  async getAdvisorsForSucursal(sucursalIdis?: string): Promise<{ code: string; name: string; sucursalIdis: string }[]> {
    const today = new Date().toISOString().split('T')[0];
    if (sucursalIdis) {
      const rows: { advisor_code: string; advisor_name: string; sucursal_idis: string }[] = await this.dataSource.query(
        `SELECT DISTINCT advisor_code, advisor_name, sucursal_idis
         FROM dms_advisor_slots
         WHERE sucursal_idis = $1 AND date >= $2
         ORDER BY advisor_name`,
        [sucursalIdis, today],
      );
      return rows.map(r => ({ code: r.advisor_code, name: r.advisor_name, sucursalIdis: r.sucursal_idis }));
    }
    const rows: { advisor_code: string; advisor_name: string; sucursal_idis: string }[] = await this.dataSource.query(
      `SELECT DISTINCT advisor_code, advisor_name, sucursal_idis
       FROM dms_advisor_slots
       WHERE date >= $1
       ORDER BY advisor_name`,
      [today],
    );
    return rows.map(r => ({ code: r.advisor_code, name: r.advisor_name, sucursalIdis: r.sucursal_idis }));
  }

  // Lee el snapshot más reciente para un scope. Devuelve null si no existe.
  async getSnapshot(kind: string, scope: string): Promise<DmsSnapshot | null> {
    return this.snapshotRepo.findOne({
      where: { kind, scope },
      order: { fetchedAt: 'DESC' },
    });
  }

  // Lista snapshots — útil para diagnóstico y health check.
  async listSnapshots(): Promise<DmsSnapshot[]> {
    return this.snapshotRepo.find({
      order: { fetchedAt: 'DESC' },
      take: 50,
    });
  }

  private async upsertSnapshot(kind: string, scope: string, data: any) {
    const existing = await this.snapshotRepo.findOne({ where: { kind, scope } });
    if (existing) {
      existing.data = data;
      existing.fetchedAt = new Date();
      existing.lastError = null;
      await this.snapshotRepo.save(existing);
    } else {
      await this.snapshotRepo.save(this.snapshotRepo.create({
        kind, scope, data, fetchedAt: new Date(), lastError: null,
      }));
    }
  }

  private async markSnapshotError(kind: string, scope: string, message: string) {
    const existing = await this.snapshotRepo.findOne({ where: { kind, scope } });
    if (existing) {
      existing.lastError = message.slice(0, 500);
      await this.snapshotRepo.save(existing);
    }
  }

  // ── OT rows materialized sync ────────────────────────────────────────────────

  // Gate: respects the 60s startup delay and the OT_SYNC_INTERVAL_MS cadence.
  // Called from syncAll() after the advisor-slot branch — failure here is fully isolated.
  async maybeRunOtRowsSync(): Promise<void> {
    if (!this.otSyncReady) {
      this.logger.debug('OT rows sync omitido: aún en período de startup delay');
      return;
    }
    if (this.lastOtSyncAt !== null) {
      const elapsed = Date.now() - this.lastOtSyncAt.getTime();
      if (elapsed < OT_SYNC_INTERVAL_MS) {
        this.logger.debug(
          `OT rows sync omitido: solo transcurrieron ${Math.round(elapsed / 1000)}s de ` +
          `${Math.round(OT_SYNC_INTERVAL_MS / 1000)}s requeridos`,
        );
        return;
      }
    }
    try {
      await this.syncOtRows();
    } catch (err: any) {
      // Log but never throw — advisor-slot path must be unaffected.
      this.logger.error(`syncOtRows falló: ${err.message}`, err.stack);
    }
  }

  // Upserts the full open set + recently-closed OTs from DMS into dms_ot_rows.
  // Uses raw SQL ON CONFLICT for atomic batch upsert (same pattern as advisor-slots).
  async syncOtRows(): Promise<void> {
    if (!process.env.DMS_HOST) {
      this.logger.warn('DMS_HOST no configurado, salteando syncOtRows');
      return;
    }

    const tickStart = new Date();

    // 1. Read last sync state
    const state = await this.stateRepo.findOne({ where: { kind: 'ot_rows' } });
    const lastSync = state?.lastSyncAt ?? null;

    // 2 + 3. Fetch open + recently closed OTs in one connection
    const { openOts, closedOts } = await this.fetchOtsBatch(lastSync);

    // 4. Upsert all rows — deduplicate by nroot (DMS can have duplicate nroot rows)
    const allOts = [...new Map([...openOts, ...closedOts].map(r => [r.nroot, r])).values()];
    if (allOts.length > 0) {
      const BATCH = 500;
      for (let i = 0; i < allOts.length; i += BATCH) {
        await this.dataSource
          .createQueryBuilder()
          .insert()
          .into(DmsOtRow)
          .values(allOts.slice(i, i + BATCH))
          .orUpdate(
            [
              'nrocliente', 'nombrecliente', 'chasis', 'modelo',
              'estado_ot', 'estado_taller', 'estado_financiero',
              'asesor', 'taller', 'sucursal_desc',
              'fecha_ingreso', 'hora_ingreso',
              'fecha_compromiso_cliente', 'fecha_cierre_ot', 'fecha_fin_taller',
              'monto', 'idtiposervicio', 'tipo_desc', 'tipo_abrev', 'codcliente', 'synced_at',
            ],
            ['nroot'],
          )
          .execute();
      }
    }

    // 5. Update sync state
    await this.stateRepo.upsert(
      {
        kind:         'ot_rows',
        lastSyncAt:   tickStart,
        openCount:    openOts.length,
        totalSynced:  allOts.length,
        errorMessage: null as unknown as string,
        updatedAt:    new Date(),
      },
      ['kind'],
    );

    this.lastOtSyncAt = tickStart;
    this.logger.log(
      `OK syncOtRows → ${openOts.length} open + ${closedOts.length} closed = ${allOts.length} total`,
    );
  }

  // Opens one pool, runs open + closed queries, closes pool once
  private async fetchOtsBatch(lastSync: Date | null): Promise<{
    openOts: Partial<DmsOtRow>[];
    closedOts: Partial<DmsOtRow>[];
  }> {
    let pool: sql.ConnectionPool | null = null;
    try {
      pool = await getDmsPool();

      const openReq = pool.request();
      const openResult = await openReq.query(this.buildOtQuery("WHERE m.EstadoOT = 'Abierto'"));

      let closedResult: { recordset: any[] } = { recordset: [] };
      if (lastSync) {
        const closedReq = pool.request();
        closedReq.input('closedSince', sql.DateTime, new Date(lastSync.getTime() - 2 * 60 * 60 * 1000));
        closedResult = await closedReq.query(this.buildOtQuery('WHERE m.fecha_cierre_ot >= @closedSince'));
      }

      const now = new Date();
      const mapRow = (r: any): Partial<DmsOtRow> => ({
        nroot:                  Number(r.nroot),
        nrocliente:             String(r.nrocliente ?? '').trim() || null,
        nombrecliente:          String(r.nombrecliente ?? '').trim() || null,
        chasis:                 String(r.chasis ?? '').trim() || null,
        modelo:                 String(r.modelo ?? '').trim() || null,
        estadoOt:               String(r.estado_ot ?? '').trim() || null,
        estadoTaller:           String(r.estado_taller ?? '').trim() || null,
        estadoFinanciero:       String(r.estado_financiero ?? '').trim() || null,
        asesor:                 String(r.asesor ?? '').trim() || null,
        taller:                 r.taller != null ? Number(r.taller) : null,
        sucursalDesc:           String(r.sucursal_desc ?? '').trim() || null,
        fechaIngreso:           r.fecha_ingreso ? new Date(r.fecha_ingreso) : null,
        horaIngreso:            r.hora_ingreso ? String(r.hora_ingreso).trim() || null : null,
        fechaCompromisoCliente: r.fecha_compromiso_cliente ? new Date(r.fecha_compromiso_cliente) : null,
        fechaCierreOt:          r.fecha_cierre_ot ? new Date(r.fecha_cierre_ot) : null,
        fechaFinTaller:         r.fecha_fin_taller ? new Date(r.fecha_fin_taller) : null,
        monto:                  r.monto != null ? Number(r.monto) : null,
        idTipoServicio:         r.idtiposervicio != null ? Number(r.idtiposervicio) : null,
        tipoDesc:               String(r.tipo_desc ?? '').trim() || null,
        tipoAbrev:              String(r.tipo_abrev ?? '').trim() || null,
        codcliente:             String(r.codcliente ?? '').trim() || null,
        syncedAt:               now,
      });

      return {
        openOts:   (openResult.recordset as any[]).map(mapRow),
        closedOts: (closedResult.recordset as any[]).map(mapRow),
      };
    } finally {
      await pool?.close();
    }
  }

  private buildOtQuery(whereClause: string): string {
    return `
      SELECT
        m.nroot,
        LTRIM(RTRIM(m.nrocliente))             AS nrocliente,
        LTRIM(RTRIM(m.nombrecliente))           AS nombrecliente,
        LTRIM(RTRIM(m.chasis))                  AS chasis,
        LTRIM(RTRIM(m.modelo))                  AS modelo,
        LTRIM(RTRIM(m.EstadoOT))               AS estado_ot,
        LTRIM(RTRIM(m.EstadoTaller))            AS estado_taller,
        LTRIM(RTRIM(m.Estadofinanciero))        AS estado_financiero,
        LTRIM(RTRIM(m.asesor))                  AS asesor,
        m.taller,
        ISNULL(LTRIM(RTRIM(s.Descripcion)), '') AS sucursal_desc,
        m.fechaingreso                           AS fecha_ingreso,
        m.horaingreso                            AS hora_ingreso,
        m.fechacompromisoCliente                 AS fecha_compromiso_cliente,
        m.fecha_cierre_ot,
        m.fecha_fin_taller,
        CAST(m.monto AS FLOAT)                  AS monto,
        m.idtiposervicio,
        ISNULL(LTRIM(RTRIM(ts.descripcion)), '') AS tipo_desc,
        ISNULL(LTRIM(RTRIM(ts.abreviatura)), '') AS tipo_abrev,
        NULL                                    AS codcliente
      FROM dbo.MasterOT_Condor m
      LEFT JOIN dbo.controltiempo_DimSucursal s
             ON s.IdSucursal = m.taller
      LEFT JOIN dbo.controltiempo_DimTipoServicio ts
             ON ts.idtipo_servicio = m.idtiposervicio
      ${whereClause}
    `;
  }

  private async fetchOtsFromDms(
    opts: { onlyOpen?: boolean; closedSince?: Date },
  ): Promise<Partial<DmsOtRow>[]> {
    let pool: sql.ConnectionPool | null = null;
    try {
      pool = await getDmsPool();
      const request = pool.request();

      let whereClause: string;
      if (opts.onlyOpen) {
        whereClause = "WHERE m.EstadoOT = 'Abierto'";
      } else if (opts.closedSince) {
        request.input('closedSince', sql.DateTime, opts.closedSince);
        whereClause = 'WHERE m.fecha_cierre_ot >= @closedSince';
      } else {
        whereClause = '';
      }

      const result = await request.query(`
        SELECT
          m.nroot,
          LTRIM(RTRIM(m.nrocliente))             AS nrocliente,
          LTRIM(RTRIM(m.nombrecliente))           AS nombrecliente,
          LTRIM(RTRIM(m.chasis))                  AS chasis,
          LTRIM(RTRIM(m.modelo))                  AS modelo,
          LTRIM(RTRIM(m.EstadoOT))               AS estado_ot,
          LTRIM(RTRIM(m.EstadoTaller))            AS estado_taller,
          LTRIM(RTRIM(m.Estadofinanciero))        AS estado_financiero,
          LTRIM(RTRIM(m.asesor))                  AS asesor,
          m.taller,
          ISNULL(LTRIM(RTRIM(s.Descripcion)), '') AS sucursal_desc,
          m.fechaingreso                           AS fecha_ingreso,
          m.horaingreso                            AS hora_ingreso,
          m.fechacompromisoCliente                 AS fecha_compromiso_cliente,
          m.fecha_cierre_ot,
          m.fecha_fin_taller,
          CAST(m.monto AS FLOAT)                  AS monto,
          m.idtiposervicio,
          ISNULL(LTRIM(RTRIM(ts.descripcion)), '') AS tipo_desc,
          ISNULL(LTRIM(RTRIM(ts.abreviatura)), '') AS tipo_abrev,
          NULL                                    AS codcliente
        FROM dbo.MasterOT_Condor m
        LEFT JOIN dbo.controltiempo_DimSucursal s
               ON s.IdSucursal = m.taller
        LEFT JOIN dbo.controltiempo_DimTipoServicio ts
               ON ts.idtipo_servicio = m.idtiposervicio
        ${whereClause}
      `);

      const now = new Date();
      return (result.recordset as any[]).map(r => ({
        nroot:                  Number(r.nroot),
        nrocliente:             String(r.nrocliente ?? '').trim() || null,
        nombrecliente:          String(r.nombrecliente ?? '').trim() || null,
        chasis:                 String(r.chasis ?? '').trim() || null,
        modelo:                 String(r.modelo ?? '').trim() || null,
        estadoOt:               String(r.estado_ot ?? '').trim() || null,
        estadoTaller:           String(r.estado_taller ?? '').trim() || null,
        estadoFinanciero:       String(r.estado_financiero ?? '').trim() || null,
        asesor:                 String(r.asesor ?? '').trim() || null,
        taller:                 r.taller != null ? Number(r.taller) : null,
        sucursalDesc:           String(r.sucursal_desc ?? '').trim() || null,
        fechaIngreso:           r.fecha_ingreso ? new Date(r.fecha_ingreso) : null,
        horaIngreso:            r.hora_ingreso ? String(r.hora_ingreso).trim() || null : null,
        fechaCompromisoCliente: r.fecha_compromiso_cliente ? new Date(r.fecha_compromiso_cliente) : null,
        fechaCierreOt:          r.fecha_cierre_ot ? new Date(r.fecha_cierre_ot) : null,
        fechaFinTaller:         r.fecha_fin_taller ? new Date(r.fecha_fin_taller) : null,
        monto:                  r.monto != null ? Number(r.monto) : null,
        idTipoServicio:         r.idtiposervicio != null ? Number(r.idtiposervicio) : null,
        tipoDesc:               String(r.tipo_desc ?? '').trim() || null,
        tipoAbrev:              String(r.tipo_abrev ?? '').trim() || null,
        codcliente:             String(r.codcliente ?? '').trim() || null,
        syncedAt:               now,
      }));
    } finally {
      await pool?.close();
    }
  }

  // ── Push agendamiento al DMS ─────────────────────────────────────────────────
  // Fire-and-forget: nunca bloquea la creación del turno en nuestro sistema.
  // Si el DMS no responde o devuelve error, se loguea y se ignora.
  async pushToAgendamiento(payload: {
    title: string;
    start_date: string;
    start_time: string;
    end_time: string;
    IdAsesor: string;
    idSucursal?: string | number | null;
    NombreCliente: string;
    Telefono: string;
    Vehiculo: string;
    Matricula: string;
    Chasis?: string;
    description: string;
    AgendadoPor?: string;
  }): Promise<{ success: boolean; dmsId?: string; error?: string }> {
    const url = process.env.DMS_AGENDAMIENTO_URL;
    if (!url) {
      this.logger.warn('DMS_AGENDAMIENTO_URL no configurada — push omitido');
      return { success: false, error: 'URL no configurada' };
    }
    const t0 = Date.now();
    const now = new Date();
    const fechaCreacion = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    try {
      const res  = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ...payload,
          end_date:              payload.start_date,
          category:              1,
          IdSucursal:            payload.idSucursal ? Number(payload.idSucursal) : undefined,
          IdEstadoAgendamiento:  1,
          IdAgendamientoTipo:    2,
          recurrence:            'N',
          AgendadoPor:           payload.AgendadoPor ?? 'sistema',
          FechaCreacion:         fechaCreacion,
          UsuarioCreacion:       payload.AgendadoPor ?? 'sistema',
        }),
        signal:  AbortSignal.timeout(8_000),
      });
      const json = await res.json().catch(() => null) as any;
      if (res.ok && json?.success) {
        this.logger.log(`DMS agendamiento OK [${res.status}] ${Date.now() - t0}ms id=${json.id} — ${payload.NombreCliente} ${payload.start_date}`);
        return { success: true, dmsId: String(json.id ?? '') };
      }
      const errMsg = json?.message ?? `HTTP ${res.status}`;
      this.logger.warn(`DMS agendamiento rechazado: ${errMsg}`);
      return { success: false, error: errMsg };
    } catch (err: any) {
      this.logger.warn(`DMS agendamiento falló (${Date.now() - t0}ms): ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}
