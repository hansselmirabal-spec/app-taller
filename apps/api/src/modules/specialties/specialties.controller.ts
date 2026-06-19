import { Controller, Get, Post, Patch, Delete, Query, Param, Body, UseGuards, HttpCode } from '@nestjs/common';
import { SpecialtiesService, CreateSpecialtyDto, UpdateSpecialtyDto } from './specialties.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

const wrap = (data: any) => ({ data, meta: { timestamp: new Date().toISOString() } });

@Controller('specialties')
@UseGuards(JwtAuthGuard)
export class SpecialtiesController {
  constructor(private service: SpecialtiesService) {}

  @Get()
  async findAll(@Query('workshopId') workshopId?: string) {
    return wrap(await this.service.findAll(workshopId));
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  async create(@Body() dto: CreateSpecialtyDto) {
    return wrap(await this.service.create(dto));
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async update(@Param('id') id: string, @Body() dto: UpdateSpecialtyDto) {
    return wrap(await this.service.update(id, dto));
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @HttpCode(204)
  async delete(@Param('id') id: string) {
    await this.service.delete(id);
  }
}
