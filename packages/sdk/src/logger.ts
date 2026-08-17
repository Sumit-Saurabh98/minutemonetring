import { gzipSync } from "node:zlib";
import { v7 as uuidv7 } from "uuid";
import type { LogEventPayload, MmtSdkOptions } from "./types.js";

const DEFAULT_ENDPOINT = "http://localhost:3001";
const DEFAULT_BATCH = 50;
const DEFAULT_FLUSH_MS = 1000;
const DEFAULT_RETRIES = 5;
const DEFAULT_BASE_RETRY_MS = 250;

export class MmtLogger {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly maxBatchSize: number;
  private readonly flushIntervalMs: number;
  private readonly service?: string;
  private readonly env?: string;
  private readonly host?: string;
  private readonly gzip: boolean;
  private readonly maxRetries: number;
  private readonly baseRetryMs: number;

  private readonly queue: LogEventPayload[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  private closed = false;

  constructor(options: MmtSdkOptions) {
    if (!options.apiKey) throw new Error("apiKey is required");

    this.apiKey = options.apiKey;
    this.endpoint = (options.endpoint ?? DEFAULT_ENDPOINT).replace(/\/$/, "");
    this.maxBatchSize = options.maxBatchSize ?? DEFAULT_BATCH;
    this.flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_MS;
    this.service = options.service;
    this.env = options.env;
    this.host = options.host;
    this.gzip = options.gzip ?? true;
    this.maxRetries = options.maxRetries ?? DEFAULT_RETRIES;
    this.baseRetryMs = options.baseRetryMs ?? DEFAULT_BASE_RETRY_MS;
  }

  debug(message: string, attrs?: Record<string, unknown>) {
    this.log("debug", message, attrs);
  }

  info(message: string, attrs?: Record<string, unknown>) {
    this.log("info", message, attrs);
  }

  warn(message: string, attrs?: Record<string, unknown>) {
    this.log("warn", message, attrs);
  }

  error(message: string, attrs?: Record<string, unknown>) {
    this.log("error", message, attrs);
  }

  private log(
    level: LogEventPayload["level"],
    message: string,
    attrs?: Record<string, unknown>,
  ) {
    if (this.closed) return;

    const event: LogEventPayload = {
      eventId: uuidv7(),
      level,
      message,
      attrs,
      timestamp: new Date().toISOString(),
      service: this.service,
      host: this.host,
      env: this.env,
    };

    this.queue.push(event);

    if (this.queue.length >= this.maxBatchSize) {
      void this.flush();
      return;
    }

    this.scheduleFlush();
  }

  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return;

    this.flushing = true;

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const batch = this.queue.splice(0, this.maxBatchSize);

    try {
      const json = JSON.stringify({ events: batch });
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.apiKey}`,
      };

      let body: BodyInit = json;

      if (this.gzip) {
        body = gzipSync(Buffer.from(json, "utf8"));
        headers["Content-Type"] = "application/json+gzip";
        headers["Content-Encoding"] = "gzip";
      } else {
        headers["Content-Type"] = "application/json";
      }

      const res = await fetch(`${this.endpoint}/v1/logs`, {
        method: "POST",
        headers,
        body,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`ingest failed: HTTP ${res.status} ${text}`);
      }

      console.log(
        `[sdk] sent ${batch.length} events → HTTP ${res.status}${this.gzip ? " (gzip)" : ""}`,
      );
    } catch (err) {
      this.queue.unshift(...batch);
      console.error("[sdk] flush failed:", (err as Error).message);
      throw err;
    } finally {
      this.flushing = false;

      if (this.queue.length > 0) {
        this.scheduleFlush();
      }
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    while (this.queue.length > 0) {
      await this.flush();
    }
  }

  private scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.flushIntervalMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;

  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1000);
  }

  const dateMs = Date.parse(header);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return null;
}
