import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TechnicianAbsence } from './technician-absence.entity';
import { WorkingDay } from './working-day.entity';
import { Appointment } from '../appointments/appointment.entity';
import { BodyshopEntry } from '../bodyshop/bodyshop-entry.entity';
import { TechniciansService } from '../technicians/technicians.service';
import { WorkshopsService } from '../workshops/workshops.service';

export interface DailyTechnicianCapacity {
  technicianId: string;
  technicianName: string;
  specialty: string | null;
  dailyHours: number;
  availableHours: number;
  usedHours: number;
  absenceType: string | null;
  isWorkingDay: boolean;
}

// ── Slots feature types ───────────────────────────────────────────────────────

export interface TimeSlot {
  time: string;
  technicianId: string;
  technicianName: string;
  specialty: string | null;
  hasSpecialtyMatch: boolean;
}

export interface AlternativeDay {
  date: string;
  dayLabel: string;
  slotsCount: number;
  slots: TimeSlot[];
}

export type SlotsResponse =
  | { available: true;  requestedDate: string; slotsCount: number; slots: TimeSlot[] }
  | { available: false; requestedDate: string; reason: string; alternatives: AlternativeDay[]; searchedDays: number };

interface AvailabilityConfig {
  alternativeDaysCount: number;
  maxSearchDays: number;
  includeSaturdays: boolean;
  urgencyBufferHours: number;
  slotIntervalMinutes: number;
  dayStartHour: number;
  dayEndHour: number;
}

type BodyshopProcess = 'BODYWORK' | 'PREP' | 'PAINT';

const SPECIALTY_TO_PROCESS: Record<string, BodyshopProcess> = {
  CHAPERIA: 'BODYWORK', CARROCERIA: 'BODYWORK', BODYWORK: 'BODYWORK',
  PREPARACION: 'PREP', PREP: 'PREP',
  PINTURA: 'PAINT', PAINT: 'PAINT',
};

const DAY_LABELS_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTH_LABELS_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

@Injectable()
export class CapacityService {
  constructor(
    @InjectRepository(TechnicianAbsence) private absenceRepo: Repository<TechnicianAbsence>,
    @InjectRepository(WorkingDay) private workingDayRepo: Repository<WorkingDay>,
    @InjectRepository(Appointment) private appointmentRepo: Repository<Appointment>,
    @InjectRepository(BodyshopEntry) private bsEntryRepo: Repository<BodyshopEntry>,
    private techniciansService: TechniciansService,
    private workshopsService: WorkshopsService,
  ) {}

  private async computeUsedHoursForDate(date: string): Promise<Record<string, number>> {
    const rows = await this.appointmentRepo
      .createQueryBuilder('a')
      .select('a.technician_id', 'tid')
      .addSelect(
        `COALESCE(SUM(
          CASE WHEN a.time_end IS NOT NULL
            THEN EXTRACT(EPOCH FROM (a.time_end::time - a.time_start::time)) / 3600.0
            ELSE 0
          END
        ), 0)`,
        'hrs',
      )
      .where('a.date = :date', { date })
      .andWhere("a.status NOT IN ('cancelled', 'paused')")
      .groupBy('a.technician_id')
      .getRawMany();

    const map: Record<string, number> = {};
    for (const r of rows) map[r.tid] = Number(r.hrs);
    return map;
  }

  async getDailyCapacity(
    date: string,
    usedHoursMap?: Record<string, number>,
    workshopName?: string,
  ): Promise<DailyTechnicianCapacity[]> {
    const technicians = await this.techniciansService.findAll(workshopName);
    const workingDay  = await this.workingDayRepo.findOne({ where: { date } });
    const absences    = await this.absenceRepo.find({ where: { date }, relations: ['technician'] });

    const resolvedMap = usedHoursMap ?? await this.computeUsedHoursForDate(date);

    const absenceMap    = new Map(absences.map(a => [a.technicianId, a.type]));
    const dayOfWeek     = new Date(date + 'T12:00:00').getDay();
    const isSunday      = dayOfWeek === 0;
    const isGlobalHoliday = workingDay?.isWorkingDay === false;

    return technicians.map(tech => {
      const dailyHours  = Number(tech.dailyHours);
      const absenceType = absenceMap.get(tech.id) ?? null;
      const usedHours   = resolvedMap[tech.id] ?? 0;

      let availableHours: number;
      if (isSunday || isGlobalHoliday || absenceType === 'full') {
        availableHours = 0;
      } else if (absenceType === 'half' || absenceType === 'holiday') {
        availableHours = dailyHours / 2;
      } else {
        availableHours = dailyHours;
      }

      return {
        technicianId:  tech.id,
        technicianName: tech.name,
        specialty: (tech as any).specialty ?? null,
        dailyHours,
        availableHours,
        usedHours,
        absenceType,
        isWorkingDay: !isSunday && !isGlobalHoliday,
      };
    });
  }

  private async computeUsedHoursForRange(from: string, to: string): Promise<Record<string, Record<string, number>>> {
    const rows = await this.appointmentRepo
      .createQueryBuilder('a')
      .select('a.date', 'dt')
      .addSelect('a.technician_id', 'tid')
      .addSelect(
        `COALESCE(SUM(
          CASE WHEN a.time_end IS NOT NULL
            THEN EXTRACT(EPOCH FROM (a.time_end::time - a.time_start::time)) / 3600.0
            ELSE 0
          END
        ), 0)`,
        'hrs',
      )
      .where('a.date >= :from AND a.date <= :to', { from, to })
      .andWhere("a.status NOT IN ('cancelled', 'paused')")
      .groupBy('a.date, a.technician_id')
      .getRawMany();

    const map: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      const dateKey = typeof r.dt === 'string' ? r.dt : r.dt.toISOString().split('T')[0];
      if (!map[dateKey]) map[dateKey] = {};
      map[dateKey][r.tid] = Number(r.hrs);
    }
    return map;
  }

  async getWeekCapacity(
    from: string,
    to: string,
    usedHoursMap?: Record<string, Record<string, number>>,
    workshopName?: string,
  ) {
    const resolvedMap = usedHoursMap ?? await this.computeUsedHoursForRange(from, to);

    const results: Record<string, DailyTechnicianCapacity[]> = {};
    const current = new Date(from + 'T12:00:00');
    const end     = new Date(to   + 'T12:00:00');

    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      results[dateStr] = await this.getDailyCapacity(dateStr, resolvedMap[dateStr] ?? {}, workshopName);
      current.setDate(current.getDate() + 1);
    }
    return results;
  }

  async createAbsence(technicianId: string, date: string, type: 'full' | 'half' | 'holiday') {
    await this.techniciansService.findOne(technicianId);
    const existing = await this.absenceRepo.findOne({ where: { technicianId, date } });
    if (existing) throw new ConflictException('Ya existe una ausencia registrada para este técnico en esa fecha');
    return this.absenceRepo.save(this.absenceRepo.create({ technicianId, date, type }));
  }

  async deleteAbsence(id: string) {
    const absence = await this.absenceRepo.findOne({ where: { id } });
    if (!absence) throw new NotFoundException('Ausencia no encontrada');
    await this.absenceRepo.remove(absence);
  }

  findAbsences(technicianId?: string, date?: string) {
    const where: any = {};
    if (technicianId) where.technicianId = technicianId;
    if (date) where.date = date;
    return this.absenceRepo.find({ where, relations: ['technician'], order: { date: 'ASC' } });
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
    if (!wd) throw new NotFoundException('Configuración del día laboral no encontrada');
    await this.workingDayRepo.remove(wd);
  }

  // ── Disponibilidad alternativa ────────────────────────────────────────────────

  async findAvailableSlots(params: {
    workshopId: string;
    date: string;
    workshopType: 'MECHANIC' | 'BODYSHOP';
    durationMinutes?: number;
    serviceSpecialty?: string;
    bodyworkHours?: number;
    prepHours?: number;
    paintHours?: number;
    /** Cuando es true, ignora el check de la fecha solicitada y devuelve
     *  las próximas N fechas con disponibilidad a partir de `date` (inclusive).
     *  Úsalo para el buscador proactivo "¿En qué día te ayudo?". */
    findNext?: boolean;
  }): Promise<SlotsResponse> {
    const workshop = await this.workshopsService.findOne(params.workshopId);
    const cfg      = this.resolveAvailabilityConfig(workshop.config);

    if (!params.findNext) {
      const requestedSlots = await this.computeDaySlots(params.date, workshop.name, workshop.config, params, cfg);
      if (requestedSlots.length > 0) {
        return { available: true, requestedDate: params.date, slotsCount: requestedSlots.length, slots: requestedSlots };
      }
    }

    // Modo findNext: busca desde la fecha solicitada (inclusive) en lugar de date+1
    const alternatives: AlternativeDay[] = [];
    let cursor       = params.findNext ? params.date : this.addDays(params.date, 1);
    let searchedDays = 0;

    while (alternatives.length < cfg.alternativeDaysCount && searchedDays < cfg.maxSearchDays) {
      searchedDays++;

      if (!await this.isWorkingDayForSearch(cursor, workshop.config, cfg)) {
        cursor = this.addDays(cursor, 1);
        continue;
      }

      const daySlots = await this.computeDaySlots(cursor, workshop.name, workshop.config, params, cfg);

      if (daySlots.length > 0) {
        alternatives.push({
          date:      cursor,
          dayLabel:  this.formatDayEs(cursor),
          slotsCount: daySlots.length,
          slots:     daySlots.slice(0, 5),
        });
      }

      cursor = this.addDays(cursor, 1);
    }

    const isCurrentlyWorking = await this.isWorkingDayForSearch(params.date, workshop.config, cfg);
    const reason = isCurrentlyWorking ? 'NO_CAPACITY' : 'NON_WORKING_DAY';

    return { available: false, requestedDate: params.date, reason, alternatives, searchedDays };
  }

  private async computeDaySlots(
    date: string,
    workshopName: string,
    workshopConfig: any,
    params: { workshopType: string; durationMinutes?: number; serviceSpecialty?: string; workshopId: string; bodyworkHours?: number; prepHours?: number; paintHours?: number },
    cfg: AvailabilityConfig,
  ): Promise<TimeSlot[]> {
    if (params.workshopType === 'BODYSHOP') {
      return this.computeSlotsBodyshop(date, params.workshopId, workshopName, workshopConfig, {
        bodyworkHours: params.bodyworkHours ?? 0,
        prepHours:     params.prepHours     ?? 0,
        paintHours:    params.paintHours    ?? 0,
      });
    }
    return this.computeSlotsMechanic(
      date, workshopName, workshopConfig,
      params.durationMinutes ?? 60,
      params.serviceSpecialty ?? null,
      cfg,
    );
  }

  private async computeSlotsMechanic(
    date: string,
    workshopName: string,
    workshopConfig: any,
    durationMinutes: number,
    serviceSpecialty: string | null,
    cfg: AvailabilityConfig,
  ): Promise<TimeSlot[]> {
    const durHours   = durationMinutes / 60;
    const dailyCap   = await this.getDailyCapacity(date, undefined, workshopName);
    const allAppts   = await this.appointmentRepo.find({
      where: { date },
      select: { technicianId: true, timeStart: true, timeEnd: true, status: true },
    });
    const activeAppts = allAppts.filter((a: any) => a.status !== 'cancelled' && a.status !== 'paused');

    const lunchBreak = workshopConfig?.lunchBreak as { enabled: boolean; start: string; end: string } | undefined;
    const slots: TimeSlot[] = [];

    for (const techCap of dailyCap) {
      const freeHours = techCap.availableHours - techCap.usedHours - cfg.urgencyBufferHours;
      if (!techCap.isWorkingDay || freeHours < durHours) continue;

      const techAppts  = activeAppts.filter((a: any) => a.technicianId === techCap.technicianId);
      let cursor       = cfg.dayStartHour * 60;
      const endLimit   = cfg.dayEndHour   * 60;

      while (cursor + durationMinutes <= endLimit) {
        const slotEnd = cursor + durationMinutes;

        // Skip lunch break
        if (lunchBreak?.enabled && lunchBreak.start && lunchBreak.end) {
          const lStart = this.toMin(lunchBreak.start);
          const lEnd   = this.toMin(lunchBreak.end);
          if (cursor < lEnd && slotEnd > lStart) { cursor = lEnd; continue; }
        }

        // Skip overlap with existing appointments (guard null timeStart/timeEnd)
        const conflict = techAppts.find((a: any) =>
          a.timeStart && a.timeEnd &&
          this.toMin(a.timeStart) < slotEnd && this.toMin(a.timeEnd) > cursor,
        );
        if (conflict) {
          cursor = conflict.timeEnd ? this.toMin(conflict.timeEnd) : cursor + cfg.slotIntervalMinutes;
          continue;
        }

        slots.push({
          time:             this.fromMin(cursor),
          technicianId:     techCap.technicianId,
          technicianName:   techCap.technicianName,
          specialty:        techCap.specialty,
          hasSpecialtyMatch: !serviceSpecialty || techCap.specialty === serviceSpecialty,
        });

        cursor += cfg.slotIntervalMinutes;
      }
    }

    return slots.sort((a, b) => {
      if (a.hasSpecialtyMatch !== b.hasSpecialtyMatch) return a.hasSpecialtyMatch ? -1 : 1;
      return this.toMin(a.time) - this.toMin(b.time);
    });
  }

  private async computeSlotsBodyshop(
    date: string,
    workshopId: string,
    workshopName: string,
    workshopConfig: any,
    needed: { bodyworkHours: number; prepHours: number; paintHours: number },
  ): Promise<TimeSlot[]> {
    const technicians   = await this.techniciansService.findAll(workshopName);
    const activeTechs   = technicians.filter((t: any) => t.active);
    const workingDay    = await this.workingDayRepo.findOne({ where: { date } });
    const absences      = await this.absenceRepo.find({ where: { date } });
    const absenceMap    = new Map(absences.map(a => [a.technicianId, a.type]));
    const dayOfWeek     = new Date(date + 'T12:00:00').getDay();
    const isSunday      = dayOfWeek === 0;
    const isGlobalHoliday = workingDay?.isWorkingDay === false;

    const specIds = workshopConfig?.processSpecialtyIds as { BODYWORK: string[]; PREP: string[]; PAINT: string[] } | undefined;
    const techProcess = (specialty: string | null): BodyshopProcess | null => {
      const sp = (specialty ?? '').toUpperCase();
      if (specIds) {
        if (specIds.BODYWORK.includes(sp)) return 'BODYWORK';
        if (specIds.PREP.includes(sp))     return 'PREP';
        if (specIds.PAINT.includes(sp))    return 'PAINT';
      }
      return SPECIALTY_TO_PROCESS[sp] ?? null;
    };

    const available: Record<BodyshopProcess, number> = { BODYWORK: 0, PREP: 0, PAINT: 0 };
    for (const tech of activeTechs) {
      const proc    = techProcess((tech as any).specialty);
      if (!proc) continue;
      const absType = absenceMap.get((tech as any).id) ?? null;
      let avail     = Number((tech as any).dailyHours);
      if (isSunday || isGlobalHoliday || absType === 'full') avail = 0;
      else if (absType === 'half' || absType === 'holiday')  avail = avail / 2;
      available[proc] += avail;
    }

    // Occupied hours — including multi-day stays
    const entries = await this.bsEntryRepo
      .createQueryBuilder('e')
      .select(['e.bodyworkHours', 'e.prepHours', 'e.paintHours'])
      .where('e.workshopId = :workshopId', { workshopId })
      .andWhere("e.status != 'cancelled'")
      .andWhere("CAST(e.date AS DATE) <= CAST(:date AS DATE)", { date })
      .andWhere("CAST(e.date AS DATE) + (e.stay_days * INTERVAL '1 day') > CAST(:date AS DATE)", { date })
      .getMany();

    const occupied: Record<BodyshopProcess, number> = { BODYWORK: 0, PREP: 0, PAINT: 0 };
    for (const e of entries) {
      const stayDays = Math.max(Number((e as any).stayDays) || 1, 1);
      occupied.BODYWORK += Number(e.bodyworkHours) / stayDays;
      occupied.PREP     += Number(e.prepHours)     / stayDays;
      occupied.PAINT    += Number(e.paintHours)    / stayDays;
    }

    const hasCap = (
      (needed.bodyworkHours <= 0 || available.BODYWORK - occupied.BODYWORK >= needed.bodyworkHours) &&
      (needed.prepHours     <= 0 || available.PREP     - occupied.PREP     >= needed.prepHours)     &&
      (needed.paintHours    <= 0 || available.PAINT    - occupied.PAINT    >= needed.paintHours)
    );

    // Bodyshop doesn't have time slots — return a placeholder slot when capacity exists
    if (!hasCap) return [];
    return [{
      time:             '08:00',
      technicianId:     '',
      technicianName:   'Auto-asignado',
      specialty:        null,
      hasSpecialtyMatch: true,
    }];
  }

  private async isWorkingDayForSearch(date: string, workshopConfig: any, cfg: AvailabilityConfig): Promise<boolean> {
    const d   = new Date(date + 'T12:00:00');
    const dow = d.getDay();

    if (dow === 0) return false;
    if (dow === 6 && !cfg.includeSaturdays) return false;

    const override = await this.workingDayRepo.findOne({ where: { date } });
    if (override !== null && override !== undefined) return override.isWorkingDay;

    const schedule = workshopConfig?.weeklySchedule;
    if (schedule) {
      const keys = ['sun','mon','tue','wed','thu','fri','sat'];
      return schedule[keys[dow]]?.working ?? true;
    }

    return true;
  }

  private resolveAvailabilityConfig(workshopConfig: any): AvailabilityConfig {
    const c = workshopConfig?.availabilitySearch ?? {};
    return {
      alternativeDaysCount: c.alternativeDaysCount ?? 3,
      maxSearchDays:        c.maxSearchDays        ?? 30,
      includeSaturdays:     c.includeSaturdays      ?? false,
      urgencyBufferHours:   c.urgencyBufferHours    ?? 0,
      slotIntervalMinutes:  c.slotIntervalMinutes   ?? 30,
      dayStartHour:         c.dayStartHour          ?? 8,
      dayEndHour:           c.dayEndHour            ?? 18,
    };
  }

  private addDays(date: string, n: number): string {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
  }

  private formatDayEs(date: string): string {
    const d   = new Date(date + 'T12:00:00');
    const dow = DAY_LABELS_ES[d.getDay()];
    return `${dow} ${d.getDate()} de ${MONTH_LABELS_ES[d.getMonth()]}`;
  }

  private toMin(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  private fromMin(minutes: number): string {
    return `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`;
  }
}
