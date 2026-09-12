import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

const CREDENTIALS = {
  email: 'throttled@example.com',
  name: 'Throttle Demo',
  password: 'sup3r!secret',
};

describe('rate limiting (e2e)', () => {
  let mongo: MongoMemoryServer;
  let app: INestApplication;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create({ instance: { dbName: 'easygenerator-throttle' } });

    process.env.MONGODB_URI = mongo.getUri();
    process.env.JWT_SECRET = 'e2e-only-secret';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    // Production defaults on purpose: this suite is the one that proves them.
    delete process.env.THROTTLE_GLOBAL_LIMIT;
    delete process.env.THROTTLE_AUTH_LIMIT;
    delete process.env.THROTTLE_TTL_MS;

    const { AppModule } = await import('../app.module');
    const { configureApp } = await import('../app.setup');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(app as NestExpressApplication, { corsOrigin: 'http://localhost:5173' });
    await app.init();

    await request(app.getHttpServer()).post('/api/v1/auth/sign-up').send(CREDENTIALS).expect(201);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  it('allows 5 sign-ins per minute and rejects the 6th in envelope shape', async () => {
    // The sign-up in beforeAll consumed one of the 5 sign-up slots, not a
    // sign-in slot; the two routes carry separate counters per handler.
    const statuses: number[] = [];

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in')
        .send({ email: CREDENTIALS.email, password: CREDENTIALS.password });

      statuses.push(res.status);
    }

    expect(statuses).toEqual([200, 200, 200, 200, 200]);

    const sixth = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-in')
      .send({ email: CREDENTIALS.email, password: CREDENTIALS.password })
      .expect(429);

    expect(sixth.body).toEqual({
      statusCode: 429,
      errorCode: 'TOO_MANY_REQUESTS',
      message: expect.any(String),
      requestId: expect.any(String),
      timestamp: expect.any(String),
    });
  }, 60_000);

  it('leaves an unthrottled route reachable', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });
});
