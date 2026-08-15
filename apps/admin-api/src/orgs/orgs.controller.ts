import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard, SessionRequest } from "../auth/guards/jwt-auth.guard";
import { CreateOrgDto } from "./dto/create-org.dto";
import { OrgsService } from "./orgs.service";

@Controller("v1/orgs")
@UseGuards(JwtAuthGuard)
export class OrgsController {
  constructor(private readonly orgs: OrgsService) {}

  @Post()
  async create(@Req() req: SessionRequest, @Body() dto: CreateOrgDto) {
    const org = await this.orgs.createOrg(req.user.userId, dto.name);
    return { id: org.id, name: dto.name };
  }

  @Get()
  async list(@Req() req: SessionRequest) {
    const orgs = await this.orgs.listMyOrgs(req.user.userId);
    return { orgs };
  }
}