import { DynamicModule, Module, ValidationPipe } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { LoggerModule } from 'nestjs-pino';
import { CapacityModule } from './capacity/CapacityModule';
import { CAPACITY_MIGRATIONS } from './capacity/database/schema';
import { AppConfig } from './config/config';
import { JwtAuthGuard } from './infrastructure/auth/JwtAuthGuard';
import { DatabaseModule } from './infrastructure/database/DatabaseModule';
import { ConfiguredExchangeRates } from './infrastructure/fx/ConfiguredExchangeRates';
import { HealthController } from './infrastructure/health/HealthController';
import { ShutdownState } from './infrastructure/health/ShutdownState';
import { createLoggerOptions } from './infrastructure/logging/loggerOptions';
import { MetricsModule } from './infrastructure/metrics/MetricsModule';
import { VALIDATION_OPTIONS } from './infrastructure/validation/validationOptions';

@Module({})
export class AppModule {
  public static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        LoggerModule.forRoot(createLoggerOptions(config.logLevel)),
        DatabaseModule.forRoot(config.databaseUrl, CAPACITY_MIGRATIONS),
        MetricsModule,
        JwtModule.register({ secret: config.jwtSecret }),
        CapacityModule.forRoot({
          exchangeRates: new ConfiguredExchangeRates(config.fxRates),
          kafka: config.kafka,
        }),
      ],
      controllers: [HealthController],
      providers: [
        ShutdownState,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_PIPE, useValue: new ValidationPipe(VALIDATION_OPTIONS) },
      ],
    };
  }
}
