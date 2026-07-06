import { Controller, Get, Param, ParseIntPipe, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { DmsOtService, OtFilters } from './dms-ot.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

function parseFilters(q: Record<string, any>): OtFilters {
  return {
    estadoOt:  q.estado     ?? q.estadoOt,
    sucursal:  q.sucursal,
    asesor:    q.asesor,
    tipo:      q.tipo,
    taller:    q.taller   != null ? Number(q.taller)  : undefined,
    days:      q.days     != null ? Number(q.days)    : undefined,
    dateFrom:  q.dateFrom,
    dateTo:    q.dateTo,
    search:    q.search,
    page:      q.page     != null ? Number(q.page)    : undefined,
    limit:     q.limit    != null ? Number(q.limit)   : undefined,
    sortBy:    q.sortBy,
    sortDir:   q.sortDir === 'ASC' ? 'ASC' : 'DESC',
  };
}

@Controller('dms')
@UseGuards(JwtAuthGuard)
export class DmsOtController {
  constructor(private readonly service: DmsOtService) {}

  @Get('ot-seguimiento')
  async findOtSeguimiento(@Query() q: Record<string, any>) {
    return this.service.findOtSeguimiento(parseFilters(q));
  }

  @Get('ot-seguimiento/operativo')
  async getOperativo(@Query() q: Record<string, any>) {
    if (q.drill) {
      return this.service.getOperativoDrill(String(q.drill), String(q.periodo ?? q.period ?? 'hoy'));
    }
    return this.service.getOperativo(q.period ?? 'all', parseFilters(q));
  }

  @Get('ot-seguimiento/reportes')
  async getReportes(@Query() q: Record<string, any>) {
    return this.service.getReportes(parseFilters(q));
  }

  @Get('ot-seguimiento/reportes/dashboard')
  async getDashboard(@Query() q: Record<string, any>) {
    return this.service.getReportesDashboard(parseFilters(q));
  }

  @Get('ot-seguimiento/reportes/dashboard/detail')
  async getDashboardDetail(@Query() q: Record<string, any>) {
    const kind = String(q.kind ?? 'abiertas');
    return this.service.getReportesDashboardDetail(kind, parseFilters(q));
  }

  @Get('ot-detail/:nroot')
  async getOtDetail(@Param('nroot', ParseIntPipe) nroot: number) {
    const detail = await this.service.getOtDetail(nroot);
    if (!detail) throw new NotFoundException('OT no encontrada');
    return detail;
  }

  @Get('sync-status')
  async getSyncStatus() {
    return this.service.getSyncStatus();
  }
}
