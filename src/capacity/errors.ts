export class ProgramNotFoundError extends Error {
  public constructor(public readonly programId: string) {
    super(`Program ${programId} does not exist`);
    this.name = 'ProgramNotFoundError';
  }
}

export class ReservationNotFoundError extends Error {
  public constructor(
    public readonly programId: string,
    public readonly invoiceId: string,
  ) {
    super(`Program ${programId} has no reservation for invoice ${invoiceId}`);
    this.name = 'ReservationNotFoundError';
  }
}

export class InsufficientCapacityError extends Error {
  public constructor(
    public readonly programId: string,
    public readonly requested: number,
    public readonly available: number,
  ) {
    super(`Program ${programId} has ${available} available, the invoice needs ${requested}`);
    this.name = 'InsufficientCapacityError';
  }
}

export class ReservationConflictError extends Error {
  public constructor(
    public readonly programId: string,
    public readonly invoiceId: string,
  ) {
    super(`Invoice ${invoiceId} is already reserved in program ${programId} with a different amount or currency`);
    this.name = 'ReservationConflictError';
  }
}

export class UnsupportedCurrencyError extends Error {
  public constructor(public readonly currency: string) {
    super(`No exchange rate is configured for ${currency}`);
    this.name = 'UnsupportedCurrencyError';
  }
}

export class CurrencyMismatchError extends Error {
  public constructor(
    public readonly programId: string,
    public readonly expected: string,
    public readonly actual: string,
  ) {
    super(`Program ${programId} is denominated in ${expected}, the treasury message says ${actual}`);
    this.name = 'CurrencyMismatchError';
  }
}
