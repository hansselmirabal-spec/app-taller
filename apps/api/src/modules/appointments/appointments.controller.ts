import { Controller, Get, Post, Patch, Delete, Query, Param, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { AppointmentsService, CreateAppointmentDto, UpdateAppointmentDto, UpdateStatusDto, RescheduleAppointmentDto } from './appointments.service';
import { WorkshopsService } from '../workshops/workshops.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const wrap = (data: any) => ({ data, meta: { timestamp: new Date().toISOString() } });
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

@Controller('appointments')
@UseGuards(JwtAuthGuard)
export class AppointmentsController {
  constructor(
    private service: AppointmentsService,
    private workshopsService: WorkshopsService,
  ) {}

  private async resolveWorkshopName(workshopId?: string): Promise<string | undefined> {
    if (!workshopId) return undefined;
    const ws = await this.workshopsService.findOne(workshopId);
    return ws.name;
  }

  @Get()
  async find(
    @Query('date') date?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('workshopId') workshopId?: string,
    @Query('includeAll') includeAll?: string,
  ) {
    const workshopName = await this.resolveWorkshopName(workshopId);

    if (date) {
      if (!DATE_RE.test(date)) throw new BadRequestException('Formato de fecha inválido');
      return wrap(await this.service.findByDate(date, workshopName));
    }
    if (from && to) {
      if (!DATE_RE.test(from) || !DATE_RE.test(to)) throw new BadRequestException('Formato de fecha inválido');
      return wrap(await this.service.findByRange(from, to, workshopName, includeAll === 'true'));
    }
    return wrap([]);
  }

  // Buscador global de turnos/ingresos agendados por chapa, cliente o id corto.
  // Atraviesa appointments (mecánica) + bodyshop_entries (chapería). Devuelve
  // hasta 30 resultados ordenados por fecha desc.
  @Get('search')
  async search(
    @Query('q') q?: string,
    @Query('workshopId') workshopId?: string,
  ) {
    const query = (q ?? '').trim();
    if (query.length < 2) return wrap({ results: [], total: 0 });
    return wrap(await this.service.search(query, workshopId));
  }

  @Post()
  async create(@Body() dto: CreateAppointmentDto, @CurrentUser() user: any) {
    return wrap(await this.service.create(dto, user.id));
  }

  @Patch(':id/reschedule')
  async reschedule(
    @Param('id') id: string,
    @Body() dto: RescheduleAppointmentDto,
    @CurrentUser() user: any,
  ) {
    return wrap(await this.service.reschedule(id, dto, user));
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return wrap(await this.service.updateStatus(id, dto.status));
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateAppointmentDto, @CurrentUser() user: any) {
    return wrap(await this.service.update(id, dto, user));
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @CurrentUser() user: any) {
    return wrap(await this.service.delete(id, user));
  }
}
