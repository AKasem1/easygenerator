import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

const CREDENTIALS = {
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  password: 'sup3r!secret',
};

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

    const { AppModule } = await import('../app.module');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
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
    expect(JSON.stringify(signUp.body)).not.toContain('passwordHash');

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

  it('rejects a weak password with 400 from the shared schema', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up')
      .send({ email: 'other@example.com', name: 'Other Person', password: 'short' })
      .expect(400);
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

    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });
});
