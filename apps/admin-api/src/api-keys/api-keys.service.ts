import { Injectable, Logger } from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import { PgService } from "../db/pg.service";

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

  constructor(private readonly pg: PgService) {}

  async create(
    projectId: string,
    name: string,
  ): Promise<{ id: string; prefix: string; secret: string; name: string }> {
    const prefix = randomBytes(6).toString("hex");
    const secretPart = randomBytes(24).toString("hex");
    const secret = `mmt_live_${prefix}_${secretPart}`;
    const keyHash = createHash("sha256").update(secret).digest("hex");

    const { rows } = await this.pg.query<{ id: string }>(
      `INSERT INTO api_keys (project_id, key_prefix, key_hash, name)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [projectId, prefix, keyHash, name],
    );

    const id = rows[0].id;
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
}
