import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, JetStreamClient, JSONCodec, NatsConnection } from 'nats';

@Injectable()
export class NatsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NatsService.name);
  private nc!: NatsConnection;
  private js!: JetStreamClient;

  readonly codec = JSONCodec();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const servers =
      this.config.get<string>('NATS_URL') ?? 'nats://localhost:4222';

    this.nc = await connect({
      servers,
      name: 'ingestion-api',
      maxReconnectAttempts: -1,
      reconnectTimeWait: 500,
    });

    this.js = this.nc.jetstream();
    this.logger.log(`NATS connected: ${this.nc.getServer()}`);

    void (async () => {
      for await (const s of this.nc.status()) {
        this.logger.warn(`NATS status: ${s.type}`);
      }
    })();
  }

  async onModuleDestroy() {
    await this.nc?.drain();
    this.logger.log('NATS drained');
  }

  jetstream(): JetStreamClient {
    return this.js;
  }
}
