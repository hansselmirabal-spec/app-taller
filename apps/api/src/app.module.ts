import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TechniciansModule } from './modules/technicians/technicians.module';
import { ServiceTypesModule } from './modules/service-types/service-types.module';
import { CapacityModule } from './modules/capacity/capacity.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { RolesModule } from './modules/roles/roles.module';
import { WorkshopsModule } from './modules/workshops/workshops.module';
import { SpecialtiesModule } from './modules/specialties/specialties.module';
import { WorkTypesModule } from './modules/work-types/work-types.module';
import { BodyshopModule } from './modules/bodyshop/bodyshop.module';
import { HealthModule } from './modules/health/health.module';
import { DmsSyncModule } from './modules/dms-sync/dms-sync.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { BudgetAppointmentsModule } from './modules/budget-appointments/budget-appointments.module';
import { BudgetSimulatorModule } from './modules/budget-simulator/budget-simulator.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Nombre 'default' para que los `@Throttle({ default: { ttl, limit } })` por endpoint
    // efectivamente overrideen este global. Antes estaba 'global' y los overrides eran no-op.
    // Limite global elevado: app interna con polling de dashboards + navegación normal
    // genera fácilmente >10 req/min por usuario. Endpoints sensibles (login) tienen su
    // propio @Throttle más estricto en su controller.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: config.get('NODE_ENV') === 'development',
        migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
        migrationsRun: config.get('NODE_ENV') !== 'development',
        logging: false,
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    TechniciansModule,
    ServiceTypesModule,
    CapacityModule,
    AppointmentsModule,
    RolesModule,
    WorkshopsModule,
    SpecialtiesModule,
    WorkTypesModule,
    BodyshopModule,
    HealthModule,
    DmsSyncModule,
    TrackingModule,
    BudgetAppointmentsModule,
    BudgetSimulatorModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
