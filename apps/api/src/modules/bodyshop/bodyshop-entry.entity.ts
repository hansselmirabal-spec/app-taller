import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany,
  JoinColumn, CreateDateColumn,
} from 'typeorm';
import { WorkType } from '../work-types/work-type.entity';
import { Technician } from '../technicians/technician.entity';
import { BodyshopProcessTech } from './bodyshop-process-tech.entity';
import { BodyshopWorkItem } from './bodyshop-work-item.entity';
import { BodyshopEntryProcessSlot } from './bodyshop-entry-process-slot.entity';

@Entity('bodyshop_entries')
export class BodyshopEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workshop_id', type: 'varchar' })
  workshopId: string;

  @Column({ type: 'varchar', length: 10 })
  date: string;

  @Column({ name: 'work_type_id', type: 'varchar', nullable: true })
  workTypeId: string | null;

  @ManyToOne(() => WorkType, { nullable: true, eager: false })
  @JoinColumn({ name: 'work_type_id' })
  workType: WorkType | null;

  @Column({ name: 'customer_name', length: 100 })
  customerName: string;

  @Column({ length: 50 })
  plate: string;

  @Column({ type: 'varchar', length: 20, default: 'scheduled' })
  status: string;

  @Column({ name: 'bodywork_hours', type: 'decimal', precision: 5, scale: 2 })
  bodyworkHours: number;

  @Column({ name: 'prep_hours', type: 'decimal', precision: 5, scale: 2 })
  prepHours: number;

  @Column({ name: 'paint_hours', type: 'decimal', precision: 5, scale: 2 })
  paintHours: number;

  @Column({ name: 'stay_days', type: 'int', default: 1 })
  stayDays: number;

  @Column({ type: 'varchar', length: 20 })
  channel: string;

  @Column({ name: 'time_start', type: 'varchar', length: 8, nullable: true })
  timeStart: string | null;

  @Column({ name: 'advisor_code', type: 'varchar', length: 30, nullable: true })
  advisorCode: string | null;

  @Column({ name: 'advisor_name', type: 'varchar', length: 100, nullable: true })
  advisorName: string | null;

  @Column({ name: 'budget_number', type: 'varchar', length: 50, nullable: true })
  budgetNumber: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'technician_id', type: 'varchar', nullable: true })
  technicianId: string | null;

  @ManyToOne(() => Technician, { nullable: true, eager: false })
  @JoinColumn({ name: 'technician_id' })
  technician: Technician | null;

  @OneToMany(() => BodyshopProcessTech, pt => pt.entry, { cascade: true })
  processTechsList: BodyshopProcessTech[];

  @OneToMany(() => BodyshopWorkItem, w => w.entry, { cascade: true })
  workItems: BodyshopWorkItem[];

  @OneToMany(() => BodyshopEntryProcessSlot, s => s.entry, { cascade: true })
  processSlots: BodyshopEntryProcessSlot[];

  @Column({ name: 'estimated_finish_date', type: 'varchar', length: 10, nullable: true })
  estimatedFinishDate: string | null;

  @Column({ type: 'jsonb', nullable: true })
  processes: { code: string; name: string; hours: number }[] | null;

  @Column({ name: 'waiting_for_resource', type: 'boolean', default: false })
  waitingForResource: boolean;

  @Column({ name: 'resource_note', type: 'varchar', length: 200, nullable: true })
  resourceNote: string | null;

  @Column({ name: 'resource_blocked_at', type: 'timestamptz', nullable: true })
  resourceBlockedAt: Date | null;

  @Column({ name: 'no_start_at', type: 'timestamptz', nullable: true })
  noStartAt: Date | null;

  @Column({ name: 'no_start_hours_lost', type: 'decimal', precision: 5, scale: 2, nullable: true })
  noStartHoursLost: number | null;

  @Column({ name: 'no_start_tech_snapshot', type: 'jsonb', nullable: true })
  noStartTechSnapshot: { process: string; technicianId: string; technicianName: string }[] | null;

  @Column({ name: 'created_by', type: 'varchar' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
