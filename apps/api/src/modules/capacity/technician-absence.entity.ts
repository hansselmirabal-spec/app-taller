import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { Technician } from '../technicians/technician.entity';

@Entity('technician_absences')
@Unique(['technicianId', 'date'])
export class TechnicianAbsence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'technician_id' })
  technicianId: string;

  @ManyToOne(() => Technician)
  @JoinColumn({ name: 'technician_id' })
  technician: Technician;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar' })
  type: 'full' | 'half' | 'holiday';
}
