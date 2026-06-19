import { Controller, Get, Post, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { DmsSyncService } from './dms-sync.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

const wrap = (data: any) => ({ data, meta: { timestamp: new Date().toISOString() } });

@Controller('dms-sync')
export class DmsSyncController {
  constructor(private readonly service: DmsSyncService) {}

  // Endpoint público (sin auth) para que el frontend lea el cache de OTs.
  // Devuelve el snapshot tal cual con metadata de freshness.
  @Get('ot-seguimiento')
  async getOtSeguimiento(
    @Query('days') daysRaw?: string,
    @Query('soloAbiertas') soloAbiertasRaw?: string,
  ) {
    const days = Math.max(0, Math.min(720, Number(daysRaw ?? '90')));
    const soloAbiertas = soloAbiertasRaw !== 'false';
    const scope = `days=${days}|abiertas=${soloAbiertas ? 1 : 0}`;

    const snapshot = await this.service.getSnapshot('ot-seguimiento', scope);
    if (!snapshot) {
      // Sin snapshot: el frontend usa su fallback al endpoint Next.js directo.
      return { available: false, scope };
    }

    const ageMs = Date.now() - new Date(snapshot.fetchedAt).getTime();
    return {
      available: true,
      scope,
      ageSeconds: Math.round(ageMs / 1000),
      fetchedAt: snapshot.fetchedAt.toISOString(),
      lastError: snapshot.lastError,
      payload: snapshot.data,
    };
  }

  // Snapshots disponibles + edad de cada uno + salud del worker (admin).
  // Lo usa el dashboard de operaciones para detectar caídas del DMS sync.
  @Get('status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async status() {
    const list = await this.service.listSnapshots();
    return wrap({
      worker: this.service.getHealth(),
      snapshots: list.map(s => ({
        kind:       s.kind,
        scope:      s.scope,
        fetchedAt:  s.fetchedAt,
        ageSeconds: Math.round((Date.now() - new Date(s.fetchedAt).getTime()) / 1000),
        lastError:  s.lastError,
        rowsCount:  Array.isArray(s.data?.data) ? s.data.data.length : null,
      })),
    });
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

  // Forzar sync inmediato de un scope (admin).
  @Post('refresh')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async refresh(
    @Query('days') daysRaw?: string,
    @Query('soloAbiertas') soloAbiertasRaw?: string,
  ) {
    const days = Math.max(0, Math.min(720, Number(daysRaw ?? '90')));
    if (!Number.isFinite(days)) throw new BadRequestException('days inválido');
    const soloAbiertas = soloAbiertasRaw !== 'false';
    const t0 = Date.now();
    await this.service.syncOtSeguimiento(days, soloAbiertas);
    return wrap({ days, soloAbiertas, durationMs: Date.now() - t0 });
  }
}
