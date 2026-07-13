import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User } from './user.entity';
import { IsEmail, IsString, MinLength, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { Role } from '../roles/role.entity';
import type { Permissions } from '../roles/role.entity';
import { MailService } from '../mail/mail.service';

export class CreateUserDto {
  @IsString() name: string;
  @IsEmail() email: string;
  @IsEnum(['admin', 'admin_taller', 'receptionist', 'perito']) role: 'admin' | 'admin_taller' | 'receptionist' | 'perito';
  @IsOptional() roleId?: string | null;
  @IsOptional() allowedWorkshopIds?: string[] | null;
}

export class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() @MinLength(8) password?: string;
  @IsOptional() @IsEnum(['admin', 'admin_taller', 'receptionist', 'perito']) role?: 'admin' | 'admin_taller' | 'receptionist' | 'perito';
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() roleId?: string | null;
  @IsOptional() allowedWorkshopIds?: string[] | null;
}

function serializeUser(user: User) {
  const { passwordHash: _, ...u } = user;
  return u;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private repo: Repository<User>,
    @InjectRepository(Role) private roleRepo: Repository<Role>,
    private mailService: MailService,
  ) {}

  async findByEmail(email: string) {
    const user = await this.repo.findOne({ where: { email }, relations: ['customRole'] });
    if (user) await this.fillDefaultRole(user);
    return user;
  }

  async findById(id: string) {
    const user = await this.repo.findOne({ where: { id }, relations: ['customRole'] });
    if (user) await this.fillDefaultRole(user);
    return user;
  }

  private async fillDefaultRole(user: User): Promise<void> {
    if (user.customRole) return;
    const defaultRole = await this.roleRepo.findOne({ where: { defaultFor: user.role } });
    if (defaultRole) user.customRole = defaultRole;
  }

  async findAll() {
    const users = await this.repo.find({ order: { name: 'ASC' }, relations: ['customRole'] });
    return users.map(serializeUser);
  }

  async create(dto: CreateUserDto) {
    const exists = await this.findByEmail(dto.email);
    if (exists) throw new ConflictException('El email ya está en uso');

    const tempPassword = generateTempPassword();
    const user = this.repo.create({
      name: dto.name,
      email: dto.email,
      passwordHash: await bcrypt.hash(tempPassword, 10),
      role: dto.role,
      roleId: dto.roleId ?? null,
      allowedWorkshopIds: dto.allowedWorkshopIds ?? null,
      mustChangePassword: true,
    });
    const saved = await this.repo.save(user);

    await this.mailService.sendWelcome(dto.name, dto.email, tempPassword);

    return serializeUser(await this.repo.findOne({ where: { id: saved.id }, relations: ['customRole'] }) as User);
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.repo.findOne({ where: { id }, relations: ['customRole'] });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    if (dto.name) user.name = dto.name;
    if (dto.role) user.role = dto.role;
    if (dto.active !== undefined) user.active = dto.active;
    if (dto.password) user.passwordHash = await bcrypt.hash(dto.password, 10);
    if ('roleId' in dto) user.roleId = dto.roleId ?? null;
    if ('allowedWorkshopIds' in dto) user.allowedWorkshopIds = dto.allowedWorkshopIds ?? null;

    const saved = await this.repo.save(user);
    return serializeUser(await this.repo.findOne({ where: { id: saved.id }, relations: ['customRole'] }) as User);
  }

  async remove(id: string): Promise<void> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    await this.repo.delete(id);
  }

  async clearMustChangePassword(id: string): Promise<void> {
    await this.repo.update(id, { mustChangePassword: false });
  }

  resolvePermissions(user: User): Permissions {
    if (user.role === 'admin' || user.role === 'admin_taller') return buildFullPermissions();
    if (user.customRole?.permissions) return user.customRole.permissions;
    if (user.role === 'perito') return buildDefaultPeritoPermissions();
    return buildDefaultReceptionistPermissions();
  }
}

function buildFullPermissions(): Permissions {
  return Object.fromEntries(
    MODULES.map(m => [m, { view: true, edit: true }])
  );
}

function buildDefaultReceptionistPermissions(): Permissions {
  return {
    dashboard:    { view: true,  edit: false },
    capacity:     { view: true,  edit: false },
    appointments: { view: true,  edit: true  },
    kanban:       { view: true,  edit: false },
    reports:      { view: false, edit: false },
    settings:     { view: false, edit: false },
    presupuesto:  { view: false, edit: false },
  };
}

function buildDefaultPeritoPermissions(): Permissions {
  return {
    dashboard:    { view: true,  edit: false },
    capacity:     { view: false, edit: false },
    appointments: { view: false, edit: false },
    kanban:       { view: false, edit: false },
    reports:      { view: false, edit: false },
    settings:     { view: false, edit: false },
    presupuesto:  { view: true,  edit: true  },
  };
}

const MODULES = ['dashboard', 'capacity', 'appointments', 'kanban', 'reports', 'settings', 'presupuesto'];

function generateTempPassword(): string {
  return crypto.randomBytes(6).toString('base64url').slice(0, 10) + '#1Aa';
}
