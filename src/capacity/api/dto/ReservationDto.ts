import { formatRate, parseRate } from '../../money';
import { Reservation, ReservationStatus } from '../../types';

export interface ReservationDto {
  programId: string;
  invoiceId: string;
  amount: number;
  currency: string;
  programAmount: number;
  fxRate: string | null;
  status: ReservationStatus;
  reservedAt: string;
  releasedAt: string | null;
}

export function toReservationDto(reservation: Reservation): ReservationDto {
  return {
    ...reservation,
    fxRate: reservation.fxRate === null ? null : formatRate(parseRate(reservation.fxRate)),
    reservedAt: reservation.reservedAt.toISOString(),
    releasedAt: reservation.releasedAt?.toISOString() ?? null,
  };
}
