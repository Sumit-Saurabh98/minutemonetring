import { Module } from "@nestjs/common";
import { PgModule } from "../db/pg.module";
import { AuthModule } from "../auth/auth.module";
import { ProjectMemberGuard } from "../projects/guards/project-member.guard";
import { ApiKeysController } from "./api-keys.controller";
import { ApiKeysService } from "./api-keys.service";
import { RedisModule } from "../redis/redis.module";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [PgModule, AuthModule, RedisModule, AuditModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService, ProjectMemberGuard],
})
export class ApiKeysModule {}
