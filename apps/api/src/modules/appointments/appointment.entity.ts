import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Technician } from '../technicians/technician.entity';
import { ServiceType } from '../service-types/service-type.entity';
import { User } from '../users/user.entity';

@Entity('appointments')
export class Appointment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ name: 'time_start', type: 'time' })
  timeStart: string;

  @Column({ name: 'time_end', type: 'time' })
  timeEnd: string;

  @Column({ name: 'technician_id' })
  technicianId: string;

  @ManyToOne(() => Technician)
  @JoinColumn({ name: 'technician_id' })
  technician: Technician;

  @Column({ name: 'service_type_id' })
  serviceTypeId: string;

  @ManyToOne(() => ServiceType)
  @JoinColumn({ name: 'service_type_id' })
  serviceType: ServiceType;

  @Column({ name: 'customer_name', length: 100 })
  customerName: string;

  @Column({ length: 50 })
  plate: string;

  @Column({ default: 'scheduled' })
  status: 'scheduled' | 'in_progress' | 'done' | 'cancelled' | 'paused';

  @Column({ name: 'advisor_code', type: 'varchar', length: 30, nullable: true })
  advisorCode: string | null;

  @Column({ name: 'advisor_name', type: 'varchar', length: 100, nullable: true })
  advisorName: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ name: 'vehicle_description', type: 'varchar', length: 120, nullable: true })
  vehicleDescription: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'created_by' })
  createdBy: string;

  @Column({ name: 'estimated_finish_date', type: 'date', nullable: true })
  estimatedFinishDate: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
