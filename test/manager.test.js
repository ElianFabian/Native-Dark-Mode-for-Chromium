import test from 'node:test';
import assert from 'node:assert/strict';

test('the full-page manager can change a saved URL and export it without a website tab', async () => {
  let listener;
  const data = {};
  const event = { addListener() {} };
  globalThis.chrome = {
    runtime: {
      id: 'test', getURL: file => `chrome-extension://test/${file}`,
      onMessage: { addListener: callback => { listener = callback; } },
      onStartup: event, onInstalled: event
    },
    storage: { local: {
      get: async key => ({ [key]: data[key] }),
      set: async value => Object.assign(data, value)
    } },
    tabs: { query: async () => [], onUpdated: event, onRemoved: event },
    debugger: { onDetach: event }
  };
  try {
    await import('../extension/background.js');
    const send = message => new Promise(resolve => {
      assert.equal(listener(message, { id: 'test', url: chrome.runtime.getURL('options.html') }, resolve), true);
    });
    const created = await send({ type: 'save', rule: { url: 'example.com', enabled: true } });
    const edited = await send({ type: 'replace-scope', id: created.rules[0].id,
      rule: { url: 'example.org/guides', scope: 'section', enabled: false } });
    assert.equal(edited.rules.length, 1);
    assert.equal(edited.rules[0].enabled, true);
    const { backup } = await send({ type: 'export' });
    assert.deepEqual(backup.rules, [{ host: 'example.org', path: '/guides', enabled: true, includeSubdomains: false }]);
  } finally {
    delete globalThis.chrome;
  }
});
