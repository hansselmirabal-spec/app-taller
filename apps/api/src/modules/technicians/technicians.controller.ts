import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { TechniciansService, CreateTechnicianDto, UpdateTechnicianDto } from './technicians.service';
import { WorkshopsService } from '../workshops/workshops.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

const wrap = (data: any) => ({ data, meta: { timestamp: new Date().toISOString() } });

@Controller('technicians')
@UseGuards(JwtAuthGuard)
export class TechniciansController {
  constructor(
    private service: TechniciansService,
    private workshopsService: WorkshopsService,
  ) {}

  private async resolveWorkshopName(workshopId?: string, workshopName?: string): Promise<string | undefined> {
    if (workshopName) return workshopName;
    if (!workshopId) return undefined;
    const ws = await this.workshopsService.findOne(workshopId);
    return ws.name;
  }

  @Get()
  async findAll(
    @Query('workshopId') workshopId?: string,
    @Query('workshopName') workshopName?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const name = await this.resolveWorkshopName(workshopId, workshopName);
    const data = includeInactive === 'true'
      ? await this.service.findAllIncludingInactive(name)
      : await this.service.findAll(name);
    return wrap(data);
  }

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
