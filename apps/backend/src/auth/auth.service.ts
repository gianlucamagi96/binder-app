import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomUUID, createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MailService } from '../mail/mail.service';
import { RATE_LIMITS, RateLimitService } from '../rate-limit/rate-limit.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AccessPayload, RefreshPayload, SafeUser } from './types/jwt-payload.type';

const PASSWORD_SALT_ROUNDS = 10;
const ACCESS_TOKEN_EXPIRES_IN = '15m';
const REFRESH_TOKEN_EXPIRES_IN = '7d';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Finestra in cui il refresh token appena sostituito resta accettato: copre
// le richieste partite in parallelo con il token vecchio.
const ROTATION_GRACE_MS = 30 * 1000;
const RESET_TOKEN_EXPIRES_IN_MS = 60 * 60 * 1000; // 1 ora
const GOOGLE_CODE_TTL_SECONDS = 60;

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
    private readonly rateLimit: RateLimitService,
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

  private signAccessToken(user: { id: string; email: string }, sessionId: string): string {
    const payload: AccessPayload = { sub: user.id, email: user.email, sid: sessionId };
    return this.jwtService.sign(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
    });
  }

  // jwtid casuale: due refresh token emessi nello stesso secondo restano diversi.
  private signRefreshToken(userId: string, sessionId: string): string {
    const payload: RefreshPayload = { sub: userId, sid: sessionId };
    return this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: REFRESH_TOKEN_EXPIRES_IN,
      jwtid: randomUUID(),
    });
  }

  // Il refresh token è già un JWT firmato ad alta entropia: un hash veloce
  // (sha256) è sufficiente per verificarlo, senza il costo/limite a 72 byte di bcrypt.
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async startSession(user: { id: string; email: string }): Promise<AuthTokens> {
    const sessionId = randomUUID();
    const refreshToken = this.signRefreshToken(user.id, sessionId);
    const now = Date.now();
    await this.prisma.$transaction([
      this.prisma.session.deleteMany({
        where: { userId: user.id, expiresAt: { lt: new Date(now) } },
      }),
      this.prisma.session.create({
        data: {
          id: sessionId,
          userId: user.id,
          tokenHash: this.hashToken(refreshToken),
          expiresAt: new Date(now + SESSION_TTL_MS),
        },
      }),
    ]);
    return { accessToken: this.signAccessToken(user, sessionId), refreshToken };
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

    const tokens = await this.startSession(user);
    return { ...tokens, user: this.toSafeUser(user) };
  }

  async login(dto: LoginDto) {
    await this.rateLimit.consume(RATE_LIMITS.login, dto.email);

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

    const tokens = await this.startSession(user);
    return { ...tokens, user: this.toSafeUser(user) };
  }

  // Ogni refresh restituisce un nuovo refresh token e invalida il precedente.
  // Un token già sostituito usato fuori dalla finestra di tolleranza indica un
  // possibile furto: la sessione viene chiusa.
  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken?: string }> {
    let payload: RefreshPayload;
    try {
      payload = this.jwtService.verify<RefreshPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Refresh token non valido o scaduto');
    }

    const session = payload.sid
      ? await this.prisma.session.findUnique({
          where: { id: payload.sid },
          include: { user: { select: { id: true, email: true } } },
        })
      : null;

    if (!session || session.userId !== payload.sub || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Sessione non valida, effettua nuovamente il login');
    }

    const presentedHash = this.hashToken(refreshToken);
    const accessToken = this.signAccessToken(session.user, session.id);

    if (presentedHash === session.tokenHash) {
      const nextToken = this.signRefreshToken(session.userId, session.id);
      const now = new Date();
      const rotated = await this.prisma.session.updateMany({
        where: { id: session.id, tokenHash: presentedHash },
        data: {
          tokenHash: this.hashToken(nextToken),
          previousTokenHash: presentedHash,
          rotatedAt: now,
          lastUsedAt: now,
          expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
        },
      });
      // Se un'altra richiesta ha ruotato nel frattempo, il token presentato è
      // ora il "precedente": vale la stessa tolleranza qui sotto.
      if (rotated.count === 1) {
        return { accessToken, refreshToken: nextToken };
      }
      return { accessToken };
    }

    const withinGrace =
      presentedHash === session.previousTokenHash &&
      session.rotatedAt !== null &&
      Date.now() - session.rotatedAt.getTime() < ROTATION_GRACE_MS;
    if (withinGrace) {
      return { accessToken };
    }

    this.logger.warn(`Refresh token riusato per la sessione ${session.id}: sessione chiusa`);
    await this.prisma.session.deleteMany({ where: { id: session.id } });
    throw new UnauthorizedException('Sessione non valida, effettua nuovamente il login');
  }

  async logout(refreshToken: string) {
    try {
      const payload = this.jwtService.verify<RefreshPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
      if (payload.sid) {
        await this.prisma.session.deleteMany({
          where: { id: payload.sid, userId: payload.sub },
        });
      }
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

  // I token non viaggiano nell'URL del redirect: il frontend riceve un codice
  // monouso di breve durata e lo scambia con i token tramite una POST.
  async createGoogleLoginCode(user: { id: string; email: string }): Promise<string> {
    const tokens = await this.startSession(user);
    const code = randomBytes(32).toString('hex');
    await this.redis.setJSON(this.googleCodeKey(code), tokens, GOOGLE_CODE_TTL_SECONDS);
    return code;
  }

  async exchangeGoogleLoginCode(code: string): Promise<AuthTokens> {
    const tokens = await this.redis.takeJSON<AuthTokens>(this.googleCodeKey(code));
    if (!tokens) {
      throw new UnauthorizedException('Codice di accesso non valido o scaduto');
    }
    return tokens;
  }

  private googleCodeKey(code: string): string {
    return `auth:google-code:${this.hashToken(code)}`;
  }

  async forgotPassword(email: string) {
    const genericReply = { message: 'Se l\'email esiste, riceverai le istruzioni per il reset.' };
    await this.rateLimit.consume(RATE_LIMITS.forgotPassword, email);

    const user = await this.prisma.user.findUnique({ where: { email } });

    // Risposta generica in ogni caso, per non rivelare se l'email esiste.
    if (!user) {
      return genericReply;
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
    // Non si attende l'invio: i tempi di risposta non devono rivelare se l'email esiste.
    void this.mail.sendPasswordReset(user.email, resetLink).catch((error: unknown) => {
      this.logger.error(`Invio email di reset non riuscito: ${String(error)}`);
    });

    return genericReply;
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

    // Cambiare password chiude tutte le sessioni aperte, su ogni dispositivo.
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          passwordResetToken: null,
          passwordResetExpiresAt: null,
        },
      }),
      this.prisma.session.deleteMany({ where: { userId: user.id } }),
    ]);

    return { message: 'Password aggiornata con successo' };
  }
}
