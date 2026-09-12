import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { AUTH_RATE_LIMIT, RATE_LIMIT_TTL_MS } from '../common/rate-limit';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { Env } from '../config/env.validation';
import type { PublicUser } from '../users/user.public';
import { signInSchema, signUpSchema } from './auth.contracts';
import type { SignInInput, SignUpInput } from './auth.contracts';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { REFRESH_COOKIE_NAME, refreshCookieOptions } from './refresh-cookie';

const SENSITIVE_RATE_LIMIT = { default: { limit: AUTH_RATE_LIMIT, ttl: RATE_LIMIT_TTL_MS } };

interface AuthResponse {
  user: PublicUser;
  accessToken: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Post('sign-up')
  @Throttle(SENSITIVE_RATE_LIMIT)
  @HttpCode(HttpStatus.CREATED)
  async signUp(
    @Body(new ZodValidationPipe(signUpSchema)) body: SignUpInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const session = await this.auth.signUp(body);
    this.setRefreshCookie(res, session.refreshToken);

    return { user: session.user, accessToken: session.accessToken };
  }

  @Post('sign-in')
  @Throttle(SENSITIVE_RATE_LIMIT)
  @HttpCode(HttpStatus.OK)
  async signIn(
    @Body(new ZodValidationPipe(signInSchema)) body: SignInInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const session = await this.auth.signIn(body);
    this.setRefreshCookie(res, session.refreshToken);

    return { user: session.user, accessToken: session.accessToken };
  }

  @Post('refresh')
  @Throttle(SENSITIVE_RATE_LIMIT)
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const result = await this.auth.refresh(this.readRefreshCookie(req));
    this.setRefreshCookie(res, result.refreshToken);

    return { accessToken: result.accessToken };
  }

  @Post('sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async signOut(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.signOut(this.readRefreshCookie(req));
    res.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions());
  }

  private readRefreshCookie(req: Request): string | undefined {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    return cookies?.[REFRESH_COOKIE_NAME];
  }

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE_NAME, token, this.cookieOptions());
  }

  private cookieOptions() {
    return refreshCookieOptions(this.config.get('NODE_ENV', { infer: true }) === 'production');
  }
}
