import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClickHouseClient, createClient } from '@clickhouse/client';

export type LogRow = {
  event_id: string;
  project_id: string;
  ingest_id: string;
  level: string;
  message: string;
  attrs: string;
  client_ts: string;
  received_at: string;
  service: string;
  host: string;
  env: string;
};

@Injectable()
export class ClickhouseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ClickhouseService.name);
  private client!: ClickHouseClient;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.client = createClient({
      url: this.config.get<string>('CLICKHOUSE_URL'),
      username: this.config.get<string>('CLICKHOUSE_USER'),
      password: this.config.get<string>('CLICKHOUSE_PASSWORD'),
      database: this.config.get<string>('CLICKHOUSE_DB'),
      clickhouse_settings: {
        date_time_input_format: 'best_effort',
        async_insert: 1,
        wait_for_async_insert: 1,
      },
    });

    this.logger.log('ClickHouse client ready');
  }

  async onModuleDestroy() {
    await this.client?.close();
  }

  async insertLogs(rows: LogRow[]) {
    await this.client.insert({
      table: 'logs',
      values: rows,
      format: 'JSONEachRow',
    });
  }
}