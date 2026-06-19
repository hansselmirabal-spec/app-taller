import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('work_types')
export class WorkType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workshop_id', type: 'varchar' })
  workshopId: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 20 })
  severity: string;

  @Column({ name: 'estimated_days', type: 'decimal', precision: 4, scale: 1 })
  estimatedDays: number;

  @Column({ name: 'bodywork_hours', type: 'decimal', precision: 5, scale: 2 })
  bodyworkHours: number;

  @Column({ name: 'prep_hours', type: 'decimal', precision: 5, scale: 2 })
  prepHours: number;

  @Column({ name: 'paint_hours', type: 'decimal', precision: 5, scale: 2 })
  paintHours: number;

  @Column({ length: 7 })
  color: string;

  @Column({ default: true })
  active: boolean;
}
