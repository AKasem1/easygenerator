import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

import { REFRESH_COOKIE_NAME } from './refresh-cookie';

const CREDENTIALS = {
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  password: 'sup3r!secret',
};

/** Pulls the refresh cookie value out of a Set-Cookie header list. */
function readRefreshCookie(headers: Record<string, unknown>): string {
  const raw = headers['set-cookie'] as string[] | undefined;
  const cookie = raw?.find((entry) => entry.startsWith(`${REFRESH_COOKIE_NAME}=`));

  if (!cookie) {
    throw new Error('no refresh cookie on response');
  }

  return cookie.split(';')[0]!;
}

function refreshCookieAttributes(headers: Record<string, unknown>): string {
  const raw = headers['set-cookie'] as string[] | undefined;
  return raw?.find((entry) => entry.startsWith(`${REFRESH_COOKIE_NAME}=`)) ?? '';
}

describe('auth flow (e2e)', () => {
  let mongo: MongoMemoryServer;
  let app: INestApplication;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create({ instance: { dbName: 'easygenerator-e2e' } });

    // Set before the module loads: dotenv does not override existing env vars,
    // so this wins over the repo-root .env.
    process.env.MONGODB_URI = mongo.getUri();
    process.env.JWT_SECRET = 'e2e-only-secret';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    // Rate limiting has its own suite; these flows sign in repeatedly and would
    // otherwise trip the 5/min limit. The guard stays active, just permissive.
    process.env.THROTTLE_GLOBAL_LIMIT = '100000';
    process.env.THROTTLE_AUTH_LIMIT = '100000';

    const { AppModule } = await import('../app.module');
    const { configureApp } = await import('../app.setup');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(app as NestExpressApplication, { corsOrigin: 'http://localhost:5173' });
    await app.init();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  it('signs up, signs in, and authorises /users/me', async () => {
    const signUp = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up')
      .send(CREDENTIALS)
      .expect(201);

    expect(signUp.body.user).toEqual({
      id: expect.any(String),
      email: CREDENTIALS.email,
      name: CREDENTIALS.name,
      createdAt: expect.any(String),
    });
    expect(signUp.body.accessToken).toEqual(expect.any(String));
    expect(signUp.body.refreshToken).toBeUndefined();
    expect(JSON.stringify(signUp.body)).not.toContain('passwordHash');

    const attributes = refreshCookieAttributes(signUp.headers);
    expect(attributes).toContain('HttpOnly');
    expect(attributes).toContain('SameSite=Strict');
    expect(attributes).toContain('Path=/api/v1/auth');

    const signIn = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-in')
      .send({ email: CREDENTIALS.email, password: CREDENTIALS.password })
      .expect(200);

    expect(signIn.body.user.id).toBe(signUp.body.user.id);

    const me = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${signIn.body.accessToken}`)
      .expect(200);

    expect(me.body).toEqual({
      id: signUp.body.user.id,
      email: CREDENTIALS.email,
      name: CREDENTIALS.name,
      createdAt: expect.any(String),
    });
  });

  it('rejects /users/me without a token', async () => {
    await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
  });

  it('rejects a duplicate sign-up with 409', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up')
      .send({ ...CREDENTIALS, name: 'Someone Else' })
      .expect(409);
  });

  it('rejects a weak password with 422 from the shared schema', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up')
      .send({ email: 'other@example.com', name: 'Other Person', password: 'short' })
      .expect(422);
  });

  it('returns the same 401 for unknown email and wrong password', async () => {
    const unknownEmail = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-in')
      .send({ email: 'nobody@example.com', password: CREDENTIALS.password })
      .expect(401);

    const wrongPassword = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-in')
      .send({ email: CREDENTIALS.email, password: 'wrong-password' })
      .expect(401);

    const stable = (body: Record<string, unknown>) => ({
      statusCode: body.statusCode,
      errorCode: body.errorCode,
      message: body.message,
    });

    expect(stable(unknownEmail.body)).toEqual(stable(wrongPassword.body));
  });

  describe('error envelope', () => {
    const ENVELOPE = {
      statusCode: expect.any(Number),
      errorCode: expect.any(String),
      message: expect.any(String),
      requestId: expect.any(String),
      timestamp: expect.any(String),
    };

    it('401 UNAUTHORIZED for a missing access token', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);

      expect(res.body).toEqual({ ...ENVELOPE, statusCode: 401, errorCode: 'UNAUTHORIZED' });
    });

    it('401 INVALID_CREDENTIALS for a bad sign-in', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in')
        .send({ email: CREDENTIALS.email, password: 'wrong-password' })
        .expect(401);

      expect(res.body).toEqual({ ...ENVELOPE, statusCode: 401, errorCode: 'INVALID_CREDENTIALS' });
    });

    it('401 INVALID_REFRESH_TOKEN for a bad refresh', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', 'refresh_token=not-a-real-token')
        .expect(401);

      expect(res.body).toEqual({
        ...ENVELOPE,
        statusCode: 401,
        errorCode: 'INVALID_REFRESH_TOKEN',
      });
    });

    it('409 EMAIL_ALREADY_EXISTS', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-up')
        .send({ ...CREDENTIALS, name: 'Someone Else' })
        .expect(409);

      expect(res.body).toEqual({
        ...ENVELOPE,
        statusCode: 409,
        errorCode: 'EMAIL_ALREADY_EXISTS',
      });
    });

    it('422 VALIDATION_FAILED carries a fields map', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-up')
        .send({ email: 'not-an-email', name: 'Jo', password: 'short' })
        .expect(422);

      expect(res.body).toEqual({
        ...ENVELOPE,
        statusCode: 422,
        errorCode: 'VALIDATION_FAILED',
        fields: {
          email: expect.any(String),
          name: expect.any(String),
          password: expect.any(String),
        },
      });
    });

    it('echoes a supplied x-request-id into the header and the envelope', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('x-request-id', 'req-from-the-client')
        .expect(401);

      expect(res.headers['x-request-id']).toBe('req-from-the-client');
      expect(res.body.requestId).toBe('req-from-the-client');
    });

    it('generates a request id when the client does not supply one', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);

      expect(res.body.requestId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
      expect(res.headers['x-request-id']).toBe(res.body.requestId);
    });
  });

  describe('refresh token rotation', () => {
    async function freshSession() {
      const signIn = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in')
        .send({ email: CREDENTIALS.email, password: CREDENTIALS.password })
        .expect(200);

      return {
        accessToken: signIn.body.accessToken as string,
        cookie: readRefreshCookie(signIn.headers),
      };
    }

    it('rotates: returns a new access token and a new cookie', async () => {
      const session = await freshSession();

      const refreshed = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', session.cookie)
        .expect(200);

      expect(refreshed.body.accessToken).toEqual(expect.any(String));
      expect(readRefreshCookie(refreshed.headers)).not.toBe(session.cookie);
    });

    it('rejects the previous refresh token after rotation', async () => {
      const session = await freshSession();

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', session.cookie)
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', session.cookie)
        .expect(401);
    });

    it('reuse detection: replaying a revoked token kills the newly issued one too', async () => {
      const session = await freshSession();

      const rotated = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', session.cookie)
        .expect(200);

      const newCookie = readRefreshCookie(rotated.headers);

      // Replaying the old (revoked) token is the theft signal.
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', session.cookie)
        .expect(401);

      // The whole family is now dead, including the token issued a moment ago.
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', newCookie)
        .expect(401);
    });

    it('rejects refresh with no cookie at all', async () => {
      await request(app.getHttpServer()).post('/api/v1/auth/refresh').expect(401);
    });

    it('signs out, revoking the current refresh token', async () => {
      const session = await freshSession();

      await request(app.getHttpServer())
        .post('/api/v1/auth/sign-out')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .set('Cookie', session.cookie)
        .expect(204);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', session.cookie)
        .expect(401);
    });

    it('rejects sign-out without an access token', async () => {
      await request(app.getHttpServer()).post('/api/v1/auth/sign-out').expect(401);
    });
  });
});
