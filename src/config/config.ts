import { isCurrency, isPositiveRate } from '../capacity/money';

const DEFAULT_PORT = 3000;
const DEFAULT_KAFKA_TOPIC = 'treasury.capacity';
const DEFAULT_KAFKA_GROUP_ID = 'capacity-service';
const MIN_JWT_SECRET_LENGTH = 32;
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface KafkaConfig {
  brokers: string[];
  topic: string;
  groupId: string;
}

export interface AppConfig {
  port: number;
  databaseUrl: string;
  logLevel: LogLevel;
  jwtSecret: string;
  fxRates: Record<string, string>;
  kafka?: KafkaConfig;
}

export class ConfigError extends Error {
  public constructor(problem: string) {
    super(`Invalid configuration: ${problem}`);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const port = Number(env.PORT || DEFAULT_PORT);
  if (!Number.isInteger(port)) {
    throw new ConfigError('PORT must be an integer');
  }
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new ConfigError('DATABASE_URL is required');
  }
  const logLevel = env.LOG_LEVEL ?? 'info';
  if (!isLogLevel(logLevel)) {
    throw new ConfigError(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}`);
  }
  const jwtSecret = env.JWT_SECRET ?? '';
  if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    throw new ConfigError(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`);
  }
  const brokers = (env.KAFKA_BROKERS ?? '')
    .split(',')
    .map((broker) => broker.trim())
    .filter((broker) => broker.length > 0);
  if (brokers.length === 0) {
    throw new ConfigError('KAFKA_BROKERS is required, e.g. localhost:9094');
  }
  return {
    port,
    databaseUrl,
    logLevel,
    jwtSecret,
    fxRates: parseFxRates(env.FX_RATES ?? ''),
    kafka: {
      brokers,
      topic: env.KAFKA_TOPIC || DEFAULT_KAFKA_TOPIC,
      groupId: env.KAFKA_GROUP_ID || DEFAULT_KAFKA_GROUP_ID,
    },
  };
}

export function parseFxRates(value: string): Record<string, string> {
  const rates: Record<string, string> = {};
  for (const entry of value.split(',').filter((part) => part.trim().length > 0)) {
    const [currency, rate] = entry.split('=').map((part) => part.trim());
    if (!isCurrency(currency) || rate === undefined || !isPositiveRate(rate)) {
      throw new ConfigError(`FX_RATES entry "${entry}" must look like EUR=1.08`);
    }
    rates[currency] = rate;
  }
  return rates;
}

function isLogLevel(value: string): value is LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(value);
}
