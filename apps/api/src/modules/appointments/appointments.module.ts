import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from './appointment.entity';
import { BodyshopEntry } from '../bodyshop/bodyshop-entry.entity';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';
import { CapacityModule } from '../capacity/capacity.module';
import { ServiceTypesModule } from '../service-types/service-types.module';
import { TechniciansModule } from '../technicians/technicians.module';
import { WorkshopsModule } from '../workshops/workshops.module';
import { DmsSyncModule } from '../dms-sync/dms-sync.module';
import { TrackingModule } from '../tracking/tracking.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Appointment, BodyshopEntry]),
    CapacityModule,
    ServiceTypesModule,
    TechniciansModule,
    WorkshopsModule,
    DmsSyncModule,
    TrackingModule,
  ],
  providers: [AppointmentsService],
  controllers: [AppointmentsController],
})
export class AppointmentsModule {}
