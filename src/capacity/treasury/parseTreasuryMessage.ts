import { plainToInstance, Type } from 'class-transformer';
import { IsArray, IsEnum, ValidateNested, ValidationError, validateSync } from 'class-validator';
import { IsId, IsIsoInstant } from '../../infrastructure/validation/decorators';
import { VALIDATION_OPTIONS } from '../../infrastructure/validation/validationOptions';
import { Reconciliation, TreasuryMessage, TreasuryMessageType } from '../types';
import { HasUniqueInvoiceIds, IsAmount, IsCurrency, IsVersion } from '../validation';

export class InvalidTreasuryMessageError extends Error {
  public constructor(problems: string[]) {
    super(`Invalid treasury message: ${problems.join('; ')}`);
    this.name = 'InvalidTreasuryMessageError';
  }
}

class LimitUpdatedMessage {
  @IsEnum(TreasuryMessageType)
  public type!: TreasuryMessageType;

  @IsId()
  public programId!: string;

  @IsCurrency()
  public currency!: string;

  @IsAmount(0)
  public limit!: number;

  @IsVersion()
  public version!: number;
}

class ReconciledReservationMessage {
  @IsId()
  public invoiceId!: string;

  @IsAmount(1)
  public amount!: number;

  @IsCurrency()
  public currency!: string;

  @IsAmount(1)
  public programAmount!: number;
}

class ReconciliationMessage extends LimitUpdatedMessage {
  @IsIsoInstant()
  public asOf!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReconciledReservationMessage)
  @HasUniqueInvoiceIds()
  public reservations!: ReconciledReservationMessage[];
}

export function parseTreasuryMessage(value: Buffer | null): TreasuryMessage {
  let json: unknown;
  try {
    json = JSON.parse(value?.toString('utf8') ?? '');
  } catch {
    throw new InvalidTreasuryMessageError(['the value must be JSON']);
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new InvalidTreasuryMessageError(['the value must be a JSON object']);
  }

  const isReconciliation = 'type' in json && json.type === TreasuryMessageType.RECONCILIATION;
  const message = plainToInstance(isReconciliation ? ReconciliationMessage : LimitUpdatedMessage, json);
  const errors = validateSync(message, VALIDATION_OPTIONS);
  if (errors.length > 0) {
    throw new InvalidTreasuryMessageError(errors.flatMap((error) => describeError(error)));
  }

  if (message instanceof ReconciliationMessage) {
    const reconciliation: Reconciliation = {
      ...message,
      type: TreasuryMessageType.RECONCILIATION,
      asOf: new Date(message.asOf),
      reservations: message.reservations.map((reservation) => ({ ...reservation })),
    };
    return reconciliation;
  }
  return { ...message, type: TreasuryMessageType.LIMIT_UPDATED };
}

function describeError(error: ValidationError, path = ''): string[] {
  const own = Object.values(error.constraints ?? {}).map((problem) => `${path}${problem}`);
  const nested = (error.children ?? []).flatMap((child) => describeError(child, `${path}${error.property}.`));
  return [...own, ...nested];
}
