import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Role } from '../roles/role.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ type: 'varchar', default: 'receptionist' })
  role: 'admin' | 'receptionist' | 'perito';

  @Column({ name: 'role_id', nullable: true, type: 'uuid' })
  roleId: string | null;

  @ManyToOne(() => Role, { nullable: true, eager: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'role_id' })
  customRole: Role | null;

  @Column({ name: 'allowed_workshop_ids', type: 'jsonb', nullable: true, default: null })
  allowedWorkshopIds: string[] | null;

  @Column({ default: true })
  active: boolean;

  @Column({ name: 'must_change_password', default: false })
  mustChangePassword: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
