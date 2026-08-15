import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard, SessionRequest } from "../auth/guards/jwt-auth.guard";
import { OrgMemberGuard } from "../orgs/guards/org-member.guard";
import { CreateProjectDto } from "./dto/create-project.dto";
import { ProjectsService } from "./projects.service";

@Controller("v1/orgs/:orgId/projects")
@UseGuards(JwtAuthGuard, OrgMemberGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  async create(
    @Param("orgId") orgId: string,
    @Req() req: SessionRequest,
    @Body() dto: CreateProjectDto,
  ) {
    const project = await this.projects.create(
      orgId,
      req.user.userId,
      dto.name,
      dto.slug,
    );
    return { id: project.id, name: dto.name, slug: dto.slug };
  }

  @Get()
  async list(@Param("orgId") orgId: string) {
    const projects = await this.projects.listForOrg(orgId);
    return { projects };
  }
}