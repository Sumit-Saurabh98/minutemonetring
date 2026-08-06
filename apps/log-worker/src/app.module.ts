import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NatsService } from './nats.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
  ],
  providers: [NatsService],
})
export class AppModule {}