import { DynamicModule, Module, Provider } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { KafkaConfig } from '../config/config';
import { ApiExceptionFilter } from './api/ApiExceptionFilter';
import { ProgramsController } from './api/ProgramsController';
import { CapacityService } from './CapacityService';
import { CapacityRepository } from './database/CapacityRepository';
import { ExchangeRates } from './ExchangeRates';
import { KAFKA_CONFIG, TreasuryConsumer } from './treasury/TreasuryConsumer';

export interface CapacityOptions {
  exchangeRates: ExchangeRates;
  kafka?: KafkaConfig;
}

@Module({})
export class CapacityModule {
  public static forRoot(options: CapacityOptions): DynamicModule {
    const treasuryProviders: Provider[] =
      options.kafka === undefined ? [] : [{ provide: KAFKA_CONFIG, useValue: options.kafka }, TreasuryConsumer];
    return {
      module: CapacityModule,
      controllers: [ProgramsController],
      providers: [
        CapacityService,
        CapacityRepository,
        { provide: ExchangeRates, useValue: options.exchangeRates },
        ...treasuryProviders,
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
      ],
      exports: [CapacityService],
    };
  }
}
