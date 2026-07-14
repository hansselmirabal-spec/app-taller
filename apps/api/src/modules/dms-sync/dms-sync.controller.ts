import { Controller, Get, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { DmsSyncService } from './dms-sync.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

const wrap = (data: any) => ({ data, meta: { timestamp: new Date().toISOString() } });

@Controller('dms-sync')
export class DmsSyncController {
  constructor(private readonly service: DmsSyncService) {}

  // Salud del worker de sync (admin). Lo usa el dashboard de operaciones
  // para detectar caídas del sync de advisor-slots / OT rows.
  @Get('status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async status() {
    return wrap({ worker: this.service.getHealth() });
  }

  // Slots de asesores DMS para una fecha — usado por el formulario de ingreso.
  // sucursalIdis opcional: sin él devuelve todos los asesores de todas las sucursales.
  // Sin auth: los slots son datos de disponibilidad, no contienen info sensible de clientes.
  @Get('advisor-slots')
  async getAdvisorSlots(
    @Query('date') date?: string,
    @Query('sucursalIdis') sucursalIdis?: string,
    @Query('categoryId') categoryIdRaw?: string,
  ) {
    if (!date) {
      throw new BadRequestException('date es requerido');
    }
    const categoryId = Math.max(1, Math.min(2, Number(categoryIdRaw ?? '1')));
    const resolvedSucursal = sucursalIdis?.trim() || undefined;
    const advisors = await this.service.getAdvisorSlotsByDate(date, resolvedSucursal, categoryId);
    return wrap({ date, sucursalIdis: resolvedSucursal ?? null, categoryId, advisors });
  }

  // Lista de asesores activos en cache.
  // ?sucursalIdis=N filtra por sucursal. Sin parámetro devuelve todos.
  @Get('advisors')
  async getAdvisors(@Query('sucursalIdis') sucursalIdis?: string) {
    const advisors = await this.service.getAdvisorsForSucursal(sucursalIdis?.trim());
    return wrap(advisors);
  }
}
