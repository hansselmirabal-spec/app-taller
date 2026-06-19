import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

@Entity('tracking_logs')
@Index(['sourceType', 'sourceId'])
@Index(['status'])
export class TrackingLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'source_type', type: 'varchar', length: 20 })
  sourceType: 'mechanic' | 'bodyshop';

  @Column({ name: 'source_id', type: 'varchar' })
  sourceId: string;

  @Column({ name: 'process_name', type: 'varchar', length: 60 })
  processName: string;

  @Column({ name: 'process_code', type: 'varchar', length: 20 })
  processCode: string;

  @Column({ name: 'order_index', type: 'int' })
  orderIndex: number;

  @Column({
    name: 'planned_hours', type: 'decimal', precision: 5, scale: 2,
    transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) },
  })
  plannedHours: number;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: 'pending' | 'in_progress' | 'blocked' | 'completed' | 'skipped';

  @Column({ name: 'blocked_reason', type: 'varchar', length: 120, nullable: true })
  blockedReason: string | null;

  @Column({ name: 'paused_at', type: 'timestamptz', nullable: true })
  pausedAt: Date | null;

  @Column({
    name: 'paused_duration_minutes', type: 'decimal', precision: 8, scale: 2, default: 0,
    transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v ?? '0') },
  })
  pausedDurationMinutes: number;

  @Column({ name: 'process_type', type: 'varchar', length: 10, default: 'MOTHER' })
  processType: 'MOTHER' | 'PARALLEL';

  @Column({ name: 'technician_id', type: 'varchar', length: 100, nullable: true })
  technicianId: string | null;

  @Column({ name: 'technician_name', type: 'varchar', length: 100, nullable: true })
  technicianName: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
