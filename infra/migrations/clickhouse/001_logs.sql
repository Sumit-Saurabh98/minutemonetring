CREATE DATABASE IF NOT EXISTS meanutemonetring;

CREATE TABLE IF NOT EXISTS meanutemonetring.logs
(
  event_id UUID,
  project_id UUID,
  ingest_id UUID,
  level LowCardinality(String),
  message String,
  attrs String DEFAULT '{}',
  client_ts DateTime64(3, 'UTC'),
  received_at DateTime64(3, 'UTC'),
  service LowCardinality(String) DEFAULT '',
  host LowCardinality(String) DEFAULT '',
  env LowCardinality(String) DEFAULT ''
)
ENGINE = ReplacingMergeTree(received_at)
PARTITION BY toYYYYMMDD(received_at)
ORDER BY (project_id, event_id, received_at)
TTL toDateTime(received_at) + INTERVAL 90 DAY DELETE
SETTINGS index_granularity = 8192;

ALTER TABLE meanutemonetring.logs
  ADD INDEX IF NOT EXISTS idx_level level TYPE set(0) GRANULARITY 4,
  ADD INDEX IF NOT EXISTS idx_message message TYPE tokenbf_v1(32768, 3, 0) GRANULARITY 4,
  ADD INDEX IF NOT EXISTS idx_service service TYPE bloom_filter GRANULARITY 4;