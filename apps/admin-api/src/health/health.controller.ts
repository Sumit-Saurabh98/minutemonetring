import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { PgService } from "../db/pg.service";

@Controller("health")
export class HealthController {
  constructor(private readonly pg: PgService) {}

  @Get()
  async check() {
    try {
      await this.pg.query("SELECT 1");
    } catch {
      throw new ServiceUnavailableException({
        status: "degraded",
        postgres: "down",
      });
    }

    return { status: "ok", postgres: "up", service: "admin-api" };
  }
}
