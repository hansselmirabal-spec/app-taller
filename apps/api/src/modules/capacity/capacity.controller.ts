import { Controller, Get, Post, Delete, Query, Param, Body, UseGuards, BadRequestException, Logger } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, IsEnum, IsOptional, IsBoolean, Matches } from 'class-validator';
import { CapacityService } from './capacity.service';
import { WorkshopsService } from '../workshops/workshops.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { WorkshopAccessGuard } from '../../common/guards/workshop-access.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

class SlotsQueryDto {
  @IsString() workshopId: string;
  @IsString() date: string;
  @IsString() workshopType: 'MECHANIC' | 'BODYSHOP';
  @IsOptional() @IsString() durationMinutes?: string;
  @IsOptional() @IsString() serviceSpecialty?: string;
  @IsOptional() @IsString() bodyworkHours?: string;
  @IsOptional() @IsString() prepHours?: string;
  @IsOptional() @IsString() paintHours?: string;
  @IsOptional() @IsString() findNext?: string;
}

class CreateAbsenceDto {
  @IsString() technicianId: string;
  @IsString() @Matches(DATE_REGEX) date: string;
  @IsEnum(['full', 'half', 'holiday']) type: 'full' | 'half' | 'holiday';
}

class UpsertWorkingDayDto {
  @IsString() @Matches(DATE_REGEX) date: string;
  @IsBoolean() isWorkingDay: boolean;
  @IsOptional() @IsString() note?: string;
}

const wrap = (data: any) => ({ data, meta: { timestamp: new Date().toISOString() } });

@Controller('capacity')
@UseGuards(JwtAuthGuard)
export class CapacityController {
  private readonly logger = new Logger(CapacityController.name);

  constructor(
    private service: CapacityService,
    private workshopsService: WorkshopsService,
  ) {}

  private async resolveWorkshopName(workshopId?: string): Promise<string | undefined> {
    if (!workshopId) return undefined;
    const ws = await this.workshopsService.findOne(workshopId);
    return ws.name;
  }

  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Get('slots')
  @UseGuards(WorkshopAccessGuard)
  async getSlots(@Query() q: SlotsQueryDto) {
    this.logger.debug(`[slots] query: ${JSON.stringify(q)}`);
    if (!q.workshopId || !q.date || !q.workshopType) {
      throw new BadRequestException('Se requieren workshopId, date y workshopType');
    }
    if (!DATE_REGEX.test(q.date)) throw new BadRequestException('Formato de fecha inválido');
    if (!['MECHANIC', 'BODYSHOP'].includes(q.workshopType)) {
      throw new BadRequestException('workshopType debe ser MECHANIC o BODYSHOP');
    }
    try {
      const result = await this.service.findAvailableSlots({
        workshopId:      q.workshopId,
        date:            q.date,
        workshopType:    q.workshopType,
        durationMinutes: q.durationMinutes ? parseInt(q.durationMinutes, 10) : undefined,
        serviceSpecialty: q.serviceSpecialty || undefined,
        bodyworkHours:   q.bodyworkHours ? parseFloat(q.bodyworkHours) : undefined,
        prepHours:       q.prepHours     ? parseFloat(q.prepHours)     : undefined,
        paintHours:      q.paintHours    ? parseFloat(q.paintHours)    : undefined,
        findNext:        q.findNext === 'true',
      });
      this.logger.debug(`[slots] result: available=${result.available} alternatives=${(result as any).alternatives?.length ?? 0}`);
      return result;
    } catch (e) {
      this.logger.error(`[slots] ERROR: ${e?.message}`, e?.stack);
      throw e;
    }
  }

  @Get()
  @UseGuards(WorkshopAccessGuard)
  async getCapacity(
    @Query('date') date?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('workshopId') workshopId?: string,
  ) {
    const workshopName = await this.resolveWorkshopName(workshopId);

    if (date) {
      if (!DATE_REGEX.test(date)) throw new BadRequestException('Formato de fecha inválido');
      return wrap(await this.service.getDailyCapacity(date, undefined, workshopName));
    }
    if (from && to) {
      if (!DATE_REGEX.test(from) || !DATE_REGEX.test(to)) throw new BadRequestException('Formato de fecha inválido');
      const diffDays = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
      if (diffDays > 31) throw new BadRequestException('El rango de fechas no puede superar 31 días');
      return wrap(await this.service.getWeekCapacity(from, to, undefined, workshopName));
    }
    return wrap([]);
  }

  @Get('absences')
  async getAbsences(
    @Query('technicianId') technicianId?: string,
    @Query('date') date?: string,
  ) {
    return wrap(await this.service.findAbsences(technicianId, date));
  }

  @Post('absences')
  @UseGuards(PermissionsGuard)
  @RequirePermission('capacity', 'edit')
  async createAbsence(@Body() dto: CreateAbsenceDto) {
    return wrap(await this.service.createAbsence(dto.technicianId, dto.date, dto.type));
  }

  @Delete('absences/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('capacity', 'edit')
  async deleteAbsence(@Param('id') id: string) {
    await this.service.deleteAbsence(id);
    return wrap({ deleted: true });
  }

  @Post('working-days')
  @UseGuards(PermissionsGuard)
  @RequirePermission('capacity', 'edit')
  async upsertWorkingDay(@Body() dto: UpsertWorkingDayDto) {
    return wrap(await this.service.upsertWorkingDay(dto.date, dto.isWorkingDay, dto.note));
  }

  @Delete('working-days/:date')
  @UseGuards(PermissionsGuard)
  @RequirePermission('capacity', 'edit')
  async deleteWorkingDay(@Param('date') date: string) {
    await this.service.deleteWorkingDay(date);
    return wrap({ deleted: true });
  }
}
