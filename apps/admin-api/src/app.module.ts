import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PgModule } from "./db/pg.module";
import { HealthController } from "./health/health.controller";
import { AuthModule } from "./auth/auth.module";
import { OrgsModule } from "./orgs/org.module";
import { ProjectsModule } from "./projects/project.module";
import { ApiKeysModule } from "./api-keys/api-keys.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    PgModule,
    AuthModule,
    OrgsModule,
    ProjectsModule,
    ApiKeysModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
