import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UnsupportedCurrencyError } from '../../capacity/errors';
import { ConfiguredExchangeRates } from './ConfiguredExchangeRates';

describe('FX | ConfiguredExchangeRates', () => {
  const rates = new ConfiguredExchangeRates({ USD: '1', EUR: '1.08', GBP: '1.27' });

  it('gives the rate against the base currency', async () => {
    assert.strictEqual(await rates.rate('EUR', 'USD'), '1.08');
  });

  it('gives a cross rate through the base currency, rounded to 10 decimal places', async () => {
    assert.strictEqual(await rates.rate('EUR', 'GBP'), '0.8503937008');
  });

  it('rejects a currency without a configured value', async () => {
    await assert.rejects(rates.rate('CHF', 'USD'), UnsupportedCurrencyError);
    await assert.rejects(rates.rate('USD', 'CHF'), UnsupportedCurrencyError);
  });
});
