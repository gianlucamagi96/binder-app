import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { MailService } from '../mail/mail.service';
import type { RateLimitService } from '../rate-limit/rate-limit.service';

type SessionRow = {
  id: string;
  userId: string;
  tokenHash: string;
  previousTokenHash: string | null;
  rotatedAt: Date | null;
  expiresAt: Date;
};

const USER = { id: 'user-1', email: 'ash@example.com' };

// Prisma finto in memoria: copre solo le operazioni sulle sessioni usate da
// login, refresh e logout.
function fakePrisma() {
  const sessions = new Map<string, SessionRow>();
  const session = {
    deleteMany: ({ where }: { where: { id?: string; userId?: string; expiresAt?: { lt: Date } } }) => {
      for (const row of sessions.values()) {
        const matches =
          (where.id === undefined || row.id === where.id) &&
          (where.userId === undefined || row.userId === where.userId) &&
          (where.expiresAt === undefined || row.expiresAt < where.expiresAt.lt);
        if (matches) sessions.delete(row.id);
      }
      return Promise.resolve({ count: 0 });
    },
    create: ({ data }: { data: Omit<SessionRow, 'previousTokenHash' | 'rotatedAt'> }) => {
      sessions.set(data.id, { ...data, previousTokenHash: null, rotatedAt: null });
      return Promise.resolve(data);
    },
    findUnique: ({ where }: { where: { id: string } }) => {
      const row = sessions.get(where.id);
      return Promise.resolve(row ? { ...row, user: USER } : null);
    },
    updateMany: ({ where, data }: { where: { id: string; tokenHash: string }; data: Partial<SessionRow> }) => {
      const row = sessions.get(where.id);
      if (!row || row.tokenHash !== where.tokenHash) return Promise.resolve({ count: 0 });
      Object.assign(row, data);
      return Promise.resolve({ count: 1 });
    },
  };
  const prisma = {
    session,
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
    user: {
      findUnique: () => Promise.resolve({ ...USER, passwordHash: null }),
    },
  };
  return { prisma, sessions };
}

describe('AuthService.refresh', () => {
  let service: AuthService;
  let sessions: Map<string, SessionRow>;

  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-access';
    process.env.JWT_REFRESH_SECRET = 'test-refresh';
  });

  beforeEach(() => {
    const fake = fakePrisma();
    sessions = fake.sessions;
    service = new AuthService(
      fake.prisma as unknown as PrismaService,
      new JwtService({}),
      {} as RedisService,
      {} as MailService,
      { consume: () => Promise.resolve() } as unknown as RateLimitService,
    );
  });

  function login() {
    return (service as unknown as {
      startSession: (user: typeof USER) => Promise<{ accessToken: string; refreshToken: string }>;
    }).startSession(USER);
  }

  it('ruota il refresh token a ogni uso', async () => {
    const { refreshToken } = await login();
    const first = await service.refresh(refreshToken);

    expect(first.accessToken).toBeTruthy();
    expect(first.refreshToken).toBeTruthy();
    expect(first.refreshToken).not.toBe(refreshToken);

    const second = await service.refresh(first.refreshToken!);
    expect(second.refreshToken).toBeTruthy();
  });

  it('tiene due dispositivi collegati in parallelo', async () => {
    const phone = await login();
    const desktop = await login();

    await expect(service.refresh(phone.refreshToken)).resolves.toHaveProperty('accessToken');
    await expect(service.refresh(desktop.refreshToken)).resolves.toHaveProperty('accessToken');
    expect(sessions.size).toBe(2);
  });

  it('accetta il token appena sostituito per una richiesta parallela, senza ruotarlo di nuovo', async () => {
    const { refreshToken } = await login();
    await service.refresh(refreshToken);

    const parallel = await service.refresh(refreshToken);
    expect(parallel.accessToken).toBeTruthy();
    expect(parallel.refreshToken).toBeUndefined();
    expect(sessions.size).toBe(1);
  });

  it('chiude la sessione se un token sostituito viene riusato dopo la finestra di tolleranza', async () => {
    const { refreshToken } = await login();
    await service.refresh(refreshToken);
    const [row] = sessions.values();
    row.rotatedAt = new Date(Date.now() - 60_000);

    await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessions.size).toBe(0);
  });

  it('dopo il logout il refresh token non vale più', async () => {
    const { refreshToken } = await login();
    await service.logout(refreshToken);

    await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
