import { MmtLogger } from "./logger.js";

export type {
  LogLevel,
  LogEventInput,
  LogEventPayload,
  MmtSdkOptions,
} from "./types.js";

export { MmtLogger };

export function createLogger(options: import("./types.js").MmtSdkOptions) {
  return new MmtLogger(options);
}
