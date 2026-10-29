import { ExchangeRates } from '../../capacity/ExchangeRates';
import { UnsupportedCurrencyError } from '../../capacity/errors';
import { divideRates, formatRate, parseRate } from '../../capacity/money';

export class ConfiguredExchangeRates extends ExchangeRates {
  private readonly valueInBase: ReadonlyMap<string, bigint>;

  public constructor(valueInBase: Record<string, string>) {
    super();
    this.valueInBase = new Map(Object.entries(valueInBase).map(([currency, value]) => [currency, parseRate(value)]));
  }

  public override async rate(from: string, to: string): Promise<string> {
    return formatRate(divideRates(this.baseValueOf(from), this.baseValueOf(to)));
  }

  private baseValueOf(currency: string): bigint {
    const value = this.valueInBase.get(currency);
    if (value === undefined) {
      throw new UnsupportedCurrencyError(currency);
    }
    return value;
  }
}
