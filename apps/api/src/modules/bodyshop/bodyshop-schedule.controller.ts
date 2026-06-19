import { Controller, Post, Get, Query, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BodyshopScheduleService, SimulateInput } from './bodyshop-schedule.service';

const wrap = (data: any) => ({ data, meta: { timestamp: new Date().toISOString() } });
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

@Controller('bodyshop')
@UseGuards(JwtAuthGuard)
export class BodyshopScheduleController {
  constructor(private readonly service: BodyshopScheduleService) {}

  @Post('simulate-schedule')
  async simulate(@Body() dto: SimulateInput) {
    return wrap(await this.service.simulate(dto));
  }
}
