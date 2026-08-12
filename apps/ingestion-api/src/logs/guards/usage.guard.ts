import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Response } from 'express';
import { RedisService } from '../../redis/redis.service';
import { AuthedRequest } from './auth.guard';

const USAGE_TTL_SECONDS = 172_800; // 48h

@Injectable()
export class UsageGuard implements CanActivate {
  private readonly logger = new Logger(UsageGuard.name);

  constructor(private readonly redis: RedisService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const res = ctx.switchToHttp().getResponse<Response>();

    const apiKey = req.apiKey!;
    const body = req.body as { events?: unknown[] } | undefined;
    const batchSize = Array.isArray(body?.events) ? body.events.length : 0;

    // Nothing countable — ValidationPipe will reject it in a moment
    if (batchSize === 0) return true;

    const day = new Date().toISOString().slice(0, 10);
    const key = `usage:${apiKey.projectId}:${day}`;
    const limit = apiKey.eventsPerDay;

    let count: number;
    try {
      count = await this.redis.raw.incrby(key, batchSize);
      if (count === batchSize) {
        await this.redis.raw.expire(key, USAGE_TTL_SECONDS);
      }
    } catch (err) {
      this.logger.error(`usage incr failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException({ error: 'usage_unavailable' });
    }

    if (count > limit) {
      await this.redis.raw.decrby(key, batchSize).catch(() => undefined);
      await this.redis.raw
        .incrby(`usage:rejected:${apiKey.projectId}:${day}`, batchSize)
        .catch(() => undefined);

      const retryAfter = this.secondsUntilUtcMidnight();
      res.setHeader('Retry-After', String(retryAfter));

      this.logger.warn(
        `hard limit hit project=${apiKey.projectId} plan=${apiKey.planCode} limit=${limit}`,
      );

      throw new HttpException(
        { error: 'usage_hard_limit', retryAfterSeconds: retryAfter },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    res.setHeader('X-Usage-Remaining', String(Math.max(0, limit - count)));
    return true;
  }

  private secondsUntilUtcMidnight(): number {
    const now = new Date();
    const nextMidnight = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
    );
    return Math.max(1, Math.ceil((nextMidnight - now.getTime()) / 1000));
  }
}
