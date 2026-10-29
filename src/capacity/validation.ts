import { ValidateBy, ValidationArguments, ValidationOptions } from 'class-validator';
import { isCurrency, MAX_AMOUNT } from './money';

export function IsAmount(minimum: number, options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isAmount',
      validator: {
        validate: (value: unknown): boolean =>
          typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= MAX_AMOUNT,
        defaultMessage: (args?: ValidationArguments): string =>
          `${args?.property ?? 'amount'} must be a whole number of minor currency units, at least ${minimum} and at most ${MAX_AMOUNT}`,
      },
    },
    options,
  );
}

export function IsCurrency(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isCurrency',
      validator: {
        validate: isCurrency,
        defaultMessage: (args?: ValidationArguments): string =>
          `${args?.property ?? 'currency'} must be an ISO 4217 currency code, e.g. USD`,
      },
    },
    options,
  );
}

export function IsVersion(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isVersion',
      validator: {
        validate: (value: unknown): boolean => Number.isSafeInteger(value) && (value as number) > 0,
        defaultMessage: (args?: ValidationArguments): string =>
          `${args?.property ?? 'version'} must be a positive integer`,
      },
    },
    options,
  );
}

export function HasUniqueInvoiceIds(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'hasUniqueInvoiceIds',
      validator: {
        validate: (value: unknown): boolean => {
          if (!Array.isArray(value)) {
            return true;
          }
          const invoiceIds = value.map((item: unknown) =>
            typeof item === 'object' && item !== null && 'invoiceId' in item ? item.invoiceId : undefined,
          );
          return new Set(invoiceIds).size === invoiceIds.length;
        },
        defaultMessage: (): string => 'reservations must not repeat an invoiceId',
      },
    },
    options,
  );
}
