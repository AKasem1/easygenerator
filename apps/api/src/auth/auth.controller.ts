import { Body, Controller, HttpCode, HttpStatus, Post, UsePipes } from '@nestjs/common';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { signInSchema, signUpSchema } from './auth.contracts';
import type { SignInInput, SignUpInput } from './auth.contracts';
import { AuthService } from './auth.service';
import type { AuthResult } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('sign-up')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(signUpSchema))
  async signUp(@Body() body: SignUpInput): Promise<AuthResult> {
    return this.auth.signUp(body);
  }

  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(signInSchema))
  async signIn(@Body() body: SignInInput): Promise<AuthResult> {
    return this.auth.signIn(body);
  }
}
