import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { NextFunction, Request, Response } from 'express';
import { Logger, PinoLogger } from 'nestjs-pino';
import { AppModule } from './AppModule';
import { AppConfig } from './config/config';
import { ShutdownState } from './infrastructure/health/ShutdownState';
import { createHttpObservabilityMiddleware } from './infrastructure/metrics/httpObservabilityMiddleware';
import { MetricsService } from './infrastructure/metrics/MetricsService';

export async function createApp(config: AppConfig): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), {
    bufferLogs: true,
    bodyParser: false,
  });
  app.useLogger(app.get(Logger));
  app.use(createHttpObservabilityMiddleware(app.get(MetricsService), (await app.resolve(PinoLogger)).logger));
  const shutdownState = app.get(ShutdownState);
  app.use((_req: Request, res: Response, next: NextFunction): void => {
    if (shutdownState.isShuttingDown) {
      res.setHeader('Connection', 'close');
    }
    next();
  });
  app.useBodyParser('json', { limit: '1mb' });
  return app;
}

export async function startServer(config: AppConfig): Promise<void> {
  const app = await createApp(config);
  app.enableShutdownHooks(['SIGTERM', 'SIGINT']);
  await app.listen(config.port);
  app.get(Logger).log(`Listening on port ${config.port}`, 'Bootstrap');
}
