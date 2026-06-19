import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { DmsSnapshot } from './dms-snapshot.entity';
import { DmsAdvisorSlot } from './dms-advisor-slot.entity';
import { DmsSyncService } from './dms-sync.service';
import { DmsSyncController } from './dms-sync.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([DmsSnapshot, DmsAdvisorSlot]),
    ScheduleModule.forRoot(),
  ],
  providers: [DmsSyncService],
  controllers: [DmsSyncController],
  exports: [DmsSyncService],
})
export class DmsSyncModule {}
