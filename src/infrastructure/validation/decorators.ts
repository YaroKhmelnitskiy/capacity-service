import { isISO8601, ValidateBy, ValidationArguments, ValidationOptions } from 'class-validator';

const MAX_ID_LENGTH = 255;
const CONTROL_CHARACTER = /\p{Cc}/u;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

export function isId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.isWellFormed() &&
    !CONTROL_CHARACTER.test(value) &&
    [...value].length <= MAX_ID_LENGTH
  );
}

export function describeIdRule(name: string): string {
  return `${name} must be a non-blank string of at most ${MAX_ID_LENGTH} characters without control characters`;
}

export function IsId(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isId',
      validator: {
        validate: isId,
        defaultMessage: (args?: ValidationArguments): string => describeIdRule(args?.property ?? 'id'),
      },
    },
    options,
  );
}

export function IsIsoInstant(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isIsoInstant',
      validator: {
        validate: (value: unknown): boolean =>
          typeof value === 'string' && ISO_INSTANT.test(value) && isISO8601(value, { strict: true }),
        defaultMessage: (args?: ValidationArguments): string =>
          `${args?.property ?? 'date'} must be an ISO 8601 date-time with a time zone, e.g. 2026-10-27T09:00:00Z`,
      },
    },
    options,
  );
}
