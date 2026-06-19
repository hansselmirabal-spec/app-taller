import { Controller, Get, Patch, Post, Delete, Query, Param, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { TrackingService } from './tracking.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkshopAccessGuard } from '../../common/guards/workshop-access.guard';
import { IsOptional, IsString } from 'class-validator';

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

  @Get('card/:sourceType/:sourceId')
  async getCard(
    @Param('sourceType') sourceType: 'mechanic' | 'bodyshop',
    @Param('sourceId') sourceId: string,
  ) {
    return wrap(await this.service.getCardProcesses(sourceType, sourceId));
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
  async unblockProcess(@Param('logId') logId: string) {
    return wrap(await this.service.unblockProcess(logId));
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
