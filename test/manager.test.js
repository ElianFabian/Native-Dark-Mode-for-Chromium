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
    const rule = { host: 'example.org', path: '/guides', enabled: true, includeSubdomains: false, createdAt: created.rules[0].createdAt };
    assert.deepEqual(backup.rules, [rule]);
    const deleted = await send({ type: 'remove', id: edited.rules[0].id });
    assert.equal(deleted.rules.length, 0);
    assert.equal(deleted.trash.length, 1);
    const recreated = await send({ type: 'save', rule: { url: 'example.org/guides', scope: 'section', enabled: false } });
    assert.match((await send({ type: 'restore', id: deleted.trash[0].id })).error, /already exists/);
    assert.equal((await send({ type: 'status' })).trash.length, 1);
    await send({ type: 'remove', id: recreated.rules[0].id });
    const restored = await send({ type: 'restore', id: deleted.trash[0].id });
    assert.equal(restored.trash.length, 1);
    assert.deepEqual((await send({ type: 'export' })).backup.rules, [rule]);
    const another = await send({ type: 'save', rule: { url: 'example.net', enabled: false } });
    await send({ type: 'remove', id: another.rules.find(entry => entry.host === 'example.net').id });
    const cleared = await send({ type: 'empty-trash', ids: restored.trash.map(entry => entry.id) });
    assert.deepEqual(cleared.trash.map(entry => entry.rule.host), ['example.net']);
    assert.deepEqual(cleared.rules, restored.rules);
    const emptied = await send({ type: 'empty-trash', ids: cleared.trash.map(entry => entry.id) });
    assert.deepEqual(emptied.trash, []);
  } finally {
    delete globalThis.chrome;
  }
});
