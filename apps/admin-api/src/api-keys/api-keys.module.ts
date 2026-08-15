import { Module } from "@nestjs/common";
import { PgModule } from "../db/pg.module";
import { AuthModule } from "../auth/auth.module";
import { ProjectMemberGuard } from "../projects/guards/project-member.guard";
import { ApiKeysController } from "./api-keys.controller";
import { ApiKeysService } from "./api-keys.service";

@Module({
  imports: [PgModule, AuthModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService, ProjectMemberGuard],
})
export class ApiKeysModule {}
