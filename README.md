# Meanutemonetring

Production system design for a high-volume logging SaaS: SDK → NestJS ingest → NATS JetStream → workers → ClickHouse, with Postgres metadata, Redis+LRU validation cache, hybrid alerting, and JWT-authenticated query/SSE.

## Design docs

| Area | Path |
|------|------|
| Architecture (source of truth) | [docs/architecture/overview.md](docs/architecture/overview.md) |
| ADRs | [docs/adr/](docs/adr/) |
| Data schemas | [docs/schemas/](docs/schemas/) |
| API contracts | [docs/api/](docs/api/) |
| Sequence diagrams | [docs/sequences/](docs/sequences/) |
| Failure modes & capacity | [docs/operations/](docs/operations/) |
| Build phases P0–P3 | [docs/phases/](docs/phases/) |

## Locked decisions

- **Alerting:** hybrid (NATS realtime + ClickHouse aggregates)
- **Delivery:** at-least-once ingest with idempotent ClickHouse writes (`event_id`)
- **Auth:** API keys for ingest; JWT sessions for dashboard / Query / SSE
- **Usage:** Redis atomic counters (fast path); Postgres ledger via periodic settle
- **Isolation:** ClickHouse ordered by `project_id`; Query API injects tenant filter
- **Edge:** Cloudflare TLS + WAF + edge rate limit

## Build order

1. [P0 Foundation](docs/phases/p0-foundation.md)
2. [P1 Reliability](docs/phases/p1-reliability.md)
3. [P2 Alerting](docs/phases/p2-alerting.md)
4. [P3 Hardening](docs/phases/p3-hardening.md)
