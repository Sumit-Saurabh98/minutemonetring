import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NatsService } from './nats.service';
import { ClickhouseService } from './clickhouse.service';
import { ConsumerService } from './consumer.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
  ],
  providers: [NatsService, ClickhouseService, ConsumerService],
})
export class AppModule {}