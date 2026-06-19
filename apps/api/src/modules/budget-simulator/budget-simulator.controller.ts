import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, Query,
  UseGuards, HttpCode, UseInterceptors, UploadedFile, ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  BudgetSimulatorService,
  EstimateRequestDto,
  CatalogListQuery,
  UpdateCatalogItemDto,
  CreateCatalogItemDto,
} from './budget-simulator.service';

const wrap = (data: any) => ({ data, meta: { timestamp: new Date().toISOString() } });

@Controller('budget-simulator')
@UseGuards(JwtAuthGuard)
export class BudgetSimulatorController {
  constructor(private readonly service: BudgetSimulatorService) {}

  @Get('piezas')
  async getPiezas() {
    return wrap(await this.service.getPiezas());
  }

  @Get('damage-levels')
  getDamageLevels() {
    return wrap(this.service.getDamageLevels());
  }

  @Get('config')
  async getConfig() {
    return wrap(await this.service.getConfig());
  }

  @Put('config')
  async updateConfig(@Body() dto: { tarifaMdo?: number; moneda?: string; ivaIncluido?: boolean }) {
    return wrap(await this.service.updateConfig(dto));
  }

  @Post('estimate')
  @HttpCode(200)
  async estimate(@Body() dto: EstimateRequestDto) {
    return wrap(await this.service.estimate(dto));
  }

  // ── Catalog CRUD ─────────────────────────────────────────────────────────────

  @Get('catalog')
  async listCatalog(@Query() q: CatalogListQuery) {
    const res = await this.service.listCatalog({
      ...q,
      page:       q.page  ? Number(q.page)  : 1,
      limit:      q.limit ? Number(q.limit) : 50,
      activeOnly: q.activeOnly !== undefined ? String(q.activeOnly) !== 'false' : true,
    });
    return wrap(res);
  }

  @Post('catalog')
  async createCatalogItem(@Body() dto: CreateCatalogItemDto) {
    return wrap(await this.service.createCatalogItem(dto));
  }

  @Patch('catalog/:id')
  async updateCatalogItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatalogItemDto,
  ) {
    return wrap(await this.service.updateCatalogItem(id, dto));
  }

  @Delete('catalog/:id')
  async deleteCatalogItem(@Param('id', ParseUUIDPipe) id: string) {
    return wrap(await this.service.updateCatalogItem(id, { active: false }));
  }

  @Post('catalog/import')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file'))
  async importCatalog(@UploadedFile() file: Express.Multer.File) {
    return wrap(await this.service.importFromExcel(file.buffer));
  }
}
