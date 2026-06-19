import { Controller, Get, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { BodyshopService } from './bodyshop.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const wrap = (data: any) => ({ data, meta: { timestamp: new Date().toISOString() } });

@Controller('capacity/bodyshop')
@UseGuards(JwtAuthGuard)
export class BodyshopCapacityController {
  constructor(private service: BodyshopService) {}

  @Get('week')
  async getWeek(
    @Query('workshopId') workshopId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    if (!workshopId || !from || !to) throw new BadRequestException('Se requieren workshopId, from y to');
    const diffDays = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
    if (diffDays > 31) throw new BadRequestException('El rango de fechas no puede superar 31 días');
    return wrap(await this.service.getWeekCapacity(workshopId, from, to));
  }

  @Get()
  async getDay(
    @Query('workshopId') workshopId: string,
    @Query('date') date: string,
  ) {
    if (!workshopId || !date) throw new BadRequestException('Se requieren workshopId y date');
    if (!DATE_RE.test(date)) throw new BadRequestException('Formato de fecha inválido');
    return wrap(await this.service.getDayCapacity(workshopId, date));
  }
}
