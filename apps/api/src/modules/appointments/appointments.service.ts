import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, IsEnum, IsOptional, Matches } from 'class-validator';
import { Appointment } from './appointment.entity';
import { CapacityService } from '../capacity/capacity.service';
import { ServiceTypesService } from '../service-types/service-types.service';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^\d{2}:\d{2}$/;

export class CreateAppointmentDto {
  @IsString() @Matches(DATE_REGEX) date: string;
  @IsString() @Matches(TIME_REGEX) timeStart: string;
  @IsString() technicianId: string;
  @IsString() serviceTypeId: string;
  @IsString() customerName: string;
  @IsString() plate: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateAppointmentDto {
  @IsOptional() @IsString() customerName?: string;
  @IsOptional() @IsString() plate?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateStatusDto {
  @IsEnum(['scheduled', 'in_progress', 'done', 'cancelled']) status: string;
}

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectRepository(Appointment) private repo: Repository<Appointment>,
    private capacityService: CapacityService,
    private serviceTypesService: ServiceTypesService,
  ) {}

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  private minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60).toString().padStart(2, '0');
    const m = (minutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  async findByDate(date: string) {
    return this.repo.find({
      where: { date },
      relations: ['technician', 'serviceType'],
      order: { timeStart: 'ASC' },
    });
  }

  async findByRange(from: string, to: string) {
    return this.repo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.technician', 'technician')
      .leftJoinAndSelect('a.serviceType', 'serviceType')
      .where('a.date >= :from AND a.date <= :to', { from, to })
      .andWhere("a.status != 'cancelled'")
      .orderBy('a.date', 'ASC')
      .addOrderBy('a.timeStart', 'ASC')
      .getMany();
  }

  async create(dto: CreateAppointmentDto, userId: string) {
    const serviceType = await this.serviceTypesService.findOne(dto.serviceTypeId);
    const durationMinutes = Math.round(Number(serviceType.durationHours) * 60);
    const startMinutes = this.timeToMinutes(dto.timeStart);
    const endMinutes = startMinutes + durationMinutes;
    const timeEnd = this.minutesToTime(endMinutes);

    // Check for overlap
    const existing = await this.repo
      .createQueryBuilder('a')
      .where('a.technician_id = :tid', { tid: dto.technicianId })
      .andWhere('a.date = :date', { date: dto.date })
      .andWhere("a.status != 'cancelled'")
      .andWhere('a.time_start < :end AND a.time_end > :start', {
        start: dto.timeStart,
        end: timeEnd,
      })
      .getCount();

    if (existing > 0) throw new BadRequestException('Time slot overlaps with an existing appointment');

    // Check capacity
    const activeAppointments = await this.repo.find({
      where: { technicianId: dto.technicianId, date: dto.date },
      relations: ['serviceType'],
    });
    const usedHours = activeAppointments
      .filter(a => a.status !== 'cancelled')
      .reduce((sum, a) => sum + Number(a.serviceType.durationHours), 0);

    const usedHoursMap = { [dto.technicianId]: usedHours };
    const [techCapacity] = await this.capacityService.getDailyCapacity(dto.date, usedHoursMap);
    const techCap = techCapacity; // already filtered to this tech via map

    const allCapacity = await this.capacityService.getDailyCapacity(dto.date, usedHoursMap);
    const cap = allCapacity.find(c => c.technicianId === dto.technicianId);

    if (!cap) throw new BadRequestException('Technician not found');
    if (cap.availableHours <= 0) throw new BadRequestException('Technician has no available hours this day');

    const remainingHours = cap.availableHours - usedHours;
    if (Number(serviceType.durationHours) > remainingHours) {
      throw new BadRequestException(`Not enough hours. Available: ${remainingHours}h, required: ${serviceType.durationHours}h`);
    }

    const appointment = this.repo.create({
      ...dto,
      timeEnd,
      createdBy: userId,
      status: 'scheduled',
    });
    return this.repo.save(appointment);
  }

  async update(id: string, dto: UpdateAppointmentDto) {
    const appointment = await this.repo.findOne({ where: { id } });
    if (!appointment) throw new NotFoundException('Appointment not found');
    Object.assign(appointment, dto);
    return this.repo.save(appointment);
  }

  async updateStatus(id: string, status: string) {
    const appointment = await this.repo.findOne({ where: { id } });
    if (!appointment) throw new NotFoundException('Appointment not found');
    appointment.status = status as any;
    return this.repo.save(appointment);
  }

  async delete(id: string) {
    const appointment = await this.repo.findOne({ where: { id } });
    if (!appointment) throw new NotFoundException('Appointment not found');
    appointment.status = 'cancelled';
    return this.repo.save(appointment);
  }
}
