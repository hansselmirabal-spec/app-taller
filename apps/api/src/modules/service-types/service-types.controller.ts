import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ServiceTypesService, CreateServiceTypeDto, UpdateServiceTypeDto } from './service-types.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

const wrap = (data: any) => ({ data, meta: { timestamp: new Date().toISOString() } });

@Controller('service-types')
@UseGuards(JwtAuthGuard)
export class ServiceTypesController {
  constructor(private service: ServiceTypesService) {}

  @Get()
  async findAll() { return wrap(await this.service.findAll()); }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  async create(@Body() dto: CreateServiceTypeDto) { return wrap(await this.service.create(dto)); }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async update(@Param('id') id: string, @Body() dto: UpdateServiceTypeDto) {
    return wrap(await this.service.update(id, dto));
  }
}
