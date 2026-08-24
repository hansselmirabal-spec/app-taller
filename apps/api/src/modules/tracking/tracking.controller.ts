import { Controller, Get, Patch, Post, Delete, Query, Param, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { TrackingService } from './tracking.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkshopAccessGuard } from '../../common/guards/workshop-access.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { IsOptional, IsString, IsNotEmpty, IsUUID, IsNumber, MaxLength, Min } from 'class-validator';

export class AddProcessDto {
  @IsString() processCode: string;
  @IsNumber() @Min(0.1) hours: number;
}

class CompleteProcessDto {
  @IsOptional() @IsString() notes?: string;
}

class StartProcessDto {
  @IsOptional() @IsString() technicianId?: string;
  @IsOptional() @IsString() technicianName?: string;
}

class BlockProcessDto {
  @IsString() reason: string;
}

// Mirror de StartProcessDto: la reanudación (Func.2, PR2) SIEMPRE requiere
// confirmación explícita de técnico desde el frontend, pero ambos campos
// quedan opcionales acá para compat hacia atrás (caso tech-less / callers
// legacy que no mandan body).
export class UnblockProcessDto {
  @IsOptional() @IsString() technicianId?: string;
  @IsOptional() @IsString() technicianName?: string;
}

// D1 (design): el motivo se guarda en blocked_reason (varchar(120)) — de
// ahí el @MaxLength(120). technicianId es obligatorio (a diferencia de
// UnblockProcessDto): "reanudar" tiene un snapshot al que caer si no viene
// técnico, pero "devolver" siempre arranca una pasada nueva sin snapshot
// previo posible.
export class ReturnProcessDto {
  @IsString() @IsNotEmpty() @MaxLength(120) reason: string;
  @IsUUID() technicianId: string;
  @IsOptional() @IsString() technicianName?: string;
}

class SetExitDateDto {
  @IsOptional() @IsString() date?: string | null;
}

class SetResourceDto {
  @IsString() note: string;
}

const wrap = (data: any) => ({ data, meta: { timestamp: new Date().toISOString() } });

@UseGuards(JwtAuthGuard)
@Controller('tracking')
export class TrackingController {
  constructor(private readonly service: TrackingService) {}

  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Get('board')
  @UseGuards(WorkshopAccessGuard)
  async getBoard(
    @Query('date') date?: string,
    @Query('workshopId') workshopId?: string,
  ) {
    if (!date || !workshopId) throw new BadRequestException('date y workshopId son requeridos');
    return wrap(await this.service.getBoard(date, workshopId));
  }

  @Get('productivity')
  @UseGuards(PermissionsGuard)
  @RequirePermission('reports', 'view')
  async getProductivity(
    @Query('workshopId') workshopId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('sourceType') sourceType?: 'mechanic' | 'bodyshop',
  ) {
    if (!workshopId || !from || !to) {
      throw new BadRequestException('workshopId, from y to son requeridos');
    }
    return wrap(await this.service.getTechProductivityReport(workshopId, from, to, sourceType));
  }

  @Get('card/:sourceType/:sourceId')
  async getCard(
    @Param('sourceType') sourceType: 'mechanic' | 'bodyshop',
    @Param('sourceId') sourceId: string,
  ) {
    return wrap(await this.service.getCardProcesses(sourceType, sourceId));
  }

  @Post('process/bodyshop/:entryId/add')
  async addProcess(
    @Param('entryId') entryId: string,
    @Body() dto: AddProcessDto,
  ) {
    return wrap(await this.service.addProcessToBodyshop(entryId, dto.processCode, dto.hours));
  }

  @Patch('process/:logId/start')
  async startProcess(
    @Param('logId') logId: string,
    @Body() dto: StartProcessDto,
  ) {
    return wrap(await this.service.startProcess(logId, dto.technicianId, dto.technicianName));
  }

  @Patch('process/:logId/complete')
  async completeProcess(
    @Param('logId') logId: string,
    @Body() dto: CompleteProcessDto,
  ) {
    return wrap(await this.service.completeProcess(logId, dto.notes));
  }

  @Patch('process/:logId/block')
  async blockProcess(
    @Param('logId') logId: string,
    @Body() dto: BlockProcessDto,
  ) {
    return wrap(await this.service.blockProcess(logId, dto.reason));
  }

  @Patch('process/:logId/unblock')
  async unblockProcess(
    @Param('logId') logId: string,
    @Body() dto: UnblockProcessDto,
  ) {
    return wrap(await this.service.unblockProcess(logId, dto.technicianId, dto.technicianName));
  }

  @Get('process/:logId/resume-options')
  async getResumeOptions(@Param('logId') logId: string) {
    return wrap(await this.service.getResumeOptions(logId));
  }

  // D7: RolesGuard a nivel de MÉTODO (no de clase, como sí hace
  // users.controller.ts:8) — sigue el patrón ya usado en este mismo
  // controller (WorkshopAccessGuard en getBoard, PermissionsGuard en
  // getProductivity): cada ruta compone sus propios guards, ninguna ruta
  // existente cambia de comportamiento.
  @Patch('process/:logId/return')
  @UseGuards(RolesGuard)
  @Roles('admin', 'admin_taller')
  async returnProcess(
    @Param('logId') logId: string,
    @Body() dto: ReturnProcessDto,
  ) {
    return wrap(await this.service.returnToProcess(logId, dto.reason, dto.technicianId, dto.technicianName));
  }

  @Patch('exit-date/:sourceType/:sourceId')
  async setExitDate(
    @Param('sourceType') sourceType: 'mechanic' | 'bodyshop',
    @Param('sourceId') sourceId: string,
    @Body() dto: SetExitDateDto,
  ) {
    await this.service.setExitDate(sourceType, sourceId, dto.date ?? null);
    return wrap({ ok: true });
  }

  @Post('init/:sourceType/:sourceId')
  async reinitialize(
    @Param('sourceType') sourceType: 'mechanic' | 'bodyshop',
    @Param('sourceId') sourceId: string,
  ) {
    if (sourceType === 'mechanic') {
      await this.service.initForMechanic(sourceId, 'Trabajo mecánico', 0);
    }
    return { ok: true };
  }

  @Patch('resource/:entryId')
  async setResource(
    @Param('entryId') entryId: string,
    @Body() dto: SetResourceDto,
  ) {
    await this.service.setResource(entryId, dto.note);
    return wrap({ ok: true });
  }

  @Delete('resource/:entryId')
  async clearResource(@Param('entryId') entryId: string) {
    await this.service.clearResource(entryId);
    return wrap({ ok: true });
  }

  @Get('resources')
  async getResourceAgenda(@Query('workshopId') workshopId?: string) {
    if (!workshopId) throw new BadRequestException('workshopId es requerido');
    return wrap(await this.service.getResourceAgenda(workshopId));
  }
}
