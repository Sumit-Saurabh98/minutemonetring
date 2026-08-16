import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ProjectMemberGuard } from "../projects/guards/project-member.guard";
import { ApiKeysService } from "./api-keys.service";
import { CreateApiKeyDto } from "./dto/create-api-key.dto";
import { Req } from "@nestjs/common";
import { SessionRequest } from "../auth/guards/jwt-auth.guard";

@Controller("v1/projects/:projectId/api-keys")
@UseGuards(JwtAuthGuard, ProjectMemberGuard)
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Post()
  async create(
    @Param("projectId") projectId: string,
    @Req() req: SessionRequest,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.apiKeys.create(projectId, req.user.userId, dto.name);
  }

  @Get()
  async list(@Param("projectId") projectId: string) {
    const keys = await this.apiKeys.listForProject(projectId);
    return { keys };
  }

  @Post(":keyId/revoke")
  async revoke(
    @Param("projectId") projectId: string,
    @Param("keyId") keyId: string,
    @Req() req: SessionRequest,
  ) {
    return this.apiKeys.revoke(projectId, req.user.userId, keyId);
  }
}
