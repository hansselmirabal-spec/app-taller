import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrackingLog } from './tracking-log.entity';
import { TrackingService } from './tracking.service';
import { TrackingController } from './tracking.controller';
import { Appointment } from '../appointments/appointment.entity';
import { BodyshopEntry } from '../bodyshop/bodyshop-entry.entity';
import { BodyshopProcessTech } from '../bodyshop/bodyshop-process-tech.entity';
import { Workshop } from '../workshops/workshop.entity';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TrackingLog, Appointment, BodyshopEntry, BodyshopProcessTech, Workshop]),
    UsersModule,
  ],
  providers: [TrackingService],
  controllers: [TrackingController],
  exports: [TrackingService],
})
export class TrackingModule {}
