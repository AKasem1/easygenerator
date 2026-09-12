import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { ApiErrorDto } from '../common/dto/api-error.dto';
import { AUTH_RATE_LIMIT, RATE_LIMIT_TTL_MS } from '../common/rate-limit';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { Env } from '../config/env.validation';
import type { PublicUser } from '../users/user.public';
import { signInSchema, signUpSchema } from './auth.contracts';
import type { SignInInput, SignUpInput } from './auth.contracts';
import { AuthService } from './auth.service';
import {
  AuthResponseDto,
  RefreshResponseDto,
  SignInRequestDto,
  SignUpRequestDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { REFRESH_COOKIE_NAME, refreshCookieOptions } from './refresh-cookie';

const SENSITIVE_RATE_LIMIT = { default: { limit: AUTH_RATE_LIMIT, ttl: RATE_LIMIT_TTL_MS } };

interface AuthResponse {
  user: PublicUser;
  accessToken: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Post('sign-up')
  @Throttle(SENSITIVE_RATE_LIMIT)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create an account',
    description:
      'Returns the access token in the body and sets the refresh token as an httpOnly cookie scoped to /api/v1/auth. Rate limited to 5 requests per minute.',
  })
  @ApiBody({ type: SignUpRequestDto })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiResponse({ status: 409, description: 'EMAIL_ALREADY_EXISTS', type: ApiErrorDto })
  @ApiResponse({ status: 422, description: 'VALIDATION_FAILED', type: ApiErrorDto })
  @ApiResponse({ status: 429, description: 'TOO_MANY_REQUESTS', type: ApiErrorDto })
  @ApiResponse({ status: 500, description: 'INTERNAL_ERROR', type: ApiErrorDto })
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
  @ApiOperation({
    summary: 'Sign in',
    description:
      'Unknown email and wrong password return an identical 401 by design. Rate limited to 5 requests per minute.',
  })
  @ApiBody({ type: SignInRequestDto })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'INVALID_CREDENTIALS', type: ApiErrorDto })
  @ApiResponse({ status: 422, description: 'VALIDATION_FAILED', type: ApiErrorDto })
  @ApiResponse({ status: 429, description: 'TOO_MANY_REQUESTS', type: ApiErrorDto })
  @ApiResponse({ status: 500, description: 'INTERNAL_ERROR', type: ApiErrorDto })
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
  @ApiCookieAuth(REFRESH_COOKIE_NAME)
  @ApiOperation({
    summary: 'Rotate the refresh token',
    description:
      'Reads the refresh cookie, revokes it and issues a new one. Replaying an already-revoked token revokes every refresh token for that user. Rate limited to 5 requests per minute.',
  })
  @ApiOkResponse({ type: RefreshResponseDto })
  @ApiResponse({
    status: 401,
    description: 'INVALID_REFRESH_TOKEN — missing, expired, revoked or replayed',
    type: ApiErrorDto,
  })
  @ApiResponse({ status: 429, description: 'TOO_MANY_REQUESTS', type: ApiErrorDto })
  @ApiResponse({ status: 500, description: 'INTERNAL_ERROR', type: ApiErrorDto })
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
  @ApiBearerAuth()
  @ApiCookieAuth(REFRESH_COOKIE_NAME)
  @ApiOperation({
    summary: 'Sign out',
    description:
      'Revokes the presented refresh token and clears the cookie. The already-issued access token stays valid until it expires.',
  })
  @ApiNoContentResponse({ description: 'Signed out' })
  @ApiResponse({
    status: 401,
    description: 'UNAUTHORIZED — missing or invalid access token',
    type: ApiErrorDto,
  })
  @ApiResponse({ status: 429, description: 'TOO_MANY_REQUESTS', type: ApiErrorDto })
  @ApiResponse({ status: 500, description: 'INTERNAL_ERROR', type: ApiErrorDto })
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
