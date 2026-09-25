import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { BindersController } from './binders.controller';
import { BindersService } from './binders.service';
import { CatalogModule } from '../catalog/catalog.module';

@Module({
  imports: [CatalogModule, PassportModule.register({})],
  controllers: [BindersController],
  providers: [BindersService],
  exports: [BindersService],
})
export class BindersModule {}
