import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, IsNumber, Min, Max, IsOptional, IsBoolean } from 'class-validator';
import { Technician } from './technician.entity';

export class CreateTechnicianDto {
  @IsString() name: string;
  @IsOptional() @IsNumber() @Min(1) @Max(24) dailyHours?: number;
}

export class UpdateTechnicianDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() @Min(1) @Max(24) dailyHours?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

@Injectable()
export class TechniciansService {
  constructor(@InjectRepository(Technician) private repo: Repository<Technician>) {}

  findAll() {
    return this.repo.find({ where: { active: true }, order: { name: 'ASC' } });
  }

  findAllIncludingInactive() {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string) {
    const t = await this.repo.findOne({ where: { id } });
    if (!t) throw new NotFoundException('Technician not found');
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
