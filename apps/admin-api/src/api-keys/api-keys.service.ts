import { Injectable, Logger } from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import { PgService } from "../db/pg.service";
import { NotFoundException } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";
import { AuditService } from "../audit/audit.service";

export type ApiKeyRow = {
  id: string;
  key_prefix: string;
  name: string;
  status: string;
  last_used_at: string | null;
  created_at: string;
};

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);

  constructor(
    private readonly pg: PgService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  async create(
    projectId: string,
    actorUserId: string,
    name: string,
  ): Promise<{ id: string; prefix: string; secret: string; name: string }> {
    const prefix = randomBytes(6).toString("hex");
    const secretPart = randomBytes(24).toString("hex");
    const secret = `mmt_live_${prefix}_${secretPart}`;
    const keyHash = createHash("sha256").update(secret).digest("hex");

    const id = await this.pg.withTransaction(async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO api_keys (project_id, key_prefix, key_hash, name)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
        [projectId, prefix, keyHash, name],
      );

      const keyId = rows[0].id;

      await tx.query(
        `INSERT INTO audit_log (actor_user_id, project_id, action, meta)
       VALUES ($1, $2, $3, $4::jsonb)`,
        [
          actorUserId,
          projectId,
          "api_key.created",
          JSON.stringify({
            keyId,
            name,
            prefix: `mmt_live_${prefix}`,
          }),
        ],
      );

      return keyId;
    });

    this.logger.log(`api key created: ${id} for project ${projectId}`);

    return {
      id,
      prefix: `mmt_live_${prefix}`,
      secret,
      name,
    };
  }

  async listForProject(projectId: string): Promise<
    Array<{
      id: string;
      prefix: string;
      name: string;
      status: string;
      last_used_at: string | null;
      created_at: string;
    }>
  > {
    const { rows } = await this.pg.query<ApiKeyRow>(
      `SELECT id, key_prefix, name, status, last_used_at, created_at
         FROM api_keys
        WHERE project_id = $1
        ORDER BY created_at`,
      [projectId],
    );

    return rows.map((r) => ({
      id: r.id,
      prefix: `mmt_live_${r.key_prefix}`,
      name: r.name,
      status: r.status,
      last_used_at: r.last_used_at,
      created_at: r.created_at,
    }));
  }

  async revoke(
    projectId: string,
    actorUserId: string,
    keyId: string,
  ): Promise<{ revoked: true }> {
    const prefix = await this.pg.withTransaction(async (tx) => {
      const { rows } = await tx.query<{ key_prefix: string }>(
        `UPDATE api_keys
          SET status = 'revoked'
        WHERE id = $1
          AND project_id = $2
          AND status = 'active'
        RETURNING key_prefix`,
        [keyId, projectId],
      );

      if (rows.length === 0) {
        throw new NotFoundException({ error: "key_not_found" });
      }

      const keyPrefix = rows[0].key_prefix;

      await tx.query(
        `INSERT INTO audit_log (actor_user_id, project_id, action, meta)
       VALUES ($1, $2, $3, $4::jsonb)`,
        [
          actorUserId,
          projectId,
          "api_key.revoked",
          JSON.stringify({
            keyId,
            prefix: `mmt_live_${keyPrefix}`,
          }),
        ],
      );

      return keyPrefix;
    });

    await this.redis.raw.del(`apikey:${prefix}`);
    await this.redis.raw.publish("bust:apikey", prefix);

    this.logger.log(`api key revoked: ${keyId} prefix ${prefix}`);
    return { revoked: true };
  }
}
