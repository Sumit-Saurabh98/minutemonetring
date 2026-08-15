import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PgService } from "../../db/pg.service";
import { SessionRequest } from "../../auth/guards/jwt-auth.guard";

@Injectable()
export class OrgMemberGuard implements CanActivate {
  constructor(private readonly pg: PgService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<SessionRequest>();
    const orgId = req.params.orgId as string;

    const { rows } = await this.pg.query<{ role: string }>(
      `SELECT role FROM org_members
        WHERE org_id = $1 AND user_id = $2`,
      [orgId, req.user.userId],
    );

    if (rows.length === 0) {
      throw new ForbiddenException({ error: "not_org_member" });
    }

    (req as SessionRequest & { orgRole: string }).orgRole = rows[0].role;
    return true;
  }
}
