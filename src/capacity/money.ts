import { ExchangeRates } from './ExchangeRates';

export const MAX_AMOUNT = 1_000_000_000_000_000;

const FX_RATE_DECIMALS = 10;
const FX_RATE_SCALE = 10n ** BigInt(FX_RATE_DECIMALS);
const DECIMAL = /^(\d{1,15})(?:\.(\d+))?$/;
const ISO_CURRENCIES = new Set(Intl.supportedValuesOf('currency'));

export interface Conversion {
  programAmount: number;
  fxRate: string;
}

export function isCurrency(value: unknown): value is string {
  return typeof value === 'string' && ISO_CURRENCIES.has(value);
}

export function isPositiveRate(value: string): boolean {
  return DECIMAL.test(value) && parseRate(value) > 0n;
}

export function minorUnitDigits(currency: string): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

export function parseRate(value: string): bigint {
  const match = DECIMAL.exec(value);
  if (match === null) {
    throw new RangeError(`${value} is not a decimal rate`);
  }
  const [, whole, fraction = ''] = match;
  const digits = BigInt(whole + fraction.padEnd(FX_RATE_DECIMALS + 1, '0').slice(0, FX_RATE_DECIMALS + 1));
  return (digits + 5n) / 10n;
}

export function formatRate(scaled: bigint): string {
  const whole = scaled / FX_RATE_SCALE;
  const fraction = (scaled % FX_RATE_SCALE).toString().padStart(FX_RATE_DECIMALS, '0').replace(/0+$/, '');
  return fraction === '' ? whole.toString() : `${whole}.${fraction}`;
}

export function divideRates(dividend: bigint, divisor: bigint): bigint {
  return (dividend * FX_RATE_SCALE * 2n + divisor) / (divisor * 2n);
}

export async function convert(amount: number, from: string, to: string, rates: ExchangeRates): Promise<Conversion> {
  if (from === to) {
    return { programAmount: amount, fxRate: '1' };
  }
  const rate = parseRate(await rates.rate(from, to));
  const digitShift = minorUnitDigits(to) - minorUnitDigits(from);
  const numerator = BigInt(amount) * rate * 10n ** BigInt(Math.max(digitShift, 0));
  const denominator = FX_RATE_SCALE * 10n ** BigInt(Math.max(-digitShift, 0));
  const programAmount = (numerator + denominator - 1n) / denominator;
  return { programAmount: Number(programAmount), fxRate: formatRate(rate) };
}
