import { Controller, Get, Post, Delete, Query, Param, Body, UseGuards } from '@nestjs/common';
import { IsString, IsEnum, IsOptional, IsBoolean, Matches } from 'class-validator';
import { CapacityService } from './capacity.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

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
  constructor(private service: CapacityService) {}

  @Get()
  async getCapacity(@Query('date') date?: string, @Query('from') from?: string, @Query('to') to?: string) {
    if (date) return wrap(await this.service.getDailyCapacity(date));
    if (from && to) return wrap(await this.service.getWeekCapacity(from, to));
    return wrap([]);
  }

  @Post('absences')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async createAbsence(@Body() dto: CreateAbsenceDto) {
    return wrap(await this.service.createAbsence(dto.technicianId, dto.date, dto.type));
  }

  @Delete('absences/:id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async deleteAbsence(@Param('id') id: string) {
    await this.service.deleteAbsence(id);
    return wrap({ deleted: true });
  }

  @Post('working-days')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async upsertWorkingDay(@Body() dto: UpsertWorkingDayDto) {
    return wrap(await this.service.upsertWorkingDay(dto.date, dto.isWorkingDay, dto.note));
  }

  @Delete('working-days/:date')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async deleteWorkingDay(@Param('date') date: string) {
    await this.service.deleteWorkingDay(date);
    return wrap({ deleted: true });
  }
}
