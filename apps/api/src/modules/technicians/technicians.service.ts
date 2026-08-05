import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, IsNumber, Min, Max, IsOptional, IsBoolean, IsEmail } from 'class-validator';
import { Technician } from './technician.entity';
import { UsersService } from '../users/users.service';

export class CreateTechnicianDto {
  @IsString() name: string;
  @IsOptional() @IsNumber() @Min(1) @Max(24) dailyHours?: number;
  @IsOptional() @IsString() specialty?: string | null;
  @IsOptional() @IsString() box?: string | null;
  @IsOptional() @IsString() workshopName?: string | null;
  @IsOptional() @IsString() dmsAdvisorCode?: string | null;
  @IsOptional() @IsEmail() email?: string | null;
  @IsOptional() @IsBoolean() isPerito?: boolean;
}

export class UpdateTechnicianDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() @Min(1) @Max(24) dailyHours?: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() specialty?: string | null;
  @IsOptional() @IsString() box?: string | null;
  @IsOptional() @IsString() workshopName?: string | null;
  @IsOptional() @IsString() dmsAdvisorCode?: string | null;
  @IsOptional() @IsEmail() email?: string | null;
  @IsOptional() @IsBoolean() isPerito?: boolean;
}

@Injectable()
export class TechniciansService {
  constructor(
    @InjectRepository(Technician) private repo: Repository<Technician>,
    private usersService: UsersService,
  ) {}

  findAll(workshopName?: string) {
    const where: any = { active: true };
    if (workshopName) where.workshopName = workshopName;
    return this.repo.find({ where, order: { name: 'ASC' } });
  }

  findAllIncludingInactive(workshopName?: string) {
    const where: any = {};
    if (workshopName) where.workshopName = workshopName;
    return this.repo.find({ where: Object.keys(where).length ? where : undefined, order: { name: 'ASC' } });
  }

  async findOne(id: string) {
    const t = await this.repo.findOne({ where: { id } });
    if (!t) throw new NotFoundException('Técnico no encontrado');
    return t;
  }

  async create(dto: CreateTechnicianDto) {
    const t = this.repo.create({ ...dto, dailyHours: dto.dailyHours ?? 8 });
    const saved = await this.repo.save(t);
    if (saved.isPerito) await this.syncPeritoAccount(saved);
    return saved;
  }

  async update(id: string, dto: UpdateTechnicianDto) {
    const t = await this.findOne(id);
    Object.assign(t, dto);
    const saved = await this.repo.save(t);

    // isPerito activado/desactivado, o el técnico entero se desactivó: la
    // cuenta de usuario vinculada sigue el mismo estado (nunca se crea una
    // segunda cuenta si userId ya existe — solo se reactiva/desactiva).
    if ('isPerito' in dto || 'active' in dto) await this.syncPeritoAccount(saved);

    return saved;
  }

  // Mantiene la cuenta de Usuario (rol 'perito') en sincronía con el técnico:
  // - isPerito=true y todavía sin cuenta → la crea (password temporal + email
  //   de bienvenida, mismo flujo que Configuración → Usuarios).
  // - isPerito=true con cuenta ya creada → la reactiva si estaba inactiva.
  // - isPerito=false, o el técnico se desactivó → desactiva la cuenta (no la
  //   borra, para no perder el historial de presupuestos ya asignados).
  private async syncPeritoAccount(t: Technician): Promise<void> {
    const shouldBeActive = t.isPerito && t.active;

    if (shouldBeActive && !t.userId) {
      if (!t.email) {
        throw new BadRequestException('El email es obligatorio para marcar un técnico como perito.');
      }
      const user = await this.usersService.create({ name: t.name, email: t.email, role: 'perito' });
      await this.repo.update(t.id, { userId: user.id });
      t.userId = user.id;
      return;
    }

    if (t.userId) {
      await this.usersService.update(t.userId, { active: shouldBeActive });
    }
  }
}
