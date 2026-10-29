import { randomUUID } from 'node:crypto';
import { Kysely, sql } from 'kysely';
import { Client } from 'pg';
import { Database } from '../capacity/database/schema';

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL ?? 'postgres://user:password@localhost:5435/postgres';

export interface TestDatabase {
  url: string;
  drop(): Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const name = `capacity_test_${randomUUID().replaceAll('-', '')}`;
  await runAdminQuery(`CREATE DATABASE ${name}`);
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  return { url: url.toString(), drop: () => runAdminQuery(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`) };
}

export async function truncateAll(db: Kysely<Database>): Promise<void> {
  await sql`TRUNCATE reservations, programs`.execute(db);
}

async function runAdminQuery(query: string): Promise<void> {
  const client = new Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    await client.query(query);
  } finally {
    await client.end();
  }
}
