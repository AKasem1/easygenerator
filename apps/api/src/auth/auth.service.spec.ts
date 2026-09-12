import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';

import type { UserDocument } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');

function fakeUser(overrides: Partial<{ email: string; name: string; passwordHash: string }> = {}) {
  return {
    _id: { toString: () => 'user-id-1' },
    email: overrides.email ?? 'ada@example.com',
    name: overrides.name ?? 'Ada Lovelace',
    passwordHash: overrides.passwordHash ?? 'unset',
    createdAt: CREATED_AT,
  } as unknown as UserDocument;
}

describe('AuthService', () => {
  let service: AuthService;
  let users: {
    findByEmail: ReturnType<typeof vi.fn>;
    findByEmailWithPassword: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
  };
  let jwt: { signAsync: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    users = {
      findByEmail: vi.fn(),
      findByEmailWithPassword: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
    };
    jwt = { signAsync: vi.fn().mockResolvedValue('signed.jwt.token') };

    // Resolved through the container, so this also covers decorator metadata.
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('signUp', () => {
    it('stores an argon2id hash rather than the password', async () => {
      users.findByEmail.mockResolvedValue(null);
      users.create.mockImplementation((input: { passwordHash: string }) =>
        Promise.resolve(fakeUser({ passwordHash: input.passwordHash })),
      );

      await service.signUp({
        email: 'ada@example.com',
        name: 'Ada Lovelace',
        password: 'sup3r!secret',
      });

      expect(users.create).toHaveBeenCalledTimes(1);
      const { passwordHash } = users.create.mock.calls[0]![0] as { passwordHash: string };

      expect(passwordHash).not.toBe('sup3r!secret');
      expect(passwordHash.startsWith('$argon2id$')).toBe(true);
      await expect(argon2.verify(passwordHash, 'sup3r!secret')).resolves.toBe(true);
    });

    it('returns the public user and an access token', async () => {
      users.findByEmail.mockResolvedValue(null);
      users.create.mockResolvedValue(fakeUser());

      const result = await service.signUp({
        email: 'ada@example.com',
        name: 'Ada Lovelace',
        password: 'sup3r!secret',
      });

      expect(result).toEqual({
        user: {
          id: 'user-id-1',
          email: 'ada@example.com',
          name: 'Ada Lovelace',
          createdAt: CREATED_AT,
        },
        accessToken: 'signed.jwt.token',
      });
      expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 'user-id-1', email: 'ada@example.com' });
    });

    it('rejects a duplicate email found by the pre-check', async () => {
      users.findByEmail.mockResolvedValue(fakeUser());

      await expect(
        service.signUp({
          email: 'ada@example.com',
          name: 'Ada Lovelace',
          password: 'sup3r!secret',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(users.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate email that only the unique index catches', async () => {
      users.findByEmail.mockResolvedValue(null);
      users.create.mockRejectedValue(
        Object.assign(new Error('E11000 duplicate key'), { code: 11000 }),
      );

      await expect(
        service.signUp({
          email: 'ada@example.com',
          name: 'Ada Lovelace',
          password: 'sup3r!secret',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not swallow unrelated write failures', async () => {
      users.findByEmail.mockResolvedValue(null);
      users.create.mockRejectedValue(new Error('connection reset'));

      await expect(
        service.signUp({
          email: 'ada@example.com',
          name: 'Ada Lovelace',
          password: 'sup3r!secret',
        }),
      ).rejects.toThrow('connection reset');
    });
  });

  describe('signIn', () => {
    it('returns the public user and an access token', async () => {
      const passwordHash = await argon2.hash('sup3r!secret', { type: argon2.argon2id });
      users.findByEmailWithPassword.mockResolvedValue(fakeUser({ passwordHash }));

      const result = await service.signIn({ email: 'ada@example.com', password: 'sup3r!secret' });

      expect(result.user.id).toBe('user-id-1');
      expect(result.accessToken).toBe('signed.jwt.token');
    });

    it('selects the password hash explicitly', async () => {
      const passwordHash = await argon2.hash('sup3r!secret', { type: argon2.argon2id });
      users.findByEmailWithPassword.mockResolvedValue(fakeUser({ passwordHash }));

      await service.signIn({ email: 'ADA@example.com', password: 'sup3r!secret' });

      expect(users.findByEmailWithPassword).toHaveBeenCalledWith('ada@example.com');
      expect(users.findByEmail).not.toHaveBeenCalled();
    });

    it('rejects a wrong password', async () => {
      const passwordHash = await argon2.hash('sup3r!secret', { type: argon2.argon2id });
      users.findByEmailWithPassword.mockResolvedValue(fakeUser({ passwordHash }));

      await expect(
        service.signIn({ email: 'ada@example.com', password: 'wrong-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('is indistinguishable between unknown email and wrong password', async () => {
      const passwordHash = await argon2.hash('sup3r!secret', { type: argon2.argon2id });

      users.findByEmailWithPassword.mockResolvedValue(null);
      const unknownEmail = await service
        .signIn({ email: 'nobody@example.com', password: 'sup3r!secret' })
        .catch((error: UnauthorizedException) => error);

      users.findByEmailWithPassword.mockResolvedValue(fakeUser({ passwordHash }));
      const wrongPassword = await service
        .signIn({ email: 'ada@example.com', password: 'wrong-password' })
        .catch((error: UnauthorizedException) => error);

      expect(unknownEmail).toBeInstanceOf(UnauthorizedException);
      expect(wrongPassword).toBeInstanceOf(UnauthorizedException);
      expect((unknownEmail as UnauthorizedException).getStatus()).toBe(
        (wrongPassword as UnauthorizedException).getStatus(),
      );
      expect((unknownEmail as UnauthorizedException).getResponse()).toEqual(
        (wrongPassword as UnauthorizedException).getResponse(),
      );
    });
  });
});
