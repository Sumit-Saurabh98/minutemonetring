import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { PgService } from "../db/pg.service";

export type ProjectRow = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
};

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(private readonly pg: PgService) {}

  async create(
    orgId: string,
    userId: string,
    name: string,
    slug: string,
  ): Promise<{ id: string }> {
    try {
      const project = await this.pg.withTransaction(async (tx) => {
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO projects (org_id, name, slug)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [orgId, name, slug],
        );

        await tx.query(
          `INSERT INTO project_members (project_id, user_id, role)
           VALUES ($1, $2, 'admin')`,
          [rows[0].id, userId],
        );

        return rows[0];
      });

      this.logger.log(`project created: ${project.id} in org ${orgId}`);
      return project;
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        throw new ConflictException({ error: "slug_taken" });
      }
      throw err;
    }
  }

  async listForOrg(orgId: string): Promise<ProjectRow[]> {
    const { rows } = await this.pg.query<ProjectRow>(
      `SELECT id, name, slug, created_at
         FROM projects
        WHERE org_id = $1
        ORDER BY created_at`,
      [orgId],
    );
    return rows;
  }
}
