import { Module } from '@nestjs/common';
import { LogsController } from './logs.controller';
import { NatsModule } from '../nats/nats.module';
import { RedisModule } from '../redis/redis.module';
import { PgModule } from '../db/pg.module';
import { AuthGuard } from './guards/auth.guard';
import { UsageGuard } from './guards/usage.guard';

@Module({
  imports: [NatsModule, RedisModule, PgModule],
  controllers: [LogsController],
  providers: [AuthGuard, UsageGuard],
})
export class LogsModule {}
