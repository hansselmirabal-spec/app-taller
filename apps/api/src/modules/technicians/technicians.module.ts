import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Technician } from './technician.entity';
import { TechniciansService } from './technicians.service';
import { TechniciansController } from './technicians.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Technician])],
  providers: [TechniciansService],
  controllers: [TechniciansController],
  exports: [TechniciansService],
})
export class TechniciansModule {}
