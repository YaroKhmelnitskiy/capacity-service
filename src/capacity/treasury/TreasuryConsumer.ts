import { setTimeout as sleep } from 'node:timers/promises';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { Inject, Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { KafkaConfig } from '../../config/config';
import { TreasuryResult } from '../../infrastructure/metrics/enums';
import { MetricsService } from '../../infrastructure/metrics/MetricsService';
import { CapacityService } from '../CapacityService';
import { CurrencyMismatchError } from '../errors';
import { InvalidTreasuryMessageError, parseTreasuryMessage } from './parseTreasuryMessage';

export const KAFKA_CONFIG = Symbol('KAFKA_CONFIG');

const CLIENT_ID = 'capacity-service';
const RETRY_DELAY_MS = 1_000;

export interface TreasuryRecord {
  partition: number;
  offset: string;
  value: Buffer | null;
}

@Injectable()
export class TreasuryConsumer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly consumer: KafkaJS.Consumer;

  public constructor(
    @Inject(KAFKA_CONFIG) private readonly config: KafkaConfig,
    private readonly capacity: CapacityService,
    private readonly metrics: MetricsService,
    @InjectPinoLogger(TreasuryConsumer.name) private readonly logger: PinoLogger,
  ) {
    const kafka = new KafkaJS.Kafka({
      kafkaJS: { clientId: CLIENT_ID, brokers: config.brokers, logger: toKafkaLogger(logger) },
    });
    this.consumer = kafka.consumer({ kafkaJS: { groupId: config.groupId, fromBeginning: true } });
  }

  public async onApplicationBootstrap(): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({ topics: [this.config.topic] });
    await this.consumer.run({
      eachMessage: ({ partition, message }) => this.handle({ partition, offset: message.offset, value: message.value }),
    });
    this.logger.info({ topic: this.config.topic, groupId: this.config.groupId }, 'Consuming treasury messages');
  }

  public async onApplicationShutdown(): Promise<void> {
    await this.consumer.disconnect();
  }

  public async handle(record: TreasuryRecord): Promise<void> {
    const position = { partition: record.partition, offset: record.offset };
    let message: ReturnType<typeof parseTreasuryMessage>;
    try {
      message = parseTreasuryMessage(record.value);
    } catch (error) {
      this.reject('unknown', position, error);
      return;
    }

    try {
      await this.capacity.applyTreasuryMessage(message);
    } catch (error) {
      if (error instanceof CurrencyMismatchError) {
        this.reject(message.type, position, error);
        return;
      }
      this.logger.warn({ err: error, ...position }, 'Treasury message failed, retrying');
      await sleep(RETRY_DELAY_MS);
      throw error;
    }
  }

  private reject(type: string, position: object, error: unknown): void {
    if (!(error instanceof InvalidTreasuryMessageError || error instanceof CurrencyMismatchError)) {
      throw error;
    }
    this.metrics.countTreasuryMessage(type, TreasuryResult.REJECTED);
    this.logger.error({ ...position, problem: error.message }, 'Treasury message rejected and skipped');
  }
}

function toKafkaLogger(logger: PinoLogger): KafkaJS.Logger {
  const kafkaLogger: KafkaJS.Logger = {
    info: (message, extra) => logger.debug({ kafka: extra }, message),
    warn: (message, extra) => logger.warn({ kafka: extra }, message),
    error: (message, extra) => logger.error({ kafka: extra }, message),
    debug: () => undefined,
    namespace: () => kafkaLogger,
    setLogLevel: () => undefined,
  };
  return kafkaLogger;
}
