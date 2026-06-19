import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, IsNumber, Min, IsOptional, Matches } from 'class-validator';
import { ServiceType } from './service-type.entity';

export class CreateServiceTypeDto {
  @IsString() name: string;
  @IsNumber() @Min(0.5) durationHours: number;
  @IsOptional() @IsString() @Matches(/^#[0-9A-Fa-f]{6}$/) color?: string;
  @IsOptional() @IsString() workshopId?: string | null;
}

export class UpdateServiceTypeDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() @Min(0.5) durationHours?: number;
  @IsOptional() @IsString() @Matches(/^#[0-9A-Fa-f]{6}$/) color?: string;
  @IsOptional() active?: boolean;
  @IsOptional() @IsString() workshopId?: string | null;
}

@Injectable()
export class ServiceTypesService {
  constructor(@InjectRepository(ServiceType) private repo: Repository<ServiceType>) {}

  findAll(workshopId?: string) {
    const where: any = { active: true };
    if (workshopId) where.workshopId = workshopId;
    return this.repo.find({ where, order: { name: 'ASC' } });
  }

  async findOne(id: string) {
    const st = await this.repo.findOne({ where: { id } });
    if (!st) throw new NotFoundException('Tipo de servicio no encontrado');
    return st;
  }

  create(dto: CreateServiceTypeDto) {
    return this.repo.save(this.repo.create(dto));
  }

  async update(id: string, dto: UpdateServiceTypeDto) {
    const st = await this.findOne(id);
    Object.assign(st, dto);
    return this.repo.save(st);
  }
}
