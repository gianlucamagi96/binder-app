import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TcgGamesService } from '../tcg-games/tcg-games.service';
import { TcgGameStatus } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tcgGamesService: TcgGamesService,
  ) {}

  async setActiveTcgGame(userId: string, code: string) {
    const game = await this.tcgGamesService.findByCode(code);

    if (!game) {
      throw new NotFoundException('Gioco non trovato');
    }

    if (game.status !== TcgGameStatus.ACTIVE) {
      throw new BadRequestException('Questo gioco non è ancora disponibile');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { activeTcgGameCode: game.code },
    });

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      avatarUrl: user.avatarUrl,
      activeTcgGameCode: user.activeTcgGameCode,
      createdAt: user.createdAt,
    };
  }
}
