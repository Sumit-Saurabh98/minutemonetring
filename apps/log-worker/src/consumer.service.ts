import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { JsMsg } from "nats";
import { NatsService } from "./nats.service";
import { ClickhouseService, LogRow } from "./clickhouse.service";

export type IngestEvent = {
  eventId: string;
  level: string;
  message: string;
  attrs: Record<string, unknown>;
  clientTs: string;
  service: string;
  host: string;
  env: string;
};

export type IngestEnvelope = {
  ingestId: string;
  projectId: string;
  receivedAt: string;
  events: IngestEvent[];
};

const MAX_BACKOFF_MS = 30_000;

@Injectable()
export class ConsumerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ConsumerService.name);
  private running = false;

  constructor(
    private readonly nats: NatsService,
    private readonly ch: ClickhouseService,
  ) {}

  onApplicationBootstrap() {
    this.running = true;
    void this.loop();
  }

  onModuleDestroy() {
    this.running = false;
  }

  private backoffFor(msg: JsMsg): number {
    const attempt = msg.info.redeliveryCount;
    return Math.min(1000 * Math.pow(2, attempt - 1), MAX_BACKOFF_MS);
  }

  private toRows(batch: { msg: JsMsg; envelope: IngestEnvelope }[]): LogRow[] {
    return batch.flatMap(({ envelope }) =>
      envelope.events.map((e) => ({
        event_id: e.eventId,
        project_id: envelope.projectId,
        ingest_id: envelope.ingestId,
        level: e.level,
        message: e.message,
        attrs: JSON.stringify(e.attrs ?? {}),
        client_ts: e.clientTs,
        received_at: envelope.receivedAt,
        service: e.service ?? "",
        host: e.host ?? "",
        env: e.env ?? "",
      })),
    );
  }

  private async loop() {
    const consumer = await this.nats
      .jetstream()
      .consumers.get("LOGS", "log-writers");

    this.logger.log("bound to LOGS / log-writers");

    while (this.running) {
      let batch: { msg: JsMsg; envelope: IngestEnvelope }[] = [];

      try {
        const messages = await consumer.fetch({
          max_messages: 500,
          expires: 1000,
        });

        for await (const m of messages) {
          batch.push({
            msg: m,
            envelope: this.nats.codec.decode(m.data) as IngestEnvelope,
          });
        }
      } catch (err) {
        this.logger.error(`fetch failed: ${(err as Error).message}`);
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      if (batch.length === 0) continue;

      try {
        const rows = this.toRows(batch);

        const started = Date.now();
        await this.ch.insertLogs(rows);
        const took = Date.now() - started;

        for (const b of batch) b.msg.ack();

        this.logger.log(
          `inserted ${rows.length} rows from ${batch.length} messages in ${took}ms`,
        );
      } catch (err) {
        const delay = this.backoffFor(batch[0].msg);

        this.logger.error(
          `insert failed for ${batch.length} messages, nak with ${delay}ms delay (attempt ${batch[0].msg.info.redeliveryCount}): ${(err as Error).message}`,
        );

        for (const b of batch) b.msg.nak(delay);
      }
    }
  }
}
