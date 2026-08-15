import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ProjectMemberGuard } from "../projects/guards/project-member.guard";
import { ApiKeysService } from "./api-keys.service";
import { CreateApiKeyDto } from "./dto/create-api-key.dto";

@Controller("v1/projects/:projectId/api-keys")
@UseGuards(JwtAuthGuard, ProjectMemberGuard)
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Post()
  async create(
    @Param("projectId") projectId: string,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.apiKeys.create(projectId, dto.name);
  }

  @Get()
  async list(@Param("projectId") projectId: string) {
    const keys = await this.apiKeys.listForProject(projectId);
    return { keys };
  }
}
