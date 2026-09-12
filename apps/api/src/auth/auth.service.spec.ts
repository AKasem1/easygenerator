import { HttpException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { Types } from 'mongoose';

import {
  EmailAlreadyExistsException,
  InvalidCredentialsException,
  InvalidRefreshTokenException,
} from '../common/app.exception';
import type { UserDocument } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import type { RefreshTokenDocument } from './refresh-token.schema';
import { RefreshTokensService } from './refresh-tokens.service';

// argon2's namespace is frozen, so vi.spyOn cannot patch it. Wrap the real
// implementations instead, keeping behaviour while recording calls.
vi.mock('argon2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('argon2')>();
  return { ...actual, hash: vi.fn(actual.hash), verify: vi.fn(actual.verify) };
});

const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');
const USER_ID = new Types.ObjectId();

function fakeUser(overrides: Partial<{ email: string; name: string; passwordHash: string }> = {}) {
  return {
    _id: USER_ID,
    email: overrides.email ?? 'ada@example.com',
    name: overrides.name ?? 'Ada Lovelace',
    passwordHash: overrides.passwordHash ?? 'unset',
    createdAt: CREATED_AT,
  } as unknown as UserDocument;
}

function fakeRefreshRecord(overrides: Partial<{ revokedAt: Date | null; expiresAt: Date }> = {}) {
  return {
    _id: new Types.ObjectId(),
    userId: USER_ID,
    tokenHash: 'hashed',
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60_000),
    revokedAt: overrides.revokedAt ?? null,
  } as unknown as RefreshTokenDocument;
}

type Mock = ReturnType<typeof vi.fn>;

interface UsersMock {
  findByEmail: Mock;
  findByEmailWithPassword: Mock;
  create: Mock;
  findById: Mock;
}

interface RefreshTokensMock {
  issue: Mock;
  findByRawToken: Mock;
  revoke: Mock;
  revokeAllForUser: Mock;
}

const SIGN_UP = {
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  password: 'sup3r!secret',
};

describe('AuthService', () => {
  let service: AuthService;
  let users: UsersMock;
  let refreshTokens: RefreshTokensMock;
  let jwt: { signAsync: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    users = {
      findByEmail: vi.fn(),
      findByEmailWithPassword: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
    };
    refreshTokens = {
      issue: vi.fn().mockResolvedValue('raw-refresh-token'),
      findByRawToken: vi.fn(),
      revoke: vi.fn(),
      revokeAllForUser: vi.fn(),
    };
    jwt = { signAsync: vi.fn().mockResolvedValue('signed.jwt.token') };

    // Resolved through the container, so this also covers decorator metadata.
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: JwtService, useValue: jwt },
        { provide: RefreshTokensService, useValue: refreshTokens },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('signUp', () => {
    it('stores an argon2id hash rather than the password', async () => {
      users.findByEmail.mockResolvedValue(null);
      users.create.mockImplementation((input: { passwordHash: string }) =>
        Promise.resolve(fakeUser({ passwordHash: input.passwordHash })),
      );

      await service.signUp(SIGN_UP);

      const { passwordHash } = users.create.mock.calls[0]![0] as { passwordHash: string };

      expect(passwordHash).not.toBe(SIGN_UP.password);
      expect(passwordHash.startsWith('$argon2id$')).toBe(true);
      await expect(argon2.verify(passwordHash, SIGN_UP.password)).resolves.toBe(true);
    });

    it('returns the public user, an access token and a refresh token', async () => {
      users.findByEmail.mockResolvedValue(null);
      users.create.mockResolvedValue(fakeUser());

      const result = await service.signUp(SIGN_UP);

      expect(result).toEqual({
        user: {
          id: USER_ID.toString(),
          email: SIGN_UP.email,
          name: SIGN_UP.name,
          createdAt: CREATED_AT,
        },
        accessToken: 'signed.jwt.token',
        refreshToken: 'raw-refresh-token',
      });
      expect(jwt.signAsync).toHaveBeenCalledWith({
        sub: USER_ID.toString(),
        email: SIGN_UP.email,
      });
    });

    it('rejects a duplicate email found by the pre-check', async () => {
      users.findByEmail.mockResolvedValue(fakeUser());

      await expect(service.signUp(SIGN_UP)).rejects.toBeInstanceOf(EmailAlreadyExistsException);
      expect(users.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate email that only the unique index catches', async () => {
      users.findByEmail.mockResolvedValue(null);
      users.create.mockRejectedValue(
        Object.assign(new Error('E11000 duplicate key'), { code: 11000 }),
      );

      await expect(service.signUp(SIGN_UP)).rejects.toBeInstanceOf(EmailAlreadyExistsException);
    });

    it('does not swallow unrelated write failures', async () => {
      users.findByEmail.mockResolvedValue(null);
      users.create.mockRejectedValue(new Error('connection reset'));

      await expect(service.signUp(SIGN_UP)).rejects.toThrow('connection reset');
    });
  });

  describe('signIn', () => {
    it('returns a session on correct credentials', async () => {
      const passwordHash = await argon2.hash(SIGN_UP.password, { type: argon2.argon2id });
      users.findByEmailWithPassword.mockResolvedValue(fakeUser({ passwordHash }));

      const result = await service.signIn({ email: SIGN_UP.email, password: SIGN_UP.password });

      expect(result.user.id).toBe(USER_ID.toString());
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toBe('raw-refresh-token');
    });

    it('selects the password hash explicitly', async () => {
      const passwordHash = await argon2.hash(SIGN_UP.password, { type: argon2.argon2id });
      users.findByEmailWithPassword.mockResolvedValue(fakeUser({ passwordHash }));

      await service.signIn({ email: 'ADA@example.com', password: SIGN_UP.password });

      expect(users.findByEmailWithPassword).toHaveBeenCalledWith('ada@example.com');
      expect(users.findByEmail).not.toHaveBeenCalled();
    });

    it('rejects a wrong password', async () => {
      const passwordHash = await argon2.hash(SIGN_UP.password, { type: argon2.argon2id });
      users.findByEmailWithPassword.mockResolvedValue(fakeUser({ passwordHash }));

      await expect(
        service.signIn({ email: SIGN_UP.email, password: 'wrong-password' }),
      ).rejects.toBeInstanceOf(InvalidCredentialsException);
    });

    // Behavioural stand-in for the timing property. A real timing assertion would
    // be flaky on a shared CI runner, so this asserts the work happens instead.
    it('still runs argon2.verify when the email is unknown', async () => {
      const verify = vi.mocked(argon2.verify);
      users.findByEmailWithPassword.mockResolvedValue(null);

      await expect(
        service.signIn({ email: 'nobody@example.com', password: SIGN_UP.password }),
      ).rejects.toBeInstanceOf(InvalidCredentialsException);

      expect(verify).toHaveBeenCalledTimes(1);
      expect(verify.mock.calls[0]![0]).toMatch(/^\$argon2id\$/);
    });

    it('verifies against a dummy hash carrying the real cost parameters', async () => {
      const verify = vi.mocked(argon2.verify);
      const realHash = await argon2.hash('anything', { type: argon2.argon2id });
      const realParams = /^\$argon2id\$v=\d+\$([^$]+)\$/.exec(realHash)![1];

      users.findByEmailWithPassword.mockResolvedValue(null);
      await service.signIn({ email: 'nobody@example.com', password: 'x' }).catch(() => undefined);

      const dummyHash = verify.mock.calls[0]![0];
      expect(/^\$argon2id\$v=\d+\$([^$]+)\$/.exec(dummyHash)![1]).toBe(realParams);
    });

    it('is indistinguishable between unknown email and wrong password', async () => {
      const passwordHash = await argon2.hash(SIGN_UP.password, { type: argon2.argon2id });

      users.findByEmailWithPassword.mockResolvedValue(null);
      const unknownEmail = await service
        .signIn({ email: 'nobody@example.com', password: SIGN_UP.password })
        .catch((error: HttpException) => error);

      users.findByEmailWithPassword.mockResolvedValue(fakeUser({ passwordHash }));
      const wrongPassword = await service
        .signIn({ email: SIGN_UP.email, password: 'wrong-password' })
        .catch((error: HttpException) => error);

      expect(unknownEmail).toBeInstanceOf(InvalidCredentialsException);
      expect(wrongPassword).toBeInstanceOf(InvalidCredentialsException);
      expect((unknownEmail as HttpException).getResponse()).toEqual(
        (wrongPassword as HttpException).getResponse(),
      );
    });
  });

  describe('refresh', () => {
    it('rejects a missing token', async () => {
      await expect(service.refresh(undefined)).rejects.toBeInstanceOf(InvalidRefreshTokenException);
    });

    it('rejects an unknown token', async () => {
      refreshTokens.findByRawToken.mockResolvedValue(null);

      await expect(service.refresh('nope')).rejects.toBeInstanceOf(InvalidRefreshTokenException);
    });

    it('rejects an expired token', async () => {
      refreshTokens.findByRawToken.mockResolvedValue(
        fakeRefreshRecord({ expiresAt: new Date(Date.now() - 1) }),
      );

      await expect(service.refresh('stale')).rejects.toBeInstanceOf(InvalidRefreshTokenException);
      expect(refreshTokens.issue).not.toHaveBeenCalled();
    });

    it('revokes the old record and issues a new one', async () => {
      const record = fakeRefreshRecord();
      refreshTokens.findByRawToken.mockResolvedValue(record);
      users.findById.mockResolvedValue(fakeUser());

      const result = await service.refresh('valid');

      expect(refreshTokens.revoke).toHaveBeenCalledWith(record._id);
      expect(refreshTokens.issue).toHaveBeenCalledWith(USER_ID);
      expect(result).toEqual({
        accessToken: 'signed.jwt.token',
        refreshToken: 'raw-refresh-token',
      });
    });

    it('revokes the whole family when a revoked token is replayed', async () => {
      refreshTokens.findByRawToken.mockResolvedValue(fakeRefreshRecord({ revokedAt: new Date() }));

      await expect(service.refresh('stolen')).rejects.toBeInstanceOf(InvalidRefreshTokenException);

      expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith(USER_ID);
      expect(refreshTokens.issue).not.toHaveBeenCalled();
    });
  });

  describe('signOut', () => {
    it('revokes the presented token', async () => {
      const record = fakeRefreshRecord();
      refreshTokens.findByRawToken.mockResolvedValue(record);

      await service.signOut('valid');

      expect(refreshTokens.revoke).toHaveBeenCalledWith(record._id);
    });

    it('is a no-op without a cookie', async () => {
      await service.signOut(undefined);

      expect(refreshTokens.findByRawToken).not.toHaveBeenCalled();
      expect(refreshTokens.revoke).not.toHaveBeenCalled();
    });
  });
});
