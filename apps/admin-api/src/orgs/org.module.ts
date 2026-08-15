import { Module } from "@nestjs/common";
import { PgModule } from "../db/pg.module";
import { AuthModule } from "../auth/auth.module";
import { OrgsController } from "./orgs.controller";
import { OrgsService } from "./orgs.service";

@Module({
  imports: [PgModule, AuthModule],
  controllers: [OrgsController],
  providers: [OrgsService],
})
export class OrgsModule {}
