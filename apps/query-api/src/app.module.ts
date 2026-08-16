import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ProjectsModule } from "./projects/projects.module";
import { HealthController } from "./health/health.controller";
import { AuthModule } from "./auth/auth.module";
import { PgModule } from "./db/pg.module";


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    PgModule,
    AuthModule,
    ProjectsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
