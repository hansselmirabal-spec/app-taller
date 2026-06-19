import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Technician } from './technician.entity';
import { TechniciansService } from './technicians.service';
import { TechniciansController } from './technicians.controller';
import { WorkshopsModule } from '../workshops/workshops.module';

@Module({
  imports: [TypeOrmModule.forFeature([Technician]), WorkshopsModule],
  providers: [TechniciansService],
  controllers: [TechniciansController],
  exports: [TechniciansService],
})
export class TechniciansModule {}
