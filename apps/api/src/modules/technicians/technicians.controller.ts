import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { TechniciansService, CreateTechnicianDto, UpdateTechnicianDto } from './technicians.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

const wrap = (data: any) => ({ data, meta: { timestamp: new Date().toISOString() } });

@Controller('technicians')
@UseGuards(JwtAuthGuard)
export class TechniciansController {
  constructor(private service: TechniciansService) {}

  @Get()
  async findAll() { return wrap(await this.service.findAll()); }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  async create(@Body() dto: CreateTechnicianDto) { return wrap(await this.service.create(dto)); }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async update(@Param('id') id: string, @Body() dto: UpdateTechnicianDto) {
    return wrap(await this.service.update(id, dto));
  }
}
