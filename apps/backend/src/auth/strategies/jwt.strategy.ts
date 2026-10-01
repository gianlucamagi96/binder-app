import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessPayload, SafeUser } from '../types/jwt-payload.type';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET as string,
    });
  }

  // Controllare la sessione rende immediati logout e reset password, anche se
  // l'access token non è ancora scaduto.
  async validate(payload: AccessPayload): Promise<SafeUser> {
    const session = payload.sid
      ? await this.prisma.session.findUnique({
          where: { id: payload.sid },
          include: { user: true },
        })
      : null;

    if (!session || session.userId !== payload.sub || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Sessione non valida');
    }

    const { user } = session;

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
