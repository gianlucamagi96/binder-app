import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload, SafeUser } from './types/jwt-payload.type';

const PASSWORD_SALT_ROUNDS = 10;
const ACCESS_TOKEN_EXPIRES_IN = '15m';
const REFRESH_TOKEN_EXPIRES_IN = '7d';
const RESET_TOKEN_EXPIRES_IN_MS = 60 * 60 * 1000; // 1 ora

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private toSafeUser(user: {
    id: string;
    email: string;
    username: string;
    avatarUrl: string | null;
    activeTcgGameCode: string | null;
    createdAt: Date;
  }): SafeUser {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      avatarUrl: user.avatarUrl,
      activeTcgGameCode: user.activeTcgGameCode,
      createdAt: user.createdAt,
    };
  }

  private signTokens(payload: JwtPayload): AuthTokens {
    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: REFRESH_TOKEN_EXPIRES_IN,
    });
    return { accessToken, refreshToken };
  }

  // Il refresh token è già un JWT firmato ad alta entropia: un hash veloce
  // (sha256) è sufficiente per verificarlo, senza il costo/limite a 72 byte di bcrypt.
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async persistRefreshToken(userId: string, refreshToken: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { hashedRefreshToken: this.hashToken(refreshToken) },
    });
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
    });

    if (existing) {
      throw new ConflictException('Email o username già in uso');
    }

    const passwordHash = await bcrypt.hash(dto.password, PASSWORD_SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        passwordHash,
      },
    });

    const tokens = this.signTokens({ sub: user.id, email: user.email });
    await this.persistRefreshToken(user.id, tokens.refreshToken);

    return { ...tokens, user: this.toSafeUser(user) };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Credenziali non valide');
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Credenziali non valide');
    }

    const tokens = this.signTokens({ sub: user.id, email: user.email });
    await this.persistRefreshToken(user.id, tokens.refreshToken);

    return { ...tokens, user: this.toSafeUser(user) };
  }

  async refresh(refreshToken: string) {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Refresh token non valido o scaduto');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user?.hashedRefreshToken) {
      throw new UnauthorizedException('Sessione non valida, effettua nuovamente il login');
    }

    if (user.hashedRefreshToken !== this.hashToken(refreshToken)) {
      throw new UnauthorizedException('Refresh token non valido o scaduto');
    }

    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: ACCESS_TOKEN_EXPIRES_IN },
    );

    return { accessToken };
  }

  async logout(refreshToken: string) {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
      await this.prisma.user.update({
        where: { id: payload.sub },
        data: { hashedRefreshToken: null },
      });
    } catch {
      // Token già scaduto/non valido: la sessione è comunque da considerarsi chiusa.
    }

    return { success: true };
  }

  async validateGoogleUser(input: {
    googleId: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
  }) {
    let user = await this.prisma.user.findUnique({
      where: { googleId: input.googleId },
    });

    if (!user) {
      const existingByEmail = await this.prisma.user.findUnique({
        where: { email: input.email },
      });

      if (existingByEmail) {
        user = await this.prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            googleId: input.googleId,
            avatarUrl: existingByEmail.avatarUrl ?? input.avatarUrl,
          },
        });
      } else {
        const username = await this.generateUsernameFromEmail(input.email);
        user = await this.prisma.user.create({
          data: {
            email: input.email,
            username,
            googleId: input.googleId,
            avatarUrl: input.avatarUrl,
          },
        });
      }
    }

    return user;
  }

  private async generateUsernameFromEmail(email: string): Promise<string> {
    const base = email.split('@')[0].replace(/[^a-zA-Z0-9_.-]/g, '') || 'user';
    let candidate = base;
    let suffix = 0;

    while (await this.prisma.user.findUnique({ where: { username: candidate } })) {
      suffix += 1;
      candidate = `${base}${suffix}`;
    }

    return candidate;
  }

  async loginWithGoogleUser(user: { id: string; email: string }) {
    const tokens = this.signTokens({ sub: user.id, email: user.email });
    await this.persistRefreshToken(user.id, tokens.refreshToken);
    return tokens;
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Risposta generica in ogni caso, per non rivelare se l'email esiste.
    if (!user) {
      return { message: 'Se l\'email esiste, riceverai le istruzioni per il reset.' };
    }

    const rawToken = randomBytes(32).toString('hex');

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: this.hashToken(rawToken),
        passwordResetExpiresAt: new Date(Date.now() + RESET_TOKEN_EXPIRES_IN_MS),
      },
    });

    const resetLink = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/reset-password?token=${rawToken}`;
    // TODO: sostituire con un invio email reale quando sarà collegato un provider SMTP/transazionale.
    console.log(`[auth] Link di reset password per ${email}: ${resetLink}`);

    return { message: 'Se l\'email esiste, riceverai le istruzioni per il reset.' };
  }

  async resetPassword(token: string, newPassword: string) {
    const hashedToken = this.hashToken(token);

    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: hashedToken,
        passwordResetExpiresAt: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException('Token di reset non valido o scaduto');
    }

    const passwordHash = await bcrypt.hash(newPassword, PASSWORD_SALT_ROUNDS);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
        hashedRefreshToken: null,
      },
    });

    return { message: 'Password aggiornata con successo' };
  }
}
