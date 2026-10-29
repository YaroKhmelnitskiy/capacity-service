import { BeforeApplicationShutdown, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

export const FORCED_EXIT_DELAY_MS = 8_000;

export type ShutdownLogger = Pick<PinoLogger, 'info' | 'error'>;

@Injectable()
export class ShutdownState implements BeforeApplicationShutdown {
  private shuttingDown = false;

  public constructor(@InjectPinoLogger(ShutdownState.name) private readonly logger: ShutdownLogger) {}

  public get isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  public beforeApplicationShutdown(signal?: string): void {
    this.shuttingDown = true;
    if (signal === undefined) {
      return;
    }
    this.logger.info({ signal }, 'Shutting down');
    setTimeout(() => {
      this.logger.error({ signal }, 'Shutdown did not finish in time, exiting');
      process.exit(1);
    }, FORCED_EXIT_DELAY_MS).unref();
  }
}
