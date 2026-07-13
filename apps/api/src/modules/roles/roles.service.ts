import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role, Permissions } from './role.entity';
import { IsString, IsObject, IsOptional } from 'class-validator';

const VALID_MODULES = ['dashboard', 'capacity', 'appointments', 'kanban', 'reports', 'settings', 'presupuesto', 'documentation'];

function validatePermissions(perms: unknown): perms is Permissions {
  if (typeof perms !== 'object' || perms === null || Array.isArray(perms)) return false;
  return Object.entries(perms as Record<string, unknown>).every(([key, val]) =>
    VALID_MODULES.includes(key) &&
    typeof val === 'object' && val !== null &&
    typeof (val as any).view === 'boolean' &&
    typeof (val as any).edit === 'boolean'
  );
}

export class CreateRoleDto {
  @IsString() name: string;
  @IsObject() permissions: Permissions;
}

export class UpdateRoleDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsObject() permissions?: Permissions;
  @IsOptional() active?: boolean;
}

@Injectable()
export class RolesService {
  constructor(@InjectRepository(Role) private repo: Repository<Role>) {}

  findAll() {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  findOne(id: string) {
    return this.repo.findOne({ where: { id } });
  }

  async create(dto: CreateRoleDto) {
    if (!validatePermissions(dto.permissions)) {
      throw new BadRequestException('Los permisos deben ser un objeto con módulos válidos y booleanos {view, edit}');
    }
    const exists = await this.repo.findOne({ where: { name: dto.name } });
    if (exists) throw new ConflictException('Ya existe un rol con ese nombre');
    return this.repo.save(this.repo.create(dto));
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.repo.findOne({ where: { id } });
    if (!role) throw new NotFoundException('Rol no encontrado');
    if (dto.name !== undefined) role.name = dto.name;
    if (dto.permissions !== undefined) {
      if (!validatePermissions(dto.permissions)) {
        throw new BadRequestException('Los permisos deben ser un objeto con módulos válidos y booleanos {view, edit}');
      }
      role.permissions = dto.permissions;
    }
    if (dto.active !== undefined) role.active = dto.active;
    return this.repo.save(role);
  }

  async remove(id: string) {
    const role = await this.repo.findOne({ where: { id } });
    if (!role) throw new NotFoundException('Rol no encontrado');
    await this.repo.remove(role);
  }
}
