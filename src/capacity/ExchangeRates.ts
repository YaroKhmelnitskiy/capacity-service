export abstract class ExchangeRates {
  public abstract rate(from: string, to: string): Promise<string>;
}
