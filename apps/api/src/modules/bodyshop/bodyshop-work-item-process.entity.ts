import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
} from 'typeorm';
import { BodyshopWorkItem } from './bodyshop-work-item.entity';
import { BodyshopProcess } from './bodyshop-process.entity';

@Entity('bodyshop_work_item_processes')
export class BodyshopWorkItemProcess {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'work_item_id', type: 'varchar' })
  workItemId: string;

  @ManyToOne(() => BodyshopWorkItem, w => w.processes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'work_item_id' })
  workItem: BodyshopWorkItem;

  @Column({ name: 'process_id', type: 'varchar' })
  processId: string;

  @ManyToOne(() => BodyshopProcess, { eager: true })
  @JoinColumn({ name: 'process_id' })
  process: BodyshopProcess;

  @Column({
    name: 'suggested_hours',
    type: 'decimal',
    precision: 5,
    scale: 2,
    transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) },
  })
  suggestedHours: number;

  @Column({
    name: 'adjusted_hours',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: { to: (v: number | null) => v, from: (v: string | null) => v ? parseFloat(v) : null },
  })
  adjustedHours: number | null;

  get finalHours(): number {
    return this.adjustedHours ?? this.suggestedHours;
  }

  @Column({ name: 'adjustment_reason', type: 'text', nullable: true })
  adjustmentReason: string | null;

  @Column({ name: 'adjusted_by', type: 'varchar', length: 100, nullable: true })
  adjustedBy: string | null;

  @Column({ name: 'adjusted_at', type: 'timestamptz', nullable: true })
  adjustedAt: Date | null;

  // Fecha proyectada para este proceso (calculada por el simulador).
  @Column({ name: 'scheduled_date', type: 'varchar', length: 10, nullable: true })
  scheduledDate: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: 'pending' | 'scheduled' | 'in_progress' | 'done';
}
