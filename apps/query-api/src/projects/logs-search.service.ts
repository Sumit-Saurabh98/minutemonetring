import { BadRequestException, Injectable } from "@nestjs/common";
import { ClickhouseService } from "../clickhouse/clickhouse.service";
import { SearchLogsDto } from "./dto/search-logs.dto";

export type SearchLogsResult = {
  events: Array<{
    eventId: string;
    level: string;
    message: string;
    attrs: Record<string, unknown>;
    clientTs: string;
    receivedAt: string;
    service: string;
    host: string;
    env: string;
  }>;
  nextCursor?: { receivedAt: string; eventId: string };
};

@Injectable()
export class LogsSearchService {
  constructor(private readonly clickhouse: ClickhouseService) {}

  async search(projectId: string, dto: SearchLogsDto): Promise<SearchLogsResult> {
    const fromMs = Date.parse(dto.from);
    const toMs = Date.parse(dto.to);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) {
      throw new BadRequestException({ error: "invalid_time_range" });
    }

    const pageSize = dto.limit ?? 100;
    const rows = await this.clickhouse.searchLogs({
      projectId,
      from: dto.from,
      to: dto.to,
      levels: dto.levels,
      query: dto.query,
      service: dto.service,
      attrs: dto.attrs,
      limit: pageSize + 1,
      cursor: dto.cursor,
    });

    const hasMore = rows.length > pageSize;
    const page = hasMore ? rows.slice(0, pageSize) : rows;

    const events = page.map((row) => ({
      eventId: row.eventId,
      level: row.level,
      message: row.message,
      attrs: this.parseAttrs(row.attrs),
      clientTs: row.clientTs,
      receivedAt: row.receivedAt,
      service: row.service,
      host: row.host,
      env: row.env,
    }));

    const last = page[page.length - 1];
    return {
      events,
      nextCursor:
        hasMore && last
          ? { receivedAt: last.receivedAt, eventId: last.eventId }
          : undefined,
    };
  }

  private parseAttrs(raw: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // fall through
    }
    return {};
  }
}
