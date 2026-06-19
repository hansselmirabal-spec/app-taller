import { Injectable, BadRequestException, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, IsEnum, IsOptional, Matches } from 'class-validator';
import { Appointment } from './appointment.entity';
import { BodyshopEntry } from '../bodyshop/bodyshop-entry.entity';
import { CapacityService } from '../capacity/capacity.service';
import { ServiceTypesService } from '../service-types/service-types.service';
import { TechniciansService } from '../technicians/technicians.service';
import { WorkshopsService } from '../workshops/workshops.service';
import { DmsSyncService } from '../dms-sync/dms-sync.service';
import { TrackingService } from '../tracking/tracking.service';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^\d{2}:\d{2}$/;

export class CreateAppointmentDto {
  @IsString() @Matches(DATE_REGEX) date: string;
  @IsString() @Matches(TIME_REGEX) timeStart: string;
  @IsString() technicianId: string;
  @IsString() serviceTypeId: string;
  @IsString() customerName: string;
  @IsString() plate: string;
  @IsOptional() @IsString() advisorCode?: string | null;
  @IsOptional() @IsString() advisorName?: string | null;
  @IsOptional() @IsString() advisorSucursalId?: string | null;
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsString() vehicleDescription?: string | null;
  @IsOptional() @IsString() chasis?: string | null;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateAppointmentDto {
  @IsOptional() @IsString() customerName?: string;
  @IsOptional() @IsString() plate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() @Matches(TIME_REGEX) timeEnd?: string;
}

export class UpdateStatusDto {
  @IsEnum(['scheduled', 'in_progress', 'done', 'cancelled']) status: string;
}

export class RescheduleAppointmentDto {
  @IsString() @Matches(DATE_REGEX) date: string;
  @IsString() @Matches(TIME_REGEX) timeStart: string;
  @IsOptional() @IsString() technicianId?: string;
}

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    @InjectRepository(Appointment) private repo: Repository<Appointment>,
    @InjectRepository(BodyshopEntry) private bsRepo: Repository<BodyshopEntry>,
    private capacityService: CapacityService,
    private serviceTypesService: ServiceTypesService,
    private techniciansService: TechniciansService,
    private workshopsService: WorkshopsService,
    private dmsSyncService: DmsSyncService,
    private trackingService: TrackingService,
  ) {}

  // Búsqueda global de turnos/ingresos agendados.
  // Match por: chapa, nombre del cliente, prefijo del id (8 chars).
  // Devuelve un array unificado con tipo de origen (mecánica vs chapería) y datos clave.
  async search(query: string, workshopId?: string) {
    const q = `%${query.toLowerCase()}%`;
    const isShortId = /^[0-9a-f-]{4,}$/i.test(query.replace(/[^0-9a-f-]/gi, ''));

    const apptQb = this.repo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.serviceType', 'serviceType')
      .leftJoinAndSelect('a.technician', 'technician')
      .where('(LOWER(a.customer_name) LIKE :q OR LOWER(a.plate) LIKE :q' +
             (isShortId ? ' OR CAST(a.id AS TEXT) LIKE :idq' : '') + ')', { q, idq: `${query.toLowerCase()}%` })
      .orderBy('a.date', 'DESC')
      .addOrderBy('a.time_start', 'DESC')
      .limit(30);

    const bodyshopQb = this.bsRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.workType', 'workType')
      .leftJoinAndSelect('b.technician', 'technician')
      .where('(LOWER(b.customer_name) LIKE :q OR LOWER(b.plate) LIKE :q' +
             (isShortId ? ' OR CAST(b.id AS TEXT) LIKE :idq' : '') + ')', { q, idq: `${query.toLowerCase()}%` })
      .orderBy('b.date', 'DESC')
      .limit(30);

    if (workshopId) {
      apptQb.andWhere('1=1'); // appointments no filtra por workshopId directo (pasa por technician)
      bodyshopQb.andWhere('b.workshopId = :ws', { ws: workshopId });
    }

    const [appointments, bodyshopEntries] = await Promise.all([
      apptQb.getMany(),
      bodyshopQb.getMany(),
    ]);

    const results = [
      ...appointments.map(a => ({
        kind:         'appointment' as const,
        id:           a.id,
        date:         a.date,
        time:         a.timeStart,
        customerName: a.customerName,
        plate:        a.plate,
        status:       a.status,
        serviceType:  a.serviceType?.name ?? null,
        technician:   a.technician?.name ?? null,
        workshopId:   null as string | null,
      })),
      ...bodyshopEntries.map(b => ({
        kind:         'bodyshop' as const,
        id:           b.id,
        date:         b.date,
        time:         null,
        customerName: b.customerName,
        plate:        b.plate,
        status:       b.status,
        serviceType:  b.workType?.name ?? null,
        technician:   b.technician?.name ?? null,
        workshopId:   b.workshopId,
      })),
    ].sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0)).slice(0, 30);

    return { results, total: results.length, query };
  }

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  private minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60).toString().padStart(2, '0');
    const m = (minutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  async findByDate(date: string, workshopName?: string) {
    const qb = this.repo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.technician', 'technician')
      .leftJoinAndSelect('a.serviceType', 'serviceType')
      .where('a.date = :date', { date })
      .orderBy('a.time_start', 'ASC');

    if (workshopName) {
      qb.andWhere('technician.workshopName = :workshopName', { workshopName });
    }
    return qb.getMany();
  }

  async findByRange(from: string, to: string, workshopName?: string, includeAll = false) {
    const qb = this.repo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.technician', 'technician')
      .leftJoinAndSelect('a.serviceType', 'serviceType')
      .where('a.date >= :from AND a.date <= :to', { from, to })
      .orderBy('a.date', 'ASC')
      .addOrderBy('a.time_start', 'ASC');

    if (!includeAll) {
      qb.andWhere("a.status != 'cancelled'");
    }

    if (workshopName) {
      qb.andWhere('technician.workshopName = :workshopName', { workshopName });
    }
    return qb.getMany();
  }

  async create(dto: CreateAppointmentDto, userId: string) {
    const today = new Date().toISOString().split('T')[0];
    const existingActive = await this.repo
      .createQueryBuilder('a')
      .where('UPPER(a.plate) = UPPER(:plate)', { plate: dto.plate.trim() })
      .andWhere('a.status NOT IN (:...statuses)', { statuses: ['done', 'cancelled'] })
      .andWhere('a.date >= :today', { today })
      .getOne();
    if (existingActive) {
      throw new BadRequestException(
        `Ya existe un turno activo para la patente ${dto.plate.trim().toUpperCase()} · ${existingActive.customerName}`,
      );
    }

    const serviceType = await this.serviceTypesService.findOne(dto.serviceTypeId);
    const durationMinutes = Math.round(Number(serviceType.durationHours) * 60);
    const startMinutes    = this.timeToMinutes(dto.timeStart);
    const timeEnd         = this.minutesToTime(startMinutes + durationMinutes);

    await this.checkOverlap(dto.technicianId, dto.date, dto.timeStart, timeEnd);
    await this.checkCapacity(dto.technicianId, dto.date, Number(serviceType.durationHours));
    await this.checkLunchBreak(dto.technicianId, dto.timeStart, timeEnd);

    const appointment = this.repo.create({ ...dto, timeEnd, createdBy: userId, status: 'scheduled' });
    const saved = await this.repo.save(appointment);

    void this.trackingService
      .initForMechanic(saved.id, serviceType.name, Number(serviceType.durationHours))
      .catch(err => this.logger.warn(`tracking init failed: ${err.message}`));

    // Push al DMS con la hora original del asesor.
    // El mecánico arranca 30 min después internamente (buffer de recepción),
    // pero el DMS registra la hora pactada con el cliente.
    this.logger.log(`[DMS] create placa=${dto.plate} advisorCode=${dto.advisorCode ?? 'NINGUNO'} cliente="${dto.customerName}"`);
    const dmsSync = dto.advisorCode
      ? await this.dmsSyncService.pushToAgendamiento({
          title:         serviceType.name,
          start_date:    dto.date,
          start_time:    dto.timeStart + ':00',
          end_time:      timeEnd + ':00',
          IdAsesor:      dto.advisorCode,
          idSucursal:    dto.advisorSucursalId ?? undefined,
          NombreCliente: dto.customerName,
          Telefono:      dto.phone ?? '',
          Vehiculo:      dto.vehicleDescription ?? dto.plate,
          Matricula:     dto.plate,
          Chasis:        dto.chasis ?? undefined,
          description:   dto.notes || serviceType.name,
          AgendadoPor:   dto.advisorName ?? 'sistema',
        }).catch(err => ({ success: false, error: err.message as string }))
      : null;

    return { ...saved, dmsSync } as any;
  }

  async reschedule(id: string, dto: RescheduleAppointmentDto, user: { id: string; role: string }) {
    const appointment = await this.repo.findOne({ where: { id }, relations: ['serviceType'] });
    if (!appointment) throw new NotFoundException('Turno no encontrado');
    if (user.role !== 'admin' && appointment.createdBy !== user.id) {
      throw new ForbiddenException('Solo podés reagendar tus propios turnos');
    }
    if (appointment.status === 'cancelled') {
      throw new BadRequestException('No se puede reagendar un turno cancelado');
    }

    const technicianId    = dto.technicianId ?? appointment.technicianId;
    const durationMinutes = Math.round(Number(appointment.serviceType.durationHours) * 60);
    const timeEnd         = this.minutesToTime(this.timeToMinutes(dto.timeStart) + durationMinutes);

    // Skip overlap check for the same appointment slot
    await this.checkOverlap(technicianId, dto.date, dto.timeStart, timeEnd, id);
    await this.checkCapacity(technicianId, dto.date, Number(appointment.serviceType.durationHours), id);
    await this.checkLunchBreak(technicianId, dto.timeStart, timeEnd);

    appointment.date         = dto.date;
    appointment.timeStart    = dto.timeStart;
    appointment.timeEnd      = timeEnd;
    appointment.technicianId = technicianId;
    return this.repo.save(appointment);
  }

  async update(id: string, dto: UpdateAppointmentDto, user: { id: string; role: string }) {
    const appointment = await this.repo.findOne({ where: { id } });
    if (!appointment) throw new NotFoundException('Turno no encontrado');
    if (user.role !== 'admin' && appointment.createdBy !== user.id) {
      throw new ForbiddenException('Solo podés editar tus propios turnos');
    }
    if (dto.timeEnd !== undefined) {
      if (this.timeToMinutes(dto.timeEnd) <= this.timeToMinutes(appointment.timeStart)) {
        throw new BadRequestException('El horario de fin debe ser posterior al de inicio');
      }
    }
    Object.assign(appointment, dto);
    return this.repo.save(appointment);
  }

  async updateStatus(id: string, status: string) {
    const appointment = await this.repo.findOne({ where: { id } });
    if (!appointment) throw new NotFoundException('Turno no encontrado');
    appointment.status = status as any;
    return this.repo.save(appointment);
  }

  async delete(id: string, user: { id: string; role: string }) {
    const appointment = await this.repo.findOne({ where: { id } });
    if (!appointment) throw new NotFoundException('Turno no encontrado');
    if (user.role !== 'admin' && appointment.createdBy !== user.id) {
      throw new ForbiddenException('Solo podés cancelar tus propios turnos');
    }
    appointment.status = 'cancelled';
    return this.repo.save(appointment);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async checkOverlap(
    technicianId: string,
    date: string,
    timeStart: string,
    timeEnd: string,
    excludeId?: string,
  ) {
    const qb = this.repo
      .createQueryBuilder('a')
      .where('a.technician_id = :tid', { tid: technicianId })
      .andWhere('a.date = :date', { date })
      .andWhere("a.status != 'cancelled'")
      .andWhere('a.time_start < :end AND a.time_end > :start', { start: timeStart, end: timeEnd });

    if (excludeId) qb.andWhere('a.id != :excludeId', { excludeId });

    const count = await qb.getCount();
    if (count > 0) throw new BadRequestException('El horario se superpone con un turno existente');
  }

  private async checkLunchBreak(technicianId: string, timeStart: string, timeEnd: string) {
    const technician = await this.techniciansService.findOne(technicianId);
    if (!technician.workshopName) return;

    const workshops = await this.workshopsService.findAll();
    const workshop = workshops.find(w => w.name === technician.workshopName);
    const lb = (workshop?.config as any)?.lunchBreak as { enabled: boolean; start: string; end: string } | undefined;
    if (!lb?.enabled || !lb.start || !lb.end) return;

    const apptStart = this.timeToMinutes(timeStart);
    const apptEnd   = this.timeToMinutes(timeEnd);
    const lunchStart = this.timeToMinutes(lb.start);
    const lunchEnd   = this.timeToMinutes(lb.end);

    if (apptStart < lunchEnd && apptEnd > lunchStart) {
      throw new BadRequestException(`El horario se superpone con el horario de almuerzo del taller (${lb.start} – ${lb.end})`);
    }
  }

  private async checkCapacity(
    technicianId: string,
    date: string,
    durationHours: number,
    excludeId?: string,
  ) {
    const activeAppointments = await this.repo.find({
      where: { technicianId, date },
    });
    // Usar la duración real (time_end - time_start) para que los ajustes manuales
    // de hora fin se reflejen en el cálculo de capacidad disponible.
    const usedHours = activeAppointments
      .filter(a => a.status !== 'cancelled' && a.status !== 'paused' && a.id !== excludeId)
      .reduce((sum, a) => {
        const start = this.timeToMinutes(a.timeStart);
        const end   = this.timeToMinutes(a.timeEnd);
        return sum + (end - start) / 60;
      }, 0);

    const allCapacity = await this.capacityService.getDailyCapacity(date, { [technicianId]: usedHours });
    const cap = allCapacity.find(c => c.technicianId === technicianId);

    if (!cap) throw new BadRequestException('Técnico no encontrado');
    if (cap.availableHours <= 0) throw new BadRequestException('El técnico no tiene horas disponibles este día');

    const remainingHours = cap.availableHours - usedHours;
    if (durationHours > remainingHours) {
      throw new BadRequestException(`Horas insuficientes. Disponibles: ${remainingHours}h, necesarias: ${durationHours}h`);
    }
  }
}
