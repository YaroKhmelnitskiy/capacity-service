import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ReleaseResult as ReleaseMetric, ReservationResult, TreasuryResult } from '../infrastructure/metrics/enums';
import { MetricsService } from '../infrastructure/metrics/MetricsService';
import { CapacityRepository } from './database/CapacityRepository';
import { ExchangeRates } from './ExchangeRates';
import {
  InsufficientCapacityError,
  ProgramNotFoundError,
  ReservationConflictError,
  ReservationNotFoundError,
} from './errors';
import { convert } from './money';
import {
  Capacity,
  ReleaseResult,
  Reservation,
  ReservationRequest,
  ReserveResult,
  TreasuryMessage,
  TreasuryMessageType,
} from './types';

export type ServiceLogger = Pick<PinoLogger, 'info' | 'warn'>;

@Injectable()
export class CapacityService {
  public constructor(
    private readonly repository: CapacityRepository,
    private readonly exchangeRates: ExchangeRates,
    private readonly metrics: MetricsService,
    @InjectPinoLogger(CapacityService.name) private readonly logger: ServiceLogger,
  ) {}

  public async getCapacity(programId: string): Promise<Capacity> {
    const capacity = await this.repository.findCapacity(programId);
    if (capacity === undefined) {
      throw new ProgramNotFoundError(programId);
    }
    return capacity;
  }

  public async getReservation(programId: string, invoiceId: string): Promise<Reservation> {
    const reservation = await this.repository.findReservation(programId, invoiceId);
    if (reservation === undefined) {
      throw new ReservationNotFoundError(programId, invoiceId);
    }
    return reservation;
  }

  public async reserve(request: ReservationRequest): Promise<ReserveResult> {
    const { currency } = await this.getCapacity(request.programId);
    const conversion = await convert(request.amount, request.currency, currency, this.exchangeRates);
    const details = { ...request, ...conversion };

    const result = await this.repository.reserve(details).catch((error: unknown) => {
      if (error instanceof InsufficientCapacityError) {
        this.metrics.countReservation(ReservationResult.INSUFFICIENT_CAPACITY);
        this.logger.warn({ ...details, available: error.available }, 'Reservation rejected: insufficient capacity');
      }
      if (error instanceof ReservationConflictError) {
        this.metrics.countReservation(ReservationResult.CONFLICT);
        this.logger.warn(details, 'Reservation rejected: invoice already reserved with other values');
      }
      throw error;
    });

    this.metrics.countReservation(result.created ? ReservationResult.RESERVED : ReservationResult.DUPLICATE);
    this.logger.info(details, result.created ? 'Capacity reserved' : 'Duplicate reservation ignored');
    return result;
  }

  public async release(programId: string, invoiceId: string): Promise<ReleaseResult> {
    const result = await this.repository.release(programId, invoiceId);
    this.metrics.countRelease(result.released ? ReleaseMetric.RELEASED : ReleaseMetric.DUPLICATE);
    this.logger.info(
      { programId, invoiceId, programAmount: result.reservation.programAmount },
      result.released ? 'Capacity released' : 'Duplicate release ignored',
    );
    return result;
  }

  public async applyTreasuryMessage(message: TreasuryMessage): Promise<void> {
    const applied =
      message.type === TreasuryMessageType.LIMIT_UPDATED
        ? await this.repository.applyLimitUpdate(message)
        : await this.repository.applyReconciliation(message);

    this.metrics.countTreasuryMessage(message.type, applied ? TreasuryResult.APPLIED : TreasuryResult.STALE);
    const details = {
      type: message.type,
      programId: message.programId,
      version: message.version,
      limit: message.limit,
      ...(message.type === TreasuryMessageType.RECONCILIATION && {
        asOf: message.asOf.toISOString(),
        reservationCount: message.reservations.length,
      }),
    };
    this.logger.info(details, applied ? 'Treasury message applied' : 'Stale treasury message ignored');
  }
}
