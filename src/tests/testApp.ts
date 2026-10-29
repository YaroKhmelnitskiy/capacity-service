import assert from 'node:assert/strict';
import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Kysely } from 'kysely';
import request from 'supertest';
import { createApp } from '../app';
import { CapacityService } from '../capacity/CapacityService';
import { Database } from '../capacity/database/schema';
import { TreasuryMessageType } from '../capacity/types';
import { KafkaConfig } from '../config/config';
import { DATABASE } from '../infrastructure/database/database';
import { createTestDatabase, truncateAll } from './testDatabase';

export const TEST_JWT_SECRET = 'test-secret-that-is-long-enough-0123456789';
export const TEST_FX_RATES = { USD: '1', EUR: '1.08', JPY: '0.0067', KWD: '3.25' };

export interface TestApp {
  http(): ReturnType<typeof request>;
  db: Kysely<Database>;
  capacity: CapacityService;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export async function startTestApp(kafka?: KafkaConfig): Promise<TestApp> {
  const testDatabase = await createTestDatabase();
  try {
    const app: NestExpressApplication = await createApp({
      port: 0,
      databaseUrl: testDatabase.url,
      logLevel: 'silent',
      jwtSecret: TEST_JWT_SECRET,
      fxRates: TEST_FX_RATES,
      kafka,
    });
    await app.listen(0);
    const db = app.get<Kysely<Database>>(DATABASE);
    return {
      http: () => request(app.getHttpServer()),
      db,
      capacity: app.get(CapacityService),
      reset: () => truncateAll(db),
      close: async () => {
        await app.close();
        await testDatabase.drop();
      },
    };
  } catch (error) {
    await testDatabase.drop();
    throw error;
  }
}

export const token = (subject = 'test-client', secret = TEST_JWT_SECRET): string =>
  new JwtService({ secret }).sign({ sub: subject }, { algorithm: 'HS256', expiresIn: '5m' });

export const bearer = (subject?: string): string => `Bearer ${token(subject)}`;

export const createProgram = (testApp: TestApp, programId: string, limit: number, currency = 'USD'): Promise<void> =>
  testApp.capacity.applyTreasuryMessage({
    type: TreasuryMessageType.LIMIT_UPDATED,
    programId,
    currency,
    limit,
    version: 1,
  });

export const errorCode = (body: { code?: unknown; message?: unknown }): unknown => {
  assert.ok(Array.isArray(body.message), 'every client error lists its messages');
  return body.code;
};
