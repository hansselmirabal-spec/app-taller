import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BudgetSimulatorItem } from './budget-simulator-item.entity';
import { BudgetConfig } from './budget-config.entity';
import { BudgetSimulatorService } from './budget-simulator.service';
import { BudgetSimulatorController } from './budget-simulator.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BudgetSimulatorItem, BudgetConfig])],
  providers: [BudgetSimulatorService],
  controllers: [BudgetSimulatorController],
  exports: [BudgetSimulatorService],
})
export class BudgetSimulatorModule {}
