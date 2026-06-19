import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TechnicianAbsence } from './technician-absence.entity';
import { WorkingDay } from './working-day.entity';
import { OperationalBlock } from './operational-block.entity';
import { Appointment } from '../appointments/appointment.entity';
import { BodyshopEntry } from '../bodyshop/bodyshop-entry.entity';
import { CapacityService } from './capacity.service';
import { CapacityController } from './capacity.controller';
import { OperationalBlocksService } from './operational-blocks.service';
import { OperationalBlocksController } from './operational-blocks.controller';
import { TechniciansModule } from '../technicians/technicians.module';
import { WorkshopsModule } from '../workshops/workshops.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TechnicianAbsence, WorkingDay, OperationalBlock, Appointment, BodyshopEntry]),
    TechniciansModule,
    WorkshopsModule,
    UsersModule,
  ],
  providers: [CapacityService, OperationalBlocksService],
  controllers: [CapacityController, OperationalBlocksController],
  exports: [CapacityService, OperationalBlocksService],
})
export class CapacityModule {}
