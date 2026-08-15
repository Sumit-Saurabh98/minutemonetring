import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PgModule } from "./db/pg.module";
import { HealthController } from "./health/health.controller";
import { AuthModule } from "./auth/auth.module";
import { OrgsModule } from "./orgs/org.module";
import { ProjectsModule } from "./projects/project.module";

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
  ],
  controllers: [HealthController],
})
export class AppModule {}
