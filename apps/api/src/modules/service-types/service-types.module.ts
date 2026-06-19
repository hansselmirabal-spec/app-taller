import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceType } from './service-type.entity';
import { ServiceTypesService } from './service-types.service';
import { ServiceTypesController } from './service-types.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceType])],
  providers: [ServiceTypesService],
  controllers: [ServiceTypesController],
  exports: [ServiceTypesService],
})
export class ServiceTypesModule {}
