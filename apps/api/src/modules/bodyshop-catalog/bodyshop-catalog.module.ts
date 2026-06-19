import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BodyshopGroup } from './bodyshop-group.entity';
import { BodyshopProcess } from './bodyshop-process.entity';
import { BodyshopWorkGrade } from './bodyshop-grade.entity';
import { BodyshopPiece } from './bodyshop-piece.entity';
import { BodyshopCatalogService } from './bodyshop-catalog.service';
import { BodyshopCatalogController } from './bodyshop-catalog.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BodyshopGroup, BodyshopProcess, BodyshopWorkGrade, BodyshopPiece])],
  controllers: [BodyshopCatalogController],
  providers: [BodyshopCatalogService],
  exports: [TypeOrmModule],
})
export class BodyshopCatalogModule {}
