import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString } from 'class-validator';
import { Specialty } from './specialty.entity';

export class CreateSpecialtyDto {
  @IsString() name: string;
  @IsString() workshopId: string;
}

export class UpdateSpecialtyDto {
  @IsString() name: string;
}

@Injectable()
export class SpecialtiesService {
  constructor(@InjectRepository(Specialty) private repo: Repository<Specialty>) {}

  findAll(workshopId?: string) {
    const where: any = {};
    if (workshopId) where.workshopId = workshopId;
    return this.repo.find({ where, order: { name: 'ASC' } });
  }

  async create(dto: CreateSpecialtyDto) {
    const exists = await this.repo.findOne({ where: { name: dto.name, workshopId: dto.workshopId } });
    if (exists) throw new ConflictException('Ya existe esa especialidad en este taller');
    return this.repo.save(this.repo.create(dto));
  }

  async update(id: string, dto: UpdateSpecialtyDto) {
    const sp = await this.repo.findOne({ where: { id } });
    if (!sp) throw new NotFoundException('Especialidad no encontrada');
    Object.assign(sp, dto);
    return this.repo.save(sp);
  }

  async delete(id: string) {
    const sp = await this.repo.findOne({ where: { id } });
    if (!sp) throw new NotFoundException('Especialidad no encontrada');
    await this.repo.remove(sp);
  }
}
