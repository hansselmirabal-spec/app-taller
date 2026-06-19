import { Controller, Get, HttpCode, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const startedAt = Date.now();

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  @HttpCode(200)
  async health() {
    const checks = {
      db: await this.checkDb(),
    };
    const allOk = Object.values(checks).every(c => c.ok);

    return {
      status: allOk ? 'ok' : 'degraded',
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  // El detalle del error queda en logs (server-side) para diagnosticar internamente.
  // El cliente recibe solo `ok: false` para no filtrar hostnames, drivers ni stacktraces
  // a un atacante anónimo (este endpoint es público para load balancers / k8s probes).
  private async checkDb(): Promise<{ ok: boolean }> {
    try {
      await this.dataSource.query('SELECT 1');
      return { ok: true };
    } catch (err: any) {
      this.logger.error(`Health check DB failed: ${err.message}`, err.stack);
      return { ok: false };
    }
  }
}
