process.env.TZ = 'UTC';

import 'reflect-metadata';
import pino from 'pino';
import { startServer } from './app';
import { loadConfig } from './config/config';
import { BASE_LOGGER_OPTIONS } from './infrastructure/logging/loggerOptions';

async function main(): Promise<void> {
  await startServer(loadConfig(process.env));
}

main().catch((error: unknown) => {
  pino(BASE_LOGGER_OPTIONS).fatal({ err: error }, 'Failed to start');
  process.exit(1);
});
