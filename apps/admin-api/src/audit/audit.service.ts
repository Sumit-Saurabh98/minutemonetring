import { Injectable, Logger } from "@nestjs/common";
import { PgService } from "../db/pg.service";

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly pg: PgService) {}

  async log(params: {
    actorUserId: string;
    projectId: string;
    action: string;
    meta?: Record<string, unknown>;
  }): Promise<void> {
    await this.pg.query(
      `INSERT INTO audit_log (actor_user_id, project_id, action, meta)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [
        params.actorUserId,
        params.projectId,
        params.action,
        JSON.stringify(params.meta ?? {}),
      ],
    );

    this.logger.log(
      `audit ${params.action} project=${params.projectId} actor=${params.actorUserId}`,
    );
  }
}
