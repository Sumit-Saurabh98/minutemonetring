import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const url =
      this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6380';

    this.client = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 2,
      connectTimeout: 2000,
    });

    this.client.on('error', (e) =>
      this.logger.error(`redis error: ${e.message}`),
    );

    await this.client.connect();
    const pong = await this.client.ping();
    this.logger.log(`Redis connected (${pong})`);
  }

  async onModuleDestroy() {
    await this.client?.quit();
  }

  get raw(): Redis {
    return this.client;
  }
}
