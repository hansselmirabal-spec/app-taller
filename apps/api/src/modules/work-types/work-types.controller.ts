import { Controller, Get, Post, Patch, Delete, Query, Param, Body, UseGuards, HttpCode } from '@nestjs/common';
import { WorkTypesService, CreateWorkTypeDto, UpdateWorkTypeDto } from './work-types.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

const wrap = (data: any) => ({ data, meta: { timestamp: new Date().toISOString() } });

@Controller('work-types')
@UseGuards(JwtAuthGuard)
export class WorkTypesController {
  constructor(private service: WorkTypesService) {}

  @Get()
  async findAll(@Query('workshopId') workshopId?: string) {
    return wrap(await this.service.findAll(workshopId));
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  async create(@Body() dto: CreateWorkTypeDto) {
    return wrap(await this.service.create(dto));
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async update(@Param('id') id: string, @Body() dto: UpdateWorkTypeDto) {
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
