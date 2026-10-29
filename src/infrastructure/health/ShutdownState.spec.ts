import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { FORCED_EXIT_DELAY_MS, ShutdownState } from './ShutdownState';

describe('Health | ShutdownState', () => {
  let exit: ReturnType<typeof mock.method>;
  let state: ShutdownState;

  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout'] });
    exit = mock.method(process, 'exit', () => undefined);
    state = new ShutdownState({ info: mock.fn(), error: mock.fn() });
  });

  afterEach(() => {
    mock.timers.reset();
    mock.restoreAll();
  });

  it('reports a shutdown without forcing an exit when the app is closed without a signal', () => {
    state.beforeApplicationShutdown();
    mock.timers.tick(FORCED_EXIT_DELAY_MS * 2);

    assert.deepEqual([state.isShuttingDown, exit.mock.callCount()], [true, 0]);
  });

  it('forces an exit when a signalled shutdown does not finish in time', () => {
    state.beforeApplicationShutdown('SIGTERM');
    mock.timers.tick(FORCED_EXIT_DELAY_MS);

    assert.deepEqual(
      exit.mock.calls.map((call) => call.arguments),
      [[1]],
    );
  });
});
