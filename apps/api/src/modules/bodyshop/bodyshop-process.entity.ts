import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('bodyshop_processes')
export class BodyshopProcess {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 60 })
  name: string;

  @Column({ length: 20, unique: true })
  code: string;

  @Column({ type: 'int' })
  sequence: number;

  @Column({ type: 'varchar', length: 10, default: 'MOTHER' })
  type: 'MOTHER' | 'PARALLEL';

  @Column({ type: 'varchar', length: 7, nullable: true })
  color: string | null;

  @Column({ name: 'required_specialty', type: 'varchar', length: 30, nullable: true })
  requiredSpecialty: string | null;

  @Column({ default: true })
  active: boolean;
}
