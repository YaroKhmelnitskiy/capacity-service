import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../auth/JwtAuthGuard';
import { MetricsService } from './MetricsService';

@Public()
@Controller('metrics')
export class MetricsController {
  public constructor(private readonly metrics: MetricsService) {}

  @Get()
  public async scrape(@Res({ passthrough: true }) res: Response): Promise<string> {
    res.setHeader('Content-Type', this.metrics.registry.contentType);
    return this.metrics.scrape();
  }
}
