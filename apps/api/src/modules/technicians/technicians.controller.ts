import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { TechniciansService, CreateTechnicianDto, UpdateTechnicianDto } from './technicians.service';
import { WorkshopsService } from '../workshops/workshops.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkshopAccessGuard } from '../../common/guards/workshop-access.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserAccessContext } from '../users/users.service';
import { isUnrestrictedWorkshopAccess } from '../../common/guards/workshop-access.util';

const wrap = (data: any) => ({ data, meta: { timestamp: new Date().toISOString() } });

@Controller('technicians')
@UseGuards(JwtAuthGuard)
export class TechniciansController {
  constructor(
    private service: TechniciansService,
    private workshopsService: WorkshopsService,
  ) {}

  // `WorkshopAccessGuard` solo inspecciona `workshopId` (query/body/params) —
  // nunca `workshopName`. Por eso `workshopName` se autoriza acá, no en el
  // guard: es la ÚNICA autorización real para ese caso, no una capa extra.
  // No quitar `assertWorkshopNameAllowed` ni cambiar el orden de precedencia
  // (nombre gana sobre id cuando ambos vienen) sin reabrir el gap que este
  // cambio cierra.
  private async resolveWorkshopName(
    workshopId: string | undefined,
    workshopName: string | undefined,
    user: UserAccessContext,
  ): Promise<string | undefined> {
    if (workshopName) {
      await this.assertWorkshopNameAllowed(workshopName, user);
      return workshopName;
    }
    if (!workshopId) return undefined;
    const ws = await this.workshopsService.findOne(workshopId, user);
    return ws.name;
  }

  // Lanza si `name` no pertenece a un taller permitido para `user` — es la
  // autorización real del path por workshopName, ver comentario de arriba.
  private async assertWorkshopNameAllowed(name: string, user: UserAccessContext): Promise<void> {
    if (isUnrestrictedWorkshopAccess(user)) return;
    const allowed = await this.workshopsService.findAll(user);
    if (!allowed.some(w => w.name === name)) {
      throw new ForbiddenException('No tenés acceso a este taller');
    }
  }

  @Get()
  @UseGuards(WorkshopAccessGuard)
  async findAll(
    @CurrentUser() user: UserAccessContext,
    @Query('workshopId') workshopId?: string,
    @Query('workshopName') workshopName?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const name = await this.resolveWorkshopName(workshopId, workshopName, user);
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
