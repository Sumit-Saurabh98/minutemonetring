import {
  GatewayTimeoutException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ClickHouseClient, createClient } from "@clickhouse/client";

export type LogSearchRow = {
  eventId: string;
  level: string;
  message: string;
  attrs: string;
  clientTs: string;
  receivedAt: string;
  service: string;
  host: string;
  env: string;
};

export type SearchLogsParams = {
  projectId: string;
  from: string;
  to: string;
  levels?: string[];
  query?: string;
  service?: string;
  attrs?: Record<string, string>;
  limit: number;
  cursor?: { receivedAt: string; eventId: string };
};

const QUERY_TIMEOUT_SECONDS = 30;

@Injectable()
export class ClickhouseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ClickhouseService.name);
  private client!: ClickHouseClient;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.client = createClient({
      url: this.config.get<string>("CLICKHOUSE_URL") ?? "http://localhost:8123",
      username:
        this.config.get<string>("CLICKHOUSE_USER") ?? "meanutemonetring",
      password:
        this.config.get<string>("CLICKHOUSE_PASSWORD") ?? "meanutemonetring",
      database: this.config.get<string>("CLICKHOUSE_DB") ?? "meanutemonetring",
    });

    this.logger.log("ClickHouse client ready");
  }

  async onModuleDestroy() {
    await this.client?.close();
  }

  async searchLogs(params: SearchLogsParams): Promise<LogSearchRow[]> {
    const queryParams: Record<string, unknown> = {
      project_id: params.projectId,
      from: params.from,
      to: params.to,
      limit: params.limit,
      has_cursor: params.cursor ? 1 : 0,
      cursor_received_at: params.cursor?.receivedAt ?? "1970-01-01T00:00:00.000Z",
      cursor_event_id:
        params.cursor?.eventId ?? "00000000-0000-0000-0000-000000000000",
      has_levels: params.levels?.length ? 1 : 0,
      levels: params.levels ?? [],
      has_query: params.query ? 1 : 0,
      query: params.query ?? "",
      has_service: params.service ? 1 : 0,
      service: params.service ?? "",
    };

    const attrClauses: string[] = [];
    let attrIndex = 0;
    for (const [key, value] of Object.entries(params.attrs ?? {})) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) continue;
      const keyParam = `attr_key_${attrIndex}`;
      const valParam = `attr_val_${attrIndex}`;
      queryParams[keyParam] = key;
      queryParams[valParam] = value;
      attrClauses.push(
        `JSONExtractString(attrs, {${keyParam}:String}) = {${valParam}:String}`,
      );
      attrIndex++;
    }

    const attrsFilter =
      attrClauses.length > 0 ? `AND ${attrClauses.join(" AND ")}` : "";

    const sql = `
      SELECT
        event_id AS eventId,
        level,
        message,
        attrs,
        toString(client_ts) AS clientTs,
        toString(received_at) AS receivedAt,
        service,
        host,
        env
      FROM (
        SELECT *
        FROM logs
        WHERE project_id = {project_id:UUID}
          AND received_at >= parseDateTime64BestEffort({from:String}, 3, 'UTC')
          AND received_at <= parseDateTime64BestEffort({to:String}, 3, 'UTC')
          AND (
            {has_cursor:UInt8} = 0
            OR (received_at, event_id) < (
              parseDateTime64BestEffort({cursor_received_at:String}, 3, 'UTC'),
              toUUID({cursor_event_id:String})
            )
          )
          AND ({has_levels:UInt8} = 0 OR level IN {levels:Array(String)})
          AND ({has_query:UInt8} = 0 OR positionCaseInsensitive(message, {query:String}) > 0)
          AND ({has_service:UInt8} = 0 OR service = {service:String})
          ${attrsFilter}
        ORDER BY received_at DESC, event_id DESC
        LIMIT 1 BY event_id
      )
      ORDER BY receivedAt DESC, eventId DESC
      LIMIT {limit:UInt32}
    `;

    try {
      const result = await this.client.query({
        query: sql,
        query_params: queryParams,
        format: "JSONEachRow",
        clickhouse_settings: {
          max_execution_time: QUERY_TIMEOUT_SECONDS,
        },
      });

      return await result.json<LogSearchRow>();
    } catch (err) {
      const message = (err as Error).message ?? "";
      if (
        message.includes("TIMEOUT_EXCEEDED") ||
        message.includes("Timeout")
      ) {
        throw new GatewayTimeoutException({ error: "query_timeout" });
      }
      this.logger.error(`clickhouse search failed: ${message}`);
      throw err;
    }
  }
}
