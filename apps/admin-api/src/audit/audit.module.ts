import { Module } from "@nestjs/common";
import { PgModule } from "../db/pg.module";
import { AuditService } from "./audit.service";

@Module({
  imports: [PgModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}