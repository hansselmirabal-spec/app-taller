import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, IsEnum, Matches } from 'class-validator';
import { IsOptional } from 'class-validator';
import { OperationalBlock, OperationalBlockType } from './operational-block.entity';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export class CreateOperationalBlockDto {
  @IsString() workshopId: string;
  @IsString() @Matches(DATE_RE) date: string;
  @IsString() @Matches(TIME_RE) timeStart: string;
  @IsString() @Matches(TIME_RE) timeEnd: string;
  @IsEnum(['meeting', 'cleaning', 'break', 'maintenance', 'other']) type: OperationalBlockType;
  @IsString() reason: string;
}

export class UpdateOperationalBlockDto {
  @IsOptional() @IsString() @Matches(TIME_RE) timeStart?: string;
  @IsOptional() @IsString() @Matches(TIME_RE) timeEnd?: string;
  @IsOptional() @IsEnum(['meeting', 'cleaning', 'break', 'maintenance', 'other']) type?: OperationalBlockType;
  @IsOptional() @IsString() reason?: string;
}

@Injectable()
export class OperationalBlocksService {
  constructor(
    @InjectRepository(OperationalBlock)
    private readonly repo: Repository<OperationalBlock>,
  ) {}

  async create(dto: CreateOperationalBlockDto, userId: string): Promise<OperationalBlock> {
    return this.repo.save(this.repo.create({ ...dto, createdBy: userId }));
  }

  async findByDate(workshopId: string, date: string): Promise<OperationalBlock[]> {
    return this.repo.find({
      where: { workshopId, date },
      order: { timeStart: 'ASC' },
    });
  }

  async update(id: string, dto: UpdateOperationalBlockDto): Promise<OperationalBlock> {
    const block = await this.repo.findOne({ where: { id } });
    if (!block) throw new NotFoundException('Bloque no encontrado');
    Object.assign(block, dto);
    return this.repo.save(block);
  }

  async remove(id: string): Promise<void> {
    const block = await this.repo.findOne({ where: { id } });
    if (!block) throw new NotFoundException('Bloque no encontrado');
    await this.repo.remove(block);
  }
}
