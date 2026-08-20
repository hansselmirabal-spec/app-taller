import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { IsString, IsOptional, IsBoolean, IsIn, IsInt, Min, Max } from 'class-validator';
import { Workshop } from './workshop.entity';
import type { UserAccessContext } from '../users/users.service';

export class CreateWorkshopDto {
  @IsString() name: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsIn(['MECHANIC', 'BODYSHOP']) type?: 'MECHANIC' | 'BODYSHOP';
  @IsOptional() @IsString() dmsBranch?: string;
  @IsOptional() @IsInt() @Min(1) @Max(365) alertAtrasoDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(365) alertCriticoDays?: number;
  @IsOptional() config?: object;
}

export class UpdateWorkshopDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsIn(['MECHANIC', 'BODYSHOP']) type?: 'MECHANIC' | 'BODYSHOP';
  @IsOptional() @IsString() dmsBranch?: string;
  @IsOptional() @IsInt() @Min(1) @Max(365) alertAtrasoDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(365) alertCriticoDays?: number;
  @IsOptional() config?: object;
}

// Mismo criterio de "sin restricción" que WorkshopAccessGuard: admin/admin_taller,
// o allowedWorkshopIds null/undefined/vacío.
function isUnrestricted(user: UserAccessContext): boolean {
  if (user.role === 'admin' || user.role === 'admin_taller') return true;
  const ids = user.allowedWorkshopIds;
  return !Array.isArray(ids) || ids.length === 0;
}

@Injectable()
export class WorkshopsService {
  constructor(@InjectRepository(Workshop) private repo: Repository<Workshop>) {}

  // `user` es opcional por el mismo motivo que en findOne(): consumidores internos
  // (p.ej. appointments.service resolviendo config por nombre de taller) no operan
  // sobre una request de un usuario específico y deben seguir viendo todos los talleres.
  findAll(user?: UserAccessContext) {
    if (!user || isUnrestricted(user)) {
      return this.repo.find({ where: { active: true }, order: { name: 'ASC' } });
    }
    return this.repo.find({
      where: { active: true, id: In(user.allowedWorkshopIds as string[]) },
      order: { name: 'ASC' },
    });
  }

  // `user` es opcional a propósito: los consumidores internos (capacity, bodyshop,
  // appointments, technicians) ya resuelven un workshopId validado por su propio guard
  // de ruta y solo necesitan la entidad, sin re-chequear acceso. Solo el controller de
  // `GET /workshops/:id` pasa `user` para aplicar el scoping por usuario.
  async findOne(id: string, user?: UserAccessContext) {
    if (user && !isUnrestricted(user) && !(user.allowedWorkshopIds as string[]).includes(id)) {
      throw new ForbiddenException('No tenés acceso a este taller');
    }
    const w = await this.repo.findOne({ where: { id } });
    if (!w) throw new NotFoundException('Taller no encontrado');
    return w;
  }

  create(dto: CreateWorkshopDto) {
    return this.repo.save(this.repo.create({ ...dto, type: dto.type ?? 'MECHANIC' }));
  }

  async update(id: string, dto: UpdateWorkshopDto) {
    const w = await this.findOne(id);
    Object.assign(w, dto);
    return this.repo.save(w);
  }

  async remove(id: string) {
    const w = await this.findOne(id);
    w.active = false;
    return this.repo.save(w);
  }
}
