import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client = new Redis(
    process.env.REDIS_URL ?? 'redis://localhost:6379',
  );

  async getJSON<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setJSON(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  // Legge e cancella in un'unica operazione: un valore monouso non può
  // essere consumato due volte.
  async takeJSON<T>(key: string): Promise<T | null> {
    const raw = await this.client.getdel(key);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  // Incrementa un contatore che si azzera dopo ttlSeconds dal primo incremento.
  async increment(key: string, ttlSeconds: number): Promise<number> {
    const [[, count]] = (await this.client
      .multi()
      .incr(key)
      .expire(key, ttlSeconds, 'NX')
      .exec()) as [[Error | null, number], [Error | null, number]];
    return count;
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
