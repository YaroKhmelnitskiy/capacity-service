import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { Response } from 'express';
import { Kysely, sql } from 'kysely';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Public } from '../auth/JwtAuthGuard';
import { DATABASE } from '../database/database';

export interface HealthStatus {
  status: 'ok' | 'down';
}

@Public()
@Controller('health')
export class HealthController {
  public constructor(
    @Inject(DATABASE) private readonly db: Kysely<unknown>,
    @InjectPinoLogger(HealthController.name) private readonly logger: PinoLogger,
  ) {}

  @Get('liveness')
  public liveness(): HealthStatus {
    return { status: 'ok' };
  }

  @Get('readiness')
  public async readiness(@Res({ passthrough: true }) res: Response): Promise<HealthStatus> {
    if (!(await this.isDatabaseReachable())) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: 'down' };
    }
    return { status: 'ok' };
  }

  private async isDatabaseReachable(): Promise<boolean> {
    try {
      await sql`SELECT 1`.execute(this.db);
      return true;
    } catch (error) {
      this.logger.warn({ err: error }, 'Readiness check cannot reach the database');
      return false;
    }
  }
}
