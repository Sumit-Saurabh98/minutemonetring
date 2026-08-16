import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { createHash, timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { LRUCache } from 'lru-cache';
import { RedisService } from '../../redis/redis.service';
import { PgService } from '../../db/pg.service';

export type ApiKeyContext = {
  keyId: string;
  projectId: string;
  orgId: string;
  planCode: string;
  eventsPerDay: number;
  retentionDays: number;
  keyHash: string;
};

export type AuthedRequest = Request & { apiKey?: ApiKeyContext };

const KEY_RE = /^mmt_live_([a-f0-9]{12})_[a-f0-9]{48}$/;
const REDIS_TTL_SECONDS = 86_400;

@Injectable()
export class AuthGuard implements CanActivate, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthGuard.name);

  private readonly lru = new LRUCache<string, ApiKeyContext>({
    max: 10_000,
    ttl: 60_000,
  });

  private subscriber?: Redis;
  constructor(
    private readonly redis: RedisService,
    private readonly pg: PgService,
  ) {}

  async onModuleInit() {
    this.subscriber = this.redis.raw.duplicate();
    await this.subscriber.connect();
    await this.subscriber.subscribe('bust:apikey');

    this.subscriber.on('message', (channel, prefix) => {
      if (channel !== 'bust:apikey') return;
      this.lru.delete(prefix);
      this.logger.log(`cache bust LRU prefix=${prefix}`);
    });
  }

  async onModuleDestroy() {
    await this.subscriber?.quit();
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();

    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException({ error: 'missing_api_key' });
    }

    const fullKey = header.slice(7).trim();
    const match = KEY_RE.exec(fullKey);
    if (!match) {
      throw new UnauthorizedException({ error: 'invalid_api_key' });
    }

    const prefix = match[1];
    const hash = createHash('sha256').update(fullKey).digest('hex');

    const found =
      this.fromLru(prefix) ??
      (await this.fromRedis(prefix)) ??
      (await this.fromPostgres(prefix));

    if (!found || !this.hashMatches(hash, found.keyHash)) {
      throw new UnauthorizedException({ error: 'invalid_api_key' });
    }

    req.apiKey = found;
    return true;
  }

  private fromLru(prefix: string): ApiKeyContext | undefined {
    return this.lru.get(prefix);
  }

  private async fromRedis(prefix: string): Promise<ApiKeyContext | undefined> {
    let raw: string | null;
    try {
      raw = await this.redis.raw.get(`apikey:${prefix}`);
    } catch (err) {
      this.logger.error(`redis lookup failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException({ error: 'auth_unavailable' });
    }

    if (!raw) return undefined;

    const ctx = JSON.parse(raw) as ApiKeyContext;
    this.lru.set(prefix, ctx);
    return ctx;
  }

  private async fromPostgres(
    prefix: string,
  ): Promise<ApiKeyContext | undefined> {
    const { rows } = await this.pg.query<{
      key_id: string;
      key_hash: string;
      project_id: string;
      org_id: string;
      plan_code: string;
      events_per_day: number;
      retention_days: number;
    }>(
      `SELECT k.id           AS key_id,
              k.key_hash     AS key_hash,
              p.id           AS project_id,
              o.id           AS org_id,
              pl.code        AS plan_code,
              pl.events_per_day,
              pl.retention_days
         FROM api_keys k
         JOIN projects p ON p.id = k.project_id
         JOIN orgs     o ON o.id = p.org_id
         JOIN plans   pl ON pl.id = o.plan_id
        WHERE k.key_prefix = $1
          AND k.status = 'active'
        LIMIT 1`,
      [prefix],
    );

    if (rows.length === 0) return undefined;

    const r = rows[0];
    const ctx: ApiKeyContext = {
      keyId: r.key_id,
      projectId: r.project_id,
      orgId: r.org_id,
      planCode: r.plan_code,
      eventsPerDay: r.events_per_day,
      retentionDays: r.retention_days,
      keyHash: r.key_hash,
    };

    this.lru.set(prefix, ctx);
    try {
      await this.redis.raw.setex(
        `apikey:${prefix}`,
        REDIS_TTL_SECONDS,
        JSON.stringify(ctx),
      );
    } catch (err) {
      this.logger.warn(`redis warm failed: ${(err as Error).message}`);
    }

    this.logger.log(`cache miss -> postgres for prefix ${prefix}`);
    return ctx;
  }

  private hashMatches(a: string, b: string): boolean {
    const ab = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    return ab.length === bb.length && timingSafeEqual(ab, bb);
  }
}
