import { parseCorsOrigins, validateEnv } from './env.validation';

const validEnv = {
  MONGODB_URI: 'mongodb://localhost:27017/easygenerator',
  JWT_SECRET: 'a-secret-value',
};

describe('validateEnv', () => {
  it('accepts a minimal valid environment and applies defaults', () => {
    const env = validateEnv({ ...validEnv });

    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(3000);
    expect(env.MONGODB_URI).toBe(validEnv.MONGODB_URI);
  });

  it('refuses to start without MONGODB_URI', () => {
    expect(() => validateEnv({ JWT_SECRET: validEnv.JWT_SECRET })).toThrow(/MONGODB_URI/);
  });

  it('refuses to start without JWT_SECRET', () => {
    expect(() => validateEnv({ MONGODB_URI: validEnv.MONGODB_URI })).toThrow(/JWT_SECRET/);
  });

  it('coerces API_PORT from its string environment form', () => {
    expect(validateEnv({ ...validEnv, API_PORT: '8080' }).API_PORT).toBe(8080);
  });
});

describe('parseCorsOrigins', () => {
  it('splits and trims a comma-separated list', () => {
    expect(parseCorsOrigins('http://a.test, http://b.test ')).toEqual([
      'http://a.test',
      'http://b.test',
    ]);
  });

  it('drops empty entries', () => {
    expect(parseCorsOrigins('http://a.test,,')).toEqual(['http://a.test']);
  });
});
