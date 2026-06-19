import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TechniciansModule } from './modules/technicians/technicians.module';
import { ServiceTypesModule } from './modules/service-types/service-types.module';
import { CapacityModule } from './modules/capacity/capacity.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: config.get('NODE_ENV') === 'development',
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
  ],
})
export class AppModule {}
