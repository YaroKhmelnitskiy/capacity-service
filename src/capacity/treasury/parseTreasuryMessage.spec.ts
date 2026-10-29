import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TreasuryMessageType } from '../types';
import { InvalidTreasuryMessageError, parseTreasuryMessage } from './parseTreasuryMessage';

const encode = (value: unknown): Buffer => Buffer.from(JSON.stringify(value));

describe('Treasury | parseTreasuryMessage', () => {
  const limitUpdate = { type: 'LIMIT_UPDATED', programId: 'prog-1', currency: 'USD', limit: 1_000, version: 3 };
  const reconciliation = {
    ...limitUpdate,
    type: 'RECONCILIATION',
    asOf: '2026-10-27T09:00:00Z',
    reservations: [{ invoiceId: 'inv-1', amount: 100, currency: 'EUR', programAmount: 108 }],
  };

  it('parses a limit update', () => {
    assert.deepEqual(parseTreasuryMessage(encode(limitUpdate)), {
      ...limitUpdate,
      type: TreasuryMessageType.LIMIT_UPDATED,
    });
  });

  it('parses a reconciliation', () => {
    assert.deepEqual(parseTreasuryMessage(encode(reconciliation)), {
      ...reconciliation,
      type: TreasuryMessageType.RECONCILIATION,
      asOf: new Date('2026-10-27T09:00:00Z'),
    });
  });

  for (const [name, value] of [
    ['an empty value', null],
    ['a value that is not JSON', Buffer.from('{')],
    ['a JSON array', encode([])],
    ['an unknown type', encode({ ...limitUpdate, type: 'LIMIT_DELETED' })],
    ['a negative limit', encode({ ...limitUpdate, limit: -1 })],
    ['a missing version', encode({ ...limitUpdate, version: undefined })],
    ['a zero version', encode({ ...limitUpdate, version: 0 })],
    ['an unknown field', encode({ ...limitUpdate, extra: true })],
    ['a reconciliation without asOf', encode({ ...reconciliation, asOf: undefined })],
    ['a reconciliation with a local asOf', encode({ ...reconciliation, asOf: '2026-10-27T09:00:00' })],
    [
      'a repeated invoice',
      encode({ ...reconciliation, reservations: [...reconciliation.reservations, ...reconciliation.reservations] }),
    ],
    ['an invalid reservation', encode({ ...reconciliation, reservations: [{ invoiceId: 'inv-1', amount: 0 }] })],
  ] as const) {
    it(`rejects ${name}`, () => {
      assert.throws(() => parseTreasuryMessage(value), InvalidTreasuryMessageError);
    });
  }

  it('names the nested field that is wrong', () => {
    assert.throws(
      () =>
        parseTreasuryMessage(
          encode({ ...reconciliation, reservations: [{ ...reconciliation.reservations[0], currency: 'X' }] }),
        ),
      /reservations\.0\.currency must be an ISO 4217 currency code/,
    );
  });
});
