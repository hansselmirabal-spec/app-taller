import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { TechnicianAbsence } from './technician-absence.entity';
import { WorkingDay } from './working-day.entity';
import { TechniciansService } from '../technicians/technicians.service';

export interface DailyTechnicianCapacity {
  technicianId: string;
  technicianName: string;
  dailyHours: number;
  availableHours: number;
  usedHours: number;
  absenceType: string | null;
  isWorkingDay: boolean;
}

@Injectable()
export class CapacityService {
  constructor(
    @InjectRepository(TechnicianAbsence) private absenceRepo: Repository<TechnicianAbsence>,
    @InjectRepository(WorkingDay) private workingDayRepo: Repository<WorkingDay>,
    private techniciansService: TechniciansService,
  ) {}

  async getDailyCapacity(date: string, usedHoursMap: Record<string, number> = {}): Promise<DailyTechnicianCapacity[]> {
    const technicians = await this.techniciansService.findAll();
    const workingDay = await this.workingDayRepo.findOne({ where: { date } });
    const absences = await this.absenceRepo.find({
      where: { date },
      relations: ['technician'],
    });

    const absenceMap = new Map(absences.map(a => [a.technicianId, a.type]));
    const dayOfWeek = new Date(date + 'T12:00:00').getDay();
    const isSunday = dayOfWeek === 0;
    const isGlobalHoliday = workingDay?.isWorkingDay === false;

    return technicians.map(tech => {
      const dailyHours = Number(tech.dailyHours);
      const absenceType = absenceMap.get(tech.id) ?? null;
      const usedHours = usedHoursMap[tech.id] ?? 0;

      let availableHours: number;
      if (isSunday || isGlobalHoliday || absenceType === 'full') {
        availableHours = 0;
      } else if (absenceType === 'half' || absenceType === 'holiday') {
        availableHours = dailyHours / 2;
      } else {
        availableHours = dailyHours;
      }

      return {
        technicianId: tech.id,
        technicianName: tech.name,
        dailyHours,
        availableHours,
        usedHours,
        absenceType,
        isWorkingDay: !isSunday && !isGlobalHoliday,
      };
    });
  }

  async getWeekCapacity(from: string, to: string, usedHoursMap: Record<string, Record<string, number>> = {}) {
    const results: Record<string, DailyTechnicianCapacity[]> = {};
    const current = new Date(from + 'T12:00:00');
    const end = new Date(to + 'T12:00:00');

    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      results[dateStr] = await this.getDailyCapacity(dateStr, usedHoursMap[dateStr]);
      current.setDate(current.getDate() + 1);
    }
    return results;
  }

  async createAbsence(technicianId: string, date: string, type: 'full' | 'half' | 'holiday') {
    await this.techniciansService.findOne(technicianId);
    const existing = await this.absenceRepo.findOne({ where: { technicianId, date } });
    if (existing) throw new ConflictException('Absence already registered for this technician and date');

    return this.absenceRepo.save(this.absenceRepo.create({ technicianId, date, type }));
  }

  async deleteAbsence(id: string) {
    const absence = await this.absenceRepo.findOne({ where: { id } });
    if (!absence) throw new NotFoundException('Absence not found');
    await this.absenceRepo.remove(absence);
  }

  async upsertWorkingDay(date: string, isWorkingDay: boolean, note?: string) {
    let wd = await this.workingDayRepo.findOne({ where: { date } });
    if (wd) {
      wd.isWorkingDay = isWorkingDay;
      wd.note = note ?? wd.note;
    } else {
      wd = this.workingDayRepo.create({ date, isWorkingDay, note });
    }
    return this.workingDayRepo.save(wd);
  }

  async deleteWorkingDay(date: string) {
    const wd = await this.workingDayRepo.findOne({ where: { date } });
    if (!wd) throw new NotFoundException('Working day config not found');
    await this.workingDayRepo.remove(wd);
  }
}
