import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Between } from 'typeorm';
import { TrackingLog } from '../tracking/tracking-log.entity';
import { IsString, IsNumber, IsEnum, IsOptional, Matches, Min, ValidateIf } from 'class-validator';
import { BodyshopEntry } from './bodyshop-entry.entity';
import { BodyshopProcess } from './bodyshop-process.entity';
import { BodyshopProcessTech } from './bodyshop-process-tech.entity';
import { BodyshopEntryProcessSlot } from './bodyshop-entry-process-slot.entity';
import { TechniciansService } from '../technicians/technicians.service';
import { WorkshopsService } from '../workshops/workshops.service';
import { TechnicianAbsence } from '../capacity/technician-absence.entity';
import { WorkingDay } from '../capacity/working-day.entity';
import { BudgetAppointment, BudgetProcess } from '../budget-appointments/budget-appointment.entity';
import { DmsAgendamientoService } from './dms-agendamiento.service';
import { BodyshopScheduleService } from './bodyshop-schedule.service';
import { TrackingService } from '../tracking/tracking.service';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateBodyshopEntryDto {
  @IsString({ message: 'El taller es obligatorio.' }) workshopId: string;
  @IsString({ message: 'La fecha es obligatoria.' })
  @Matches(DATE_RE, { message: 'La fecha debe tener formato YYYY-MM-DD.' })
  date: string;
  @IsOptional() @ValidateIf(o => o.workTypeId != null) @IsString({ message: 'El tipo de trabajo no es válido.' }) workTypeId?: string | null;
  @IsString({ message: 'El nombre del cliente es obligatorio.' }) customerName: string;
  @IsString({ message: 'La chapa es obligatoria.' }) plate: string;
  @IsNumber({}, { message: 'Completá las horas de chapería con un valor numérico (no puede quedar vacío).' })
  @Min(0, { message: 'Las horas de chapería no pueden ser negativas.' })                                       bodyworkHours: number;
  @IsNumber({}, { message: 'Completá las horas de preparación con un valor numérico (no puede quedar vacío).' })
  @Min(0, { message: 'Las horas de preparación no pueden ser negativas.' })                                    prepHours: number;
  @IsNumber({}, { message: 'Completá las horas de pintura con un valor numérico (no puede quedar vacío).' })
  @Min(0, { message: 'Las horas de pintura no pueden ser negativas.' })                                        paintHours: number;
  // stayDays es calculado automáticamente por el scheduler; se puede sobreescribir manualmente.
  @IsOptional()
  @IsNumber({}, { message: 'Los días de estadía deben ser un número.' })
  @Min(1, { message: 'Los días de estadía deben ser al menos 1.' })
  stayDays?: number;
  @IsEnum(['walk_in', 'phone', 'online', 'insurance', 'direct'], { message: 'El canal no es válido.' }) channel: string;
  @IsOptional() @IsString() timeStart?: string | null;
  @IsOptional() @IsString() advisorCode?: string | null;
  @IsOptional() @IsString() advisorName?: string | null;
  @IsOptional() @IsString({ message: 'Las notas deben ser texto.' }) notes?: string;
  @IsOptional() @IsString({ message: 'El técnico no es válido.' }) technicianId?: string;
  // Asignación manual de técnicos por proceso (opcional). Si no vienen estos campos
  // o vienen vacíos, el sistema auto-asigna el técnico con más horas libres ese día.
  @IsOptional() @IsString({ message: 'Técnico de chapería no es válido.' })    bodyworkTechnicianId?: string | null;
  @IsOptional() @IsString({ message: 'Técnico de preparación no es válido.' }) prepTechnicianId?: string | null;
  @IsOptional() @IsString({ message: 'Técnico de pintura no es válido.' })     paintTechnicianId?: string | null;
  @IsOptional() @IsString() dmsSucursalId?: string | null;
  @IsOptional() @IsString() budgetNumber?: string | null;
  extraProcesses?: { code: string; name: string; hours: number }[] | null;
}

export class UpdateStatusDto {
  @IsEnum(['scheduled', 'in_progress', 'done', 'cancelled'], { message: 'El estado no es válido.' }) status: string;
}

export class AssignTechnicianDto {
  @IsOptional() @IsString({ message: 'El técnico no es válido.' }) technicianId: string | null;
}

export class AssignProcessTechDto {
  @IsEnum(['BODYWORK', 'PREP', 'PAINT'], { message: 'El proceso no es válido.' }) process: string;
  @IsOptional() @IsString({ message: 'El técnico no es válido.' }) technicianId: string | null;
}

export class AdjustProcessSlotDto {
  @IsNumber({}, { message: 'Las horas ajustadas deben ser un número.' })
  @Min(0.5, { message: 'Las horas mínimas son 0.5' })
  adjustedHours: number;

  @IsString({ message: 'El motivo del ajuste es obligatorio.' })
  reason: string;
}

type CapacityStatus = 'OK' | 'RISK' | 'OVERLOADED';
type BalanceProcess = 'BODYWORK' | 'PREP' | 'PAINT';

const PROCESS_LABEL: Record<BalanceProcess, string> = {
  BODYWORK: 'Chapería',
  PREP: 'Preparación',
  PAINT: 'Pintura',
};

const SPECIALTY_TO_PROCESS: Record<string, BalanceProcess> = {
  CHAPERIA: 'BODYWORK', CARROCERIA: 'BODYWORK', BODYWORK: 'BODYWORK',
  PREPARACION: 'PREP', PREP: 'PREP',
  PINTURA: 'PAINT', PAINT: 'PAINT',
};

function capacityStatus(rate: number): CapacityStatus {
  if (rate >= 1) return 'OVERLOADED';
  if (rate >= 0.8) return 'RISK';
  return 'OK';
}

function round2(n: number) { return Math.round(n * 100) / 100; }
function round1(n: number) { return Math.round(n * 10) / 10; }

@Injectable()
export class BodyshopService {
  private readonly logger = new Logger(BodyshopService.name);

  constructor(
    @InjectRepository(BodyshopEntry)             private entryRepo: Repository<BodyshopEntry>,
    @InjectRepository(BodyshopProcess)           private processRepo: Repository<BodyshopProcess>,
    @InjectRepository(BodyshopProcessTech)       private ptRepo: Repository<BodyshopProcessTech>,
    @InjectRepository(BodyshopEntryProcessSlot)  private slotRepo: Repository<BodyshopEntryProcessSlot>,
    @InjectRepository(TechnicianAbsence)         private absenceRepo: Repository<TechnicianAbsence>,
    @InjectRepository(WorkingDay)                private workingDayRepo: Repository<WorkingDay>,
    @InjectRepository(BudgetAppointment)         private budgetApptRepo: Repository<BudgetAppointment>,
    @InjectRepository(TrackingLog)               private trackingLogRepo: Repository<TrackingLog>,
    private techniciansService: TechniciansService,
    private workshopsService: WorkshopsService,
    private dmsAgendamiento: DmsAgendamientoService,
    private scheduleService: BodyshopScheduleService,
    private trackingService: TrackingService,
  ) {}

  // ── Entries CRUD ─────────────────────────────────────────────────────────────

  async create(dto: CreateBodyshopEntryDto, userId: string): Promise<BodyshopEntry> {
    const legacyHours = Number(dto.bodyworkHours) + Number(dto.prepHours) + Number(dto.paintHours);
    const extraHours  = (dto.extraProcesses ?? []).reduce((s, p) => s + (p.hours ?? 0), 0);
    const totalHours  = legacyHours + extraHours;
    if (totalHours <= 0) {
      throw new BadRequestException('Ingresá las horas en al menos un proceso.');
    }

    // Simular la agenda antes de guardar para obtener stayDays y estimatedFinishDate
    let computedStayDays   = dto.stayDays ?? 1;
    let estimatedFinishDate: string | null = null;
    let simulationSlots: any[] = [];

    let sim: Awaited<ReturnType<typeof this.scheduleService.simulate>>;
    try {
      sim = await this.scheduleService.simulate({
        bodyworkHours: dto.bodyworkHours,
        prepHours:     dto.prepHours,
        paintHours:    dto.paintHours,
        workshopId:    dto.workshopId,
        startDate:     dto.date,
        startTime:     dto.timeStart ?? '08:00',
      });
    } catch (err: any) {
      throw new BadRequestException(err?.message ?? 'Error al calcular la disponibilidad.');
    }

    if (!sim.canSchedule || sim.slots.length === 0) {
      const reason = sim.warnings.length > 0 ? sim.warnings[0] : 'Sin capacidad disponible en los próximos días.';
      throw new BadRequestException(reason);
    }

    // El primer proceso con horas (en secuencia) debe poder iniciar en la fecha solicitada.
    // Si no hay cupo ese día, se rechaza con la próxima fecha disponible.
    const firstSlot = sim.slots[0];
    if (firstSlot.date !== dto.date) {
      throw new BadRequestException(
        `Sin capacidad de ${firstSlot.processName} para el ${dto.date}. Próxima disponibilidad: ${firstSlot.date}.`,
      );
    }

    simulationSlots    = sim.slots;
    estimatedFinishDate = sim.estimatedFinishDate;
    const uniqueDates   = new Set(sim.slots.map((s: any) => s.date));
    computedStayDays    = dto.stayDays ?? Math.max(1, uniqueDates.size);

    const allProcesses: { code: string; name: string; hours: number }[] = [
      ...(Number(dto.bodyworkHours) > 0 ? [{ code: 'BODYWORK', name: 'Chapería',    hours: Number(dto.bodyworkHours) }] : []),
      ...(Number(dto.prepHours)     > 0 ? [{ code: 'PREP',     name: 'Preparación', hours: Number(dto.prepHours)     }] : []),
      ...(Number(dto.paintHours)    > 0 ? [{ code: 'PAINT',    name: 'Pintura',     hours: Number(dto.paintHours)    }] : []),
      ...(dto.extraProcesses ?? []).filter(p => p.hours > 0),
    ];

    // Bloquear patente duplicada: no permitir dos trabajos activos para el mismo vehículo
    const existingActive = await this.entryRepo
      .createQueryBuilder('e')
      .where('e.workshopId = :wsId', { wsId: dto.workshopId })
      .andWhere('UPPER(e.plate) = UPPER(:plate)', { plate: dto.plate.trim() })
      .andWhere('e.status NOT IN (:...statuses)', { statuses: ['done', 'cancelled'] })
      .getOne();
    if (existingActive) {
      throw new BadRequestException(
        `Ya existe un trabajo activo para la patente ${dto.plate.trim().toUpperCase()} · ${existingActive.customerName}`
      );
    }

    const entry = this.entryRepo.create({
      workshopId:          dto.workshopId,
      date:                dto.date,
      workTypeId:          dto.workTypeId ?? null,
      customerName:        dto.customerName,
      plate:               dto.plate,
      status:              'scheduled',
      bodyworkHours:       dto.bodyworkHours,
      prepHours:           dto.prepHours,
      paintHours:          dto.paintHours,
      stayDays:            computedStayDays,
      channel:             dto.channel,
      timeStart:           dto.timeStart ?? null,
      advisorCode:         dto.advisorCode ?? null,
      advisorName:         dto.advisorName ?? null,
      notes:               dto.notes ?? null,
      technicianId:        dto.technicianId ?? null,
      estimatedFinishDate,
      budgetNumber:        dto.budgetNumber ?? null,
      processes:           allProcesses.length > 0 ? allProcesses : null,
      waitingForResource:  false,
      resourceNote:        null,
      resourceBlockedAt:   null,
      createdBy:           userId,
    });
    const saved = await this.entryRepo.save(entry);

    const hoursByCode: Record<string, number> = allProcesses.reduce<Record<string, number>>(
      (acc, p) => ({ ...acc, [p.code]: p.hours }), {},
    );
    void this.processRepo
      .find({ where: { active: true }, order: { sequence: 'ASC' } })
      .then(procs => {
        const catalogProcs = procs
          .filter(p => (hoursByCode[p.code] ?? 0) > 0)
          .map(p => ({ name: p.name, code: p.code, order: p.sequence, hours: hoursByCode[p.code] ?? 0 }));
        const catalogCodes = new Set(procs.map(p => p.code));
        const extraTracking = allProcesses
          .filter(p => !catalogCodes.has(p.code))
          .map((p, i) => ({ name: p.name, code: p.code, order: 100 + i, hours: p.hours }));
        return this.trackingService.initForBodyshop(saved.id, [...catalogProcs, ...extraTracking]);
      })
      .catch(err => this.logger.warn(`tracking init failed: ${err.message}`));

    // Guardar slots generados por el scheduler
    if (simulationSlots.length > 0) {
      const slotEntities = simulationSlots.map((s: any) => {
        const slot = new BodyshopEntryProcessSlot();
        slot.entryId   = saved.id;
        slot.process   = s.process as string;
        slot.date      = s.date;
        slot.timeStart = s.timeStart;
        slot.timeEnd   = s.timeEnd;
        slot.hours     = s.hours;
        slot.sequence  = s.sequence;
        slot.status    = 'pending';
        return slot;
      });
      await this.slotRepo.save(slotEntities);
    }

    // Auto-asignación de técnico por proceso. Si el operador pasó IDs manuales
    // se usan tal cual; si no, se elige el técnico con más horas libres en la fecha
    // real del proceso (no siempre el día de entrada — PREP/PAINT pueden caer días después).
    // Envuelto en try/catch para que un fallo de asignación nunca bloquee la creación.
    try {
      const slotDateFor = (proc: BalanceProcess) =>
        simulationSlots.find((s: any) => s.process === proc)?.date ?? dto.date;

      const processAssignments: { proc: BalanceProcess; hours: number; manualId?: string | null }[] = [
        { proc: 'BODYWORK', hours: Number(dto.bodyworkHours), manualId: dto.bodyworkTechnicianId },
        { proc: 'PREP',     hours: Number(dto.prepHours),     manualId: dto.prepTechnicianId     },
        { proc: 'PAINT',    hours: Number(dto.paintHours),    manualId: dto.paintTechnicianId    },
      ];

      // Cache de disponibilidad por fecha para evitar N queries si varios procesos caen el mismo día.
      const availabilityCache = new Map<string, Awaited<ReturnType<typeof this.getTechnicianAvailability>>>();
      const getAvailability = async (date: string) => {
        if (!availabilityCache.has(date)) {
          availabilityCache.set(date, await this.getTechnicianAvailability(dto.workshopId, date));
        }
        return availabilityCache.get(date)!;
      };

      for (const { proc, hours, manualId } of processAssignments) {
        if (hours <= 0) continue;
        let techId = manualId ?? null;
        if (!techId) {
          const availability = await getAvailability(slotDateFor(proc));
          const candidates = availability
            .filter(t => t.process === proc)
            .sort((a, b) => b.hoursFree - a.hoursFree);
          techId = candidates[0]?.id ?? null;
        }
        if (techId) {
          await this.ptRepo.save(this.ptRepo.create({ entryId: saved.id, process: proc, technicianId: techId }));
        }
      }
    } catch (autoErr) {
      this.logger.error(`Auto-assign failed for entry ${saved.id}: ${autoErr?.message ?? autoErr}`, autoErr?.stack);
    }

    const dmsSync = await this.pushToDms(saved, dto).catch(err => {
      this.logger.error(`DMS push inesperado para entry ${saved.id}: ${err.message}`);
      return { success: false, error: err.message as string };
    });

    const loaded = await this.loadEntry(saved.id);
    return { ...loaded, dmsSync } as any;
  }

  // ── Schedule (slots por vehículo) ────────────────────────────────────────────

  async getEntrySchedule(entryId: string) {
    const entry = await this.entryRepo.findOne({ where: { id: entryId } });
    if (!entry) throw new NotFoundException('Ingreso no encontrado');

    const slots = await this.slotRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.technician', 'technician')
      .where('s.entry_id = :entryId', { entryId })
      .orderBy('s.date', 'ASC')
      .addOrderBy('s.time_start', 'ASC')
      .getMany();

    return {
      entryId,
      estimatedFinishDate: entry.estimatedFinishDate,
      stayDays:            entry.stayDays,
      slots:               slots.map(s => ({
        id:              s.id,
        process:         s.process,
        date:            s.date,
        timeStart:       s.timeStart,
        timeEnd:         s.timeEnd,
        hours:           s.finalHours,
        originalHours:   s.hours,
        adjustedHours:   s.adjustedHours,
        sequence:        s.sequence,
        status:          s.status,
        technicianId:    s.technicianId,
        technician:      s.technician,
        adjustmentReason: s.adjustmentReason,
        adjustedBy:      s.adjustedBy,
        adjustedAt:      s.adjustedAt,
      })),
    };
  }

  async adjustProcessSlot(
    entryId: string,
    slotId: string,
    dto: AdjustProcessSlotDto,
    userId: string,
  ) {
    const slot = await this.slotRepo.findOne({ where: { id: slotId, entryId } });
    if (!slot) throw new NotFoundException('Slot no encontrado');

    slot.adjustedHours     = dto.adjustedHours;
    slot.adjustmentReason  = dto.reason;
    slot.adjustedBy        = userId;
    slot.adjustedAt        = new Date();

    await this.slotRepo.save(slot);
    return slot;
  }

  // Recalcula slots y estimatedFinishDate cuando cambian las horas del presupuesto
  async recalculateSchedule(entryId: string): Promise<void> {
    const entry = await this.entryRepo.findOne({ where: { id: entryId } });
    if (!entry) return;

    try {
      const sim = await this.scheduleService.simulate({
        bodyworkHours:   Number(entry.bodyworkHours),
        prepHours:       Number(entry.prepHours),
        paintHours:      Number(entry.paintHours),
        workshopId:      entry.workshopId,
        startDate:       entry.date,
        startTime:       entry.timeStart ?? '08:00',
        entryIdExclude:  entry.id,
      });

      // Borrar slots pendientes y regenerar
      await this.slotRepo.delete({ entryId, status: 'pending' });

      if (sim.canSchedule && sim.slots.length > 0) {
        const slotEntities = sim.slots.map(s => {
          const slot = new BodyshopEntryProcessSlot();
          slot.entryId   = entry.id;
          slot.process   = s.process as string;
          slot.date      = s.date;
          slot.timeStart = s.timeStart;
          slot.timeEnd   = s.timeEnd;
          slot.hours     = s.hours;
          slot.sequence  = s.sequence;
          slot.status    = 'pending';
          return slot;
        });
        await this.slotRepo.save(slotEntities);

        const uniqueDates = new Set(sim.slots.map(s => s.date));
        entry.stayDays            = uniqueDates.size;
        entry.estimatedFinishDate = sim.estimatedFinishDate;
        await this.entryRepo.save(entry);
      }
    } catch (err: any) {
      this.logger.warn(`recalculateSchedule failed for ${entryId}: ${err.message}`);
    }
  }

  async getDmsSucursales() {
    return this.dmsAgendamiento.getSucursales();
  }

  async getDmsAsesores(sucursalId?: string | null) {
    return this.dmsAgendamiento.getAsesores(sucursalId);
  }

  private async pushToDms(entry: BodyshopEntry, dto: CreateBodyshopEntryDto): Promise<{ success: boolean; dmsId?: string; error?: string } | null> {
    const ws       = await this.workshopsService.findOne(dto.workshopId);
    const wsConfig = ws.config as any;
    const dmsCfg   = wsConfig?.dmsIntegration as { enabled?: boolean; defaultAdvisorId?: string } | undefined;

    if (!dmsCfg?.enabled) return null;

    const advisorId = dto.advisorCode ?? dmsCfg.defaultAdvisorId;
    if (!advisorId) {
      this.logger.warn(`DMS push omitido para ${entry.plate}: sin advisorId ni defaultAdvisorId`);
      return null;
    }

    const totalHours  = Number(dto.bodyworkHours) + Number(dto.prepHours) + Number(dto.paintHours);
    const startTime   = dto.timeStart ?? '08:00:00';
    const endTime     = DmsAgendamientoService.calcEndTime(startTime, totalHours);

    const processLines = [
      dto.bodyworkHours > 0 ? `Chapería: ${dto.bodyworkHours}h` : null,
      dto.prepHours     > 0 ? `Prep: ${dto.prepHours}h`         : null,
      dto.paintHours    > 0 ? `Pintura: ${dto.paintHours}h`     : null,
    ].filter(Boolean).join(' | ');

    return this.dmsAgendamiento.push({
      title:        `Ingreso Carrocería — ${entry.plate}`,
      startDate:    entry.date,
      startTime,
      endTime,
      advisorId,
      idSucursal:   dto.dmsSucursalId ?? undefined,
      customerName: entry.customerName,
      phone:        '',
      vehicle:      entry.plate,
      description:  [processLines, dto.notes].filter(Boolean).join('\n'),
    });
  }

  async getEntriesByRange(workshopId: string, from: string, to: string): Promise<BodyshopEntry[]> {
    const entries = await this.entryRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.workType', 'workType')
      .leftJoinAndSelect('e.technician', 'technician')
      .leftJoinAndSelect('e.processTechsList', 'pt')
      .leftJoinAndSelect('pt.technician', 'ptTech')
      .where('e.workshopId = :workshopId', { workshopId })
      .andWhere('e.date >= :from AND e.date <= :to', { from, to })
      .orderBy('e.date', 'ASC')
      .getMany();
    return entries.map(e => this.formatEntry(e));
  }

  async cancel(id: string, user: { id: string; role: string }): Promise<void> {
    const entry = await this.entryRepo.findOne({ where: { id } });
    if (!entry) throw new NotFoundException('Ingreso no encontrado');
    if (user.role !== 'admin' && entry.createdBy !== user.id) {
      throw new ForbiddenException('Solo podés cancelar tus propios ingresos');
    }
    entry.status = 'cancelled';
    await this.entryRepo.save(entry);
  }

  async updateHours(id: string, dto: { bodyworkHours?: number; prepHours?: number; paintHours?: number; stayDays?: number }): Promise<BodyshopEntry> {
    const entry = await this.entryRepo.findOne({ where: { id } });
    if (!entry) throw new NotFoundException('Ingreso no encontrado');

    const hoursChanged =
      (dto.bodyworkHours !== undefined && dto.bodyworkHours !== Number(entry.bodyworkHours)) ||
      (dto.prepHours     !== undefined && dto.prepHours     !== Number(entry.prepHours))     ||
      (dto.paintHours    !== undefined && dto.paintHours    !== Number(entry.paintHours));

    if (dto.bodyworkHours !== undefined) entry.bodyworkHours = dto.bodyworkHours;
    if (dto.prepHours     !== undefined) entry.prepHours     = dto.prepHours;
    if (dto.paintHours    !== undefined) entry.paintHours    = dto.paintHours;
    if (dto.stayDays      !== undefined) entry.stayDays      = dto.stayDays;
    await this.entryRepo.save(entry);

    // Si cambiaron las horas del presupuesto, recalcular agenda
    if (hoursChanged) {
      await this.recalculateSchedule(id);
    }

    return this.loadEntry(id);
  }

  async updateStatus(id: string, status: string): Promise<BodyshopEntry> {
    const entry = await this.entryRepo.findOne({ where: { id } });
    if (!entry) throw new NotFoundException('Ingreso no encontrado');
    entry.status = status;
    await this.entryRepo.save(entry);
    return this.loadEntry(id);
  }

  async assignTechnician(id: string, technicianId: string | null): Promise<BodyshopEntry> {
    const entry = await this.entryRepo.findOne({ where: { id } });
    if (!entry) throw new NotFoundException('Ingreso no encontrado');
    entry.technicianId = technicianId;
    await this.entryRepo.save(entry);
    return this.loadEntry(id);
  }

  async assignProcessTechnician(id: string, process: string, technicianId: string | null): Promise<BodyshopEntry> {
    const entry = await this.entryRepo.findOne({ where: { id } });
    if (!entry) throw new NotFoundException('Ingreso no encontrado');

    if (technicianId === null) {
      await this.ptRepo.delete({ entryId: id, process });
    } else {
      const existing = await this.ptRepo.findOne({ where: { entryId: id, process } });
      if (existing) {
        existing.technicianId = technicianId;
        await this.ptRepo.save(existing);
      } else {
        await this.ptRepo.save(this.ptRepo.create({ entryId: id, process, technicianId }));
      }
    }
    return this.loadEntry(id);
  }

  async releaseTech(id: string): Promise<BodyshopEntry> {
    const entry = await this.entryRepo.findOne({
      where: { id },
      relations: ['processTechsList', 'processTechsList.technician'],
    });
    if (!entry) throw new NotFoundException('Ingreso no encontrado');
    if (entry.noStartAt) throw new BadRequestException('Este ingreso ya fue liberado previamente');

    const anyStarted = await this.trackingLogRepo.findOne({
      where: { sourceType: 'bodyshop', sourceId: id, status: 'in_progress' as any },
    });
    if (anyStarted) throw new BadRequestException('El trabajo ya fue iniciado, no se puede liberar');

    entry.noStartTechSnapshot = (entry.processTechsList ?? []).map(pt => ({
      process:        pt.process,
      technicianId:   pt.technicianId,
      technicianName: (pt.technician as any)?.name ?? pt.technicianId,
    }));
    entry.noStartHoursLost = Number(entry.bodyworkHours) + Number(entry.prepHours) + Number(entry.paintHours);
    entry.noStartAt        = new Date();
    entry.technicianId     = null;

    await this.ptRepo.delete({ entryId: id });
    await this.entryRepo.save(entry);
    return this.loadEntry(id);
  }

  // ── Bodyshop Day Capacity ────────────────────────────────────────────────────

  async getDayCapacity(workshopId: string, date: string) {
    const ws = await this.workshopsService.findOne(workshopId);
    const technicians = await this.techniciansService.findAll(ws.name);
    const [workingDay, absences, entriesInShop, pendingBudgets] = await Promise.all([
      this.workingDayRepo.findOne({ where: { date } }),
      this.absenceRepo.find({ where: { date } }),
      this.entryRepo
        .createQueryBuilder('e')
        .leftJoinAndSelect('e.workType', 'workType')
        .leftJoinAndSelect('e.technician', 'technician')
        .leftJoinAndSelect('e.processTechsList', 'pt')
        .leftJoinAndSelect('pt.technician', 'ptTech')
        .where('e.workshopId = :workshopId', { workshopId })
        .andWhere("e.status != 'cancelled'")
        .andWhere("CAST(e.date AS DATE) <= CAST(:date AS DATE)", { date })
        .andWhere("CAST(e.date AS DATE) + (e.stay_days * INTERVAL '1 day') > CAST(:date AS DATE)", { date })
        .orderBy('e.date', 'ASC')
        .getMany(),
      this.budgetApptRepo.find({ where: { workshopId, date, status: 'pending' } }),
    ]);
    return this.computeDayCapacity(workshopId, date, ws, technicians, workingDay ?? null, absences, entriesInShop, pendingBudgets);
  }

  async getWeekCapacity(workshopId: string, from: string, to: string) {
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) throw new BadRequestException('Formato de fecha inválido');

    const ws = await this.workshopsService.findOne(workshopId);
    const technicians = await this.techniciansService.findAll(ws.name);

    const [workingDays, absences, entriesInRange, pendingBudgets] = await Promise.all([
      this.workingDayRepo.find({ where: { date: Between(from, to) } }),
      this.absenceRepo.find({ where: { date: Between(from, to) } }),
      this.entryRepo
        .createQueryBuilder('e')
        .leftJoinAndSelect('e.workType', 'workType')
        .leftJoinAndSelect('e.technician', 'technician')
        .leftJoinAndSelect('e.processTechsList', 'pt')
        .leftJoinAndSelect('pt.technician', 'ptTech')
        .where('e.workshopId = :workshopId', { workshopId })
        .andWhere("e.status != 'cancelled'")
        .andWhere("CAST(e.date AS DATE) <= CAST(:to AS DATE)", { to })
        .andWhere("CAST(e.date AS DATE) + (e.stay_days * INTERVAL '1 day') > CAST(:from AS DATE)", { from })
        .orderBy('e.date', 'ASC')
        .getMany(),
      this.budgetApptRepo.find({ where: { workshopId, status: 'pending', date: Between(from, to) } }),
    ]);

    const workingDayMap  = new Map(workingDays.map(w => [w.date, w]));
    const absencesByDate = new Map<string, TechnicianAbsence[]>();
    const pendingByDate  = new Map<string, BudgetAppointment[]>();

    for (const a of absences) {
      if (!absencesByDate.has(a.date)) absencesByDate.set(a.date, []);
      absencesByDate.get(a.date)!.push(a);
    }
    for (const b of pendingBudgets) {
      if (!pendingByDate.has(b.date)) pendingByDate.set(b.date, []);
      pendingByDate.get(b.date)!.push(b);
    }

    const result: Record<string, any> = {};
    const current = new Date(from + 'T12:00:00');
    const end     = new Date(to   + 'T12:00:00');

    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      const dateMs  = current.getTime();

      const dayEntries = entriesInRange.filter(e => {
        const entryMs  = new Date(e.date + 'T12:00:00').getTime();
        const stayDays = Math.max(Number((e as any).stayDays) || 1, 1);
        return entryMs <= dateMs && entryMs + stayDays * 86_400_000 > dateMs;
      });

      result[dateStr] = this.computeDayCapacity(
        workshopId, dateStr, ws, technicians,
        workingDayMap.get(dateStr) ?? null,
        absencesByDate.get(dateStr) ?? [],
        dayEntries,
        pendingByDate.get(dateStr) ?? [],
      );

      current.setDate(current.getDate() + 1);
    }
    return result;
  }

  private computeDayCapacity(
    workshopId: string,
    date: string,
    ws: any,
    technicians: any[],
    workingDay: WorkingDay | null,
    absences: TechnicianAbsence[],
    entriesInShop: BodyshopEntry[],
    pendingBudgets: BudgetAppointment[],
  ) {
    const activeTechs     = technicians.filter(t => t.active);
    const absenceMap      = new Map(absences.map(a => [a.technicianId, a.type]));
    const dayOfWeek       = new Date(date + 'T12:00:00').getDay();
    const isSunday        = dayOfWeek === 0;
    const isGlobalHoliday = workingDay?.isWorkingDay === false;

    const wsConfig = ws.config as any;
    const specIds = wsConfig?.processSpecialtyIds as { BODYWORK: string[]; PREP: string[]; PAINT: string[] } | undefined;

    const techProcess = (specialty: string | null): BalanceProcess | null => {
      const sp = (specialty ?? '').toUpperCase();
      if (specIds) {
        if (specIds.BODYWORK.includes(sp)) return 'BODYWORK';
        if (specIds.PREP.includes(sp))     return 'PREP';
        if (specIds.PAINT.includes(sp))    return 'PAINT';
      }
      return SPECIALTY_TO_PROCESS[sp] ?? null;
    };

    const availableByProcess: Record<BalanceProcess, number> = { BODYWORK: 0, PREP: 0, PAINT: 0 };

    for (const tech of activeTechs) {
      const proc = techProcess(tech.specialty);
      if (!proc) continue;
      const absType = absenceMap.get(tech.id) ?? null;
      let avail = Number(tech.dailyHours);
      if (isSunday || isGlobalHoliday || absType === 'full') {
        avail = 0;
      } else if (absType === 'half' || absType === 'holiday') {
        avail = avail / 2;
      }
      availableByProcess[proc] += avail;
    }

    const baseDailyCapByProcess: Record<BalanceProcess, number> = { BODYWORK: 0, PREP: 0, PAINT: 0 };
    for (const tech of activeTechs) {
      const proc = techProcess(tech.specialty);
      if (!proc) continue;
      baseDailyCapByProcess[proc] += Number(tech.dailyHours);
    }

    const occupiedByProcess: Record<BalanceProcess, number> = { BODYWORK: 0, PREP: 0, PAINT: 0 };

    for (const e of entriesInShop) {
      const bwH   = Number(e.bodyworkHours);
      const prepH = Number(e.prepHours);
      const pntH  = Number(e.paintHours);

      const bwC   = baseDailyCapByProcess.BODYWORK;
      const prepC = baseDailyCapByProcess.PREP;
      const pntC  = baseDailyCapByProcess.PAINT;

      const bwDays   = bwH   > 0 ? (bwC   > 0 ? Math.ceil(bwH   / bwC)   : 1) : 0;
      const prepDays = prepH > 0 ? (prepC > 0 ? Math.ceil(prepH / prepC) : 1) : 0;
      const pntDays  = pntH  > 0 ? (pntC  > 0 ? Math.ceil(pntH  / pntC)  : 1) : 0;

      const prepStart = bwDays;
      const pntStart  = bwDays + prepDays;
      const totalDays = bwDays + prepDays + pntDays;

      const entryMs  = new Date(e.date + 'T12:00:00').getTime();
      const dateMs   = new Date(date   + 'T12:00:00').getTime();
      const dayIndex = Math.round((dateMs - entryMs) / 86_400_000);

      if (dayIndex < 0 || dayIndex >= totalDays) continue;

      if (dayIndex < prepStart) {
        occupiedByProcess.BODYWORK += bwDays   > 0 ? bwH   / bwDays   : 0;
      } else if (dayIndex < pntStart) {
        occupiedByProcess.PREP     += prepDays > 0 ? prepH / prepDays : 0;
      } else {
        occupiedByProcess.PAINT    += pntDays  > 0 ? pntH  / pntDays  : 0;
      }
    }

    for (const budget of pendingBudgets) {
      const procs: BudgetProcess[] = budget.processes ?? [];
      for (const p of procs) {
        if (p.code === 'BODYWORK')      occupiedByProcess.BODYWORK += Number(p.hours);
        else if (p.code === 'PREP')     occupiedByProcess.PREP     += Number(p.hours);
        else if (p.code === 'PAINT')    occupiedByProcess.PAINT    += Number(p.hours);
      }
    }

    const techHoursMap = new Map<string, number>();
    for (const e of entriesInShop) {
      const stayDays = Math.max(Number((e as any).stayDays) || 1, 1);

      const processDefs: Array<{ code: BalanceProcess; hours: number }> = [
        { code: 'BODYWORK', hours: Number(e.bodyworkHours) },
        { code: 'PREP',     hours: Number(e.prepHours)     },
        { code: 'PAINT',    hours: Number(e.paintHours)    },
      ];

      for (const { code, hours } of processDefs) {
        if (hours <= 0) continue;
        const dailyShare = hours / stayDays;

        const assigned = ((e as any).processTechsList ?? []).find(
          (pt: any) => pt.process === code && pt.technicianId,
        );

        if (assigned) {
          techHoursMap.set(assigned.technicianId, (techHoursMap.get(assigned.technicianId) ?? 0) + dailyShare);
        } else {
          const procTechs = activeTechs.filter(t => techProcess(t.specialty) === code);
          if (procTechs.length > 0) {
            const share = dailyShare / procTechs.length;
            for (const tech of procTechs) {
              techHoursMap.set(tech.id, (techHoursMap.get(tech.id) ?? 0) + share);
            }
          }
        }
      }
    }

    const byTechnician = activeTechs.map(tech => {
      const absType = absenceMap.get(tech.id) ?? null;
      let avail = Number(tech.dailyHours);
      if (isSunday || isGlobalHoliday || absType === 'full') avail = 0;
      else if (absType === 'half' || absType === 'holiday') avail = avail / 2;
      return {
        technicianId:   tech.id,
        technicianName: tech.name,
        specialty:      tech.specialty ?? null,
        process:        techProcess(tech.specialty),
        dailyHours:     round2(Number(tech.dailyHours)),
        availableHours: round2(avail),
        usedHours:      round2(techHoursMap.get(tech.id) ?? 0),
        absenceType:    absType,
        isWorkingDay:   !isSunday && !isGlobalHoliday,
      };
    });

    const byProcess: Record<BalanceProcess, any> = {} as any;
    let totalCommercializable = 0;
    let totalOccupied = 0;

    for (const proc of (['BODYWORK', 'PREP', 'PAINT'] as BalanceProcess[])) {
      const comm  = round2(availableByProcess[proc]);
      const occ   = round2(occupiedByProcess[proc]);
      const avail = round2(comm - occ);
      const rate  = comm > 0 ? round2(occ / comm) : 0;
      byProcess[proc] = {
        process: proc,
        label: PROCESS_LABEL[proc],
        commercializableHours: comm,
        occupiedHours: occ,
        availableHours: avail,
        occupancyRate: rate,
        status: capacityStatus(rate),
      };
      totalCommercializable += comm;
      totalOccupied += occ;
    }

    const globalRate = totalCommercializable > 0 ? round2(totalOccupied / totalCommercializable) : 0;
    return {
      workshopId,
      date,
      commercializableTotal: round2(totalCommercializable),
      byProcess,
      byTechnician,
      globalOccupancyRate: globalRate,
      globalStatus: capacityStatus(globalRate),
      entries: entriesInShop.map(e => this.formatEntry(e)),
      pendingBudgets: pendingBudgets.length,
    };
  }

  // ── Disponibilidad por técnico (para auto-asignación y selector manual) ─────
  // Devuelve por cada técnico activo del taller: capacidad del día, horas que ya
  // tiene asignadas en procesos del bodyshop y horas libres restantes.
  // Los técnicos saturados (libres ≤ 0) se incluyen igual con flag overhour=true,
  // porque el operador puede asignarlos sabiendo que será horas extras.
  async getTechnicianAvailability(workshopId: string, date: string) {
    if (!DATE_RE.test(date)) throw new BadRequestException('Formato de fecha inválido');
    const ws = await this.workshopsService.findOne(workshopId);
    const technicians = await this.techniciansService.findAll(ws.name);
    const activeTechs = technicians.filter(t => t.active);

    const workingDay = await this.workingDayRepo.findOne({ where: { date } });
    const absences   = await this.absenceRepo.find({ where: { date } });
    const absenceMap = new Map(absences.map(a => [a.technicianId, a.type]));

    const dayOfWeek = new Date(date + 'T12:00:00').getDay();
    const isSunday  = dayOfWeek === 0;
    const isGlobalHoliday = workingDay?.isWorkingDay === false;

    const wsConfig = ws.config as any;
    const specIds = wsConfig?.processSpecialtyIds as { BODYWORK: string[]; PREP: string[]; PAINT: string[] } | undefined;
    const techProcess = (specialty: string | null): BalanceProcess | null => {
      const sp = (specialty ?? '').toUpperCase();
      if (specIds) {
        if (specIds.BODYWORK.includes(sp)) return 'BODYWORK';
        if (specIds.PREP.includes(sp))     return 'PREP';
        if (specIds.PAINT.includes(sp))    return 'PAINT';
      }
      return SPECIALTY_TO_PROCESS[sp] ?? null;
    };

    // Entries en taller en esa fecha — para sumar horas asignadas a cada técnico.
    const entriesInShop = await this.entryRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.processTechsList', 'pt')
      .where('e.workshopId = :workshopId', { workshopId })
      .andWhere("e.status != 'cancelled'")
      .andWhere("CAST(e.date AS DATE) <= CAST(:date AS DATE)", { date })
      .andWhere("CAST(e.date AS DATE) + (e.stay_days * INTERVAL '1 day') > CAST(:date AS DATE)", { date })
      .getMany();

    // Para cada técnico, sumar horas de los procesos que tiene asignados.
    const hoursAssigned = new Map<string, { BODYWORK: number; PREP: number; PAINT: number }>();
    const ensure = (techId: string) => {
      if (!hoursAssigned.has(techId)) hoursAssigned.set(techId, { BODYWORK: 0, PREP: 0, PAINT: 0 });
      return hoursAssigned.get(techId)!;
    };
    for (const e of entriesInShop) {
      const stayDays = Math.max(Number((e as any).stayDays) || 1, 1);
      for (const pt of e.processTechsList ?? []) {
        if (!pt.technicianId) continue;
        const proc = pt.process as BalanceProcess;
        const totalHours =
          proc === 'BODYWORK' ? Number(e.bodyworkHours) :
          proc === 'PREP'     ? Number(e.prepHours)     :
                                 Number(e.paintHours);
        ensure(pt.technicianId)[proc] += totalHours / stayDays;
      }
    }

    return activeTechs.map(t => {
      const proc = techProcess(t.specialty);
      const absType = absenceMap.get(t.id) ?? null;
      let dailyAvail = Number(t.dailyHours);
      let absenceLabel: string | null = null;
      if (isSunday || isGlobalHoliday) { dailyAvail = 0; absenceLabel = isSunday ? 'Domingo' : 'Feriado'; }
      else if (absType === 'full')     { dailyAvail = 0; absenceLabel = 'Ausente todo el día'; }
      else if (absType === 'half')     { dailyAvail = dailyAvail / 2; absenceLabel = 'Media jornada'; }
      else if (absType === 'holiday')  { dailyAvail = dailyAvail / 2; absenceLabel = 'Asueto media'; }

      const occ = hoursAssigned.get(t.id) ?? { BODYWORK: 0, PREP: 0, PAINT: 0 };
      const occAll = occ.BODYWORK + occ.PREP + occ.PAINT;
      const free   = round2(dailyAvail - occAll);

      return {
        id:          t.id,
        name:        t.name,
        specialty:   t.specialty,
        process:     proc,                // BODYWORK | PREP | PAINT | null
        dailyHours:  round2(dailyAvail),
        hoursAssigned: round2(occAll),
        hoursFree:   free,
        overhour:    free <= 0,           // true = asignarlo implica horas extras
        absenceLabel,                     // descripción si hay ausencia/feriado/domingo
      };
    });
  }

  // ── Monthly Report ────────────────────────────────────────────────────────────

  async getMonthlyReport(workshopId: string, year: number, month: number) {
    const ws = await this.workshopsService.findOne(workshopId);
    const technicians = await this.techniciansService.findAll(ws.name);
    const activeTechs = technicians.filter(t => t.active);

    const prefix = `${year}-${month.toString().padStart(2, '0')}`;
    const from   = `${prefix}-01`;
    const to     = new Date(year, month, 0).toISOString().split('T')[0];

    const entries   = await this.entryRepo.find({
      where: { workshopId },
      relations: ['processTechsList'],
    });
    const monthEntries = entries.filter(e => e.date.startsWith(prefix) && e.status !== 'cancelled');
    const absences     = await this.absenceRepo.find({
      where: { date: from },
    });
    const allAbsences  = await this.absenceRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.technician', 'tech')
      .where('a.date >= :from AND a.date <= :to', { from, to })
      .getMany();

    const wsConfig = ws.config as any;
    const specIds  = wsConfig?.processSpecialtyIds as { BODYWORK: string[]; PREP: string[]; PAINT: string[] } | undefined;

    const techProcess = (specialty: string | null): BalanceProcess | null => {
      const sp = (specialty ?? '').toUpperCase();
      if (specIds) {
        if (specIds.BODYWORK.includes(sp)) return 'BODYWORK';
        if (specIds.PREP.includes(sp))     return 'PREP';
        if (specIds.PAINT.includes(sp))    return 'PAINT';
      }
      return SPECIALTY_TO_PROCESS[sp] ?? null;
    };

    const entryHours = (e: BodyshopEntry, proc: BalanceProcess): number => {
      if (proc === 'BODYWORK') return Number(e.bodyworkHours);
      if (proc === 'PREP')     return Number(e.prepHours);
      return Number(e.paintHours);
    };

    const rows: any[] = activeTechs.flatMap(t => {
      const process = techProcess(t.specialty);
      if (!process) return [];

      const monthlyTarget = (t as any).monthlyTargetHours ?? Number(t.dailyHours) * 22;
      let assignedHours = 0;
      let workedHours   = 0;
      const workedDates = new Set<string>();

      for (const e of monthEntries) {
        const pt = e.processTechsList?.find(p => p.process === process);
        if (pt?.technicianId !== t.id) continue;
        const h = entryHours(e, process);
        assignedHours += h;
        workedDates.add(e.date);
        if (e.status === 'done') workedHours += h;
      }

      const absenceDays = allAbsences.filter(a => a.technicianId === t.id).length;
      const rt          = monthlyTarget > 0 ? assignedHours / monthlyTarget : 0;

      return [{
        technicianId:      t.id,
        technicianName:    t.name,
        process,
        processLabel:      PROCESS_LABEL[process],
        monthlyTarget,
        assignedHours:     round1(assignedHours),
        workedHours:       round1(workedHours),
        balanceHours:      round1(monthlyTarget - assignedHours),
        compliancePercent: monthlyTarget > 0 ? Math.round((workedHours / monthlyTarget) * 100) : 0,
        loadRatio:         round2(rt),
        absenceDays,
        workedDays:        workedDates.size,
        rankLoadAsc:       0,
        rankLoadDesc:      0,
      }];
    });

    const sorted = [...rows].sort((a, b) => a.loadRatio - b.loadRatio || a.assignedHours - b.assignedHours);
    sorted.forEach((r, i) => {
      r.rankLoadAsc  = i + 1;
      r.rankLoadDesc = rows.length - i;
    });

    return rows.sort((a, b) => a.rankLoadAsc - b.rankLoadAsc);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async loadEntry(id: string): Promise<BodyshopEntry> {
    const entry = await this.entryRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.workType', 'workType')
      .leftJoinAndSelect('e.technician', 'technician')
      .leftJoinAndSelect('e.processTechsList', 'pt')
      .leftJoinAndSelect('pt.technician', 'ptTech')
      .where('e.id = :id', { id })
      .getOne();
    if (!entry) throw new NotFoundException('Ingreso no encontrado');
    return this.formatEntry(entry);
  }

  // ── Schedule (Gantt por proceso) ─────────────────────────────────────────────
  // Retorna para un rango de fechas las ventanas de proceso de cada entry activa
  // cuya estadía se solapa con ese rango.
  async getSchedule(workshopId: string, from: string, to: string) {
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) throw new BadRequestException('Formato de fecha inválido');

    const ws = await this.workshopsService.findOne(workshopId);
    const technicians = await this.techniciansService.findAll(ws.name);
    const activeTechs = technicians.filter(t => t.active);

    const wsConfig = ws.config as any;
    const specIds = wsConfig?.processSpecialtyIds as { BODYWORK: string[]; PREP: string[]; PAINT: string[] } | undefined;

    const techProcess = (specialty: string | null): BalanceProcess | null => {
      const sp = (specialty ?? '').toUpperCase();
      if (specIds) {
        if (specIds.BODYWORK.includes(sp)) return 'BODYWORK';
        if (specIds.PREP.includes(sp))     return 'PREP';
        if (specIds.PAINT.includes(sp))    return 'PAINT';
      }
      return SPECIALTY_TO_PROCESS[sp] ?? null;
    };

    // Capacidad base diaria por proceso (sin ajuste de ausencias)
    const baseDailyCap: Record<BalanceProcess, number> = { BODYWORK: 0, PREP: 0, PAINT: 0 };
    for (const tech of activeTechs) {
      const proc = techProcess(tech.specialty);
      if (!proc) continue;
      baseDailyCap[proc] += Number(tech.dailyHours);
    }

    // Entries activas cuya estadía se solapa con el rango from..to
    const entries = await this.entryRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.workType', 'workType')
      .leftJoinAndSelect('e.technician', 'technician')
      .leftJoinAndSelect('e.processTechsList', 'pt')
      .leftJoinAndSelect('pt.technician', 'ptTech')
      .where('e.workshopId = :workshopId', { workshopId })
      .andWhere("e.status != 'cancelled'")
      .andWhere("CAST(e.date AS DATE) <= CAST(:to AS DATE)", { to })
      .andWhere("CAST(e.date AS DATE) + (e.stay_days * INTERVAL '1 day') > CAST(:from AS DATE)", { from })
      .orderBy('e.date', 'ASC')
      .getMany();

    // Bulk-load tracking logs para todas las entries en un solo query
    const entryIds = entries.map(e => e.id);
    const allLogs  = entryIds.length > 0
      ? await this.trackingLogRepo.find({
          where: { sourceType: 'bodyshop', sourceId: In(entryIds) },
          order: { orderIndex: 'ASC' },
        })
      : [];
    const logsByEntry = new Map<string, TrackingLog[]>();
    for (const l of allLogs) {
      if (!logsByEntry.has(l.sourceId)) logsByEntry.set(l.sourceId, []);
      logsByEntry.get(l.sourceId)!.push(l);
    }

    // Helper: fecha planificada de salida (entry.date + totalDays, saltando domingos)
    function addCalDays(dateStr: string, days: number): string {
      const [y, m, d] = dateStr.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      let added = 0;
      while (added < days) {
        date.setDate(date.getDate() + 1);
        if (date.getDay() !== 0) added++;
      }
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    const todayStr = new Date().toISOString().slice(0, 10);

    const result = entries.map(e => {
      const bwH   = Number(e.bodyworkHours);
      const prepH = Number(e.prepHours);
      const pntH  = Number(e.paintHours);

      const bwC   = baseDailyCap.BODYWORK;
      const prepC = baseDailyCap.PREP;
      const pntC  = baseDailyCap.PAINT;

      const bwDays   = bwH   > 0 ? (bwC   > 0 ? Math.ceil(bwH   / bwC)   : 1) : 0;
      const prepDays = prepH > 0 ? (prepC > 0 ? Math.ceil(prepH / prepC) : 1) : 0;
      const pntDays  = pntH  > 0 ? (pntC  > 0 ? Math.ceil(pntH  / pntC)  : 1) : 0;

      const prepStart  = bwDays;
      const pntStart   = bwDays + prepDays;
      const totalDays  = bwDays + prepDays + pntDays;

      const processWindows: Array<{
        process: BalanceProcess;
        startDay: number;
        endDay: number;
        hours: number;
        days: number;
      }> = [];

      if (bwDays > 0) processWindows.push({ process: 'BODYWORK', startDay: 0, endDay: bwDays - 1, hours: round2(bwH), days: bwDays });
      if (prepDays > 0) processWindows.push({ process: 'PREP', startDay: prepStart, endDay: prepStart + prepDays - 1, hours: round2(prepH), days: prepDays });
      if (pntDays > 0) processWindows.push({ process: 'PAINT', startDay: pntStart, endDay: pntStart + pntDays - 1, hours: round2(pntH), days: pntDays });

      const processTechs: Record<string, { technicianId: string; technicianName: string }> = {};
      for (const pt of (e.processTechsList ?? [])) {
        const techName = (pt as any).technician?.name ?? pt.technicianId;
        processTechs[pt.process] = { technicianId: pt.technicianId, technicianName: techName };
      }

      // ── Desviación: plan vs realidad ──────────────────────────────────────────
      const plannedExitDate = totalDays > 0 ? addCalDays(e.date, totalDays) : null;

      // Estado actual desde tracking_logs (proceso madre activo o pendiente siguiente)
      const entryLogs = (logsByEntry.get(e.id) ?? []).filter(l => l.processType !== 'PARALLEL');
      const inProgressLog = entryLogs.find(l => l.status === 'in_progress' || l.status === 'blocked');
      const currentTrackingCode = inProgressLog?.processCode
        ?? entryLogs.filter(l => l.status === 'completed').at(-1)?.processCode
        ?? null;

      // Proceso planificado para HOY según las ventanas
      const todayIndex = Math.round(
        (new Date(todayStr + 'T12:00:00').getTime() - new Date(e.date + 'T12:00:00').getTime()) / 86_400_000,
      );
      let plannedProcessToday: BalanceProcess | null = null;
      for (const w of processWindows) {
        if (todayIndex >= w.startDay && todayIndex <= w.endDay) { plannedProcessToday = w.process; break; }
      }

      // Orden de proceso para comparar
      const procOrder: Record<string, number> = { AGENDA: -1, BODYWORK: 0, PREP: 1, PAINT: 2 };
      const plannedOrder = plannedProcessToday !== null ? (procOrder[plannedProcessToday] ?? 99) : 99;
      const actualOrder  = currentTrackingCode  !== null ? (procOrder[currentTrackingCode]  ?? 99) : 99;

      // Retraso en días de calendario respecto a la fecha de salida planeada
      let delayDays = 0;
      if (plannedExitDate && e.status !== 'done' && todayStr > plannedExitDate) {
        delayDays = Math.round(
          (new Date(todayStr + 'T12:00:00').getTime() - new Date(plannedExitDate + 'T12:00:00').getTime()) / 86_400_000,
        );
      }

      // isDelayed: la agenda está atrasada si:
      //   1. Pasó la fecha de salida planeada y sigue activa, O
      //   2. El proceso actual es anterior al planificado para hoy (está "colgado" en un proceso anterior), O
      //   3. No hay tracking iniciado pero debería estar en proceso (init fire-and-forget puede fallar)
      const noTrackingStarted = currentTrackingCode === null && plannedProcessToday !== null && e.status !== 'done';
      const isDelayed = delayDays > 0 || noTrackingStarted || (plannedProcessToday !== null && actualOrder < plannedOrder && e.status !== 'done');

      // Horas totales acumuladas (para resumen semanal)
      const totalPlannedHours = round2(bwH + prepH + pntH);

      return {
        id:                  e.id,
        plate:               e.plate,
        customerName:        e.customerName,
        status:              e.status,
        date:                e.date,
        stayDays:            e.stayDays,
        estimatedFinishDate: e.estimatedFinishDate ?? null,
        bodyworkHours:       round2(bwH),
        prepHours:           round2(prepH),
        paintHours:          round2(pntH),
        totalPlannedHours,
        plannedExitDate,
        processWindows,
        processTechs,
        currentTrackingCode,
        plannedProcessToday,
        isDelayed,
        delayDays,
      };
    });

    // KPIs globales del período
    const today = new Date(todayStr + 'T12:00:00');
    const fromDate = new Date(from + 'T12:00:00');
    const toDate   = new Date(to   + 'T12:00:00');
    const entriesInWindow = result.filter(e => {
      const ed = new Date(e.date + 'T12:00:00');
      return ed >= fromDate && ed <= toDate;
    });

    const kpis = {
      totalInShop:   result.length,
      onSchedule:    result.filter(e => !e.isDelayed && e.status !== 'done').length,
      delayed:       result.filter(e => e.isDelayed).length,
      done:          result.filter(e => e.status === 'done').length,
      exitToday:     result.filter(e => e.plannedExitDate === todayStr && e.status !== 'done').length,
      totalHoursWeek: round2(entriesInWindow.reduce((s, e) => s + e.totalPlannedHours, 0)),
    };

    return {
      baseDailyCap,
      entries: result,
      kpis,
    };
  }

  private formatEntry(e: BodyshopEntry): any {
    const processTechs: any = {};
    for (const pt of (e.processTechsList ?? [])) {
      processTechs[pt.process] = { technicianId: pt.technicianId, technician: pt.technician };
    }
    // El workType embebido también tiene columnas decimal: forzar Number aquí también.
    const workType = e.workType ? {
      ...e.workType,
      estimatedDays: Number(e.workType.estimatedDays),
      bodyworkHours: Number(e.workType.bodyworkHours),
      prepHours:     Number(e.workType.prepHours),
      paintHours:    Number(e.workType.paintHours),
    } : undefined;
    return {
      id:            e.id,
      workshopId:    e.workshopId,
      date:          e.date,
      workTypeId:    e.workTypeId,
      workType,
      customerName:  e.customerName,
      plate:         e.plate,
      status:        e.status,
      bodyworkHours: Number(e.bodyworkHours),
      prepHours:     Number(e.prepHours),
      paintHours:    Number(e.paintHours),
      stayDays:      e.stayDays,
      channel:       e.channel,
      notes:         e.notes,
      technicianId:        e.technicianId,
      technician:          e.technician,
      budgetNumber:        e.budgetNumber ?? null,
      estimatedFinishDate: e.estimatedFinishDate ?? null,
      processTechs:        Object.keys(processTechs).length > 0 ? processTechs : undefined,
      createdBy:           e.createdBy,
      createdAt:           e.createdAt,
    };
  }
}
