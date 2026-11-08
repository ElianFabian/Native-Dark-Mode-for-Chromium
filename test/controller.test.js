import test from 'node:test';
import assert from 'node:assert/strict';
import { DarkModeController } from '../extension/controller.js';

function fixture({ commandError, attachError, scriptLoaded = true, themeApplied = true, url = 'https://example.org/' } = {}) {
  const data = {};
  const calls = [];
  const api = {
    storage: { session: {
      get: async key => ({ [key]: data[key] }),
      set: async value => Object.assign(data, value)
    } },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    tabs: {
      get: async () => ({ url }),
      sendMessage: async (...args) => {
        calls.push(['message', ...args]);
        if (!scriptLoaded) throw new Error('Could not establish connection. Receiving end does not exist.');
        return themeApplied;
      }
    },
    scripting: {
      executeScript: async details => {
        calls.push(['inject', details]);
        scriptLoaded = true;
      }
    },
    debugger: {
      attach: async (...args) => { calls.push(['attach', ...args]); if (attachError) throw new Error(attachError); },
      detach: async (...args) => { calls.push(['detach', ...args]); },
      sendCommand: async (...args) => { calls.push(['command', ...args]); if (commandError) throw new Error(commandError); }
    }
  };
  const controller = new DarkModeController(api);
  const apply = (tabId, enabled, automatic = false) => controller.reconcile(tabId, () => ({ enabled }), automatic);
  return { controller, apply, calls };
}

test('enables the filter, clears the override and detaches when disabled', async () => {
  const { controller, apply, calls } = fixture();
  assert.equal((await apply(7, true)).enabled, true);
  assert.equal((await apply(7, false)).enabled, false);
  assert.deepEqual(calls, [
    ['attach', { tabId: 7 }, '1.3'],
    ['command', { tabId: 7 }, 'Emulation.setAutoDarkModeOverride', { enabled: true }],
    ['command', { tabId: 7 }, 'Emulation.setAutoDarkModeOverride', {}],
    ['detach', { tabId: 7 }]
  ]);
});

test('a theme the page could not apply is not reported active', async () => {
  const { controller } = fixture({ themeApplied: false });
  await assert.rejects(controller.reconcile(7, () => ({ enabled: true, preset: 'soft' }), false),
    /could not be applied/);
  assert.deepEqual(await controller.read(7), { enabled: false });
});

test('custom presets clear native mode and are removed before native mode resumes', async () => {
  const { controller, apply, calls } = fixture();
  await apply(7, true);
  const custom = preset => controller.reconcile(7, () => ({ enabled: true, preset }), false);
  assert.deepEqual(await custom('soft'), { enabled: true, preset: 'soft' });
  assert.deepEqual(await custom('contrast'), { enabled: true, preset: 'contrast' });
  assert.deepEqual(await apply(7, true), { enabled: true });
  assert.deepEqual(calls.map(([type]) => type), [
    'attach', 'command', 'command', 'detach', 'message', 'message', 'message', 'message', 'message', 'attach', 'command'
  ]);
  assert.deepEqual(calls.filter(([type]) => type === 'message').map(([, , message]) => message.preset),
    ['soft', 'soft', 'contrast', 'contrast', undefined]);
});

test('disabling a custom preset clears the frame styles without attaching a debugger', async () => {
  const { controller, apply, calls } = fixture();
  await controller.reconcile(7, () => ({ enabled: true, preset: 'soft' }), false);
  await controller.disconnected(7, 'canceled_by_user');
  assert.deepEqual(await controller.read(7), { enabled: true, preset: 'soft' });
  assert.deepEqual(await apply(7, false), { enabled: false });
  assert.deepEqual(calls.map(([type]) => type), ['message', 'message', 'message']);
});

test('loads the custom theme script when the tab was already open', async () => {
  const { controller, calls } = fixture({ scriptLoaded: false });
  await controller.reconcile(7, () => ({ enabled: true, preset: 'soft' }), false);
  assert.deepEqual(calls.map(([type]) => type), ['message', 'inject', 'message', 'message']);
  assert.deepEqual(calls[1][1], { target: { tabId: 7, allFrames: true }, files: ['website-theme.js'] });
});

test('an unavailable method releases the connection and reports the error', async () => {
  const { controller, apply, calls } = fixture({ commandError: 'Method not found' });
  const result = await apply(7, true);
  assert.equal(result.enabled, false);
  assert.match(result.error, /Method not found/);
  assert.equal(calls.at(-1)[0], 'detach');
});

test('does not detach another tool when attach fails', async () => {
  const { controller, apply, calls } = fixture({ attachError: 'Another debugger is already attached' });
  assert.equal((await apply(7, true)).enabled, false);
  assert.equal(calls.length, 1);
});

test('canceling prevents reconnection on navigation', async () => {
  const { controller, apply, calls } = fixture();
  await apply(7, true);
  await controller.disconnected(7, 'canceled_by_user');
  const count = calls.length;
  await apply(7, true, true);
  assert.equal(calls.length, count);
  assert.equal((await controller.read(7)).enabled, false);
});

test('reload reapplies without attaching again and leaves other tabs disabled', async () => {
  const { controller, apply, calls } = fixture();
  await apply(7, true);
  await apply(7, true, true);
  assert.equal(calls.filter(call => call[0] === 'attach').length, 1);
  assert.equal(calls.filter(call => call[0] === 'command').length, 2);
  assert.equal((await controller.read(8)).enabled, false);
});

test('serializes concurrent enable and disable requests', async () => {
  const { controller, apply, calls } = fixture();
  await Promise.all([apply(7, true), apply(7, false)]);
  assert.equal((await controller.read(7)).enabled, false);
  assert.equal(calls.at(-1)[0], 'detach');
});

test('rejects internal pages without attaching', async () => {
  const { controller, apply, calls } = fixture({ url: 'brave://settings/' });
  assert.equal((await apply(7, true)).enabled, false);
  assert.equal(calls.length, 0);
});
