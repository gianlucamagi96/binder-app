import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export type RateLimitRule = {
  // Prefisso della chiave Redis, es. "login".
  name: string;
  limit: number;
  windowSeconds: number;
  message: string;
};

export const RATE_LIMITS = {
  login: {
    name: 'login',
    limit: 10,
    windowSeconds: 15 * 60,
    message: 'Troppi tentativi di accesso. Riprova tra qualche minuto.',
  },
  forgotPassword: {
    name: 'forgot-password',
    limit: 3,
    windowSeconds: 60 * 60,
    message: 'Hai già richiesto il reset più volte. Controlla la posta o riprova tra un’ora.',
  },
  scan: {
    name: 'scan',
    limit: 30,
    windowSeconds: 10 * 60,
    message: 'Hai fatto molte scansioni di fila. Riprova tra qualche minuto.',
  },
  chat: {
    name: 'chat',
    limit: 30,
    windowSeconds: 10 * 60,
    message: 'Hai inviato molti messaggi di fila. Riprova tra qualche minuto.',
  },
} satisfies Record<string, RateLimitRule>;

// Le chiamate arrivano quasi tutte dal server Next, quindi l'IP sarebbe lo
// stesso per tutti: i limiti si contano per email o per utente.
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(private readonly redis: RedisService) {}

  async consume(rule: RateLimitRule, subject: string): Promise<void> {
    const key = `rate:${rule.name}:${subject.trim().toLowerCase()}`;
    let count: number;
    try {
      count = await this.redis.increment(key, rule.windowSeconds);
    } catch (error) {
      // Redis giù non deve impedire login e scansioni.
      this.logger.warn(`Rate limit non verificabile (${rule.name}): ${String(error)}`);
      return;
    }
    if (count > rule.limit) {
      throw new HttpException({ message: rule.message }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
