import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, IsOptional, IsBoolean, IsIn, IsInt, Min, Max } from 'class-validator';
import { Workshop } from './workshop.entity';

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

@Injectable()
export class WorkshopsService {
  constructor(@InjectRepository(Workshop) private repo: Repository<Workshop>) {}

  findAll() {
    return this.repo.find({ where: { active: true }, order: { name: 'ASC' } });
  }

  async findOne(id: string) {
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
