import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
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
};

// Procesos que son PARALELOS por defecto (pueden correr junto al flujo madre)
const BODYSHOP_PARALLEL_CODES = new Set(['MECHANIC', 'DIAMANTADO', 'LLANTAS', 'ELECTRICO']);

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

  // ── Acciones ────────────────────────────────────────────────────────────────

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

    if (effectiveTechnicianId) {
      const conflict = await this.logRepo.findOne({
        where: { technicianId: effectiveTechnicianId, status: 'in_progress' },
      });
      if (conflict && conflict.id !== logId && conflict.sourceId !== log.sourceId) {
        throw new BadRequestException(
          `${conflict.technicianName || effectiveTechnicianName || 'El técnico'} ya está trabajando en otro vehículo (proceso "${conflict.processName}"). Hay que pausarlo o completarlo antes de iniciar este.`,
        );
      }
    }

    if (log.processType === 'PARALLEL') {
      // Paralelos corren simultáneamente: no resetear otros procesos
    } else {
      // MOTHER: solo un proceso madre in_progress por source a la vez.
      // Se cambia a 'pending' pero se preserva startedAt para no corromper
      // el cálculo de horas reales ni los semáforos de tiempo.
      await this.logRepo
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
    return this.logRepo.save(log);
  }

  async blockProcess(logId: string, reason: string): Promise<TrackingLog> {
    const log = await this.logRepo.findOne({ where: { id: logId } });
    if (!log) throw new NotFoundException('Proceso no encontrado');
    if (log.status === 'completed') throw new BadRequestException('No se puede pausar un proceso completado');

    log.status = 'blocked';
    log.blockedReason = reason;
    log.pausedAt = new Date();
    const saved = await this.logRepo.save(log);

    // Liberar capacidad del técnico marcando el appointment/entry como 'paused'
    await this.setPauseStatus(log.sourceType, log.sourceId, true);

    return saved;
  }

  async unblockProcess(logId: string): Promise<TrackingLog> {
    const log = await this.logRepo.findOne({ where: { id: logId } });
    if (!log) throw new NotFoundException('Proceso no encontrado');
    if (log.status !== 'blocked') throw new BadRequestException('El proceso no está pausado');

    log.status = log.startedAt ? 'in_progress' : 'pending';
    log.blockedReason = null;
    if (log.pausedAt) {
      const deltaMins = (Date.now() - log.pausedAt.getTime()) / 60_000;
      log.pausedDurationMinutes = (log.pausedDurationMinutes ?? 0) + deltaMins;
      log.pausedAt = null;
    }
    const saved = await this.logRepo.save(log);

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
      // Avanzar al siguiente proceso MADRE pendiente
      const nextMotherPending = await this.logRepo.findOne({
        where: { sourceType: log.sourceType, sourceId: log.sourceId, status: 'pending', processType: 'MOTHER' } as any,
        order: { orderIndex: 'ASC' },
      });
      if (nextMotherPending) {
        nextMotherPending.status = 'in_progress';
        nextMotherPending.startedAt = new Date();
        next = await this.logRepo.save(nextMotherPending);
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
      ? await this.logRepo.find({ where: { sourceId: In(allIds) }, order: { orderIndex: 'ASC' } })
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
          const newLogs = await this.logRepo.find({ where: { sourceId: a.id }, order: { orderIndex: 'ASC' } });
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
          const newLogs = await this.logRepo.find({ where: { sourceId: e.id }, order: { orderIndex: 'ASC' } });
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
      order: { orderIndex: 'ASC' },
    });
    return logs.map(l => this.toProcessSummary(l));
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

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
    const sorted = [...logs].sort((a, b) => a.orderIndex - b.orderIndex);

    const mothers   = sorted.filter(l => l.processType !== 'PARALLEL');
    const parallels = sorted.filter(l => l.processType === 'PARALLEL');

    // Proceso actual = primer proceso MADRE activo (in_progress > blocked > pending)
    const inProgress   = mothers.find(l => l.status === 'in_progress');
    const firstBlocked = mothers.find(l => l.status === 'blocked');
    const firstPending = mothers.find(l => l.status === 'pending');
    const currentLog   = inProgress ?? firstBlocked ?? firstPending ?? null;

    const allMothersDone = mothers.length > 0 && mothers.filter(l => l.processCode !== 'AGENDA')
      .every(l => l.status === 'completed' || l.status === 'skipped');
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
      } : parallelBlocking ? {
        logId:         '__parallel__',
        processCode:   '__PARALLEL_BLOCKING__',
        processName:   'Paralelo pendiente',
        orderIndex:    9997,
        plannedHours:  0,
        startedAt:     null,
        status:        'in_progress',
        blockedReason: 'Proceso paralelo pendiente bloquea finalización',
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
        order: { orderIndex: 'ASC' },
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
      status:       l.status,
      realHours,
      deviation:    realHours !== null ? Math.round((realHours - Number(l.plannedHours)) * 100) / 100 : null,
      pausedDurationMinutes: Math.round(((l.pausedDurationMinutes ?? 0) + currentPausedMins) * 100) / 100,
      technicianId:   l.technicianId   ?? null,
      technicianName: l.technicianName ?? null,
    };
  }
}
