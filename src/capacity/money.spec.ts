import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ExchangeRates } from './ExchangeRates';
import { convert, formatRate, isCurrency, isPositiveRate, minorUnitDigits, parseRate } from './money';

class FixedRates extends ExchangeRates {
  public readonly requested: string[] = [];

  public constructor(private readonly rates: Record<string, string>) {
    super();
  }

  public override async rate(from: string, to: string): Promise<string> {
    this.requested.push(`${from}/${to}`);
    return this.rates[`${from}/${to}`] ?? '0';
  }
}

describe('Capacity | money', () => {
  const rates = new FixedRates({
    'EUR/USD': '1.08',
    'EUR/GBP': '0.85039370078740157',
    'USD/JPY': '149.2537313432835821',
    'JPY/USD': '0.0067',
  });

  it('keeps the amount for the same currency without asking for a rate', async () => {
    const unused = new FixedRates({});
    assert.deepEqual(await convert(12_345, 'CHF', 'CHF', unused), { programAmount: 12_345, fxRate: '1' });
    assert.deepEqual(unused.requested, []);
  });

  it('rounds up to the next minor unit', async () => {
    assert.deepEqual(await convert(100, 'EUR', 'USD', rates), { programAmount: 108, fxRate: '1.08' });
    assert.deepEqual(await convert(1, 'EUR', 'USD', rates), { programAmount: 2, fxRate: '1.08' });
  });

  it('rounds the rate to 10 decimal places and converts with that rate', async () => {
    assert.deepEqual(await convert(1_000_000_00, 'EUR', 'GBP', rates), {
      programAmount: 85_039_371,
      fxRate: '0.8503937008',
    });
  });

  it('accounts for currencies with other minor units', async () => {
    assert.strictEqual((await convert(100_00, 'USD', 'JPY', rates)).programAmount, 14_926);
    assert.strictEqual((await convert(150_000, 'JPY', 'USD', rates)).programAmount, 1_005_00);
  });

  it('parses a rate to 10 decimal places, rounding half up', () => {
    assert.strictEqual(parseRate('1.08'), 10_800_000_000n);
    assert.strictEqual(parseRate('0.00000000005'), 1n);
    assert.strictEqual(parseRate('0.00000000004999'), 0n);
    assert.throws(() => parseRate('1e3'), RangeError);
  });

  it('formats a rate without trailing zeros', () => {
    assert.strictEqual(formatRate(10_800_000_000n), '1.08');
    assert.strictEqual(formatRate(10_000_000_000n), '1');
    assert.strictEqual(formatRate(1n), '0.0000000001');
  });

  it('accepts only positive decimal rates', () => {
    assert.ok(isPositiveRate('0.0067'));
    assert.ok(!isPositiveRate('0'));
    assert.ok(!isPositiveRate('-1'));
    assert.ok(!isPositiveRate('1e3'));
    assert.ok(!isPositiveRate('1234567890123456'));
  });

  it('knows the ISO 4217 minor units', () => {
    assert.strictEqual(minorUnitDigits('USD'), 2);
    assert.strictEqual(minorUnitDigits('JPY'), 0);
    assert.strictEqual(minorUnitDigits('KWD'), 3);
  });

  it('accepts only ISO 4217 codes', () => {
    assert.ok(isCurrency('EUR'));
    assert.ok(!isCurrency('eur'));
    assert.ok(!isCurrency('XYZ'));
    assert.ok(!isCurrency(42));
  });
});
