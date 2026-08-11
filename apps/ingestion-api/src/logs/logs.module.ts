import { Module } from '@nestjs/common';
import { LogsController } from './logs.controller';
import { NatsModule } from '../nats/nats.module';
import { RedisModule } from '../redis/redis.module';
import { PgModule } from '../db/pg.module';

@Module({
  imports: [NatsModule, RedisModule, PgModule],
  controllers: [LogsController],
})
export class LogsModule {}
