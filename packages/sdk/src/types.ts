export type LogLevel = "debug" | "info" | "warn" | "error";

/** What the caller passes in */
export type LogEventInput = {
  eventId?: string;
  level: LogLevel;
  message: string;
  attrs?: Record<string, unknown>;
  timestamp?: string;
  service?: string;
  host?: string;
  env?: string;
};

/** What we actually send — eventId required */
export type LogEventPayload = LogEventInput & {
  eventId: string;
};

/** SDK constructor options */
export type MmtSdkOptions = {
  apiKey: string;
  endpoint?: string;
  service?: string;
  env?: string;
  host?: string;
  maxBatchSize?: number;
  flushIntervalMs?: number;
  gzip?: boolean;
  maxRetries?: number;
  baseRetryMs?: number;
};
