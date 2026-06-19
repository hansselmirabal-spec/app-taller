import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BodyshopEntry } from './bodyshop-entry.entity';
import { BodyshopProcessTech } from './bodyshop-process-tech.entity';
import { BodyshopProcess } from './bodyshop-process.entity';
import { BodyshopEntryProcessSlot } from './bodyshop-entry-process-slot.entity';
import { BodyshopGrade } from './bodyshop-grade.entity';
import { BodyshopPieceGroup } from './bodyshop-piece-group.entity';
import { BodyshopPiece } from './bodyshop-piece.entity';
import { BodyshopWorkMatrix } from './bodyshop-work-matrix.entity';
import { BodyshopWorkItem } from './bodyshop-work-item.entity';
import { BodyshopWorkItemProcess } from './bodyshop-work-item-process.entity';
import { TrackingLog } from '../tracking/tracking-log.entity';
import { BodyshopService } from './bodyshop.service';
import { BodyshopCatalogService } from './bodyshop-catalog.service';
import { BodyshopWorkItemsService } from './bodyshop-work-items.service';
import { BodyshopScheduleService } from './bodyshop-schedule.service';
import { DmsAgendamientoService } from './dms-agendamiento.service';
import { BodyshopController } from './bodyshop.controller';
import { BodyshopCapacityController } from './bodyshop-capacity.controller';
import { BodyshopCatalogController } from './bodyshop-catalog.controller';
import { BodyshopWorkItemsController } from './bodyshop-work-items.controller';
import { BodyshopScheduleController } from './bodyshop-schedule.controller';
import { TechniciansModule } from '../technicians/technicians.module';
import { WorkshopsModule } from '../workshops/workshops.module';
import { TrackingModule } from '../tracking/tracking.module';
import { TechnicianAbsence } from '../capacity/technician-absence.entity';
import { WorkingDay } from '../capacity/working-day.entity';
import { BudgetAppointment } from '../budget-appointments/budget-appointment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BodyshopEntry,
      BodyshopProcessTech,
      BodyshopProcess,
      BodyshopEntryProcessSlot,
      BodyshopGrade,
      BodyshopPieceGroup,
      BodyshopPiece,
      BodyshopWorkMatrix,
      BodyshopWorkItem,
      BodyshopWorkItemProcess,
      TechnicianAbsence,
      WorkingDay,
      BudgetAppointment,
      TrackingLog,
    ]),
    TechniciansModule,
    WorkshopsModule,
    TrackingModule,
  ],
  providers: [
    BodyshopService,
    BodyshopCatalogService,
    BodyshopWorkItemsService,
    BodyshopScheduleService,
    DmsAgendamientoService,
  ],
  controllers: [
    BodyshopController,
    BodyshopCapacityController,
    BodyshopCatalogController,
    BodyshopWorkItemsController,
    BodyshopScheduleController,
  ],
  exports: [BodyshopService, BodyshopCatalogService, BodyshopScheduleService],
})
export class BodyshopModule {}
