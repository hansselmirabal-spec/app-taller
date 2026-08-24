import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository, In, EntityManager } from 'typeorm';
import { TrackingLog } from './tracking-log.entity';
import { Appointment } from '../appointments/appointment.entity';
import { BodyshopEntry } from '../bodyshop/bodyshop-entry.entity';
import { BodyshopProcessTech } from '../bodyshop/bodyshop-process-tech.entity';
import { Workshop } from '../workshops/workshop.entity';

const DEVIATION_ORANGE_THRESHOLD = 2;
const WORK_HOURS_PER_DAY = 8;

const BODYSHOP_PROCESS_ORDER: Record<string, number> = {
  BODYWORK:      1,
  PREP:          2,
  PAINT:         3,
  POLISH:        4,
  MECHANIC:      5,
  FINAL_CONTROL: 6,
};

const BODYSHOP_PROCESS_NAMES: Record<string, string> = {
  BODYWORK:      'Chapería',
  PREP:          'Preparación',
  PAINT:         'Pintura',
  POLISH:        'Pulido',
  MECHANIC:      'Mecánica',
  FINAL_CONTROL: 'Control Final',
  // Paralelos agregables post-creación vía addProcessToBodyshop (ver más abajo).
  // Sin columna dedicada en bodyshop_entries — solo viven en tracking_logs +
  // entry.processes (jsonb).
  DIAMANTADO:    'Diamantado',
  LLANTAS:       'Llantas',
  ELECTRICO:     'Eléctrico',
};

// Procesos que son PARALELOS por defecto (pueden correr junto al flujo madre)
const BODYSHOP_PARALLEL_CODES = new Set(['MECHANIC', 'DIAMANTADO', 'LLANTAS', 'ELECTRICO']);

// Entradas en estado terminal no admiten agregar procesos nuevos (spec
// tracking-add-process: "Rejected when entry status is cancelled/terminated").
const BODYSHOP_TERMINAL_STATUSES = new Set(['cancelled', 'done']);

// Descriptor compartido: TrackingLog y entry.processes (jsonb) deben nacer con
// el mismo code/name/hours para no desincronizarse (spec: "Transactional
// dual-write consistency"). Única fuente de verdad para nombre/orden.
function buildBodyshopProcessDescriptor(
  code: string,
  hours: number,
): { code: string; name: string; order: number; hours: number } {
  return {
    code,
    name:  BODYSHOP_PROCESS_NAMES[code] ?? code,
    order: BODYSHOP_PROCESS_ORDER[code] ?? 99,
    hours,
  };
}

// Añade N días hábiles (lun-sáb) a una fecha YYYY-MM-DD
function addBusinessDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0) added++; // salta domingos
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Fecha sugerida de salida: entry.date + max(1, ⌈hours/8⌉) días hábiles
// El primer día hábil es el colchón (no se trabaja el día de entrada)
function suggestExitDate(entryDate: string, plannedHours: number): string {
  const days = Math.max(1, Math.ceil(plannedHours / WORK_HOURS_PER_DAY));
  return addBusinessDays(entryDate, days);
}

export interface ProcessSummary {
  logId: string;
  processCode: string;
  processName: string;
  processType: 'MOTHER' | 'PARALLEL';
  orderIndex: number;
  plannedHours: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  status: string;
  realHours: number | null;
  deviation: number | null;
  pausedDurationMinutes: number;
  technicianId: string | null;
  technicianName: string | null;
}

export interface TrackingCard {
  id: string;
  sourceId: string;
  sourceType: 'mechanic' | 'bodyshop';
  status: string;
  plate: string;
  customerName: string;
  vehicleType: string | null;
  techName: string | null;
  serviceOrType: string | null;
  currentProcess: {
    logId: string;
    processCode: string;
    processName: string;
    orderIndex: number;
    plannedHours: number;
    startedAt: string | null;
    status: string;
    blockedReason: string | null;
    canReturn: boolean;
    previousProcessName: string | null;
  } | null;
  plannedTotalHours: number;
  realTotalHours: number;
  deviationTotal: number;
  overdueHours: number;
  semaphore: 'green' | 'normal' | 'red' | 'orange';
  allProcesses: ProcessSummary[];
  motherProcesses: ProcessSummary[];
  parallelProcesses: ProcessSummary[];
  parallelBlocking: boolean;
  entryDate: string | null;
  exitDate: string | null;
  suggestedExitDate: string | null;
  waitingForResource: boolean;
  resourceNote: string | null;
  resourceBlockedAt: string | null;
  advisorTime: string | null;
  noStartAt: string | null;
  noStartHoursLost: number | null;
}

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(
    @InjectRepository(TrackingLog)
    private readonly logRepo: Repository<TrackingLog>,
    @InjectRepository(Appointment)
    private readonly apptRepo: Repository<Appointment>,
    @InjectRepository(BodyshopEntry)
    private readonly entryRepo: Repository<BodyshopEntry>,
    @InjectRepository(BodyshopProcessTech)
    private readonly processTechRepo: Repository<BodyshopProcessTech>,
    @InjectRepository(Workshop)
    private readonly workshopRepo: Repository<Workshop>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // El técnico real de un log vive afuera de tracking_logs: en
  // bodyshop_process_techs (por proceso) para bodyshop, o en
  // appointments.technician_id para mecánica. tracking_logs.technician_id
  // solo se llena cuando alguien pasa el parámetro explícito a startProcess
  // — que la UI nunca hace — así que sin esto la validación de concurrencia
  // nunca tiene a quién comparar.
  private async resolveAssignedTechnician(log: TrackingLog): Promise<{ id: string; name: string } | null> {
    if (log.sourceType === 'bodyshop') {
      const pt = await this.processTechRepo.findOne({
        where: { entryId: log.sourceId, process: log.processCode },
        relations: ['technician'],
      });
      if (!pt) return null;
      return { id: pt.technicianId, name: pt.technician?.name ?? '' };
    }
    if (log.sourceType === 'mechanic') {
      const appt = await this.apptRepo.findOne({ where: { id: log.sourceId }, relations: ['technician'] });
      if (!appt?.technicianId) return null;
      return { id: appt.technicianId, name: appt.technician?.name ?? '' };
    }
    return null;
  }

  // ── Inicialización ──────────────────────────────────────────────────────────

  async initForMechanic(appointmentId: string, processName: string, plannedHours: number): Promise<void> {
    const existing = await this.logRepo.findOne({ where: { sourceType: 'mechanic', sourceId: appointmentId } });
    if (existing) return;
    await this.logRepo.save([
      this.logRepo.create({
        sourceType:  'mechanic',
        sourceId:    appointmentId,
        processName: 'Agendado',
        processCode: 'AGENDA',
        orderIndex:  0,
        plannedHours: 0.5,
        status:      'in_progress',
        startedAt:   new Date(),
      }),
      this.logRepo.create({
        sourceType:  'mechanic',
        sourceId:    appointmentId,
        processName,
        processCode: 'MECHANIC',
        orderIndex:  1,
        plannedHours,
        status:      'pending',
      }),
    ]);
  }

  async initForBodyshop(entryId: string, processes: { name: string; code: string; order: number; hours: number; processType?: 'MOTHER' | 'PARALLEL' }[]): Promise<void> {
    const existing = await this.logRepo.findOne({ where: { sourceType: 'bodyshop', sourceId: entryId } });
    if (existing) return;
    const valid = processes.filter(p => p.hours > 0);
    if (valid.length === 0) return;
    await this.logRepo.save([
      this.logRepo.create({
        sourceType:  'bodyshop',
        sourceId:    entryId,
        processName: 'Agendado',
        processCode: 'AGENDA',
        orderIndex:  0,
        plannedHours: 0,
        processType: 'MOTHER',
        status:      'in_progress',
        startedAt:   new Date(),
      }),
      ...valid.map(p => this.logRepo.create({
        sourceType:  'bodyshop',
        sourceId:    entryId,
        processName: p.name,
        processCode: p.code,
        orderIndex:  p.order,
        plannedHours: p.hours,
        processType: p.processType ?? (BODYSHOP_PARALLEL_CODES.has(p.code) ? 'PARALLEL' : 'MOTHER'),
        status:      'pending',
      })),
    ]);
  }

  // Cuando se ajustan las horas de un ingreso desde Agenda ("Ajustar horas
  // reales"), eso solo tocaba bodyshop_entries y regeneraba los slots de
  // agenda (recalculateSchedule) — nunca sincronizaba tracking_logs.planned_hours,
  // que es lo que lee el Kanban/Seguimiento para "Duración plan". Las dos
  // vistas quedaban desincronizadas (bug reportado en QA). No toca procesos ya
  // 'completed': cambiar el plan de un trabajo ya cerrado corrompería el
  // desvío real-vs-plan ya calculado para ese proceso.
  async syncBodyshopPlannedHours(entryId: string, hoursByCode: Record<string, number>): Promise<void> {
    const codes = Object.keys(hoursByCode);
    if (codes.length === 0) return;
    const logs = await this.logRepo.find({
      where: { sourceType: 'bodyshop', sourceId: entryId, processCode: In(codes) },
    });
    for (const log of logs) {
      if (log.status === 'completed') continue;
      const newHours = hoursByCode[log.processCode];
      if (newHours === undefined || Number(log.plannedHours) === Number(newHours)) continue;
      log.plannedHours = newHours;
      await this.logRepo.save(log);
    }
  }

  // Agrega un proceso PARALELO (MECHANIC/DIAMANTADO/LLANTAS/ELECTRICO) a un
  // ingreso de bodyshop ya existente, en cualquier momento después de su
  // creación. Dual-write atómico: TrackingLog nuevo + entry.processes (jsonb)
  // deben quedar consistentes — si cualquiera de los dos writes falla, ninguno
  // persiste (spec tracking-add-process, requerimiento "transactional dual-write
  // consistency"). No usa entryRepo.save(entry completo) para no pisar cambios
  // concurrentes en otras columnas: solo toca `processes`.
  async addProcessToBodyshop(entryId: string, processCode: string, hours: number): Promise<TrackingLog> {
    if (!BODYSHOP_PARALLEL_CODES.has(processCode)) {
      throw new BadRequestException(
        `Solo se pueden agregar procesos paralelos (${[...BODYSHOP_PARALLEL_CODES].join(', ')}). "${processCode}" es un proceso madre.`,
      );
    }

    const entry = await this.entryRepo.findOne({ where: { id: entryId } as any });
    if (!entry) throw new NotFoundException('Entrada no encontrada');
    if (BODYSHOP_TERMINAL_STATUSES.has((entry as any).status)) {
      throw new BadRequestException('No se puede agregar un proceso a una entrada cancelada o finalizada');
    }

    const currentProcesses: { code: string; name: string; hours: number }[] = (entry as any).processes ?? [];
    const alreadyInProcesses = currentProcesses.some(p => p.code === processCode);
    const existingLog = await this.logRepo.findOne({
      where: { sourceType: 'bodyshop', sourceId: entryId, processCode },
    });
    if (alreadyInProcesses || existingLog) {
      throw new BadRequestException(`El proceso "${processCode}" ya existe en esta entrada`);
    }

    const descriptor = buildBodyshopProcessDescriptor(processCode, hours);

    return this.dataSource.transaction(async manager => {
      const log = manager.create(TrackingLog, {
        sourceType:  'bodyshop',
        sourceId:    entryId,
        processName: descriptor.name,
        processCode: descriptor.code,
        orderIndex:  descriptor.order,
        plannedHours: hours,
        processType: 'PARALLEL',
        status:      'pending',
      });
      const savedLog = await manager.save(TrackingLog, log);

      const updatedProcesses = [
        ...currentProcesses,
        { code: descriptor.code, name: descriptor.name, hours },
      ];
      await manager.save(BodyshopEntry, { ...entry, processes: updatedProcesses });

      return savedLog;
    });
  }

  // ── Acciones ────────────────────────────────────────────────────────────────

  // Serializa cualquier sección crítica de un técnico (chequeo de conflicto +
  // escritura) contra llamadas concurrentes al mismo técnico, incluso entre
  // instancias distintas del backend — pg_advisory_xact_lock es a nivel DB, no
  // en memoria del proceso Node. Se libera solo al terminar la transacción
  // (commit o rollback), nunca hay que soltarlo a mano.
  private async withTechnicianLock<T>(technicianId: string, fn: (manager: EntityManager) => Promise<T>): Promise<T> {
    try {
      return await this.dataSource.transaction(async manager => {
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [technicianId]);
        return fn(manager);
      });
    } catch (err: any) {
      // Red de seguridad a nivel DB (índice único parcial en tracking_logs,
      // migración 011): si por lo que sea dos transacciones lo esquivan, el
      // constraint devuelve 23505 en vez de dejar pasar el duplicado.
      if (err?.code === '23505' && err?.constraint === 'tracking_logs_one_in_progress_per_technician') {
        throw new BadRequestException('Ese técnico ya está trabajando en otro vehículo. Hay que pausarlo o completarlo antes de continuar.');
      }
      throw err;
    }
  }

  async startProcess(logId: string, technicianId?: string, technicianName?: string): Promise<TrackingLog> {
    const log = await this.logRepo.findOne({ where: { id: logId } });
    if (!log) throw new NotFoundException('Proceso no encontrado');
    if (log.status === 'completed') throw new BadRequestException('El proceso ya está completado');

    // Un técnico no puede quedar "in_progress" en dos vehículos a la vez —
    // corrompería horas reales y KPIs de productividad si no se valida acá.
    // El botón "Iniciar" del kanban llama startProcess(logId) sin pasar
    // technicianId, y tracking_logs.technician_id NUNCA se llena solo (no hay
    // ningún otro lugar del código que lo escriba) — el técnico real vive en
    // bodyshop_process_techs (por proceso) o en appointments.technician_id.
    // Sin resolverlo desde ahí, effectiveTechnicianId queda siempre undefined
    // y la validación nunca se ejecuta (bug reportado en QA: 6 vehículos
    // simultáneos al mismo técnico, ninguno rechazado).
    let effectiveTechnicianId   = technicianId ?? log.technicianId ?? undefined;
    let effectiveTechnicianName = technicianName ?? log.technicianName ?? undefined;
    if (!effectiveTechnicianId) {
      const assigned = await this.resolveAssignedTechnician(log);
      if (assigned) {
        effectiveTechnicianId   = assigned.id;
        effectiveTechnicianName = assigned.name || undefined;
      }
    }

    const applyStart = async (manager: EntityManager) => {
      if (log.processType === 'PARALLEL') {
        // Un paralelo (ej. Mecánica) se hace afuera de Chapería: no consume
        // técnicos del taller, pero mientras está en curso el vehículo no se
        // puede seguir trabajando adentro. Al arrancarlo, pausamos el proceso
        // madre activo (mismo mecanismo que blockProcess) con motivo = el
        // nombre del paralelo, para que quede contado en el reloj de pausas y
        // el operario deba reanudar explícitamente (con confirmación de
        // técnico) cuando el paralelo termine. Confirmado con negocio 2026-07-31.
        const activeMother = await manager.findOne(TrackingLog, {
          where: { sourceType: log.sourceType, sourceId: log.sourceId, status: 'in_progress', processType: 'MOTHER' } as any,
        });
        if (activeMother) {
          await this.pauseLog(activeMother, log.processName);
          await this.setPauseStatus(log.sourceType, log.sourceId, true);
        }
      } else {
        // MOTHER: solo un proceso madre in_progress por source a la vez.
        // Se cambia a 'pending' pero se preserva startedAt para no corromper
        // el cálculo de horas reales ni los semáforos de tiempo.
        await manager
          .createQueryBuilder()
          .update(TrackingLog)
          .set({ status: 'pending' })
          .where('source_type = :st AND source_id = :si AND status = :s AND process_type = :pt', {
            st: log.sourceType, si: log.sourceId, s: 'in_progress', pt: 'MOTHER',
          })
          .execute();
      }

      log.status = 'in_progress';
      log.startedAt = new Date();
      log.completedAt = null;
      // Persistir el técnico resuelto (aunque haya venido del fallback, no de un
      // parámetro explícito) para que quede consistente de acá en más: futuros
      // chequeos de conflicto, reportes de productividad y la tarjeta del kanban.
      if (effectiveTechnicianId)   log.technicianId   = effectiveTechnicianId;
      if (effectiveTechnicianName) log.technicianName = effectiveTechnicianName;
      return manager.save(TrackingLog, log);
    };

    // Sin técnico resuelto no hay conflicto posible que serializar.
    if (!effectiveTechnicianId) return applyStart(this.logRepo.manager);

    return this.withTechnicianLock(effectiveTechnicianId, async manager => {
      const conflict = await manager.findOne(TrackingLog, {
        where: { technicianId: effectiveTechnicianId, status: 'in_progress' },
      });
      if (conflict && conflict.id !== logId && conflict.sourceId !== log.sourceId) {
        throw new BadRequestException(
          `${conflict.technicianName || effectiveTechnicianName || 'El técnico'} ya está trabajando en otro vehículo (proceso "${conflict.processName}"). Hay que pausarlo o completarlo antes de iniciar este.`,
        );
      }
      return applyStart(manager);
    });
  }

  // Snapshotea técnico + marca 'blocked' + libera bodyshop_process_techs.
  // Compartido por blockProcess (pausa manual) y por startProcess cuando un
  // paralelo (ej. Mecánica) pausa automáticamente el proceso madre activo.
  private async pauseLog(log: TrackingLog, reason: string): Promise<TrackingLog> {
    // Snapshot del técnico asignado ANTES de borrar bodyshop_process_techs — así
    // getResumeOptions puede sugerir "el mismo técnico de antes" incluso después
    // de liberar su capacidad (spec: "suggest same technician if still free").
    // Solo si el log todavía no lo tenía (no pisar un snapshot previo).
    if (!log.technicianId) {
      const assigned = await this.resolveAssignedTechnician(log);
      if (assigned) {
        log.technicianId = assigned.id;
        log.technicianName = assigned.name || null;
      }
    }

    log.status = 'blocked';
    log.blockedReason = reason;
    log.pausedAt = new Date();
    const saved = await this.logRepo.save(log);

    // Libera la capacidad del técnico: BORRA (no anula) la fila de
    // bodyshop_process_techs para que deje de sumar horas ocupadas en
    // getTechnicianAvailability/getDayCapacity mientras está pausado (spec
    // tracking-pause-technician-release, alcance: los 6 procesos reales de
    // Chapería — solo sourceType 'bodyshop', que es donde vive esa tabla).
    // No-op si el proceso no tenía técnico asignado (ej. MECHANIC paralelo sin
    // auto-asignación) — TypeORM `delete` no falla si no matchea ninguna fila.
    if (log.sourceType === 'bodyshop') {
      await this.processTechRepo.delete({ entryId: log.sourceId, process: log.processCode });
    }

    return saved;
  }

  async blockProcess(logId: string, reason: string): Promise<TrackingLog> {
    const log = await this.logRepo.findOne({ where: { id: logId } });
    if (!log) throw new NotFoundException('Proceso no encontrado');
    if (log.status === 'completed') throw new BadRequestException('No se puede pausar un proceso completado');

    const saved = await this.pauseLog(log, reason);

    // Liberar capacidad del técnico marcando el appointment/entry como 'paused'
    await this.setPauseStatus(log.sourceType, log.sourceId, true);

    return saved;
  }

  // Reutiliza el mismo criterio de conflicto que startProcess: un técnico no
  // puede figurar in_progress en dos logs a la vez. excludeLogId excluye el
  // propio log del chequeo.
  private async findTechnicianConflict(technicianId: string, excludeLogId?: string): Promise<TrackingLog | null> {
    const conflict = await this.logRepo.findOne({
      where: { technicianId, status: 'in_progress' },
    });
    if (!conflict) return null;
    if (excludeLogId && conflict.id === excludeLogId) return null;
    return conflict;
  }

  private async isTechnicianFree(technicianId: string, excludeLogId?: string): Promise<boolean> {
    return (await this.findTechnicianConflict(technicianId, excludeLogId)) === null;
  }

  async unblockProcess(logId: string, technicianId?: string, technicianName?: string): Promise<TrackingLog> {
    const log = await this.logRepo.findOne({ where: { id: logId } });
    if (!log) throw new NotFoundException('Proceso no encontrado');
    if (log.status !== 'blocked') throw new BadRequestException('El proceso no está pausado');

    // Reanudar SIEMPRE requiere confirmación explícita de técnico (spec:
    // "Resume always requires explicit technician confirmation") — la UI manda
    // el técnico confirmado; si no lo manda, cae al snapshot dejado por
    // blockProcess (compat hacia atrás / caso tech-less).
    const effectiveTechnicianId   = technicianId ?? log.technicianId ?? undefined;
    const effectiveTechnicianName = technicianName ?? log.technicianName ?? undefined;

    const applyUnblock = async (manager: EntityManager) => {
      log.status = log.startedAt ? 'in_progress' : 'pending';
      log.blockedReason = null;
      if (log.pausedAt) {
        const deltaMins = (Date.now() - log.pausedAt.getTime()) / 60_000;
        log.pausedDurationMinutes = (log.pausedDurationMinutes ?? 0) + deltaMins;
        log.pausedAt = null;
      }
      if (effectiveTechnicianId)   log.technicianId   = effectiveTechnicianId;
      if (effectiveTechnicianName) log.technicianName = effectiveTechnicianName;
      const saved = await manager.save(TrackingLog, log);

      // Recrea la fila de bodyshop_process_techs borrada en blockProcess — vuelve
      // a sumar horas ocupadas del técnico confirmado. Upsert por unique key
      // (entryId, process), mismo patrón que assignProcessTechnician en
      // bodyshop.service.ts.
      if (log.sourceType === 'bodyshop' && effectiveTechnicianId) {
        const existing = await manager.findOne(BodyshopProcessTech, {
          where: { entryId: log.sourceId, process: log.processCode },
        });
        if (existing) {
          existing.technicianId = effectiveTechnicianId;
          await manager.save(BodyshopProcessTech, existing);
        } else {
          await manager.save(BodyshopProcessTech,
            manager.create(BodyshopProcessTech, { entryId: log.sourceId, process: log.processCode, technicianId: effectiveTechnicianId }),
          );
        }
      }

      return saved;
    };

    const saved = effectiveTechnicianId
      ? await this.withTechnicianLock(effectiveTechnicianId, async manager => {
          const conflict = await manager.findOne(TrackingLog, {
            where: { technicianId: effectiveTechnicianId, status: 'in_progress' },
          });
          if (conflict && conflict.id !== logId) {
            throw new BadRequestException(
              `${conflict.technicianName || effectiveTechnicianName || 'El técnico'} ya está trabajando en otro vehículo (proceso "${conflict.processName}"). Hay que pausarlo o completarlo antes de reanudar este.`,
            );
          }
          return applyUnblock(manager);
        })
      : await applyUnblock(this.logRepo.manager);

    // Solo restaurar si no hay otros procesos bloqueados para el mismo origen
    const otherBlocked = await this.logRepo.findOne({
      where: { sourceType: log.sourceType, sourceId: log.sourceId, status: 'blocked' },
    });
    if (!otherBlocked) {
      const hasInProgress = await this.logRepo.findOne({
        where: { sourceType: log.sourceType, sourceId: log.sourceId, status: 'in_progress' },
      });
      await this.setPauseStatus(log.sourceType, log.sourceId, false, !!hasInProgress);
    }

    return saved;
  }

  // GET tracking/process/:logId/resume-options — sugiere al operador con quién
  // reanudar: el técnico que estaba antes de pausar (si sigue libre) o, si está
  // ocupado en otro proceso, el nombre de ese proceso para que el frontend
  // muestre el conflicto y ofrezca elegir otro (spec: "Unavailable suggested
  // technician does not block resume").
  async getResumeOptions(logId: string): Promise<{
    previousTechnicianId: string | null;
    previousTechnicianName: string | null;
    previousTechnicianFree: boolean;
    conflictProcessName: string | null;
  }> {
    const log = await this.logRepo.findOne({ where: { id: logId } });
    if (!log) throw new NotFoundException('Proceso no encontrado');

    const previousTechnicianId   = log.technicianId   ?? null;
    const previousTechnicianName = log.technicianName ?? null;
    if (!previousTechnicianId) {
      return { previousTechnicianId: null, previousTechnicianName: null, previousTechnicianFree: false, conflictProcessName: null };
    }

    const conflict = await this.findTechnicianConflict(previousTechnicianId, logId);
    return {
      previousTechnicianId,
      previousTechnicianName,
      previousTechnicianFree: !conflict,
      conflictProcessName: conflict?.processName ?? null,
    };
  }

  // PATCH tracking/process/:logId/return — devuelve el proceso MADRE actual
  // al proceso MADRE inmediatamente anterior (D4/pickPreviousMother), dentro
  // de una única transacción vía withTechnicianLock (mismo candado que
  // startProcess/unblockProcess, línea 321) para que el índice único parcial
  // tracking_logs_one_in_progress_per_technician (migración 011) nunca vea un
  // estado intermedio inconsistente.
  async returnToProcess(
    logId: string,
    reason: string,
    technicianId: string,
    technicianName?: string,
  ): Promise<TrackingLog> {
    const log = await this.logRepo.findOne({ where: { id: logId } });
    if (!log) throw new NotFoundException('Proceso no encontrado');

    // Requisito 8 (spec): solo procesos MADRE se pueden devolver — un
    // paralelo (ej. Mecánica) no tiene "proceso anterior" en el flujo madre.
    if (log.processType === 'PARALLEL') {
      throw new BadRequestException('Solo los procesos madre se pueden devolver');
    }
    // completed/skipped/returned quedan afuera — esto es justamente lo que
    // impide una doble devolución del mismo log.
    if (!['in_progress', 'blocked', 'pending'].includes(log.status)) {
      throw new BadRequestException('El proceso no se puede devolver en su estado actual');
    }

    const allLogs = await this.logRepo.find({
      where: { sourceType: log.sourceType, sourceId: log.sourceId },
      order: { orderIndex: 'ASC', createdAt: 'ASC' },
    });
    const prev = this.pickPreviousMother(allLogs, log);
    if (!prev) throw new BadRequestException('No hay proceso anterior al que devolver');
    // prev ya ES la pasada más nueva de su processCode (pickPreviousMother
    // desempata por createdAt DESC + id) — su status refleja directamente si
    // ese proceso ya está abierto, sin necesidad de una segunda consulta.
    if (['pending', 'in_progress', 'blocked'].includes(prev.status)) {
      throw new BadRequestException('El proceso anterior ya está abierto');
    }

    const newLog = await this.withTechnicianLock(technicianId, async manager => {
      // (a) mismo chequeo de conflicto que unblockProcess() líneas 530-534.
      const conflict = await manager.findOne(TrackingLog, {
        where: { technicianId, status: 'in_progress' },
      });
      if (conflict && conflict.id !== logId) {
        throw new BadRequestException(
          `${conflict.technicianName || technicianName || 'El técnico'} ya está trabajando en otro vehículo (proceso "${conflict.processName}"). Hay que pausarlo o completarlo antes de continuar.`,
        );
      }

      // (b) snapshot del técnico saliente ANTES de borrar
      // bodyshop_process_techs — mismo patrón que pauseLog() líneas 427-433.
      if (!log.technicianId) {
        const assigned = await this.resolveAssignedTechnician(log);
        if (assigned) {
          log.technicianId = assigned.id;
          log.technicianName = assigned.name || null;
        }
      }

      // (c) marcar 'returned' ANTES de crear el log nuevo (e) — si se
      // invirtiera, el índice único parcial
      // tracking_logs_one_in_progress_per_technician (migración 011)
      // dispararía un 23505 al reasignar el mismo técnico al proceso reabierto.
      log.status = 'returned';
      log.blockedReason = reason;
      log.pausedAt = null;
      await manager.save(TrackingLog, log);

      // (d) libera la capacidad del proceso devuelto — mismo criterio que
      // pauseLog() tracking.service.ts:448 (`this.processTechRepo.delete(...)`),
      // pero vía manager para que quede atómico con el resto de la transacción.
      if (log.sourceType === 'bodyshop') {
        await manager.delete(BodyshopProcessTech, { entryId: log.sourceId, process: log.processCode });
      }

      // (e) nueva pasada del proceso anterior — shape de initForBodyshop()
      // líneas 225-234 + campos de arranque de startProcess() líneas 392-399.
      const created = await manager.save(TrackingLog, manager.create(TrackingLog, {
        sourceType:   log.sourceType,
        sourceId:     log.sourceId,
        processName:  prev.processName,
        processCode:  prev.processCode,
        orderIndex:   prev.orderIndex,
        plannedHours: prev.plannedHours,
        processType:  'MOTHER',
        status:       'in_progress',
        startedAt:    new Date(),
        technicianId,
        technicianName,
      }));

      // (f) upsert de bodyshop_process_techs para el proceso reabierto —
      // mirror exacto de unblockProcess() líneas 511-523.
      if (log.sourceType === 'bodyshop') {
        const existing = await manager.findOne(BodyshopProcessTech, {
          where: { entryId: log.sourceId, process: prev.processCode },
        });
        if (existing) {
          existing.technicianId = technicianId;
          await manager.save(BodyshopProcessTech, existing);
        } else {
          await manager.save(BodyshopProcessTech,
            manager.create(BodyshopProcessTech, { entryId: log.sourceId, process: prev.processCode, technicianId }),
          );
        }
      }

      return created;
    });

    // Post-transacción, mirror de unblockProcess() líneas 542-551: si no
    // queda ningún otro log 'blocked' para el mismo origen, restaura el
    // estado de pausa del appointment/entry.
    const otherBlocked = await this.logRepo.findOne({
      where: { sourceType: log.sourceType, sourceId: log.sourceId, status: 'blocked' },
    });
    if (!otherBlocked) {
      const hasInProgress = await this.logRepo.findOne({
        where: { sourceType: log.sourceType, sourceId: log.sourceId, status: 'in_progress' },
      });
      await this.setPauseStatus(log.sourceType, log.sourceId, false, !!hasInProgress);
    }

    return newLog;
  }

  private async setPauseStatus(
    sourceType: 'mechanic' | 'bodyshop',
    sourceId: string,
    pause: boolean,
    wasInProgress = false,
  ): Promise<void> {
    if (sourceType === 'mechanic') {
      const newStatus = pause ? 'paused' : (wasInProgress ? 'in_progress' : 'scheduled');
      await this.apptRepo.update({ id: sourceId }, { status: newStatus as any });
    } else {
      const newStatus = pause ? 'paused' : (wasInProgress ? 'in_progress' : 'scheduled');
      await this.entryRepo.update({ id: sourceId } as any, { status: newStatus });
    }
  }

  async completeProcess(logId: string, notes?: string): Promise<{ completed: TrackingLog; next: TrackingLog | null; parallelBlocking: boolean }> {
    const log = await this.logRepo.findOne({ where: { id: logId } });
    if (!log) throw new NotFoundException('Proceso no encontrado');
    if (log.status !== 'in_progress' && log.status !== 'blocked') {
      throw new BadRequestException('El proceso debe estar en curso o pausado para completarlo');
    }

    if (log.pausedAt !== null) {
      const deltaMins = (Date.now() - log.pausedAt.getTime()) / 60_000;
      log.pausedDurationMinutes = (log.pausedDurationMinutes ?? 0) + deltaMins;
      log.pausedAt = null;
    }
    log.status = 'completed';
    log.completedAt = new Date();
    if (notes) log.notes = notes;
    const completed = await this.logRepo.save(log);

    let next: TrackingLog | null = null;
    let parallelBlocking = false;

    if (log.processType === 'MOTHER') {
      // D6 (spec "Re-completion regenerates the returned process"): resolver
      // UNIFICADO sobre pending Y returned juntos, ordenados por orderIndex
      // ASC — activa el de menor orderIndex mayor al recién completado. Antes
      // de PR2 esto solo miraba 'pending', así que devolver PREP→BODYWORK y
      // luego completar BODYWORK saltaba directo a PAINT (el próximo
      // 'pending'), dejando PREP 'returned' para siempre. Con este resolver,
      // aunque ya existan 'pending' más adelante en la secuencia (PAINT,
      // POLISH...), el 'returned' de menor orderIndex siempre gana primero.
      const allLogs = await this.logRepo.find({
        where: { sourceType: log.sourceType, sourceId: log.sourceId } as any,
        order: { orderIndex: 'ASC', createdAt: 'ASC' },
      });
      const laterMothers = allLogs.filter(l => l.processType !== 'PARALLEL' && l.processCode !== 'AGENDA'
                                             && l.orderIndex > log.orderIndex);
      const latestByCode = new Map<string, TrackingLog>();
      for (const l of laterMothers) latestByCode.set(l.processCode, l); // última pasada por processCode
      const target = [...latestByCode.values()]
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .find(l => l.status === 'pending' || l.status === 'returned') ?? null;

      if (target?.status === 'pending') {
        // Comportamiento actual, intacto.
        target.status = 'in_progress';
        target.startedAt = new Date();
        next = await this.logRepo.save(target);
      } else if (target?.status === 'returned') {
        // Regeneración: se crea una pasada NUEVA (no se resucita in place),
        // 'pending' (no 'in_progress') — el operador debe confirmar técnico
        // explícitamente vía "Iniciar", la capacidad nunca se asigna implícita.
        next = await this.logRepo.save(this.logRepo.create({
          sourceType:   log.sourceType,
          sourceId:     log.sourceId,
          processName:  target.processName,
          processCode:  target.processCode,
          orderIndex:   target.orderIndex,
          plannedHours: target.plannedHours,
          processType:  'MOTHER',
          status:       'pending',
        }));
      } else {
        // Todos los procesos madre terminaron — verificar si hay paralelos pendientes
        const pendingParallel = await this.logRepo.findOne({
          where: {
            sourceType: log.sourceType,
            sourceId:   log.sourceId,
            processType: 'PARALLEL',
          } as any,
        });
        if (pendingParallel && (pendingParallel.status === 'pending' || pendingParallel.status === 'in_progress')) {
          parallelBlocking = true;
        }
      }
    }
    // Si es PARALLEL: no auto-avanza el flujo madre, solo registra fin

    return { completed, next, parallelBlocking };
  }

  // ── Board ───────────────────────────────────────────────────────────────────

  async getBoard(date: string, workshopId: string) {
    const workshop = await this.workshopRepo.findOne({ where: { id: workshopId } });
    if (!workshop) throw new NotFoundException('Taller no encontrado');

    const [appointments, entries] = await Promise.all([
      this.apptRepo
        .createQueryBuilder('a')
        .leftJoinAndSelect('a.technician', 'tech')
        .leftJoinAndSelect('a.serviceType', 'st')
        .where('a.date = :date', { date })
        .andWhere('tech.workshopName = :wname', { wname: workshop.name })
        .getMany(),
      (() => {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 60);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        return this.entryRepo
          .createQueryBuilder('b')
          .leftJoinAndSelect('b.workType', 'wt')
          .leftJoinAndSelect('b.technician', 'tech')
          .where('b.workshopId = :workshopId', { workshopId })
          .andWhere('b.status NOT IN (:...excludedStatuses)', { excludedStatuses: ['done', 'cancelled'] })
          .andWhere('b.date >= :cutoff', { cutoff: cutoffStr })
          .getMany();
      })(),
    ]);

    const mechIds = appointments.map(a => a.id);
    const bsIds   = entries.map(e => e.id);
    const allIds  = [...mechIds, ...bsIds];

    const logs = allIds.length > 0
      ? await this.logRepo.find({ where: { sourceId: In(allIds) }, order: { orderIndex: 'ASC', createdAt: 'ASC' } })
      : [];

    const logsBySource = new Map<string, TrackingLog[]>();
    for (const l of logs) {
      if (!logsBySource.has(l.sourceId)) logsBySource.set(l.sourceId, []);
      logsBySource.get(l.sourceId)!.push(l);
    }

    // Auto-inicializar entradas sin tracking logs (solo activas, no canceladas)
    await Promise.all([
      ...appointments
        .filter(a => !logsBySource.has(a.id) && a.status !== 'cancelled')
        .map(async a => {
          const svc = (a as any).serviceType;
          await this.initForMechanic(a.id, svc?.name ?? 'Trabajo mecánico', Number(svc?.durationHours ?? 0));
          const newLogs = await this.logRepo.find({ where: { sourceId: a.id }, order: { orderIndex: 'ASC', createdAt: 'ASC' } });
          logsBySource.set(a.id, newLogs);
        }),
      ...entries
        .filter(e => !logsBySource.has(e.id) && (e as any).status !== 'cancelled')
        .map(async e => {
          const stored: { code: string; name: string; hours: number }[] | null = (e as any).processes ?? null;
          const procs = stored && stored.length > 0
            ? stored
                .filter(p => p.hours > 0)
                .map(p => ({
                  name:  BODYSHOP_PROCESS_NAMES[p.code] ?? p.name,
                  code:  p.code,
                  order: BODYSHOP_PROCESS_ORDER[p.code] ?? 99,
                  hours: p.hours,
                }))
            : [
                { name: 'Chapería',    code: 'BODYWORK', order: 1, hours: Number((e as any).bodyworkHours) || 0 },
                { name: 'Preparación', code: 'PREP',     order: 2, hours: Number((e as any).prepHours)     || 0 },
                { name: 'Pintura',     code: 'PAINT',    order: 3, hours: Number((e as any).paintHours)    || 0 },
              ];
          await this.initForBodyshop(e.id, procs);
          const newLogs = await this.logRepo.find({ where: { sourceId: e.id }, order: { orderIndex: 'ASC', createdAt: 'ASC' } });
          logsBySource.set(e.id, newLogs);
        }),
    ]);

    const cards: TrackingCard[] = [
      ...appointments.map(a => this.buildCard(a.id, 'mechanic', {
        status: a.status,
        plate: a.plate,
        customerName: a.customerName,
        vehicleType: a.vehicleDescription ?? null,
        techName: (a as any).technician?.name ?? null,
        serviceOrType: (a as any).serviceType?.name ?? null,
        entryDate: a.date ?? null,
        exitDate: a.estimatedFinishDate ?? null,
      }, logsBySource.get(a.id) ?? [])),
      ...entries.map(e => this.buildCard(e.id, 'bodyshop', {
        status:             (e as any).status ?? 'scheduled',
        plate:              e.plate,
        customerName:       e.customerName,
        vehicleType:        null,
        techName:           (e as any).technician?.name ?? null,
        serviceOrType:      (e as any).workType?.name ?? null,
        entryDate:          e.date ?? null,
        exitDate:           (e as any).estimatedFinishDate ?? null,
        waitingForResource: (e as any).waitingForResource ?? false,
        resourceNote:       (e as any).resourceNote ?? null,
        resourceBlockedAt:  (e as any).resourceBlockedAt ?? null,
        advisorTime:        (e as any).timeStart ?? null,
        noStartAt:          (e as any).noStartAt ?? null,
        noStartHoursLost:   (e as any).noStartHoursLost ?? null,
      }, logsBySource.get(e.id) ?? [])),
    ];

    // Agrupar por proceso actual (o columnas especiales)
    const columnsMap = new Map<string, {
      processCode: string; processName: string; orderIndex: number; cards: TrackingCard[];
    }>();

    const ensure = (code: string, name: string, order: number) => {
      if (!columnsMap.has(code)) columnsMap.set(code, { processCode: code, processName: name, orderIndex: order, cards: [] });
    };

    ensure('AGENDA', 'Agendado', 0);
    if ((workshop.type ?? 'MECHANIC').toUpperCase() === 'BODYSHOP') {
      ensure('BODYWORK',              'Chapería',           1);
      ensure('PREP',                  'Preparación',        2);
      ensure('PAINT',                 'Pintura',            3);
      ensure('POLISH',                'Pulido',             4);
      ensure('MECHANIC',              'Mecánica',           5);
      ensure('FINAL_CONTROL',         'Control Final',      6);
      ensure('__PARALLEL_BLOCKING__', 'Paralelos pendientes', 9997);
    } else {
      ensure('MECHANIC', 'Mecánica', 1);
    }
    ensure('__DONE__',      'Finalizado',           9998);
    ensure('__CANCELLED__', 'Historial canceladas', 9999);

    for (const card of cards) {
      if (card.status === 'cancelled') {
        columnsMap.get('__CANCELLED__')!.cards.push(card);
      } else if (card.currentProcess) {
        ensure(card.currentProcess.processCode, card.currentProcess.processName, card.currentProcess.orderIndex);
        columnsMap.get(card.currentProcess.processCode)!.cards.push(card);
      } else if (card.allProcesses.length === 0) {
        ensure('__UNTRACKED__', 'Sin seguimiento', 0);
        columnsMap.get('__UNTRACKED__')!.cards.push(card);
      } else {
        columnsMap.get('__DONE__')!.cards.push(card);
      }
    }

    const columns = Array.from(columnsMap.values())
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(col => ({
        ...col,
        cards: col.processCode === '__CANCELLED__'
          ? col.cards  // canceladas: orden cronológico (no por desviación)
          : col.cards.sort((a, b) => b.deviationTotal - a.deviationTotal),
      }));

    const alerts = cards.filter(c =>
      c.status !== 'cancelled' && (c.semaphore === 'red' || c.semaphore === 'orange'),
    );

    return { date, workshopId, workshopName: workshop.name, columns, alertCount: alerts.length };
  }

  async setExitDate(sourceType: 'mechanic' | 'bodyshop', sourceId: string, date: string | null): Promise<void> {
    if (sourceType === 'bodyshop') {
      const entry = await this.entryRepo.findOne({ where: { id: sourceId } as any });
      if (!entry) throw new NotFoundException('Entrada no encontrada');
      (entry as any).estimatedFinishDate = date;
      await this.entryRepo.save(entry);
    } else {
      const appt = await this.apptRepo.findOne({ where: { id: sourceId } });
      if (!appt) throw new NotFoundException('Cita no encontrada');
      appt.estimatedFinishDate = date;
      await this.apptRepo.save(appt);
    }
  }

  async getCardProcesses(sourceType: 'mechanic' | 'bodyshop', sourceId: string): Promise<ProcessSummary[]> {
    const logs = await this.logRepo.find({
      where: { sourceType, sourceId },
      order: { orderIndex: 'ASC', createdAt: 'ASC' },
    });
    return logs.map(l => this.toProcessSummary(l));
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  // Regla D4: el proceso MADRE anterior es el de mayor orderIndex estrictamente
  // menor al actual, excluyendo PARALLEL y AGENDA — orderIndex-1 no sirve porque
  // BODYSHOP_PROCESS_ORDER tiene huecos (paralelos intercalados, procesos con
  // 0 horas) y hay un PARALLEL (MECHANIC, 5) entre dos MOTHER (POLISH 4,
  // FINAL_CONTROL 6). Si hay varias pasadas del mismo processCode empatadas en
  // orderIndex, se queda con la más nueva (createdAt DESC).
  //
  // Post-review fix (PR1→PR2): el desempate por createdAt no alcanza cuando
  // dos pasadas nacen en la MISMA transacción — returnToProcess() (PR2) hace
  // dos writes a tracking_logs en un único dataSource.transaction(), y
  // Postgres now() devuelve el mismo valor para toda la transacción, así que
  // dos createdAt podrían quedar idénticos. Se agrega `id` (UUID) como tercer
  // desempate: no le da un significado temporal real al ganador, pero
  // garantiza que la elección sea determinística sin importar el orden en que
  // Postgres devuelva las filas empatadas (ORDER BY no lo garantiza en ties).
  private pickPreviousMother(logs: TrackingLog[], current: TrackingLog): TrackingLog | null {
    return logs
      .filter(l => l.processType !== 'PARALLEL' && l.processCode !== 'AGENDA'
                && l.orderIndex < current.orderIndex)
      .sort((a, b) => b.orderIndex - a.orderIndex
                    || b.createdAt.getTime() - a.createdAt.getTime()
                    || b.id.localeCompare(a.id))[0] ?? null;
  }

  private buildCard(
    sourceId: string,
    sourceType: 'mechanic' | 'bodyshop',
    meta: {
      status: string;
      plate: string;
      customerName: string;
      vehicleType: string | null;
      techName: string | null;
      serviceOrType: string | null;
      entryDate: string | null;
      exitDate: string | null;
      waitingForResource?: boolean;
      resourceNote?: string | null;
      resourceBlockedAt?: Date | null;
      advisorTime?: string | null;
      noStartAt?: Date | string | null;
      noStartHoursLost?: number | null;
    },
    logs: TrackingLog[],
  ): TrackingCard {
    const now = new Date();
    // orderIndex ASC, createdAt ASC (D5): dos pasadas del mismo processCode
    // comparten orderIndex y el orden de llegada de Postgres no está
    // garantizado en los empates — createdAt como desempate asegura que la
    // pasada más nueva quede siempre al final (histórico cronológico y
    // "último write gana" para el dedup de allMothersDone más abajo).
    const sorted = [...logs].sort((a, b) => a.orderIndex - b.orderIndex || a.createdAt.getTime() - b.createdAt.getTime());

    const mothers   = sorted.filter(l => l.processType !== 'PARALLEL');
    const parallels = sorted.filter(l => l.processType === 'PARALLEL');

    // Proceso actual = primer proceso MADRE activo (in_progress > blocked > pending)
    const inProgress   = mothers.find(l => l.status === 'in_progress');
    const firstBlocked = mothers.find(l => l.status === 'blocked');
    const firstPending = mothers.find(l => l.status === 'pending');
    const currentLog   = inProgress ?? firstBlocked ?? firstPending ?? null;

    // D3: un log 'returned' nunca desaparece — tras devolver y rehacer el
    // proceso quedan dos pasadas con el mismo processCode. Si se evaluara
    // "done" sobre TODOS los logs, la pasada 'returned' vieja bloquearía
    // "Entregado" para siempre. Se deduplica quedándose con la última pasada
    // por processCode (gana la última en `mothers`, que ya viene ordenado
    // createdAt ASC) y se evalúa completitud solo sobre esa lista.
    const latestMothers = new Map<string, TrackingLog>();
    for (const l of mothers) latestMothers.set(l.processCode, l);
    const evaluatedMothers = [...latestMothers.values()].filter(l => l.processCode !== 'AGENDA');
    const allMothersDone = evaluatedMothers.length > 0
      && evaluatedMothers.every(l => l.status === 'completed' || l.status === 'skipped');
    const hasActiveParallel = parallels.some(l => l.status === 'pending' || l.status === 'in_progress' || l.status === 'blocked');
    const parallelBlocking  = allMothersDone && hasActiveParallel;
    const allDone = allMothersDone && !hasActiveParallel;

    let deviationTotal = 0;
    let overdueHours = 0;

    for (const l of sorted) {
      if (l.processCode === 'AGENDA') continue;
      if (l.status === 'completed' && l.startedAt && l.completedAt) {
        const real = (l.completedAt.getTime() - l.startedAt.getTime()) / 3_600_000;
        deviationTotal += real - Number(l.plannedHours);
      } else if (l.status === 'in_progress' && l.startedAt) {
        const elapsed = (now.getTime() - l.startedAt.getTime()) / 3_600_000;
        const over = elapsed - Number(l.plannedHours);
        if (over > 0) { deviationTotal += over; overdueHours = over; }
      }
    }

    deviationTotal = Math.round(deviationTotal * 100) / 100;
    overdueHours   = Math.round(overdueHours   * 100) / 100;

    let semaphore: TrackingCard['semaphore'] = 'normal';
    if (allDone || deviationTotal < 0) semaphore = 'green';
    else if (overdueHours > 0)         semaphore = 'red';
    else if (deviationTotal >= DEVIATION_ORANGE_THRESHOLD) semaphore = 'orange';

    const plannedTotalHours = sorted
      .filter(l => l.processCode !== 'AGENDA')
      .reduce((s, l) => s + Number(l.plannedHours), 0);
    const realTotalHours = sorted
      .filter(l => l.processCode !== 'AGENDA' && l.status === 'completed' && l.startedAt && l.completedAt)
      .reduce((s, l) => s + (l.completedAt!.getTime() - l.startedAt!.getTime()) / 3_600_000, 0);

    // D4: false para PARALLEL, AGENDA y el primer proceso madre — pickPreviousMother
    // ya filtra esos casos y devuelve null, así que basta con chequear el resultado.
    const previousMother = currentLog ? this.pickPreviousMother(sorted, currentLog) : null;

    return {
      id: `${sourceType}:${sourceId}`,
      sourceId,
      sourceType,
      status: meta.status,
      plate: meta.plate,
      customerName: meta.customerName,
      vehicleType: meta.vehicleType,
      techName: meta.techName,
      serviceOrType: meta.serviceOrType,
      currentProcess: (!allDone && !parallelBlocking && currentLog) ? {
        logId:         currentLog.id,
        processCode:   currentLog.processCode,
        processName:   currentLog.processName,
        orderIndex:    currentLog.orderIndex,
        plannedHours:  Number(currentLog.plannedHours),
        startedAt:     currentLog.startedAt?.toISOString() ?? null,
        status:        currentLog.status,
        blockedReason: currentLog.blockedReason ?? null,
        canReturn:            previousMother !== null,
        previousProcessName:  previousMother?.processName ?? null,
      } : parallelBlocking ? {
        logId:         '__parallel__',
        processCode:   '__PARALLEL_BLOCKING__',
        processName:   'Paralelo pendiente',
        orderIndex:    9997,
        plannedHours:  0,
        startedAt:     null,
        status:        'in_progress',
        blockedReason: 'Proceso paralelo pendiente bloquea finalización',
        canReturn:            false,
        previousProcessName:  null,
      } : null,
      plannedTotalHours: Math.round(plannedTotalHours * 100) / 100,
      realTotalHours:    Math.round(realTotalHours    * 100) / 100,
      deviationTotal,
      overdueHours,
      semaphore,
      allProcesses:      sorted.map(l => this.toProcessSummary(l)),
      motherProcesses:   mothers.map(l => this.toProcessSummary(l)),
      parallelProcesses: parallels.map(l => this.toProcessSummary(l)),
      parallelBlocking,
      entryDate: meta.entryDate,
      exitDate:  meta.exitDate,
      suggestedExitDate: meta.entryDate
        ? suggestExitDate(meta.entryDate, Math.round(plannedTotalHours * 100) / 100)
        : null,
      waitingForResource: meta.waitingForResource ?? false,
      resourceNote:       meta.resourceNote ?? null,
      resourceBlockedAt:  meta.resourceBlockedAt instanceof Date
        ? meta.resourceBlockedAt.toISOString()
        : (meta.resourceBlockedAt ?? null),
      advisorTime:      meta.advisorTime ?? null,
      noStartAt:        meta.noStartAt instanceof Date
        ? meta.noStartAt.toISOString()
        : (meta.noStartAt ?? null),
      noStartHoursLost: meta.noStartHoursLost != null ? Number(meta.noStartHoursLost) : null,
    };
  }

  // ── Recursos ────────────────────────────────────────────────────────────────

  async setResource(entryId: string, note: string): Promise<void> {
    const entry = await this.entryRepo.findOne({ where: { id: entryId } as any });
    if (!entry) throw new NotFoundException('Entrada no encontrada');
    (entry as any).waitingForResource = true;
    (entry as any).resourceNote       = note;
    (entry as any).resourceBlockedAt  = new Date();
    await this.entryRepo.save(entry);
  }

  async clearResource(entryId: string): Promise<void> {
    const entry = await this.entryRepo.findOne({ where: { id: entryId } as any });
    if (!entry) throw new NotFoundException('Entrada no encontrada');
    (entry as any).waitingForResource = false;
    (entry as any).resourceNote       = null;
    (entry as any).resourceBlockedAt  = null;
    await this.entryRepo.save(entry);
  }

  async getResourceAgenda(workshopId: string) {
    const entries = await this.entryRepo
      .createQueryBuilder('e')
      .where('e.workshopId = :workshopId', { workshopId })
      .andWhere('e.waitingForResource = true')
      .orderBy('e.resourceBlockedAt', 'ASC')
      .getMany();

    return Promise.all(entries.map(async e => {
      const logs = await this.logRepo.find({
        where: { sourceType: 'bodyshop', sourceId: e.id },
        order: { orderIndex: 'ASC', createdAt: 'ASC' },
      });
      const currentLog = logs.find(l => l.status === 'in_progress' || l.status === 'blocked')
        ?? logs.find(l => l.status === 'pending') ?? null;
      return {
        entryId:            e.id,
        plate:              e.plate,
        customerName:       e.customerName,
        date:               e.date,
        currentProcessName: currentLog?.processName ?? 'Sin proceso',
        resourceNote:       (e as any).resourceNote as string | null,
        resourceBlockedAt:  ((e as any).resourceBlockedAt as Date | null)?.toISOString() ?? null,
      };
    }));
  }

  // ── GET /tracking/productivity ───────────────────────────────────────────────
  async getTechProductivityReport(
    workshopId: string,
    from: string,
    to: string,
    sourceType?: 'mechanic' | 'bodyshop',
  ): Promise<Record<string, unknown>> {
    const workshop = await this.workshopRepo.findOne({ where: { id: workshopId } });
    if (!workshop) throw new NotFoundException('Taller no encontrado');
    const workshopName = workshop.name;

    const sourceFilter = sourceType ? `AND tl.source_type = $4` : '';
    const mainParams: any[] = [from, to, workshopName];
    if (sourceType) mainParams.push(sourceType);

    const [mainRows, trendRows, unattributedRows] = await Promise.all([
      this.logRepo.manager.query(`
        SELECT
          tl.technician_id                                                      AS "technicianId",
          tl.technician_name                                                    AS "technicianName",
          tl.process_code                                                       AS "processCode",
          tl.process_name                                                       AS "processName",
          COUNT(*)::int                                                         AS "completedCount",
          SUM(tl.planned_hours)::float                                          AS "plannedHours",
          SUM(EXTRACT(EPOCH FROM (tl.completed_at - tl.started_at)) / 3600.0)::float AS "realHours",
          SUM(tl.paused_duration_minutes)::float                                AS "pausedMinutes"
        FROM tracking_logs tl
        JOIN technicians t ON t.id::text = tl.technician_id
        WHERE tl.status = 'completed'
          AND tl.process_code != 'AGENDA'
          AND tl.technician_id IS NOT NULL
          AND tl.started_at IS NOT NULL
          AND tl.completed_at >= $1::date
          AND tl.completed_at < ($2::date + INTERVAL '1 day')
          AND t.workshop_name = $3
          ${sourceFilter}
        GROUP BY tl.technician_id, tl.technician_name, tl.process_code, tl.process_name
        ORDER BY tl.technician_id, tl.process_code
      `, mainParams),
      this.logRepo.manager.query(`
        SELECT
          tl.technician_id                                                      AS "technicianId",
          tl.technician_name                                                    AS "technicianName",
          TO_CHAR(DATE_TRUNC('month', tl.completed_at), 'YYYY-MM')             AS month,
          SUM(tl.planned_hours)::float                                          AS "plannedHours",
          SUM(EXTRACT(EPOCH FROM (tl.completed_at - tl.started_at)) / 3600.0)::float AS "realHours",
          SUM(tl.paused_duration_minutes)::float                                AS "pausedMinutes"
        FROM tracking_logs tl
        JOIN technicians t ON t.id::text = tl.technician_id
        WHERE tl.status = 'completed'
          AND tl.process_code != 'AGENDA'
          AND tl.technician_id IS NOT NULL
          AND tl.started_at IS NOT NULL
          AND tl.completed_at >= (DATE_TRUNC('month', NOW()) - INTERVAL '5 months')
          AND t.workshop_name = $1
        GROUP BY tl.technician_id, tl.technician_name, DATE_TRUNC('month', tl.completed_at)
        ORDER BY tl.technician_id, month
      `, [workshopName]),
      this.logRepo.manager.query(`
        SELECT COUNT(*)::int AS count
        FROM tracking_logs tl
        WHERE tl.status = 'completed'
          AND tl.process_code != 'AGENDA'
          AND tl.technician_id IS NULL
          AND tl.completed_at >= $1::date
          AND tl.completed_at < ($2::date + INTERVAL '1 day')
          AND tl.source_id IN (
            SELECT id::text FROM bodyshop_entries WHERE workshop_id = $3
            UNION ALL
            SELECT a.id::text FROM appointments a
            JOIN technicians t ON t.id = a.technician_id
            WHERE t.workshop_name = $4
          )
      `, [from, to, workshopId, workshopName]),
    ]);

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const efficiency = (planned: number, net: number) =>
      net > 0.001 ? Math.min(200, Math.round((planned / net) * 100)) : 0;

    const byTech = new Map<string, {
      technicianId: string;
      technicianName: string;
      completedProcesses: number;
      plannedHours: number;
      realHours: number;
      pausedMinutes: number;
      processes: any[];
    }>();

    for (const r of mainRows) {
      let tech = byTech.get(r.technicianId);
      if (!tech) {
        tech = {
          technicianId: r.technicianId,
          technicianName: r.technicianName ?? '',
          completedProcesses: 0,
          plannedHours: 0,
          realHours: 0,
          pausedMinutes: 0,
          processes: [],
        };
        byTech.set(r.technicianId, tech);
      }
      const planned = Number(r.plannedHours ?? 0);
      const real = Number(r.realHours ?? 0);
      const paused = Number(r.pausedMinutes ?? 0);
      const net = real - paused / 60;

      tech.completedProcesses += Number(r.completedCount ?? 0);
      tech.plannedHours += planned;
      tech.realHours += real;
      tech.pausedMinutes += paused;
      tech.processes.push({
        processCode:    r.processCode,
        processName:    r.processName,
        completedCount: Number(r.completedCount ?? 0),
        plannedHours:   round2(planned),
        realHours:      round2(real),
        netHours:       round2(net),
        deviation:      round2(real - planned),
        efficiencyPct:  efficiency(planned, net),
      });
    }

    const technicians = Array.from(byTech.values())
      .map(t => {
        const netHours = t.realHours - t.pausedMinutes / 60;
        return {
          technicianId:       t.technicianId,
          technicianName:     t.technicianName,
          completedProcesses: t.completedProcesses,
          plannedHours:       round2(t.plannedHours),
          realHours:          round2(t.realHours),
          netHours:           round2(netHours),
          pausedMinutes:      round2(t.pausedMinutes),
          deviation:          round2(t.realHours - t.plannedHours),
          efficiencyPct:      efficiency(t.plannedHours, netHours),
          processes:          t.processes,
        };
      })
      .sort((a, b) => b.efficiencyPct - a.efficiencyPct)
      .map((t, i) => ({ ...t, rankByEfficiency: i + 1 }));

    const trend = trendRows.map((r: any) => {
      const planned = Number(r.plannedHours ?? 0);
      const net = Number(r.realHours ?? 0) - Number(r.pausedMinutes ?? 0) / 60;
      return {
        technicianId:   r.technicianId,
        technicianName: r.technicianName ?? '',
        month:          r.month,
        plannedHours:   round2(planned),
        netHours:       round2(net),
        efficiencyPct:  efficiency(planned, net),
      };
    });

    return {
      workshopName,
      from,
      to,
      technicians,
      trend,
      dataQuality: {
        unattributedCompletedCount: Number(unattributedRows[0]?.count ?? 0),
      },
    };
  }

  private toProcessSummary(l: TrackingLog): ProcessSummary {
    const realHours = (l.status === 'completed' && l.startedAt && l.completedAt)
      ? Math.round((l.completedAt.getTime() - l.startedAt.getTime()) / 36_000) / 100
      : null;
    const currentPausedMins = l.status === 'blocked' && l.pausedAt
      ? (Date.now() - l.pausedAt.getTime()) / 60_000
      : 0;
    return {
      logId:        l.id,
      processCode:  l.processCode,
      processName:  l.processName,
      processType:  l.processType ?? 'MOTHER',
      orderIndex:   l.orderIndex,
      plannedHours: Number(l.plannedHours),
      startedAt:    l.startedAt?.toISOString()  ?? null,
      completedAt:  l.completedAt?.toISOString() ?? null,
      createdAt:    l.createdAt.toISOString(),
      status:       l.status,
      realHours,
      deviation:    realHours !== null ? Math.round((realHours - Number(l.plannedHours)) * 100) / 100 : null,
      pausedDurationMinutes: Math.round(((l.pausedDurationMinutes ?? 0) + currentPausedMins) * 100) / 100,
      technicianId:   l.technicianId   ?? null,
      technicianName: l.technicianName ?? null,
    };
  }
}
