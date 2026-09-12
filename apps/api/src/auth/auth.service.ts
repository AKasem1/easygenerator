import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';

import { toPublicUser } from '../users/user.public';
import type { PublicUser } from '../users/user.public';
import { UsersService } from '../users/users.service';
import type { SignInInput, SignUpInput } from './auth.contracts';
import type { JwtPayload } from './jwt.types';

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
}

const DUPLICATE_KEY_ERROR = 11000;

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code === DUPLICATE_KEY_ERROR
    : false;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async signUp(input: SignUpInput): Promise<AuthResult> {
    const email = input.email.toLowerCase();

    if (await this.users.findByEmail(email)) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

    try {
      const user = await this.users.create({ email, name: input.name, passwordHash });
      return this.buildResult(user);
    } catch (error) {
      // The check above is not atomic; the unique index is what actually decides.
      if (isDuplicateKeyError(error)) {
        throw new ConflictException('Email already registered');
      }
      throw error;
    }
  }

  async signIn(input: SignInInput): Promise<AuthResult> {
    const user = await this.users.findByEmailWithPassword(input.email.toLowerCase());

    // Unknown email and wrong password must be indistinguishable.
    if (!user || !(await argon2.verify(user.passwordHash, input.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.buildResult(user);
  }

  private async buildResult(user: Parameters<typeof toPublicUser>[0]): Promise<AuthResult> {
    const publicUser = toPublicUser(user);
    const payload: JwtPayload = { sub: publicUser.id, email: publicUser.email };

    return { user: publicUser, accessToken: await this.jwt.signAsync(payload) };
  }
}
