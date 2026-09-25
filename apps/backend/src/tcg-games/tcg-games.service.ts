import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TcgGamesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.tcgGame.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  findByCode(code: string) {
    return this.prisma.tcgGame.findUnique({ where: { code } });
  }
}
