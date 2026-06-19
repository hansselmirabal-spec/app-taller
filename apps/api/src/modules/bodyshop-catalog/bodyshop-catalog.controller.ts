import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, HttpCode } from '@nestjs/common';
import { BodyshopCatalogService } from './bodyshop-catalog.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

const wrap = (data: any) => ({ data, meta: { timestamp: new Date().toISOString() } });

@Controller('bodyshop-catalog')
@UseGuards(JwtAuthGuard)
export class BodyshopCatalogController {
  constructor(private service: BodyshopCatalogService) {}

  // ── Groups ──────────────────────────────────────────────────────────────────

  @Get('groups')
  async getGroups() { return wrap(await this.service.findGroups()); }

  @Post('groups')
  @UseGuards(RolesGuard) @Roles('admin')
  async createGroup(@Body() dto: { code: string; label: string }) {
    return wrap(await this.service.createGroup(dto));
  }

  @Patch('groups/:id')
  @UseGuards(RolesGuard) @Roles('admin')
  async updateGroup(@Param('id') id: string, @Body() dto: { code?: string; label?: string }) {
    return wrap(await this.service.updateGroup(id, dto));
  }

  @Delete('groups/:id')
  @UseGuards(RolesGuard) @Roles('admin')
  @HttpCode(204)
  async deleteGroup(@Param('id') id: string) { await this.service.deleteGroup(id); }

  // ── Pieces ──────────────────────────────────────────────────────────────────

  @Get('pieces')
  async getPieces() { return wrap(await this.service.findPieces()); }

  @Post('pieces')
  @UseGuards(RolesGuard) @Roles('admin')
  async createPiece(@Body() dto: { code: string; label: string; groupId?: string | null }) {
    return wrap(await this.service.createPiece(dto));
  }

  @Patch('pieces/:id')
  @UseGuards(RolesGuard) @Roles('admin')
  async updatePiece(@Param('id') id: string, @Body() dto: { code?: string; label?: string; groupId?: string | null }) {
    return wrap(await this.service.updatePiece(id, dto));
  }

  @Delete('pieces/:id')
  @UseGuards(RolesGuard) @Roles('admin')
  @HttpCode(204)
  async deletePiece(@Param('id') id: string) { await this.service.deletePiece(id); }

  // ── Processes ────────────────────────────────────────────────────────────────

  @Get('processes')
  async getProcesses() { return wrap(await this.service.findProcesses()); }

  @Post('processes')
  @UseGuards(RolesGuard) @Roles('admin')
  async createProcess(@Body() dto: { code: string; label: string; order: number }) {
    return wrap(await this.service.createProcess(dto));
  }

  @Patch('processes/:id')
  @UseGuards(RolesGuard) @Roles('admin')
  async updateProcess(@Param('id') id: string, @Body() dto: { code?: string; label?: string; order?: number }) {
    return wrap(await this.service.updateProcess(id, dto));
  }

  @Delete('processes/:id')
  @UseGuards(RolesGuard) @Roles('admin')
  @HttpCode(204)
  async deleteProcess(@Param('id') id: string) { await this.service.deleteProcess(id); }

  // ── Grades ───────────────────────────────────────────────────────────────────

  @Get('grades')
  async getGrades() { return wrap(await this.service.findGrades()); }

  @Post('grades')
  @UseGuards(RolesGuard) @Roles('admin')
  async createGrade(@Body() dto: { code: string; label: string; factor?: number | null }) {
    return wrap(await this.service.createGrade(dto));
  }

  @Patch('grades/:id')
  @UseGuards(RolesGuard) @Roles('admin')
  async updateGrade(@Param('id') id: string, @Body() dto: { code?: string; label?: string; factor?: number | null }) {
    return wrap(await this.service.updateGrade(id, dto));
  }

  @Delete('grades/:id')
  @UseGuards(RolesGuard) @Roles('admin')
  @HttpCode(204)
  async deleteGrade(@Param('id') id: string) { await this.service.deleteGrade(id); }
}
