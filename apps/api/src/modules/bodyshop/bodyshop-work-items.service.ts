import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { IsUUID, IsInt, IsOptional, IsString, IsNumber, Min, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { BodyshopEntry } from './bodyshop-entry.entity';
import { BodyshopWorkItem } from './bodyshop-work-item.entity';
import { BodyshopWorkItemProcess } from './bodyshop-work-item-process.entity';
import { BodyshopCatalogService } from './bodyshop-catalog.service';

const AUTHORIZED_ROLES = ['admin', 'supervisor', 'torre'];

export class WorkItemProcessDto {
  @IsUUID()                              processId: string;
  @IsNumber() @Min(0.25)                 suggestedHours: number;
  @IsOptional() @IsNumber() @Min(0.25)   adjustedHours?: number;
  @IsOptional() @IsString()              adjustmentReason?: string;
}

export class CreateWorkItemDto {
  @IsUUID()                                         pieceId: string;
  @IsUUID()                                         gradeId: string;
  @IsOptional() @IsInt() @Min(0)                    sequence?: number;
  @IsOptional() @IsString()                         notes?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkItemProcessDto)
  processes: WorkItemProcessDto[];
}

export class AdjustHoursDto {
  @IsNumber() @Min(0.25)         adjustedHours: number;
  @IsString()                    adjustmentReason: string;
}

@Injectable()
export class BodyshopWorkItemsService {
  constructor(
    @InjectRepository(BodyshopEntry)            private entryRepo: Repository<BodyshopEntry>,
    @InjectRepository(BodyshopWorkItem)          private itemRepo: Repository<BodyshopWorkItem>,
    @InjectRepository(BodyshopWorkItemProcess)   private wipRepo: Repository<BodyshopWorkItemProcess>,
    private catalogService: BodyshopCatalogService,
    private dataSource: DataSource,
  ) {}

  async addWorkItem(entryId: string, dto: CreateWorkItemDto): Promise<BodyshopWorkItem> {
    const entry = await this.entryRepo.findOne({ where: { id: entryId } });
    if (!entry) throw new NotFoundException('Ingreso no encontrado');

    const item = this.itemRepo.create({
      entryId,
      pieceId:  dto.pieceId,
      gradeId:  dto.gradeId,
      sequence: dto.sequence ?? 0,
      notes:    dto.notes ?? null,
    });
    const saved = await this.itemRepo.save(item);

    const wips = dto.processes.map(p =>
      this.wipRepo.create({
        workItemId:       saved.id,
        processId:        p.processId,
        suggestedHours:   p.suggestedHours,
        adjustedHours:    p.adjustedHours ?? null,
        adjustmentReason: p.adjustmentReason ?? null,
        status:           'pending',
      }),
    );
    await this.wipRepo.save(wips);

    await this.syncLegacyHours(entryId);
    return this.loadItem(saved.id);
  }

  async removeWorkItem(itemId: string, userId: string, role: string): Promise<void> {
    const item = await this.itemRepo.findOne({ where: { id: itemId }, relations: ['entry'] });
    if (!item) throw new NotFoundException('Trabajo no encontrado');
    if (role !== 'admin' && item.entry.createdBy !== userId) {
      throw new ForbiddenException('Solo podés eliminar trabajos de tus propios ingresos');
    }
    await this.itemRepo.remove(item);
    await this.syncLegacyHours(item.entryId);
  }

  async adjustHours(
    wipId: string,
    dto: AdjustHoursDto,
    user: { id: string; role: string; name?: string },
  ): Promise<BodyshopWorkItemProcess> {
    if (!AUTHORIZED_ROLES.includes(user.role)) {
      throw new ForbiddenException('No tenés permiso para ajustar horas manualmente');
    }
    const wip = await this.wipRepo.findOne({
      where: { id: wipId },
      relations: ['workItem'],
    });
    if (!wip) throw new NotFoundException('Proceso no encontrado');
    if (!dto.adjustmentReason?.trim()) {
      throw new BadRequestException('El motivo del ajuste es obligatorio');
    }

    wip.adjustedHours    = dto.adjustedHours;
    wip.adjustmentReason = dto.adjustmentReason.trim();
    wip.adjustedBy       = user.name ?? user.id;
    wip.adjustedAt       = new Date();
    await this.wipRepo.save(wip);

    await this.syncLegacyHours(wip.workItem.entryId);
    return wip;
  }

  async getWorkItems(entryId: string): Promise<BodyshopWorkItem[]> {
    return this.itemRepo.find({
      where: { entryId },
      relations: ['piece', 'grade', 'processes', 'processes.process'],
      order: { sequence: 'ASC' },
    });
  }

  // Recomputa bodyworkHours/prepHours/paintHours en el entry legacy a partir de los work items.
  // Mantiene compatibilidad con el calendario y capacity existentes.
  private async syncLegacyHours(entryId: string): Promise<void> {
    const items = await this.getWorkItems(entryId);
    let bodywork = 0, prep = 0, paint = 0;
    for (const item of items) {
      for (const wip of item.processes) {
        const fh = wip.adjustedHours ?? wip.suggestedHours;
        const code = wip.process?.code ?? '';
        if (code === 'BODYWORK') bodywork += Number(fh);
        else if (code === 'PREP') prep    += Number(fh);
        else if (code === 'PAINT') paint  += Number(fh);
      }
    }
    // Solo actualizar si hay work items — preservar los valores manuales si no hay items.
    if (items.length > 0) {
      await this.entryRepo.update(entryId, {
        bodyworkHours: bodywork,
        prepHours:     prep,
        paintHours:    paint,
      });
    }
  }

  private async loadItem(id: string): Promise<BodyshopWorkItem> {
    const item = await this.itemRepo.findOne({
      where: { id },
      relations: ['piece', 'grade', 'processes', 'processes.process'],
    });
    if (!item) throw new NotFoundException('Trabajo no encontrado');
    return item;
  }
}
