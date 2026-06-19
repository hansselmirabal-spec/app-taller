import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export type OperationalBlockType = 'meeting' | 'cleaning' | 'break' | 'maintenance' | 'other';

@Entity('operational_blocks')
export class OperationalBlock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workshop_id', type: 'varchar' })
  workshopId: string;

  @Column({ type: 'varchar', length: 10 })
  date: string;

  @Column({ name: 'time_start', type: 'varchar', length: 5 })
  timeStart: string;

  @Column({ name: 'time_end', type: 'varchar', length: 5 })
  timeEnd: string;

  @Column({ type: 'varchar', length: 20, default: 'other' })
  type: OperationalBlockType;

  @Column({ type: 'varchar', length: 150 })
  reason: string;

  @Column({ name: 'created_by', type: 'varchar' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
