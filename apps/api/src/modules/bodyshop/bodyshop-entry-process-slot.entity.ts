import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { BodyshopEntry } from './bodyshop-entry.entity';
import { Technician } from '../technicians/technician.entity';

@Entity('bodyshop_entry_process_slots')
export class BodyshopEntryProcessSlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'entry_id', type: 'uuid' })
  entryId: string;

  @ManyToOne(() => BodyshopEntry, e => e.processSlots, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'entry_id' })
  entry: BodyshopEntry;

  @Column({ type: 'varchar', length: 20 })
  process: string;

  @Column({ type: 'varchar', length: 10 })
  date: string;

  @Column({ name: 'time_start', type: 'varchar', length: 5 })
  timeStart: string;

  @Column({ name: 'time_end', type: 'varchar', length: 5 })
  timeEnd: string;

  @Column({
    type: 'decimal', precision: 5, scale: 2,
    transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) },
  })
  hours: number;

  @Column({ type: 'int', default: 0 })
  sequence: number;

  @Column({ name: 'technician_id', type: 'varchar', nullable: true })
  technicianId: string | null;

  @ManyToOne(() => Technician, { nullable: true, eager: false })
  @JoinColumn({ name: 'technician_id' })
  technician: Technician | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: 'pending' | 'in_progress' | 'done';

  @Column({
    name: 'adjusted_hours', type: 'decimal', precision: 5, scale: 2, nullable: true,
    transformer: { to: (v: number | null) => v, from: (v: string | null) => v ? parseFloat(v) : null },
  })
  adjustedHours: number | null;

  @Column({ name: 'adjustment_reason', type: 'text', nullable: true })
  adjustmentReason: string | null;

  @Column({ name: 'adjusted_by', type: 'varchar', length: 100, nullable: true })
  adjustedBy: string | null;

  @Column({ name: 'adjusted_at', type: 'timestamptz', nullable: true })
  adjustedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  get finalHours(): number {
    return this.adjustedHours ?? this.hours;
  }
}
