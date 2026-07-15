import {
  Controller, Get, Post, Patch, Delete, Param, Query, Body, UseGuards, HttpCode,
} from '@nestjs/common';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { BodyshopCatalogService } from './bodyshop-catalog.service';

class WorkItemHoursDto {
  @IsString() pieceId: string;
  @IsString() processId: string;
  @IsString() gradeId: string;
}

class CalculateHoursDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkItemHoursDto)
  items: WorkItemHoursDto[];

  @IsOptional()
  @IsString()
  workshopId?: string;
}

const wrap = (data: any) => ({ data, meta: { timestamp: new Date().toISOString() } });

@UseGuards(JwtAuthGuard)
@Controller('bodyshop/catalog')
export class BodyshopCatalogController {
  constructor(private readonly catalogService: BodyshopCatalogService) {}

  @Get('processes')
  async getProcesses() { return wrap(await this.catalogService.getProcesses()); }

  @Get('grades')
  async getGrades() { return wrap(await this.catalogService.getGrades()); }

  @Get('piece-groups')
  async getPieceGroups() { return wrap(await this.catalogService.getPieceGroups()); }

  @Get('pieces')
  async getPieces(@Query('groupId') groupId?: string) {
    return wrap(await this.catalogService.getPieces(groupId));
  }

  @Get('matrix')
  async getMatrix(
    @Query('pieceId') pieceId: string,
    @Query('processId') processId: string,
    @Query('gradeId') gradeId: string,
    @Query('workshopId') workshopId?: string,
  ) {
    return wrap(await this.catalogService.getMatrix(pieceId, processId, gradeId, workshopId));
  }

  @Post('calculate-hours')
  async calculateHours(@Body() body: CalculateHoursDto) {
    return wrap(await this.catalogService.calculateHours(body.items, body.workshopId));
  }

  @Post('seed')
  @UseGuards(RolesGuard) @Roles('admin')
  seed(@Body('workshopId') workshopId?: string) {
    return this.catalogService.seedDefaults(workshopId);
  }

  @Post('seed-workshop/:workshopId')
  @UseGuards(RolesGuard) @Roles('admin')
  seedWorkshop(@Param('workshopId') workshopId: string) {
    return this.catalogService.seedWorkshopMatrix(workshopId);
  }

  // ── Group CRUD ────────────────────────────────────────────────────────────────

  @Post('groups')
  @UseGuards(RolesGuard) @Roles('admin')
  async createGroup(@Body() body: { name: string; code?: string; order?: number }) {
    return wrap(await this.catalogService.createGroup(body));
  }

  @Patch('groups/:id')
  @UseGuards(RolesGuard) @Roles('admin')
  async updateGroup(@Param('id') id: string, @Body() body: { name?: string; code?: string; order?: number }) {
    return wrap(await this.catalogService.updateGroup(id, body));
  }

  @Delete('groups/:id')
  @UseGuards(RolesGuard) @Roles('admin')
  @HttpCode(204)
  deleteGroup(@Param('id') id: string) {
    return this.catalogService.deleteGroup(id);
  }

  // ── Piece CRUD ────────────────────────────────────────────────────────────────

  @Post('pieces-crud')
  @UseGuards(RolesGuard) @Roles('admin')
  async createPiece(@Body() body: { name: string; code: string; groupId?: string | null; order?: number }) {
    return wrap(await this.catalogService.createPiece(body));
  }

  @Patch('pieces-crud/:id')
  @UseGuards(RolesGuard) @Roles('admin')
  async updatePiece(@Param('id') id: string, @Body() body: { name?: string; code?: string; groupId?: string | null; order?: number }) {
    return wrap(await this.catalogService.updatePiece(id, body));
  }

  @Delete('pieces-crud/:id')
  @UseGuards(RolesGuard) @Roles('admin')
  @HttpCode(204)
  deletePiece(@Param('id') id: string) {
    return this.catalogService.deletePiece(id);
  }

  // ── Process CRUD ──────────────────────────────────────────────────────────────

  @Post('processes-crud')
  @UseGuards(RolesGuard) @Roles('admin')
  async createProcess(@Body() body: { name: string; code: string; sequence?: number }) {
    return wrap(await this.catalogService.createProcess(body));
  }

  @Patch('processes-crud/:id')
  @UseGuards(RolesGuard) @Roles('admin')
  async updateProcess(@Param('id') id: string, @Body() body: { name?: string; code?: string; sequence?: number }) {
    return wrap(await this.catalogService.updateProcess(id, body));
  }

  @Delete('processes-crud/:id')
  @UseGuards(RolesGuard) @Roles('admin')
  @HttpCode(204)
  deleteProcess(@Param('id') id: string) {
    return this.catalogService.deleteProcess(id);
  }

  // ── Grade CRUD ────────────────────────────────────────────────────────────────

  @Post('grades-crud')
  @UseGuards(RolesGuard) @Roles('admin')
  async createGrade(@Body() body: { name: string; code: string; severity?: number }) {
    return wrap(await this.catalogService.createGrade(body));
  }

  @Patch('grades-crud/:id')
  @UseGuards(RolesGuard) @Roles('admin')
  async updateGrade(@Param('id') id: string, @Body() body: { name?: string; code?: string; severity?: number }) {
    return wrap(await this.catalogService.updateGrade(id, body));
  }

  @Delete('grades-crud/:id')
  @UseGuards(RolesGuard) @Roles('admin')
  @HttpCode(204)
  deleteGrade(@Param('id') id: string) {
    return this.catalogService.deleteGrade(id);
  }
}
