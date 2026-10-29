import { Global, Module } from '@nestjs/common';
import { MetricsController } from './MetricsController';
import { MetricsService } from './MetricsService';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
