import {
  Controller, Get, Post, Patch, Query, Param, Body,
  UseGuards, HttpCode, BadRequestException,
} from '@nestjs/common';
import {
  BodyshopService, CreateBodyshopEntryDto, UpdateStatusDto,
  AssignTechnicianDto, AssignProcessTechDto, AdjustProcessSlotDto,
} from './bodyshop.service';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { WorkshopAccessGuard } from '../../common/guards/workshop-access.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const wrap = (data: any) => ({ data, meta: { timestamp: new Date().toISOString() } });

@Controller('bodyshop')
@UseGuards(JwtAuthGuard)
export class BodyshopController {
  constructor(private service: BodyshopService) {}

  // ── Entries ───────────────────────────────────────────────────────────────────

  @Post('entries')
  @UseGuards(WorkshopAccessGuard)
  async create(@Body() dto: CreateBodyshopEntryDto, @CurrentUser() user: any) {
    return wrap(await this.service.create(dto, user.id));
  }

  @Get('entries')
  @UseGuards(WorkshopAccessGuard)
  async findByRange(
    @Query('workshopId') workshopId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    if (!workshopId || !from || !to) throw new BadRequestException('Se requieren workshopId, from y to');
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) throw new BadRequestException('Formato de fecha inválido');
    return wrap(await this.service.getEntriesByRange(workshopId, from, to));
  }

  @Patch('entries/:id/hours')
  async updateHours(
    @Param('id') id: string,
    @Body() dto: { bodyworkHours?: number; prepHours?: number; paintHours?: number; stayDays?: number },
  ) {
    return wrap(await this.service.updateHours(id, dto));
  }

  @Patch('entries/:id/cancel')
  @HttpCode(200)
  async cancel(@Param('id') id: string, @CurrentUser() user: any) {
    await this.service.cancel(id, user);
    return wrap({ cancelled: true });
  }

  @Patch('entries/:id/status')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return wrap(await this.service.updateStatus(id, dto.status));
  }

  @Patch('entries/:id/technician')
  async assignTechnician(@Param('id') id: string, @Body() dto: AssignTechnicianDto) {
    return wrap(await this.service.assignTechnician(id, dto.technicianId ?? null));
  }

  @Patch('entries/:id/process-technician')
  async assignProcessTechnician(@Param('id') id: string, @Body() dto: AssignProcessTechDto) {
    return wrap(await this.service.assignProcessTechnician(id, dto.process, dto.technicianId ?? null));
  }

  @Post('entries/:id/release-tech')
  @HttpCode(200)
  async releaseTech(@Param('id') id: string) {
    return wrap(await this.service.releaseTech(id));
  }

  // ── Agenda de slots por vehículo ──────────────────────────────────────────────

  @Get('entries/:id/schedule')
  async getEntrySchedule(@Param('id') id: string) {
    return wrap(await this.service.getEntrySchedule(id));
  }

  @Patch('entries/:id/slots/:slotId/adjust')
  async adjustProcessSlot(
    @Param('id') id: string,
    @Param('slotId') slotId: string,
    @Body() dto: AdjustProcessSlotDto,
    @CurrentUser() user: any,
  ) {
    return wrap(await this.service.adjustProcessSlot(id, slotId, dto, user.id));
  }

  @Post('entries/:id/recalculate-schedule')
  @HttpCode(200)
  async recalculateSchedule(@Param('id') id: string) {
    await this.service.recalculateSchedule(id);
    return wrap({ recalculated: true });
  }

  // ── Disponibilidad de técnicos por proceso ────────────────────────────────────

  @Get('tech-availability')
  async getTechAvailability(
    @Query('workshopId') workshopId: string,
    @Query('date') date: string,
  ) {
    if (!workshopId || !date) throw new BadRequestException('Se requieren workshopId y date');
    if (!DATE_RE.test(date)) throw new BadRequestException('Formato de fecha inválido');
    return wrap(await this.service.getTechnicianAvailability(workshopId, date));
  }

  // ── DMS catalog endpoints ─────────────────────────────────────────────────────

  @Get('dms/sucursales')
  async getDmsSucursales() {
    return wrap(await this.service.getDmsSucursales());
  }

  @Get('dms/asesores')
  async getDmsAsesores(@Query('sucursalId') sucursalId?: string) {
    return wrap(await this.service.getDmsAsesores(sucursalId || null));
  }

  // ── Schedule (Gantt por proceso) ─────────────────────────────────────────────

  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Get('schedule')
  @UseGuards(WorkshopAccessGuard)
  async getSchedule(
    @Query('workshopId') workshopId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    if (!workshopId || !from || !to) throw new BadRequestException('Se requieren workshopId, from y to');
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) throw new BadRequestException('Formato de fecha inválido');
    return wrap(await this.service.getSchedule(workshopId, from, to));
  }

  // ── Reports ───────────────────────────────────────────────────────────────────

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Get('reports/monthly')
  @UseGuards(WorkshopAccessGuard)
  async monthlyReport(
    @Query('workshopId') workshopId: string,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    if (!workshopId || !year || !month) throw new BadRequestException('Se requieren workshopId, year y month');
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    if (isNaN(y) || isNaN(m) || m < 1 || m > 12 || y < 2000 || y > 2100) {
      throw new BadRequestException('year debe ser un número válido y month debe estar entre 1 y 12');
    }
    return wrap(await this.service.getMonthlyReport(workshopId, y, m));
  }
}
