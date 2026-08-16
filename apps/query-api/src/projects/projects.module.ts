import { Module } from "@nestjs/common";
import { PgModule } from "../db/pg.module";
import { AuthModule } from "../auth/auth.module";
import { ClickhouseModule } from "../clickhouse/clickhouse.module";
import { ProjectMemberGuard } from "./guards/project-member.guard";
import { LogsSearchService } from "./logs-search.service";
import { ProjectsController } from "./projects.controller";

@Module({
  imports: [PgModule, AuthModule, ClickhouseModule],
  controllers: [ProjectsController],
  providers: [ProjectMemberGuard, LogsSearchService],
})
export class ProjectsModule {}
