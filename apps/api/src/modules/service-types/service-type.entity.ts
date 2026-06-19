import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('service_types')
export class ServiceType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ name: 'duration_hours', type: 'decimal', precision: 4, scale: 2 })
  durationHours: number;

  @Column({ length: 7, nullable: true })
  color: string;

  @Column({ default: true })
  active: boolean;
}
