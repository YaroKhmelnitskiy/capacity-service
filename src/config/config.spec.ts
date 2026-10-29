import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConfigError, loadConfig, parseFxRates } from './config';

describe('Config | loadConfig', () => {
  const required = {
    DATABASE_URL: 'postgres://user:password@localhost:5435/capacity-service',
    JWT_SECRET: 'a-secret-that-is-at-least-32-characters',
    KAFKA_BROKERS: 'localhost:9094, other:9094',
  };

  it('applies defaults', () => {
    assert.deepEqual(loadConfig(required), {
      port: 3000,
      databaseUrl: required.DATABASE_URL,
      logLevel: 'info',
      jwtSecret: required.JWT_SECRET,
      fxRates: {},
      kafka: { brokers: ['localhost:9094', 'other:9094'], topic: 'treasury.capacity', groupId: 'capacity-service' },
    });
  });

  for (const name of Object.keys(required)) {
    it(`requires ${name}`, () => {
      assert.throws(() => loadConfig({ ...required, [name]: '' }), ConfigError);
    });
  }

  it('rejects a short JWT_SECRET', () => {
    assert.throws(() => loadConfig({ ...required, JWT_SECRET: 'short' }), /at least 32 characters/);
  });

  it('rejects an unknown LOG_LEVEL', () => {
    assert.throws(() => loadConfig({ ...required, LOG_LEVEL: 'loud' }), /LOG_LEVEL must be one of/);
  });
});

describe('Config | parseFxRates', () => {
  it('reads currency=rate pairs', () => {
    assert.deepEqual(parseFxRates('USD=1, EUR=1.08,JPY=0.0067'), { USD: '1', EUR: '1.08', JPY: '0.0067' });
  });

  for (const value of ['USD', 'usd=1', 'XYZ=1', 'EUR=0', 'EUR=-1', 'EUR=1e3', 'EUR=abc']) {
    it(`rejects ${value}`, () => {
      assert.throws(() => parseFxRates(value), ConfigError);
    });
  }
});
