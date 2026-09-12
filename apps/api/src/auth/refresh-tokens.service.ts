import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash, randomBytes } from 'node:crypto';

import { RefreshToken } from './refresh-token.schema';
import type { RefreshTokenDocument } from './refresh-token.schema';

export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const TOKEN_BYTES = 32;

/**
 * Deliberately sha256, not argon2. A refresh token is 32 bytes of CSPRNG output,
 * so there is no dictionary to attack and no need to slow an attacker down; a
 * memory-hard hash would only add latency to every refresh. This asymmetry with
 * the password hashing is intentional.
 */
export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class RefreshTokensService {
  constructor(
    @InjectModel(RefreshToken.name) private readonly model: Model<RefreshTokenDocument>,
  ) {}

  async issue(userId: Types.ObjectId): Promise<string> {
    const raw = randomBytes(TOKEN_BYTES).toString('hex');

    await this.model.create({
      userId,
      tokenHash: hashRefreshToken(raw),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      revokedAt: null,
    });

    return raw;
  }

  async findByRawToken(raw: string): Promise<RefreshTokenDocument | null> {
    return this.model.findOne({ tokenHash: hashRefreshToken(raw) }).exec();
  }

  async revoke(id: Types.ObjectId): Promise<void> {
    await this.model.updateOne({ _id: id, revokedAt: null }, { revokedAt: new Date() }).exec();
  }

  async revokeAllForUser(userId: Types.ObjectId): Promise<void> {
    await this.model.updateMany({ userId, revokedAt: null }, { revokedAt: new Date() }).exec();
  }
}
