import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('specialties')
export class Specialty {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ name: 'workshop_id', type: 'varchar' })
  workshopId: string;
}
