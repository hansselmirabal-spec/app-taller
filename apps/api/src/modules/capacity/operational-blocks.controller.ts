import {
  Controller, Get, Post, Patch, Delete,
  Query, Param, Body, UseGuards, BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  OperationalBlocksService,
  CreateOperationalBlockDto,
  UpdateOperationalBlockDto,
} from './operational-blocks.service';

const wrap = (data: any) => ({ data, meta: { timestamp: new Date().toISOString() } });

@UseGuards(JwtAuthGuard)
@Controller('operational-blocks')
export class OperationalBlocksController {
  constructor(private readonly service: OperationalBlocksService) {}

  @Get()
  async findByDate(
    @Query('workshopId') workshopId: string,
    @Query('date') date: string,
  ) {
    if (!workshopId || !date) throw new BadRequestException('workshopId y date son requeridos');
    return wrap(await this.service.findByDate(workshopId, date));
  }

  @Post()
  async create(@Body() dto: CreateOperationalBlockDto, @CurrentUser() user: any) {
    return wrap(await this.service.create(dto, user.id));
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateOperationalBlockDto) {
    return wrap(await this.service.update(id, dto));
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
    return wrap({ ok: true });
  }
}
