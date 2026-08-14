import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { PubAck } from 'nats';
import { IngestLogsDto } from './dto/ingest-logs.dto';
import { NatsService } from '../nats/nats.service';
import { AuthGuard } from './guards/auth.guard';
import type { AuthedRequest } from './guards/auth.guard';
import { UsageGuard } from './guards/usage.guard';
import { SchemaGuard } from './guards/schema.guard';

@Controller('v1/logs')
@UseGuards(SchemaGuard, AuthGuard, UsageGuard)
export class LogsController {
  private readonly logger = new Logger(LogsController.name);

  constructor(private readonly nats: NatsService) {}

  @Post()
  @HttpCode(202)
  async create(@Body() body: IngestLogsDto, @Req() req: AuthedRequest) {
    // AuthGuard guarantees this is set, or the request never reached here
    const { projectId, planCode } = req.apiKey!;

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
      `published seq=${ack.seq} events=${envelope.events.length} project=${projectId} plan=${planCode} ingestId=${ingestId}`,
    );

    return { accepted: envelope.events.length, ingestId };
  }
}
