import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, QueryResultRow } from 'pg';

@Injectable()
export class PgService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PgService.name);
  private pool!: Pool;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.pool = new Pool({
      connectionString: this.config.get<string>('DATABASE_URL'),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    const { rows } = await this.pool.query<{ ok: number }>('SELECT 1 AS ok');
    this.logger.log(`Postgres connected (ok=${rows[0].ok})`);
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }

  query<T extends QueryResultRow>(text: string, params?: unknown[]) {
    return this.pool.query<T>(text, params);
  }
}
