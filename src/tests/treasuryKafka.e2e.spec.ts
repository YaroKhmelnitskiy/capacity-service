import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { bearer, startTestApp, TestApp } from './testApp';

const BROKERS = (process.env.TEST_KAFKA_BROKERS ?? 'localhost:9094').split(',');
const WAIT_TIMEOUT_MS = 20_000;

describe('E2E | Treasury messages through Kafka', () => {
  const topic = `treasury.capacity.test.${randomUUID()}`;
  const kafka = new KafkaJS.Kafka({ kafkaJS: { brokers: BROKERS, logLevel: KafkaJS.logLevel.NOTHING } });
  const admin = kafka.admin();
  const producer = kafka.producer();
  let testApp: TestApp;

  const send = async (programId: string, value: string): Promise<void> => {
    await producer.send({ topic, messages: [{ key: programId, value }] });
  };

  const waitForLimit = async (programId: string, limit: number): Promise<void> => {
    const deadline = Date.now() + WAIT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const response = await testApp.http().get(`/programs/${programId}`).set('Authorization', bearer());
      if (response.status === 200 && response.body.limit === limit) {
        return;
      }
      await sleep(200);
    }
    assert.fail(`program ${programId} did not reach limit ${limit}`);
  };

  before(async () => {
    await admin.connect();
    await admin.createTopics({ topics: [{ topic, numPartitions: 1 }] });
    await producer.connect();
    testApp = await startTestApp({ brokers: BROKERS, topic, groupId: `capacity-test-${randomUUID()}` });
  });

  after(async () => {
    await testApp.close();
    await producer.disconnect();
    await admin.deleteTopics({ topics: [topic] });
    await admin.disconnect();
  });

  it('applies limit updates and reconciliations from the topic', async () => {
    await send(
      'prog-k',
      JSON.stringify({ type: 'LIMIT_UPDATED', programId: 'prog-k', currency: 'USD', limit: 1_000_000, version: 1 }),
    );
    await waitForLimit('prog-k', 1_000_000);

    await send(
      'prog-k',
      JSON.stringify({
        type: 'RECONCILIATION',
        programId: 'prog-k',
        currency: 'USD',
        limit: 2_000_000,
        version: 2,
        asOf: new Date().toISOString(),
        reservations: [{ invoiceId: 'inv-1', amount: 500_000, currency: 'USD', programAmount: 500_000 }],
      }),
    );
    await waitForLimit('prog-k', 2_000_000);
    const response = await testApp.http().get('/programs/prog-k').set('Authorization', bearer()).expect(200);
    assert.strictEqual(response.body.available, 1_500_000);
  });

  it('skips a message it cannot apply and carries on with the next one', async () => {
    await send('prog-bad', 'not json');
    await send('prog-bad', JSON.stringify({ type: 'LIMIT_UPDATED', programId: 'prog-bad', limit: -1 }));
    await send(
      'prog-bad',
      JSON.stringify({ type: 'LIMIT_UPDATED', programId: 'prog-bad', currency: 'USD', limit: 42, version: 1 }),
    );
    await waitForLimit('prog-bad', 42);
  });
});
