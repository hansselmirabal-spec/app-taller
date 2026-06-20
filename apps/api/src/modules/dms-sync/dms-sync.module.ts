import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { DmsSnapshot } from './dms-snapshot.entity';
import { DmsAdvisorSlot } from './dms-advisor-slot.entity';
import { DmsOtRow } from './dms-ot-row.entity';
import { DmsSyncState } from './dms-sync-state.entity';
import { DmsSyncService } from './dms-sync.service';
import { DmsSyncController } from './dms-sync.controller';
import { DmsOtService } from './dms-ot.service';
import { DmsOtController } from './dms-ot.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([DmsSnapshot, DmsAdvisorSlot, DmsOtRow, DmsSyncState]),
    ScheduleModule.forRoot(),
  ],
  providers: [DmsSyncService, DmsOtService],
  controllers: [DmsSyncController, DmsOtController],
  exports: [DmsSyncService, DmsOtService],
})
export class DmsSyncModule {}
