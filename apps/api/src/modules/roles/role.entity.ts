import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export interface ModulePermission {
  view: boolean;
  edit: boolean;
}

export type Permissions = Record<string, ModulePermission>;

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100, unique: true })
  name: string;

  @Column({ type: 'jsonb' })
  permissions: Permissions;

  @Column({ name: 'default_for', nullable: true, unique: true, type: 'varchar', length: 20 })
  defaultFor: string | null;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
