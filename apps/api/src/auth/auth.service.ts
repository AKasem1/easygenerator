import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

import { toPublicUser } from '../users/user.public';
import type { PublicUser } from '../users/user.public';
import type { UserDocument } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import type { SignInInput, SignUpInput } from './auth.contracts';
import type { JwtPayload } from './jwt.types';
import {
  EmailAlreadyExistsException,
  InvalidCredentialsException,
  InvalidRefreshTokenException,
} from '../common/app.exception';
import { RefreshTokensService } from './refresh-tokens.service';

export interface AuthSession {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

const DUPLICATE_KEY_ERROR = 11000;

const HASH_OPTIONS = { type: argon2.argon2id } as const;

/**
 * Verified against when no user matches, so the unknown-email path does the same
 * argon2 work as the wrong-password path. Built with HASH_OPTIONS — the same cost
 * parameters sign-up uses — because a cheaper hash would return faster and
 * rebuild the very side channel this closes.
 *
 * This narrows enumeration but does not close it: sign-up still answers 409 for
 * an address that already exists, which remains a direct oracle.
 */
const DUMMY_PASSWORD_HASH = argon2.hash(randomBytes(32).toString('hex'), HASH_OPTIONS);
DUMMY_PASSWORD_HASH.catch(() => undefined);

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
    private readonly refreshTokens: RefreshTokensService,
  ) {}

  async signUp(input: SignUpInput): Promise<AuthSession> {
    const email = input.email.toLowerCase();

    if (await this.users.findByEmail(email)) {
      throw new EmailAlreadyExistsException();
    }

    const passwordHash = await argon2.hash(input.password, HASH_OPTIONS);

    try {
      const user = await this.users.create({ email, name: input.name, passwordHash });
      return this.startSession(user);
    } catch (error) {
      // The check above is not atomic; the unique index is what actually decides.
      if (isDuplicateKeyError(error)) {
        throw new EmailAlreadyExistsException();
      }
      throw error;
    }
  }

  async signIn(input: SignInInput): Promise<AuthSession> {
    const user = await this.users.findByEmailWithPassword(input.email.toLowerCase());

    // Both branches run exactly one argon2.verify, so an unknown email costs the
    // same as a wrong password and returns the same 401.
    const passwordMatches = await argon2.verify(
      user ? user.passwordHash : await DUMMY_PASSWORD_HASH,
      input.password,
    );

    if (!user || !passwordMatches) {
      throw new InvalidCredentialsException();
    }

    return this.startSession(user);
  }

  async refresh(rawToken: string | undefined): Promise<RefreshResult> {
    if (!rawToken) {
      throw new InvalidRefreshTokenException();
    }

    const record = await this.refreshTokens.findByRawToken(rawToken);

    if (!record) {
      throw new InvalidRefreshTokenException();
    }

    // Reuse detection: a revoked token presented again means it leaked, so kill
    // the whole family rather than just this record.
    if (record.revokedAt) {
      await this.refreshTokens.revokeAllForUser(record.userId);
      throw new InvalidRefreshTokenException();
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      throw new InvalidRefreshTokenException();
    }

    const user = await this.users.findById(record.userId.toString());

    if (!user) {
      throw new InvalidRefreshTokenException();
    }

    await this.refreshTokens.revoke(record._id);

    return {
      accessToken: await this.signAccessToken(user),
      refreshToken: await this.refreshTokens.issue(user._id),
    };
  }

  async signOut(rawToken: string | undefined): Promise<void> {
    if (!rawToken) {
      return;
    }

    const record = await this.refreshTokens.findByRawToken(rawToken);

    if (record && !record.revokedAt) {
      await this.refreshTokens.revoke(record._id);
    }
  }

  private async startSession(user: UserDocument): Promise<AuthSession> {
    return {
      user: toPublicUser(user),
      accessToken: await this.signAccessToken(user),
      refreshToken: await this.refreshTokens.issue(user._id),
    };
  }

  private async signAccessToken(user: UserDocument): Promise<string> {
    const payload: JwtPayload = { sub: user._id.toString(), email: user.email };
    return this.jwt.signAsync(payload);
  }
}
