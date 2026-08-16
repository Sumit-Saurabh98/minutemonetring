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
import { ProjectMemberGuard } from "./guards/project-member.guard";
import { SearchLogsDto } from "./dto/search-logs.dto";
import { LogsSearchService } from "./logs-search.service";

type ProjectSessionRequest = SessionRequest & { projectRole: string };

@Controller("v1/projects/:projectId")
@UseGuards(JwtAuthGuard, ProjectMemberGuard)
export class ProjectsController {
  constructor(private readonly logsSearch: LogsSearchService) {}

  @Get("access")
  access(@Param("projectId") projectId: string, @Req() req: ProjectSessionRequest) {
    return {
      projectId,
      userId: req.user.userId,
      role: req.projectRole,
    };
  }

  @Post("logs/search")
  async searchLogs(
    @Param("projectId") projectId: string,
    @Body() dto: SearchLogsDto,
  ) {
    return this.logsSearch.search(projectId, dto);
  }
}
