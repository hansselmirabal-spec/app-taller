import {
  Controller, Post, Delete, Patch, Param, Body,
  UseGuards, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BodyshopWorkItemsService, CreateWorkItemDto, AdjustHoursDto } from './bodyshop-work-items.service';

const wrap = (data: any) => ({ data, meta: { timestamp: new Date().toISOString() } });

@Controller('bodyshop/entries')
@UseGuards(JwtAuthGuard)
export class BodyshopWorkItemsController {
  constructor(private readonly service: BodyshopWorkItemsService) {}

  @Post(':entryId/work-items')
  async addWorkItem(
    @Param('entryId') entryId: string,
    @Body() dto: CreateWorkItemDto,
  ) {
    return wrap(await this.service.addWorkItem(entryId, dto));
  }

  @Delete(':entryId/work-items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeWorkItem(
    @Param('itemId') itemId: string,
    @Request() req: any,
  ) {
    return this.service.removeWorkItem(itemId, req.user.id, req.user.role);
  }

  @Patch(':entryId/work-items/processes/:wipId/hours')
  async adjustHours(
    @Param('wipId') wipId: string,
    @Body() dto: AdjustHoursDto,
    @Request() req: any,
  ) {
    return wrap(await this.service.adjustHours(wipId, dto, {
      id:   req.user.id,
      role: req.user.role,
      name: req.user.name,
    }));
  }
}
