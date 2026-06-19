import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BudgetAppointment } from './budget-appointment.entity';
import { BudgetAppointmentsService } from './budget-appointments.service';
import { BudgetAppointmentsController } from './budget-appointments.controller';
import { BodyshopModule } from '../bodyshop/bodyshop.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([BudgetAppointment]),
    BodyshopModule,
  ],
  providers: [BudgetAppointmentsService],
  controllers: [BudgetAppointmentsController],
  exports: [BudgetAppointmentsService],
})
export class BudgetAppointmentsModule {}
