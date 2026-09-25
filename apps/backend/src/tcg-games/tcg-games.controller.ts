import { Controller, Get } from '@nestjs/common';
import { TcgGamesService } from './tcg-games.service';

@Controller('tcg-games')
export class TcgGamesController {
  constructor(private readonly tcgGamesService: TcgGamesService) {}

  @Get()
  findAll() {
    return this.tcgGamesService.findAll();
  }
}
