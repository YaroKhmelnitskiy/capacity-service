import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { CurrencyMismatchError } from '../capacity/errors';
import { ReconciledReservation, TreasuryMessageType } from '../capacity/types';
import { bearer, createProgram, startTestApp, TestApp } from './testApp';

const MINUTE_MS = 60_000;

describe('E2E | Treasury updates', () => {
  let testApp: TestApp;

  const capacityOf = async (programId: string): Promise<{ limit: number; reserved: number; available: number }> => {
    const response = await testApp.http().get(`/programs/${programId}`).set('Authorization', bearer()).expect(200);
    return response.body;
  };

  const reservationOf = async (invoiceId: string): Promise<{ status: string; programAmount: number }> => {
    const response = await testApp
      .http()
      .get(`/programs/prog-1/reservations/${invoiceId}`)
      .set('Authorization', bearer())
      .expect(200);
    return response.body;
  };

  const reserve = (invoiceId: string, amount: number) =>
    testApp
      .http()
      .post('/programs/prog-1/reservations')
      .set('Authorization', bearer())
      .send({ invoiceId, amount, currency: 'USD' });

  const reconcile = (version: number, asOf: Date, reservations: ReconciledReservation[], limit = 100_000) =>
    testApp.capacity.applyTreasuryMessage({
      type: TreasuryMessageType.RECONCILIATION,
      programId: 'prog-1',
      currency: 'USD',
      limit,
      version,
      asOf,
      reservations,
    });

  const outstanding = (invoiceId: string, programAmount: number): ReconciledReservation => ({
    invoiceId,
    amount: programAmount,
    currency: 'USD',
    programAmount,
  });

  const minutesFromNow = (minutes: number): Date => new Date(Date.now() + minutes * MINUTE_MS);

  before(async () => {
    testApp = await startTestApp();
  });

  beforeEach(async () => {
    await testApp.reset();
    await createProgram(testApp, 'prog-1', 100_000);
  });

  after(async () => {
    await testApp.close();
  });

  describe('limit updates', () => {
    it('changes the limit', async () => {
      await testApp.capacity.applyTreasuryMessage({
        type: TreasuryMessageType.LIMIT_UPDATED,
        programId: 'prog-1',
        currency: 'USD',
        limit: 250_000,
        version: 2,
      });
      assert.strictEqual((await capacityOf('prog-1')).limit, 250_000);
    });

    it('ignores a repeated or older version', async () => {
      await createProgram(testApp, 'prog-1', 999);
      assert.strictEqual((await capacityOf('prog-1')).limit, 100_000);
    });

    it('rejects a different currency for an existing program', async () => {
      await assert.rejects(
        testApp.capacity.applyTreasuryMessage({
          type: TreasuryMessageType.LIMIT_UPDATED,
          programId: 'prog-1',
          currency: 'EUR',
          limit: 1,
          version: 2,
        }),
        CurrencyMismatchError,
      );
      assert.strictEqual((await capacityOf('prog-1')).limit, 100_000);
    });

    it('keeps reservations when the limit drops below them', async () => {
      await reserve('inv-1', 80_000).expect(201);
      await testApp.capacity.applyTreasuryMessage({
        type: TreasuryMessageType.LIMIT_UPDATED,
        programId: 'prog-1',
        currency: 'USD',
        limit: 50_000,
        version: 2,
      });
      assert.deepEqual(await capacityOf('prog-1'), {
        programId: 'prog-1',
        currency: 'USD',
        limit: 50_000,
        reserved: 80_000,
        available: -30_000,
      });
      await reserve('inv-2', 1).expect(409);
      await testApp
        .http()
        .post('/programs/prog-1/reservations/inv-1/release')
        .set('Authorization', bearer())
        .expect(200);
      assert.strictEqual((await capacityOf('prog-1')).available, 50_000);
    });
  });

  describe('reconciliation', () => {
    it('creates a program with its outstanding reservations', async () => {
      await testApp.capacity.applyTreasuryMessage({
        type: TreasuryMessageType.RECONCILIATION,
        programId: 'prog-new',
        currency: 'EUR',
        limit: 500_000,
        version: 7,
        asOf: minutesFromNow(-1),
        reservations: [outstanding('inv-a', 1_000), outstanding('inv-b', 2_000)],
      });
      assert.deepEqual(await capacityOf('prog-new'), {
        programId: 'prog-new',
        currency: 'EUR',
        limit: 500_000,
        reserved: 3_000,
        available: 497_000,
      });
    });

    it('brings older local state up to date with the snapshot', async () => {
      await reserve('inv-kept', 10_000).expect(201);
      await reserve('inv-repaid', 20_000).expect(201);

      await reconcile(
        2,
        minutesFromNow(1),
        [outstanding('inv-kept', 12_000), outstanding('inv-treasury', 5_000)],
        90_000,
      );

      assert.partialDeepStrictEqual(await reservationOf('inv-kept'), { status: 'RESERVED', programAmount: 12_000 });
      assert.partialDeepStrictEqual(await reservationOf('inv-repaid'), { status: 'RELEASED' });
      assert.partialDeepStrictEqual(await reservationOf('inv-treasury'), {
        status: 'RESERVED',
        programAmount: 5_000,
        fxRate: null,
      });
      assert.deepEqual(await capacityOf('prog-1'), {
        programId: 'prog-1',
        currency: 'USD',
        limit: 90_000,
        reserved: 17_000,
        available: 73_000,
      });
    });

    it('keeps changes made here after the snapshot was taken', async () => {
      const asOf = minutesFromNow(-1);
      await reserve('inv-new', 10_000).expect(201);
      await reserve('inv-repaid', 20_000).expect(201);
      await testApp
        .http()
        .post('/programs/prog-1/reservations/inv-repaid/release')
        .set('Authorization', bearer())
        .expect(200);

      await reconcile(2, asOf, [outstanding('inv-repaid', 20_000)]);

      assert.partialDeepStrictEqual(await reservationOf('inv-new'), { status: 'RESERVED' });
      assert.partialDeepStrictEqual(await reservationOf('inv-repaid'), { status: 'RELEASED' });
      assert.strictEqual((await capacityOf('prog-1')).reserved, 10_000);
    });

    it('ignores a snapshot older than the version already applied', async () => {
      await reconcile(5, minutesFromNow(1), [outstanding('inv-a', 1_000)]);
      await reconcile(4, minutesFromNow(2), [], 1);
      assert.deepEqual(await capacityOf('prog-1'), {
        programId: 'prog-1',
        currency: 'USD',
        limit: 100_000,
        reserved: 1_000,
        available: 99_000,
      });
    });

    it('releases everything when the snapshot lists no reservations', async () => {
      await reserve('inv-1', 10_000).expect(201);
      await reconcile(2, minutesFromNow(1), []);
      assert.strictEqual((await capacityOf('prog-1')).reserved, 0);
    });

    it('handles a snapshot larger than one insert batch', async () => {
      const reservations = Array.from({ length: 2_500 }, (_, index) => outstanding(`inv-${index}`, 10));
      await reconcile(2, minutesFromNow(1), reservations);
      assert.strictEqual((await capacityOf('prog-1')).reserved, 25_000);
    });
  });
});
