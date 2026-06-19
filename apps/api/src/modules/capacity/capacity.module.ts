import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TechnicianAbsence } from './technician-absence.entity';
import { WorkingDay } from './working-day.entity';
import { CapacityService } from './capacity.service';
import { CapacityController } from './capacity.controller';
import { TechniciansModule } from '../technicians/technicians.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TechnicianAbsence, WorkingDay]),
    TechniciansModule,
  ],
  providers: [CapacityService],
  controllers: [CapacityController],
  exports: [CapacityService],
})
export class CapacityModule {}
