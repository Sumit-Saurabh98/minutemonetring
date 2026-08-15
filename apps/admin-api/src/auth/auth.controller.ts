import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { LoginDto, RegisterDto } from "./dto/register.dto";
import { JwtAuthGuard, SessionRequest } from "./guards/jwt-auth.guard";

const REFRESH_COOKIE = "mmt_refresh";
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

@Controller("v1/auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  async register(@Body() dto: RegisterDto) {
    const user = await this.auth.register(dto.email, dto.password);
    return { id: user.id };
  }

  @Post("login")
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.auth.login(dto.email, dto.password);
    const tokens = await this.auth.issueTokens(user);

    this.setRefreshCookie(res, tokens.refreshToken);
    return {
      accessToken: tokens.accessToken,
      user: { id: user.id, email: user.email },
    };
  }

  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = (req.cookies as Record<string, string>)?.[REFRESH_COOKIE];
    if (!raw) {
      throw new UnauthorizedException({ error: "missing_refresh" });
    }

    const tokens = await this.auth.rotateRefresh(raw);
    this.setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  @Post("logout")
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = (req.cookies as Record<string, string>)?.[REFRESH_COOKIE];
    if (raw) {
      await this.auth.revokeRefresh(raw);
    }

    res.clearCookie(REFRESH_COOKIE, { path: "/v1/auth" });
    return { ok: true };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@Req() req: SessionRequest) {
    return req.user;
  }

  private setRefreshCookie(res: Response, token: string) {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false, // TODO(P3): true behind TLS
      path: "/v1/auth",
      maxAge: REFRESH_MAX_AGE_MS,
    });
  }
}
