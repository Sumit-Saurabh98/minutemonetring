import { Module } from "@nestjs/common";
import { PgModule } from "../db/pg.module";
import { AuthModule } from "../auth/auth.module";
import { OrgMemberGuard } from "../orgs/guards/org-member.guard";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";

@Module({
  imports: [PgModule, AuthModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, OrgMemberGuard],
})
export class ProjectsModule {}
