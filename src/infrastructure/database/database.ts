import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely';
import { Pool, types } from 'pg';

export const DATABASE = Symbol('DATABASE');

const CONNECTION_TIMEOUT_MS = 5_000;
const STATEMENT_TIMEOUT_MS = 10_000;
const QUERY_TIMEOUT_MS = 15_000;

const BIGINT_AS_NUMBER = {
  getTypeParser: ((oid: number, format?: 'text' | 'binary') =>
    oid === types.builtins.INT8 ? Number : types.getTypeParser(oid, format)) as typeof types.getTypeParser,
};

export function createDatabase<DB>(connectionString: string, onConnectionError: (error: Error) => void): Kysely<DB> {
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    statement_timeout: STATEMENT_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
    types: BIGINT_AS_NUMBER,
  });
  pool.on('error', () => undefined);
  pool.on('connect', (client) => client.on('error', onConnectionError));
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }), plugins: [new CamelCasePlugin()] });
}
