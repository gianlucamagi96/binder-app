import { Module } from '@nestjs/common';
import { TcgGamesController } from './tcg-games.controller';
import { TcgGamesService } from './tcg-games.service';

@Module({
  controllers: [TcgGamesController],
  providers: [TcgGamesService],
  exports: [TcgGamesService],
})
export class TcgGamesModule {}
