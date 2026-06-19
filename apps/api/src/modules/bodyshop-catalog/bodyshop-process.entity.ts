import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('bodyshop_processes')
export class BodyshopProcess {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 10 })
  code: string;

  @Column()
  label: string;

  @Column({ type: 'int' })
  order: number;
}
