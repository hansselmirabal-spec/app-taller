import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  IsString, IsOptional, IsArray, IsNumber,
  ValidateNested, Matches, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BudgetAppointment, BudgetProcess } from './budget-appointment.entity';
import { BodyshopService } from '../bodyshop/bodyshop.service';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export class BudgetProcessDto {
  @IsString() code: string;
  @IsString() name: string;
  // El catálogo real (Excel "Herramienta Presupuestador") tiene procesos con horas
  // legítimas por debajo de 0.5 — ej. Empapelado 0.3h, Pulir 0.4h. Un mínimo de
  // 0.5 rechazaba esos valores reales; solo se valida que sea positivo.
  @IsNumber({}, { message: 'Las horas deben ser un número.' })
  @Min(0.01, { message: 'Las horas deben ser mayores a 0.' })
  hours: number;
}

export class CreateBudgetAppointmentDto {
  @IsString({ message: 'El taller es obligatorio.' })
  workshopId: string;

  @IsOptional() @IsString() peritoId?: string | null;

  @IsString()
  @Matches(DATE_RE, { message: 'La fecha debe tener formato YYYY-MM-DD.' })
  date: string;

  @IsString()
  @Matches(TIME_RE, { message: 'La hora de inicio debe tener formato HH:MM.' })
  timeStart: string;

  @IsString()
  @Matches(TIME_RE, { message: 'La hora de fin debe tener formato HH:MM.' })
  timeEnd: string;

  @IsString({ message: 'El nombre del cliente es obligatorio.' })
  customerName: string;

  @IsString({ message: 'La chapa es obligatoria.' })
  plate: string;

  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsString() budgetNumber?: string | null;
}

export class RejectBudgetAppointmentDto {
  @IsString({ message: 'El motivo del rechazo es obligatorio.' })
  reason: string;
}

export class BudgetPieceBreakdownDto {
  @IsString() proceso: string;
  @IsNumber() horas: number;
  @IsString() descripcion: string;
}

export class BudgetPieceDto {
  @IsString() pieza: string;
  @IsString() damageLevel: string;
  @IsNumber() qty: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BudgetPieceBreakdownDto)
  breakdown: BudgetPieceBreakdownDto[];

  @IsNumber() totalHoras: number;
}

export class UpdateBudgetProcessesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BudgetProcessDto)
  processes: BudgetProcessDto[];

  // Detalle por pieza del Simulador — informativo, no lo usa approve(). Opcional
  // para que una edición posterior de horas agregadas (que no manda pieces) no
  // borre el detalle ya guardado.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BudgetPieceDto)
  pieces?: BudgetPieceDto[];
}

@Injectable()
export class BudgetAppointmentsService {
  private readonly logger = new Logger(BudgetAppointmentsService.name);

  constructor(
    @InjectRepository(BudgetAppointment)
    private readonly repo: Repository<BudgetAppointment>,
    private readonly bodyshopService: BodyshopService,
  ) {}

  async create(dto: CreateBudgetAppointmentDto, userId: string): Promise<BudgetAppointment> {
    const appt = this.repo.create({
      workshopId:   dto.workshopId,
      date:         dto.date,
      timeStart:    dto.timeStart,
      timeEnd:      dto.timeEnd,
      peritoId:     dto.peritoId ?? userId,
      customerName: dto.customerName,
      plate:        dto.plate.toUpperCase().trim(),
      phone:        dto.phone ?? null,
      notes:        dto.notes ?? null,
      budgetNumber: dto.budgetNumber ?? null,
      status:       'pending',
      createdBy:    userId,
    });
    return this.repo.save(appt);
  }

  async findByDate(workshopId: string, date: string, callerId?: string, callerRole?: string): Promise<BudgetAppointment[]> {
    const where: any = { workshopId, date };
    if (callerRole === 'perito' && callerId) where.peritoId = callerId;
    return this.repo.find({
      where,
      relations: ['perito'],
      order: { timeStart: 'ASC' },
    });
  }

  // Presupuestos de esta chapa disponibles para vincular manualmente desde el
  // wizard de ingreso directo (bypass del botón "Aprobar"). Excluye los que ya
  // generaron su propio bodyshop_entry (linkedEntryId seteado) para no ofrecer
  // un presupuesto que ya está resuelto y duplicaría el ingreso.
  async findByPlate(workshopId: string, plate: string): Promise<BudgetAppointment[]> {
    return this.repo.find({
      where: { workshopId, plate: plate.toUpperCase().trim(), linkedEntryId: IsNull() },
      relations: ['perito'],
      order: { date: 'DESC' },
    });
  }

  async findOne(id: string): Promise<BudgetAppointment> {
    const appt = await this.repo.findOne({ where: { id }, relations: ['perito'] });
    if (!appt) throw new NotFoundException('Presupuesto no encontrado');
    return appt;
  }

  async updateProcesses(id: string, dto: UpdateBudgetProcessesDto): Promise<BudgetAppointment> {
    const appt = await this.findOne(id);
    if (appt.status !== 'pending') {
      throw new BadRequestException('Solo se pueden editar procesos de presupuestos pendientes');
    }
    appt.processes = dto.processes;
    if (dto.pieces !== undefined) appt.pieces = dto.pieces;
    return this.repo.save(appt);
  }

  async reject(id: string, reason: string): Promise<BudgetAppointment> {
    const appt = await this.findOne(id);
    if (appt.status !== 'pending') {
      throw new BadRequestException('Solo se pueden rechazar presupuestos pendientes');
    }
    appt.status = 'rejected';
    appt.rejectionReason = reason;
    return this.repo.save(appt);
  }

  async cancel(id: string): Promise<BudgetAppointment> {
    const appt = await this.findOne(id);
    if (appt.status === 'approved') {
      throw new BadRequestException('No se puede cancelar un presupuesto ya aprobado');
    }
    appt.status = 'cancelled';
    return this.repo.save(appt);
  }

  async approve(id: string, userId: string, repairStartDate?: string): Promise<{ budget: BudgetAppointment; entryId: string }> {
    const appt = await this.findOne(id);
    if (appt.status !== 'pending') {
      throw new BadRequestException('Solo se pueden aprobar presupuestos pendientes');
    }

    const processes: BudgetProcess[] = appt.processes ?? [];
    if (processes.length === 0) {
      throw new BadRequestException('Cargá al menos un proceso con horas antes de aprobar');
    }

    // Usar la fecha de inicio de reparación indicada, o la mayor entre la fecha del
    // turno y hoy. Esto evita que presupuestos con fecha vieja creen entradas que
    // quedan fuera de la ventana de capacidad actual.
    const today = new Date().toISOString().split('T')[0];
    const entryDate = repairStartDate ?? (appt.date >= today ? appt.date : today);

    // POLISH/FINAL_CONTROL son código operacional (reservado por BodyshopService.create()
    // vía pieceCount), NUNCA se reenvían como extraProcesses aunque el perito haya
    // agregado manualmente una línea "Pulido"/"Control Final" al presupuesto — si no,
    // esa línea informativa terminaría duplicando/pisando la reserva operacional real.
    // Ver spec "No Leakage into Customer-Facing Budget Data" y design decisión 2.
    const OPERATIONAL_CODES = new Set(['BODYWORK', 'PREP', 'PAINT', 'POLISH', 'FINAL_CONTROL']);
    const bodyworkHours = processes.find(p => p.code === 'BODYWORK')?.hours ?? 0;
    const prepHours     = processes.find(p => p.code === 'PREP')?.hours ?? 0;
    const paintHours    = processes.find(p => p.code === 'PAINT')?.hours ?? 0;
    const extraProcesses = processes.filter(p => !OPERATIONAL_CODES.has(p.code));

    // pieceCount SIEMPRE se deriva de appt.pieces[].qty (el desglose real del
    // Simulador), NUNCA de appt.processes — esa es la fuente de verdad
    // facturable, no la cantidad de piezas físicas reparadas.
    const pieceCount = (appt.pieces ?? []).reduce((sum, p) => sum + (Number(p.qty) || 0), 0);

    let entry: Awaited<ReturnType<typeof this.bodyshopService.create>>;
    try {
      entry = await this.bodyshopService.create({
        workshopId:    appt.workshopId,
        date:          entryDate,
        plate:         appt.plate,
        customerName:  appt.customerName,
        bodyworkHours,
        prepHours,
        paintHours,
        pieceCount,
        channel:       'walk_in',
        notes:         appt.notes ?? undefined,
        budgetNumber:  appt.budgetNumber ?? undefined,
        timeStart:     appt.timeStart ?? undefined,
        extraProcesses: extraProcesses.length > 0 ? extraProcesses : null,
      } as any, userId);
    } catch (err: any) {
      if (err?.status) throw err; // re-throw HTTP exceptions (400, 404, etc.)
      throw new BadRequestException(err?.message ?? 'Error al crear el ingreso desde el presupuesto.');
    }

    appt.status = 'approved';
    appt.linkedEntryId = entry.id;
    const saved = await this.repo.save(appt);

    this.logger.log(`Presupuesto ${id} aprobado → entry ${entry.id}`);
    return { budget: saved, entryId: entry.id };
  }
}
