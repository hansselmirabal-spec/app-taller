import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BodyshopEntry } from './bodyshop-entry.entity';
import { Technician } from '../technicians/technician.entity';

@Entity('bodyshop_process_techs')
@Unique(['entryId', 'process'])
export class BodyshopProcessTech {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'entry_id', type: 'varchar' })
  entryId: string;

  @ManyToOne(() => BodyshopEntry, e => e.processTechsList, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'entry_id' })
  entry: BodyshopEntry;

  @Column({ type: 'varchar', length: 20 })
  process: string;

  @Column({ name: 'technician_id', type: 'varchar' })
  technicianId: string;

  @ManyToOne(() => Technician, { eager: false })
  @JoinColumn({ name: 'technician_id' })
  technician: Technician;
}
