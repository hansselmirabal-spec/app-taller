import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from './appointment.entity';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';
import { CapacityModule } from '../capacity/capacity.module';
import { ServiceTypesModule } from '../service-types/service-types.module';
import { TechniciansModule } from '../technicians/technicians.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Appointment]),
    CapacityModule,
    ServiceTypesModule,
    TechniciansModule,
  ],
  providers: [AppointmentsService],
  controllers: [AppointmentsController],
})
export class AppointmentsModule {}
