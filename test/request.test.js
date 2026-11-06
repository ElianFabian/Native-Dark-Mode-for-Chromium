import test from 'node:test';
import assert from 'node:assert/strict';
import { requestWithTimeout } from '../extension/request.js';

test('a stalled browser reply rejects so the popup can restore its controls', async () => {
  await assert.rejects(
    requestWithTimeout({ sendMessage: () => new Promise(() => {}) }, {}, 5),
    /rule may already be saved/
  );
});

test('normal replies and immediate errors are preserved', async () => {
  assert.deepEqual(await requestWithTimeout({ sendMessage: async () => ({ enabled: true }) }, {}), { enabled: true });
  await assert.rejects(requestWithTimeout({ sendMessage: async () => { throw new Error('Disconnected'); } }, {}), /Disconnected/);
});
