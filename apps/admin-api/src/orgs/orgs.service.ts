import { Injectable, Logger } from "@nestjs/common";
import { PgService } from "../db/pg.service";

export type OrgRow = {
  id: string;
  name: string;
  role: string;
  created_at: string;
};

@Injectable()
export class OrgsService {
  private readonly logger = new Logger(OrgsService.name);

  constructor(private readonly pg: PgService) {}

  async createOrg(userId: string, name: string): Promise<{ id: string }> {
    const org = await this.pg.withTransaction(async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO orgs (name, plan_id)
         SELECT $1, id FROM plans WHERE code = 'free'
         RETURNING id`,
        [name],
      );

      await tx.query(
        `INSERT INTO org_members (org_id, user_id, role)
         VALUES ($1, $2, 'owner')`,
        [rows[0].id, userId],
      );

      return rows[0];
    });

    this.logger.log(`org created: ${org.id} by user ${userId}`);
    return org;
  }

  async listMyOrgs(userId: string): Promise<OrgRow[]> {
    const { rows } = await this.pg.query<OrgRow>(
      `SELECT o.id, o.name, m.role, o.created_at
         FROM org_members m
         JOIN orgs o ON o.id = m.org_id
        WHERE m.user_id = $1
        ORDER BY o.created_at`,
      [userId],
    );
    return rows;
  }
}
