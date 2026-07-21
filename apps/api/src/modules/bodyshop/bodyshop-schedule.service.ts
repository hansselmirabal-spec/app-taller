import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { BodyshopEntryProcessSlot } from './bodyshop-entry-process-slot.entity';
import { BodyshopProcess } from './bodyshop-process.entity';
import { TechnicianAbsence } from '../capacity/technician-absence.entity';
import { WorkingDay } from '../capacity/working-day.entity';
import { TechniciansService } from '../technicians/technicians.service';
import { WorkshopsService } from '../workshops/workshops.service';

const MAX_LOOKAHEAD = 90;
const SHOP_OPEN  = '08:00';
const SHOP_CLOSE = '18:00';

const SPECIALTY_TO_CODE: Record<string, string> = {
  CHAPERIA: 'BODYWORK', CARROCERIA: 'BODYWORK', BODYWORK: 'BODYWORK',
  CHAPA: 'BODYWORK', CHAPERO: 'BODYWORK', 'CHAPA Y PINTURA': 'BODYWORK',
  PREPARACION: 'PREP', PREPARADOR: 'PREP', PREP: 'PREP',
  PINTURA: 'PAINT', PINTOR: 'PAINT', PAINT: 'PAINT',
  PULIDO: 'POLISH', PULIDOR: 'POLISH', POLISH: 'POLISH',
};

export interface SimulateInput {
  bodyworkHours: number;
  prepHours:     number;
  paintHours:    number;
  workshopId:    string;
  startDate:     string;   // YYYY-MM-DD
  startTime?:    string;   // HH:mm  (default 08:00)
  entryIdExclude?: string; // skip commitments from this entry (for re-simulating)
}

export interface ProcessSlotResult {
  process:    string;
  processName: string;
  date:       string;
  timeStart:  string;
  timeEnd:    string;
  hours:      number;
  sequence:   number;
}

export interface ScheduleSimulation {
  canSchedule:           boolean;
  startDate:             string | null;
  estimatedFinishDate:   string | null;
  slots:                 ProcessSlotResult[];
  warnings:              string[];
}

const DEFAULT_PROCESSES = [
  { code: 'BODYWORK', name: 'Chapería',    sequence: 1 },
  { code: 'PREP',     name: 'Preparación', sequence: 2 },
  { code: 'PAINT',    name: 'Pintura',     sequence: 3 },
  { code: 'POLISH',   name: 'Pulida',      sequence: 4 },
];

@Injectable()
export class BodyshopScheduleService {
  constructor(
    @InjectRepository(BodyshopEntryProcessSlot) private slotRepo: Repository<BodyshopEntryProcessSlot>,
    @InjectRepository(BodyshopProcess)          private processRepo: Repository<BodyshopProcess>,
    @InjectRepository(TechnicianAbsence)        private absenceRepo: Repository<TechnicianAbsence>,
    @InjectRepository(WorkingDay)               private workingDayRepo: Repository<WorkingDay>,
    private techniciansService: TechniciansService,
    private workshopsService: WorkshopsService,
  ) {}

  async onApplicationBootstrap() {
    const count = await this.processRepo.count();
    if (count === 0) {
      await this.processRepo.save(
        DEFAULT_PROCESSES.map(p => this.processRepo.create({ ...p, active: true })),
      );
    }
  }

  async simulate(input: SimulateInput): Promise<ScheduleSimulation> {
    const { bodyworkHours, prepHours, paintHours, workshopId, startDate, entryIdExclude } = input;
    // startTime puede llegar como "09:00:00" (columnas Postgres type:'time', p.ej.
    // budget_appointments.time_start) — se trunca/valida a "HH:MM" acá, en la fuente,
    // para que nunca se guarde un valor más largo en bodyshop_entry_process_slots.time_start
    // (varchar(5)) sin importar quién llame a simulate().
    const startTime = this.normalizeTime(input.startTime) ?? SHOP_OPEN;

    const hoursByCode: Record<string, number> = {
      BODYWORK: Number(bodyworkHours) || 0,
      PREP:     Number(prepHours)     || 0,
      PAINT:    Number(paintHours)    || 0,
    };

    const totalHours = Object.values(hoursByCode).reduce((s, h) => s + h, 0);
    if (totalHours <= 0) {
      return { canSchedule: false, startDate: null, estimatedFinishDate: null, slots: [], warnings: ['Debe ingresar horas en al menos un proceso.'] };
    }

    const processes = await this.processRepo.find({ where: { active: true }, order: { sequence: 'ASC' } });
    const workshop = await this.workshopsService.findOne(workshopId);
    const workshopConfig = workshop.config as any;

    // Pre-load committed hours per process per day over lookahead window
    const endLookahead = this.addDays(startDate, MAX_LOOKAHEAD);
    const committed = await this.slotRepo
      .createQueryBuilder('s')
      .innerJoin('s.entry', 'e')
      .select('s.process',  'process')
      .addSelect('s.date',  'date')
      .addSelect('SUM(COALESCE(s.adjusted_hours, s.hours))', 'committed')
      .where('e.workshopId = :workshopId', { workshopId })
      .andWhere("s.status != 'done'")
      .andWhere("e.status != 'cancelled'")
      .andWhere('s.date BETWEEN :from AND :to', { from: startDate, to: endLookahead })
      .andWhere(entryIdExclude ? 's.entry_id != :excId' : '1=1', { excId: entryIdExclude })
      .groupBy('s.process')
      .addGroupBy('s.date')
      .getRawMany();

    // Daily base capacity per process + per-tech map to compute absence reductions.
    // Se necesita ANTES de armar committedMap: si PREP comparte pool con BODYWORK
    // (sin técnico dedicado), hay que sumar los compromisos de ambos bajo la misma
    // clave — si no, un PREP viejo en la base no frena una nueva reserva de BODYWORK
    // para el mismo técnico, y viceversa.
    const { dailyCap, techCapMap, poolKey } = await this.buildCapacityInfo(workshopId, workshop);

    const committedMap = new Map<string, number>();
    for (const row of committed) {
      const pool = poolKey.get(row.process) ?? row.process;
      const key  = `${pool}|${row.date}`;
      committedMap.set(key, (committedMap.get(key) ?? 0) + Number(row.committed));
    }

    // Pre-load absences over the lookahead window and build reduction map: `process|date` → hours lost
    const absences = await this.absenceRepo.find({
      where: { date: Between(startDate, endLookahead) },
      relations: ['technician'],
    });
    const absenceReductionMap = new Map<string, number>();
    for (const abs of absences) {
      const techInfo = techCapMap.get(abs.technicianId);
      if (!techInfo) continue;
      const hoursLost = (abs.type === 'half' || abs.type === 'holiday') ? techInfo.dailyHours / 2 : techInfo.dailyHours;
      const key = `${techInfo.process}|${abs.date}`;
      absenceReductionMap.set(key, (absenceReductionMap.get(key) ?? 0) + hoursLost);
    }

    const slots:    ProcessSlotResult[] = [];
    const warnings: string[] = [];

    // pointer = where we are in the schedule (exclusive end of last slot)
    let pointerDate = startDate;
    let pointerTime = startTime;

    for (const proc of processes) {
      let remaining = hoursByCode[proc.code] ?? 0;
      if (remaining <= 0) continue;

      const baseCap = dailyCap.get(proc.code) ?? 0;
      if (baseCap <= 0) {
        warnings.push(`Sin técnicos disponibles para ${proc.name}`);
        continue;
      }

      // pool: la clave real de horas comprometidas/ausencias para este proceso.
      // Si comparte técnicos con otro proceso (ej. PREP sin dedicado → BODYWORK),
      // usa la clave del proceso dueño para no contar el mismo técnico dos veces.
      const pool = poolKey.get(proc.code) ?? proc.code;

      let sequence = 0;
      let daysSearched = 0;

      while (remaining > 0.001) {
        if (daysSearched > MAX_LOOKAHEAD) {
          warnings.push(`${proc.name}: no hay ventana disponible en los próximos ${MAX_LOOKAHEAD} días`);
          break;
        }

        if (!(await this.isWorkingDay(pointerDate, workshopConfig))) {
          pointerDate = this.addDays(pointerDate, 1);
          pointerTime = SHOP_OPEN;
          daysSearched++;
          continue;
        }

        const absReduction    = absenceReductionMap.get(`${pool}|${pointerDate}`) ?? 0;
        const cap             = Math.max(0, baseCap - absReduction);
        const alreadyCommitted = committedMap.get(`${pool}|${pointerDate}`) ?? 0;
        const dayAvailable     = Math.max(0, cap - alreadyCommitted);

        const fromMinutes  = this.toMinutes(pointerTime);
        const closeMinutes = this.toMinutes(SHOP_CLOSE);
        const windowMinutes = Math.max(0, closeMinutes - fromMinutes);
        const windowHours   = windowMinutes / 60;

        const canUseToday = Math.min(dayAvailable, windowHours, remaining);

        if (canUseToday <= 0.001) {
          pointerDate = this.addDays(pointerDate, 1);
          pointerTime = SHOP_OPEN;
          daysSearched++;
          continue;
        }

        const slotEnd = this.addHoursToTime(pointerTime, canUseToday);

        slots.push({
          process:     proc.code,
          processName: proc.name,
          date:        pointerDate,
          timeStart:   pointerTime,
          timeEnd:     slotEnd,
          hours:       Math.round(canUseToday * 100) / 100,
          sequence:    sequence++,
        });

        // Update in-memory committed so same-day multi-process doesn't double-book
        // (usa `pool`, no proc.code — así un slot de PREP también ocupa el cupo
        // de BODYWORK cuando comparten los mismos técnicos, y viceversa)
        const key = `${pool}|${pointerDate}`;
        committedMap.set(key, (committedMap.get(key) ?? 0) + canUseToday);

        remaining -= canUseToday;

        if (remaining > 0.001) {
          pointerDate = this.addDays(pointerDate, 1);
          pointerTime = SHOP_OPEN;
        } else {
          pointerTime = slotEnd;
        }
        daysSearched = 0;
      }
    }

    if (slots.length === 0) {
      return { canSchedule: false, startDate: null, estimatedFinishDate: null, slots: [], warnings };
    }

    const lastSlotDate = slots.at(-1)!.date;
    const estimatedFinishDate = await this.nextWorkingDay(lastSlotDate, workshopConfig);

    return {
      canSchedule:         true,
      startDate:           slots[0].date,
      estimatedFinishDate,
      slots,
      warnings,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async buildCapacityInfo(workshopId: string, ws?: any): Promise<{
    dailyCap:   Map<string, number>;
    techCapMap: Map<string, { process: string; dailyHours: number }>;
    poolKey:    Map<string, string>;
  }> {
    if (!ws) ws = await this.workshopsService.findOne(workshopId);
    const technicians = await this.techniciansService.findAll(ws.name);
    const wsConfig    = ws.config as any;
    const specIds     = wsConfig?.processSpecialtyIds as Record<string, string[]> | undefined;

    const dailyCap   = new Map<string, number>();
    const techCapMap = new Map<string, { process: string; dailyHours: number }>();

    for (const tech of technicians.filter(t => t.active)) {
      const sp = (tech.specialty ?? '').toUpperCase();
      let code: string | null = null;
      if (specIds) {
        for (const [proc, ids] of Object.entries(specIds)) {
          if (ids.includes(sp)) { code = proc; break; }
        }
      }
      if (!code) code = SPECIALTY_TO_CODE[sp] ?? null;
      if (!code) continue;
      const dailyHours = Number(tech.dailyHours);
      dailyCap.set(code, (dailyCap.get(code) ?? 0) + dailyHours);
      techCapMap.set(tech.id, { process: code, dailyHours });
    }

    // poolKey: qué "pool" de horas comprometidas usa cada proceso al reservar cupo.
    // Por defecto cada proceso es su propio pool.
    const poolKey = new Map<string, string>();
    for (const code of dailyCap.keys()) poolKey.set(code, code);

    // Si PREP no tiene técnico dedicado, lo cubren los técnicos de BODYWORK
    // (común en chaperías chicas) — comparten la MISMA persona, así que también
    // tienen que compartir el mismo pool de horas comprometidas por día. Si no,
    // el scheduler reserva 8h de BODYWORK y otras 8h de PREP para el mismo técnico
    // el mismo día — sobreagenda fantasma (ver auditoría, hallazgo #8).
    if (!dailyCap.has('PREP') && dailyCap.has('BODYWORK')) {
      dailyCap.set('PREP', dailyCap.get('BODYWORK')!);
      poolKey.set('PREP', 'BODYWORK');
    }

    return { dailyCap, techCapMap, poolKey };
  }

  private async isWorkingDay(date: string, workshopConfig?: any): Promise<boolean> {
    const dow = new Date(date + 'T12:00:00').getDay();

    // 1. weeklySchedule del taller (configuración base por día de semana)
    const schedule = workshopConfig?.weeklySchedule;
    if (schedule) {
      const keys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      const dayConfig = schedule[keys[dow]];
      if (dayConfig?.working === false) return false;
    }

    // 2. Override específico por fecha en working_days
    const wd = await this.workingDayRepo.findOne({ where: { date } });
    if (wd !== null && wd !== undefined) return wd.isWorkingDay;

    // 3. Fallback: domingo no es laborable
    if (dow === 0) return false;

    return true;
  }

  private async nextWorkingDay(date: string, workshopConfig?: any): Promise<string> {
    let d = this.addDays(date, 1);
    for (let i = 0; i < 14; i++) {
      if (await this.isWorkingDay(d, workshopConfig)) return d;
      d = this.addDays(d, 1);
    }
    return d;
  }

  private toMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + (m || 0);
  }

  private normalizeTime(time?: string): string | null {
    if (!time) return null;
    const truncated = time.slice(0, 5);
    return /^\d{2}:\d{2}$/.test(truncated) ? truncated : null;
  }

  private fromMinutes(minutes: number): string {
    const h = Math.floor(minutes / 60).toString().padStart(2, '0');
    const m = (minutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  private addHoursToTime(time: string, hours: number): string {
    const mins = this.toMinutes(time) + Math.round(hours * 60);
    const capped = Math.min(mins, this.toMinutes(SHOP_CLOSE));
    return this.fromMinutes(capped);
  }

  private addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().split('T')[0];
  }
}
