import { Controller, Get, Post, Patch, Delete, Param, Query, Body, UseGuards } from '@nestjs/common';
import { AppointmentsService, CreateAppointmentDto, UpdateAppointmentDto, UpdateStatusDto } from './appointments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const wrap = (data: any) => ({ data, meta: { timestamp: new Date().toISOString() } });

@Controller('appointments')
@UseGuards(JwtAuthGuard)
export class AppointmentsController {
  constructor(private service: AppointmentsService) {}

  @Get()
  async find(@Query('date') date?: string, @Query('from') from?: string, @Query('to') to?: string) {
    if (date) return wrap(await this.service.findByDate(date));
    if (from && to) return wrap(await this.service.findByRange(from, to));
    return wrap([]);
  }

  @Post()
  async create(@Body() dto: CreateAppointmentDto, @CurrentUser() user: any) {
    return wrap(await this.service.create(dto, user.id));
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateAppointmentDto) {
    return wrap(await this.service.update(id, dto));
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return wrap(await this.service.updateStatus(id, dto.status));
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return wrap(await this.service.delete(id));
  }
}
