import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { TcgdexService } from './tcgdex.service';

@Module({
  controllers: [CatalogController],
  providers: [TcgdexService],
  exports: [TcgdexService],
})
export class CatalogModule {}
