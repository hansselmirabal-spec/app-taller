import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, IsEnum, IsNumber, IsOptional } from 'class-validator';
import { WorkType } from './work-type.entity';

// Mensajes consistentes con la UX. Aplica también si llegan strings vacíos (NaN tras parseFloat)
// → en ese caso conviene validar primero en frontend; estos mensajes son defensa de borde.
const NUM_MSG = (campo: string) =>
  `Completá el campo "${campo}" con un valor numérico (no puede quedar vacío).`;

export class CreateWorkTypeDto {
  @IsString({ message: 'Falta indicar a qué taller pertenece este tipo de trabajo.' }) workshopId: string;
  @IsString({ message: 'El nombre del tipo de trabajo es obligatorio.' }) name: string;
  @IsEnum(['LIGHT', 'MEDIUM', 'HEAVY', 'MULTIPLE'], { message: 'La severidad debe ser Leve, Medio, Grave o Múltiple.' }) severity: string;
  @IsNumber({}, { message: NUM_MSG('estadía (días)') })       estimatedDays: number;
  @IsNumber({}, { message: NUM_MSG('horas de chapería') })    bodyworkHours: number;
  @IsNumber({}, { message: NUM_MSG('horas de preparación') }) prepHours: number;
  @IsNumber({}, { message: NUM_MSG('horas de pintura') })     paintHours: number;
  @IsString({ message: 'Elegí un color de identificación para el tipo de trabajo.' }) color: string;
}

export class UpdateWorkTypeDto {
  @IsOptional() @IsString({ message: 'El nombre del tipo de trabajo no puede quedar vacío.' }) name?: string;
  @IsOptional() @IsEnum(['LIGHT', 'MEDIUM', 'HEAVY', 'MULTIPLE'], { message: 'La severidad debe ser Leve, Medio, Grave o Múltiple.' }) severity?: string;
  @IsOptional() @IsNumber({}, { message: NUM_MSG('estadía (días)') })       estimatedDays?: number;
  @IsOptional() @IsNumber({}, { message: NUM_MSG('horas de chapería') })    bodyworkHours?: number;
  @IsOptional() @IsNumber({}, { message: NUM_MSG('horas de preparación') }) prepHours?: number;
  @IsOptional() @IsNumber({}, { message: NUM_MSG('horas de pintura') })     paintHours?: number;
  @IsOptional() @IsString({ message: 'El color de identificación no puede quedar vacío.' }) color?: string;
}

@Injectable()
export class WorkTypesService {
  constructor(@InjectRepository(WorkType) private repo: Repository<WorkType>) {}

  // TypeORM devuelve columnas decimal/numeric como string. Forzamos Number antes de
  // mandarlas al frontend; sin esto, el operador "+" concatena strings (ej: "8" + "4" = "84").
  private serialize(wt: WorkType): WorkType {
    return {
      ...wt,
      estimatedDays: Number(wt.estimatedDays),
      bodyworkHours: Number(wt.bodyworkHours),
      prepHours:     Number(wt.prepHours),
      paintHours:    Number(wt.paintHours),
    };
  }

  async findAll(workshopId?: string) {
    const where: any = { active: true };
    if (workshopId) where.workshopId = workshopId;
    const list = await this.repo.find({ where, order: { name: 'ASC' } });
    return list.map(wt => this.serialize(wt));
  }

  async findOne(id: string) {
    const wt = await this.repo.findOne({ where: { id } });
    if (!wt) throw new NotFoundException('Tipo de trabajo no encontrado');
    return this.serialize(wt);
  }

  async create(dto: CreateWorkTypeDto) {
    const exists = await this.repo.findOne({ where: { name: dto.name, workshopId: dto.workshopId } });
    if (exists) throw new ConflictException('Ya existe ese tipo de trabajo en este taller');
    const saved = await this.repo.save(this.repo.create({
      ...dto,
      estimatedDays: dto.estimatedDays,
      bodyworkHours: dto.bodyworkHours,
      prepHours: dto.prepHours,
      paintHours: dto.paintHours,
    }));
    return this.serialize(saved);
  }

  async update(id: string, dto: UpdateWorkTypeDto) {
    const wt = await this.repo.findOne({ where: { id } });
    if (!wt) throw new NotFoundException('Tipo de trabajo no encontrado');
    Object.assign(wt, dto);
    const saved = await this.repo.save(wt);
    return this.serialize(saved);
  }

  async delete(id: string) {
    const wt = await this.repo.findOne({ where: { id } });
    if (!wt) throw new NotFoundException('Tipo de trabajo no encontrado');
    wt.active = false;
    await this.repo.save(wt);
  }
}
