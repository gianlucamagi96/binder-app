import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { CatalogModule } from '../catalog/catalog.module';
import { ScansController } from './scans.controller';
import { ScansService } from './scans.service';

@Module({
  imports: [CatalogModule, PassportModule.register({})],
  controllers: [ScansController],
  providers: [ScansService],
})
export class ScansModule {}
