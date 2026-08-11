import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { type PubAck } from 'nats';
import { IngestLogsDto } from './dto/ingest-logs.dto';
import { NatsService } from '../nats/nats.service';

@Controller('v1/logs')
export class LogsController {
  private readonly logger = new Logger(LogsController.name);

  constructor(
    private readonly nats: NatsService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @HttpCode(202)
  async create(@Body() body: IngestLogsDto) {
    // TODO(M2): projectId will come from AuthGuard, not from .env
    const projectId = this.config.get<string>('DEV_PROJECT_ID')!;

    const ingestId = randomUUID();
    const receivedAt = new Date().toISOString();

    const envelope = {
      ingestId,
      projectId,
      receivedAt,
      events: body.events.map((e) => ({
        eventId: e.eventId,
        level: e.level,
        message: e.message,
        attrs: e.attrs ?? {},
        clientTs: e.timestamp ?? receivedAt,
        service: e.service ?? '',
        host: e.host ?? '',
        env: e.env ?? '',
      })),
    };

    let ack: PubAck;

    try {
      ack = await this.nats
        .jetstream()
        .publish(`logs.ingest.${projectId}`, this.nats.codec.encode(envelope), {
          timeout: 2000,
        });
    } catch (err) {
      this.logger.error(
        `publish failed ingestId=${ingestId} project=${projectId}: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException({
        error: 'ingest_unavailable',
        retryAfterSeconds: 5,
      });
    }

    this.logger.log(
      `published seq=${ack.seq} events=${envelope.events.length} ingestId=${ingestId}`,
    );

    return { accepted: envelope.events.length, ingestId };
  }
}
