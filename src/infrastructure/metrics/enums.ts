export enum ReservationResult {
  RESERVED = 'reserved',
  DUPLICATE = 'duplicate',
  INSUFFICIENT_CAPACITY = 'insufficient_capacity',
  CONFLICT = 'conflict',
}

export enum ReleaseResult {
  RELEASED = 'released',
  DUPLICATE = 'duplicate',
}

export enum TreasuryResult {
  APPLIED = 'applied',
  STALE = 'stale',
  REJECTED = 'rejected',
}
