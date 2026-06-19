import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, IsNumber, Min, Max, IsOptional, IsBoolean } from 'class-validator';
import { Technician } from './technician.entity';

export class CreateTechnicianDto {
  @IsString() name: string;
  @IsOptional() @IsNumber() @Min(1) @Max(24) dailyHours?: number;
  @IsOptional() @IsString() specialty?: string | null;
  @IsOptional() @IsString() box?: string | null;
  @IsOptional() @IsString() workshopName?: string | null;
  @IsOptional() @IsString() dmsAdvisorCode?: string | null;
}

export class UpdateTechnicianDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() @Min(1) @Max(24) dailyHours?: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() specialty?: string | null;
  @IsOptional() @IsString() box?: string | null;
  @IsOptional() @IsString() workshopName?: string | null;
  @IsOptional() @IsString() dmsAdvisorCode?: string | null;
}

@Injectable()
export class TechniciansService {
  constructor(@InjectRepository(Technician) private repo: Repository<Technician>) {}

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

  create(dto: CreateTechnicianDto) {
    return this.repo.save(this.repo.create({ ...dto, dailyHours: dto.dailyHours ?? 8 }));
  }

  async update(id: string, dto: UpdateTechnicianDto) {
    const t = await this.findOne(id);
    Object.assign(t, dto);
    return this.repo.save(t);
  }
}
