import {
  Controller, Get, Post, Patch, Query, Param, Body,
  UseGuards, BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  BudgetAppointmentsService,
  CreateBudgetAppointmentDto,
  UpdateBudgetProcessesDto,
  RejectBudgetAppointmentDto,
} from './budget-appointments.service';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const wrap = (data: any) => ({ data, meta: { timestamp: new Date().toISOString() } });

@UseGuards(JwtAuthGuard)
@Controller('budget-appointments')
export class BudgetAppointmentsController {
  constructor(private readonly service: BudgetAppointmentsService) {}

  @Get()
  async findByDate(
    @Query('workshopId') workshopId: string,
    @Query('date') date: string,
    @CurrentUser() user: any,
  ) {
    if (!workshopId || !date) throw new BadRequestException('workshopId y date son requeridos');
    if (!DATE_RE.test(date)) throw new BadRequestException('Formato de fecha inválido (YYYY-MM-DD)');
    return wrap(await this.service.findByDate(workshopId, date, user.id, user.role));
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return wrap(await this.service.findOne(id));
  }

  @Post()
  async create(
    @Body() dto: CreateBudgetAppointmentDto,
    @CurrentUser() user: any,
  ) {
    return wrap(await this.service.create(dto, user.id));
  }

  @Patch(':id/processes')
  async updateProcesses(
    @Param('id') id: string,
    @Body() dto: UpdateBudgetProcessesDto,
  ) {
    return wrap(await this.service.updateProcesses(id, dto));
  }

  @Post(':id/reject')
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectBudgetAppointmentDto,
  ) {
    return wrap(await this.service.reject(id, dto.reason));
  }

  @Patch(':id/cancel')
  async cancel(@Param('id') id: string) {
    return wrap(await this.service.cancel(id));
  }

  @Post(':id/approve')
  async approve(
    @Param('id') id: string,
    @Body() body: { repairStartDate?: string },
    @CurrentUser() user: any,
  ) {
    const repairStartDate = body?.repairStartDate;
    if (repairStartDate && !DATE_RE.test(repairStartDate)) {
      throw new BadRequestException('repairStartDate debe tener formato YYYY-MM-DD');
    }
    return wrap(await this.service.approve(id, user.id, repairStartDate));
  }
}
