import { createLogger } from "./dist/index.js";

const apiKey = process.env.MMT_API_KEY;
if (!apiKey) {
  console.error("Set MMT_API_KEY env var first");
  process.exit(1);
}

const logger = createLogger({
  apiKey,
  endpoint: process.env.MMT_ENDPOINT ?? "http://localhost:3001",
  service: "sdk-test",
  env: "dev",
  gzip: true,
});

logger.info("hello from sdk gzip", { foo: "bar" });
logger.info("second log");
logger.warn("third log");

await logger.close();
console.log("done");
