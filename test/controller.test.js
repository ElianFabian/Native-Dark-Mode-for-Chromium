import test from 'node:test';
import assert from 'node:assert/strict';
import { DarkModeController } from '../extension/controller.js';

function fixture({ commandError, attachError, url = 'https://example.org/' } = {}) {
  const data = {};
  const calls = [];
  const api = {
    storage: { session: {
      get: async key => ({ [key]: data[key] }),
      set: async value => Object.assign(data, value)
    } },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    tabs: { get: async () => ({ url }) },
    debugger: {
      attach: async (...args) => { calls.push(['attach', ...args]); if (attachError) throw new Error(attachError); },
      detach: async (...args) => { calls.push(['detach', ...args]); },
      sendCommand: async (...args) => { calls.push(['command', ...args]); if (commandError) throw new Error(commandError); }
    }
  };
  return { controller: new DarkModeController(api), calls };
}

test('enables the filter, clears the override and detaches when disabled', async () => {
  const { controller, calls } = fixture();
  assert.equal((await controller.set(7, true)).enabled, true);
  assert.equal((await controller.set(7, false)).enabled, false);
  assert.deepEqual(calls, [
    ['attach', { tabId: 7 }, '1.3'],
    ['command', { tabId: 7 }, 'Emulation.setAutoDarkModeOverride', { enabled: true }],
    ['command', { tabId: 7 }, 'Emulation.setAutoDarkModeOverride', {}],
    ['detach', { tabId: 7 }]
  ]);
});

test('an unavailable method releases the connection and reports the error', async () => {
  const { controller, calls } = fixture({ commandError: 'Method not found' });
  const result = await controller.set(7, true);
  assert.equal(result.enabled, false);
  assert.match(result.error, /Method not found/);
  assert.equal(calls.at(-1)[0], 'detach');
});

test('does not detach another tool when attach fails', async () => {
  const { controller, calls } = fixture({ attachError: 'Another debugger is already attached' });
  assert.equal((await controller.set(7, true)).enabled, false);
  assert.equal(calls.length, 1);
});

test('canceling prevents reconnection on navigation', async () => {
  const { controller, calls } = fixture();
  await controller.set(7, true);
  await controller.disconnected(7, 'canceled_by_user');
  const count = calls.length;
  await controller.navigation(7);
  assert.equal(calls.length, count);
  assert.equal((await controller.read(7)).enabled, false);
});

test('reload reapplies without attaching again and leaves other tabs disabled', async () => {
  const { controller, calls } = fixture();
  await controller.set(7, true);
  await controller.navigation(7);
  await controller.navigation(8);
  assert.equal(calls.filter(call => call[0] === 'attach').length, 1);
  assert.equal(calls.filter(call => call[0] === 'command').length, 2);
  assert.equal((await controller.read(8)).enabled, false);
});

test('serializes concurrent enable and disable requests', async () => {
  const { controller, calls } = fixture();
  await Promise.all([controller.set(7, true), controller.set(7, false)]);
  assert.equal((await controller.read(7)).enabled, false);
  assert.equal(calls.at(-1)[0], 'detach');
});

test('rejects internal pages without attaching', async () => {
  const { controller, calls } = fixture({ url: 'brave://settings/' });
  assert.equal((await controller.set(7, true)).enabled, false);
  assert.equal(calls.length, 0);
});
