import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { bearer, createProgram, errorCode, startTestApp, TestApp, token } from './testApp';

describe('E2E | Capacity API', () => {
  let testApp: TestApp;

  const capacityOf = async (programId: string): Promise<{ limit: number; reserved: number; available: number }> => {
    const response = await testApp.http().get(`/programs/${programId}`).set('Authorization', bearer()).expect(200);
    return response.body;
  };

  const reserve = (programId: string, body: object) =>
    testApp.http().post(`/programs/${programId}/reservations`).set('Authorization', bearer()).send(body);

  const release = (programId: string, invoiceId: string) =>
    testApp.http().post(`/programs/${programId}/reservations/${invoiceId}/release`).set('Authorization', bearer());

  before(async () => {
    testApp = await startTestApp();
  });

  beforeEach(async () => {
    await testApp.reset();
    await createProgram(testApp, 'prog-1', 10_000_000_00);
  });

  after(async () => {
    await testApp.close();
  });

  describe('authentication', () => {
    it('rejects requests without a token', async () => {
      await testApp.http().get('/programs/prog-1').expect(401);
      await testApp.http().post('/programs/prog-1/reservations').send({}).expect(401);
    });

    it('rejects a token signed with another secret', async () => {
      await testApp
        .http()
        .get('/programs/prog-1')
        .set('Authorization', `Bearer ${token('intruder', 'another-secret-that-is-long-enough-012345')}`)
        .expect(401);
    });

    it('rejects a malformed token', async () => {
      await testApp.http().get('/programs/prog-1').set('Authorization', 'Bearer not-a-jwt').expect(401);
    });

    it('keeps health checks and metrics open', async () => {
      await testApp.http().get('/health/liveness').expect(200);
      await testApp.http().get('/health/readiness').expect(200);
      await testApp.http().get('/metrics').expect(200);
    });
  });

  describe('capacity', () => {
    it('shows the limit, what is reserved and what is available', async () => {
      const response = await testApp.http().get('/programs/prog-1').set('Authorization', bearer()).expect(200);
      assert.deepEqual(response.body, {
        programId: 'prog-1',
        currency: 'USD',
        limit: 10_000_000_00,
        reserved: 0,
        available: 10_000_000_00,
      });
    });

    it('returns 404 for an unknown program', async () => {
      const response = await testApp.http().get('/programs/nope').set('Authorization', bearer()).expect(404);
      assert.strictEqual(errorCode(response.body), 'PROGRAM_NOT_FOUND');
    });
  });

  describe('reserve and release', () => {
    it('reserves capacity and gives it back on release', async () => {
      const reserved = await reserve('prog-1', { invoiceId: 'inv-1', amount: 2_500_000_00, currency: 'USD' }).expect(
        201,
      );
      assert.partialDeepStrictEqual(reserved.body, {
        programId: 'prog-1',
        invoiceId: 'inv-1',
        amount: 2_500_000_00,
        currency: 'USD',
        programAmount: 2_500_000_00,
        fxRate: '1',
        status: 'RESERVED',
        releasedAt: null,
      });
      assert.deepEqual(await capacityOf('prog-1'), {
        programId: 'prog-1',
        currency: 'USD',
        limit: 10_000_000_00,
        reserved: 2_500_000_00,
        available: 7_500_000_00,
      });

      const released = await release('prog-1', 'inv-1').expect(200);
      assert.strictEqual(released.body.status, 'RELEASED');
      assert.ok(released.body.releasedAt);
      assert.strictEqual((await capacityOf('prog-1')).available, 10_000_000_00);

      const fetched = await testApp
        .http()
        .get('/programs/prog-1/reservations/inv-1')
        .set('Authorization', bearer())
        .expect(200);
      assert.deepEqual(fetched.body, released.body);
    });

    it('treats a repeated reservation as a retry', async () => {
      const body = { invoiceId: 'inv-1', amount: 1_000_00, currency: 'USD' };
      const first = await reserve('prog-1', body).expect(201);
      const second = await reserve('prog-1', body).expect(200);
      assert.deepEqual(second.body, first.body);
      assert.strictEqual((await capacityOf('prog-1')).reserved, 1_000_00);
    });

    it('rejects the same invoice with another amount', async () => {
      await reserve('prog-1', { invoiceId: 'inv-1', amount: 1_000_00, currency: 'USD' }).expect(201);
      const response = await reserve('prog-1', { invoiceId: 'inv-1', amount: 2_000_00, currency: 'USD' }).expect(409);
      assert.strictEqual(errorCode(response.body), 'INVOICE_ALREADY_RESERVED');
      assert.strictEqual((await capacityOf('prog-1')).reserved, 1_000_00);
    });

    it('does not release twice', async () => {
      await reserve('prog-1', { invoiceId: 'inv-1', amount: 1_000_00, currency: 'USD' }).expect(201);
      await reserve('prog-1', { invoiceId: 'inv-2', amount: 3_000_00, currency: 'USD' }).expect(201);
      await release('prog-1', 'inv-1').expect(200);
      await release('prog-1', 'inv-1').expect(200);
      assert.strictEqual((await capacityOf('prog-1')).reserved, 3_000_00);
    });

    it('does not reserve a released invoice again', async () => {
      const body = { invoiceId: 'inv-1', amount: 1_000_00, currency: 'USD' };
      await reserve('prog-1', body).expect(201);
      await release('prog-1', 'inv-1').expect(200);
      const repeated = await reserve('prog-1', body).expect(200);
      assert.strictEqual(repeated.body.status, 'RELEASED');
      assert.strictEqual((await capacityOf('prog-1')).reserved, 0);
    });

    it('rejects a reservation larger than what is available', async () => {
      await reserve('prog-1', { invoiceId: 'inv-1', amount: 9_000_000_00, currency: 'USD' }).expect(201);
      const response = await reserve('prog-1', {
        invoiceId: 'inv-2',
        amount: 1_000_000_01,
        currency: 'USD',
      }).expect(409);
      assert.strictEqual(errorCode(response.body), 'INSUFFICIENT_CAPACITY');
      await reserve('prog-1', { invoiceId: 'inv-3', amount: 1_000_000_00, currency: 'USD' }).expect(201);
      assert.strictEqual((await capacityOf('prog-1')).available, 0);
    });

    it('never exceeds the limit under concurrent reservations', async () => {
      await createProgram(testApp, 'prog-small', 10_000);
      const responses = await Promise.all(
        Array.from({ length: 25 }, (_, index) =>
          reserve('prog-small', { invoiceId: `inv-${index}`, amount: 1_000, currency: 'USD' }),
        ),
      );
      const statuses = responses.map((response) => response.status).sort();
      assert.strictEqual(statuses.filter((status) => status === 201).length, 10);
      assert.strictEqual(statuses.filter((status) => status === 409).length, 15);
      assert.deepEqual(await capacityOf('prog-small'), {
        programId: 'prog-small',
        currency: 'USD',
        limit: 10_000,
        reserved: 10_000,
        available: 0,
      });
    });

    it('reserves the same invoice once under concurrent retries', async () => {
      const body = { invoiceId: 'inv-1', amount: 1_000_00, currency: 'USD' };
      const responses = await Promise.all(Array.from({ length: 10 }, () => reserve('prog-1', body)));
      assert.deepEqual(
        responses.map((response) => response.status).sort(),
        [200, 200, 200, 200, 200, 200, 200, 200, 200, 201],
      );
      assert.strictEqual((await capacityOf('prog-1')).reserved, 1_000_00);
    });

    it('returns 404 when releasing an unknown invoice', async () => {
      const response = await release('prog-1', 'nope').expect(404);
      assert.strictEqual(errorCode(response.body), 'RESERVATION_NOT_FOUND');
    });

    it('returns 404 when reserving in an unknown program', async () => {
      const response = await reserve('nope', { invoiceId: 'inv-1', amount: 100, currency: 'USD' }).expect(404);
      assert.strictEqual(errorCode(response.body), 'PROGRAM_NOT_FOUND');
    });
  });

  describe('currencies', () => {
    it('converts an invoice into the program currency at the configured rate, rounding up', async () => {
      const response = await reserve('prog-1', { invoiceId: 'inv-eur', amount: 1_000_01, currency: 'EUR' }).expect(201);
      assert.partialDeepStrictEqual(response.body, {
        amount: 1_000_01,
        currency: 'EUR',
        programAmount: 1_080_02,
        fxRate: '1.08',
      });
      assert.strictEqual((await capacityOf('prog-1')).reserved, 1_080_02);
    });

    it('respects the minor units of each currency', async () => {
      const yen = await reserve('prog-1', { invoiceId: 'inv-jpy', amount: 150_000, currency: 'JPY' }).expect(201);
      assert.strictEqual(yen.body.programAmount, 1_005_00);
      const dinar = await reserve('prog-1', { invoiceId: 'inv-kwd', amount: 1_000, currency: 'KWD' }).expect(201);
      assert.strictEqual(dinar.body.programAmount, 3_25);
    });

    it('releases exactly the amount that was reserved', async () => {
      await reserve('prog-1', { invoiceId: 'inv-eur', amount: 333_33, currency: 'EUR' }).expect(201);
      await release('prog-1', 'inv-eur').expect(200);
      assert.strictEqual((await capacityOf('prog-1')).reserved, 0);
    });

    it('rejects a currency without a configured rate', async () => {
      const response = await reserve('prog-1', { invoiceId: 'inv-1', amount: 100, currency: 'CHF' }).expect(422);
      assert.strictEqual(errorCode(response.body), 'UNSUPPORTED_CURRENCY');
    });
  });

  describe('validation', () => {
    for (const [name, body] of [
      ['a missing invoiceId', { amount: 100, currency: 'USD' }],
      ['a fractional amount', { invoiceId: 'inv-1', amount: 10.5, currency: 'USD' }],
      ['a zero amount', { invoiceId: 'inv-1', amount: 0, currency: 'USD' }],
      ['an amount as a string', { invoiceId: 'inv-1', amount: '100', currency: 'USD' }],
      ['an unknown currency code', { invoiceId: 'inv-1', amount: 100, currency: 'XYZ' }],
      ['an unknown field', { invoiceId: 'inv-1', amount: 100, currency: 'USD', note: 'x' }],
    ] as const) {
      it(`rejects ${name}`, async () => {
        await reserve('prog-1', body).expect(400);
        assert.strictEqual((await capacityOf('prog-1')).reserved, 0);
      });
    }
  });
});
