import { Injectable } from '@nestjs/common';
import { Counter, collectDefaultMetrics, Histogram, Registry } from 'prom-client';
import { ReleaseResult, ReservationResult, TreasuryResult } from './enums';

export interface HttpRequestObservation {
  method: string;
  route: string;
  statusCode: number;
  durationSeconds: number;
}

@Injectable()
export class MetricsService {
  public readonly registry = new Registry();

  private readonly httpRequestDuration = new Histogram({
    name: 'capacity_http_request_duration_seconds',
    help: 'HTTP request duration by route template',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [this.registry],
  });

  private readonly reservations = new Counter({
    name: 'capacity_reservations_total',
    help: 'Reservation requests by outcome',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });

  private readonly releases = new Counter({
    name: 'capacity_releases_total',
    help: 'Release requests by outcome',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });

  private readonly treasuryMessages = new Counter({
    name: 'capacity_treasury_messages_total',
    help: 'Treasury messages consumed from Kafka by type and outcome',
    labelNames: ['type', 'result'] as const,
    registers: [this.registry],
  });

  public constructor() {
    collectDefaultMetrics({ register: this.registry });
    for (const result of Object.values(ReservationResult)) {
      this.reservations.inc({ result }, 0);
    }
    for (const result of Object.values(ReleaseResult)) {
      this.releases.inc({ result }, 0);
    }
  }

  public async scrape(): Promise<string> {
    return this.registry.metrics();
  }

  public countReservation(result: ReservationResult): void {
    this.reservations.inc({ result });
  }

  public countRelease(result: ReleaseResult): void {
    this.releases.inc({ result });
  }

  public countTreasuryMessage(type: string, result: TreasuryResult): void {
    this.treasuryMessages.inc({ type, result });
  }

  public observeHttpRequest(observation: HttpRequestObservation): void {
    this.httpRequestDuration.observe(
      { method: observation.method, route: observation.route, status_code: String(observation.statusCode) },
      observation.durationSeconds,
    );
  }
}
