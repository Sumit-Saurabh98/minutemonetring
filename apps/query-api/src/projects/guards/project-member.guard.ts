import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { PgService } from "../../db/pg.service";
import { SessionRequest } from "../../auth/guards/jwt-auth.guard";

@Injectable()
export class ProjectMemberGuard implements CanActivate {
  constructor(private readonly pg: PgService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<SessionRequest>();
    const projectId = req.params.projectId as string;

    const { rows } = await this.pg.query<{ role: string }>(
      `SELECT role FROM project_members
        WHERE project_id = $1 AND user_id = $2`,
      [projectId, req.user.userId],
    );

    if (rows.length === 0) {
      throw new ForbiddenException({ error: "not_project_member" });
    }

    (req as SessionRequest & { projectRole: string }).projectRole =
      rows[0].role;
    return true;
  }
}
