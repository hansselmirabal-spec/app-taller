import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkType } from './work-type.entity';
import { WorkTypesService } from './work-types.service';
import { WorkTypesController } from './work-types.controller';

@Module({
  imports: [TypeOrmModule.forFeature([WorkType])],
  providers: [WorkTypesService],
  controllers: [WorkTypesController],
  exports: [WorkTypesService],
})
export class WorkTypesModule {}
