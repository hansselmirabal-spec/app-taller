import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrackingLog } from './tracking-log.entity';
import { TrackingService } from './tracking.service';
import { TrackingController } from './tracking.controller';
import { Appointment } from '../appointments/appointment.entity';
import { BodyshopEntry } from '../bodyshop/bodyshop-entry.entity';
import { Workshop } from '../workshops/workshop.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([TrackingLog, Appointment, BodyshopEntry, Workshop]),
  ],
  providers: [TrackingService],
  controllers: [TrackingController],
  exports: [TrackingService],
})
export class TrackingModule {}
