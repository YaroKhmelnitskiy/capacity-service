import { Conversion } from './money';

export enum ReservationStatus {
  RESERVED = 'RESERVED',
  RELEASED = 'RELEASED',
}

export interface Capacity {
  programId: string;
  currency: string;
  limit: number;
  reserved: number;
  available: number;
}

export interface ReservationRequest {
  programId: string;
  invoiceId: string;
  amount: number;
  currency: string;
}

export interface NewReservation extends ReservationRequest, Conversion {}

export interface Reservation extends ReservationRequest {
  programAmount: number;
  fxRate: string | null;
  status: ReservationStatus;
  reservedAt: Date;
  releasedAt: Date | null;
}

export interface ReserveResult {
  reservation: Reservation;
  created: boolean;
}

export interface ReleaseResult {
  reservation: Reservation;
  released: boolean;
}

export enum TreasuryMessageType {
  LIMIT_UPDATED = 'LIMIT_UPDATED',
  RECONCILIATION = 'RECONCILIATION',
}

export interface LimitUpdate {
  type: TreasuryMessageType.LIMIT_UPDATED;
  programId: string;
  currency: string;
  limit: number;
  version: number;
}

export interface ReconciledReservation {
  invoiceId: string;
  amount: number;
  currency: string;
  programAmount: number;
}

export interface Reconciliation extends Omit<LimitUpdate, 'type'> {
  type: TreasuryMessageType.RECONCILIATION;
  asOf: Date;
  reservations: ReconciledReservation[];
}

export type TreasuryMessage = LimitUpdate | Reconciliation;
