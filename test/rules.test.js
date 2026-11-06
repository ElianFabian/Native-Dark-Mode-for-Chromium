import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRule, matchingRule, RuleManager } from '../extension/rules.js';
import { DarkModeController } from '../extension/controller.js';

const rule = (url, enabled = true, extra = {}) => normalizeRule({ url, enabled, scope: 'section', ...extra });

test('section boundaries and longest-path exclusions override website rules', () => {
  const rules = [rule('example.com/'), rule('example.com/photos/', false), rule('example.com/photos/articles/')];
  assert.equal(matchingRule(rules, 'https://example.com/photos').enabled, false);
  assert.equal(matchingRule(rules, 'https://example.com/photos/one?x=1#top').enabled, false);
  assert.equal(matchingRule(rules, 'https://example.com/photos-extra').enabled, true);
  assert.equal(matchingRule(rules, 'https://example.com/photos/articles/one').enabled, true);
  assert.equal(matchingRule(rules, 'https://example.com/Photos').enabled, true);
  assert.equal(matchingRule(rules, 'https://example.com/photos%2Fone').enabled, true);
});

test('hostname boundaries, explicit subdomains, exact matches and ports', () => {
  const inherited = rule('example.com', true, { includeSubdomains: true });
  assert.equal(matchingRule([inherited], 'https://otherexample.com/'), undefined);
  assert.equal(matchingRule([inherited], 'https://sub.example.com/').enabled, true);
  assert.equal(matchingRule([rule('example.com')], 'https://sub.example.com/'), undefined);
  assert.equal(matchingRule([inherited, rule('sub.example.com', false)], 'https://sub.example.com/').enabled, false);
  assert.equal(matchingRule([rule('example.com:8765')], 'http://example.com:8765/').enabled, true);
  assert.equal(matchingRule([rule('example.com:8765')], 'http://example.com:8766/'), undefined);
});

test('normalization merges trailing slash variants and rejects unsafe schemes', () => {
  assert.equal(rule('example.com/photos/').id, rule('https://example.com/photos?x=1#top').id);
  assert.equal(rule('example.com/photos', true, { scope: 'website' }).path, '/');
  assert.throws(() => rule('file:///tmp/test'));
  assert.throws(() => rule('https://name:secret@example.com'));
});

function integration() {
  const local = {};
  const session = {};
  const calls = [];
  const tab = { id: 7, url: 'https://example.com/articles/one' };
  const store = data => ({ get: async key => ({ [key]: data[key] }), set: async value => Object.assign(data, value) });
  const api = {
    storage: { local: store(local), session: store(session) },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    tabs: { get: async () => tab, query: async () => [tab] },
    debugger: {
      attach: async () => calls.push('attach'), detach: async () => calls.push('detach'),
      sendCommand: async (...args) => calls.push(args)
    },
    scripting: {
      insertCSS: async value => calls.push(['insertCSS', value]),
      removeCSS: async value => calls.push(['removeCSS', value])
    }
  };
  const controller = new DarkModeController(api);
  return { api, controller, manager: new RuleManager(api, controller), tab, calls };
}

test('saved rules persist across managers; disable retains entry and detaches', async () => {
  const { api, controller, manager, calls } = integration();
  await manager.save({ url: 'example.com', scope: 'website', enabled: true });
  await new RuleManager(api, controller).applyAll();
  assert.equal((await controller.read(7)).enabled, true);
  const [saved] = await manager.list();
  await manager.update(saved.id, { enabled: false });
  await manager.applyAll();
  assert.equal((await manager.list()).length, 1);
  assert.equal((await manager.list())[0].enabled, false);
  assert.equal((await controller.read(7)).enabled, false);
  assert.ok(calls.includes('detach'));
});

test('navigation to an unrelated site clears the filter', async () => {
  const { controller, manager, tab } = integration();
  await manager.save({ url: 'example.com', scope: 'website', enabled: true });
  await manager.apply(7);
  tab.url = 'https://other.example/';
  await manager.apply(7);
  assert.equal((await controller.read(7)).enabled, false);
});

test('image preservation inserts and removes the same CSS without claiming rendering proof', async () => {
  const { controller, manager, calls } = integration();
  await manager.save({ url: 'example.com', scope: 'website', enabled: true, applyToImages: false });
  await manager.apply(7);
  assert.equal((await controller.read(7)).applyToImages, false);
  const insertion = calls.find(call => call[0] === 'insertCSS');
  assert.match(insertion[1].css, /color-scheme: only light/);
  const [saved] = await manager.list();
  await manager.update(saved.id, { applyToImages: true });
  await manager.apply(7);
  assert.deepEqual(calls.at(-1), ['removeCSS', insertion[1]]);
});

test('cancellation pauses automatic rules until explicit resume', async () => {
  const { controller, manager, calls } = integration();
  await manager.save({ url: 'example.com', scope: 'website', enabled: true });
  await manager.apply(7);
  await controller.disconnected(7, 'canceled_by_user');
  const count = calls.length;
  await manager.apply(7);
  assert.equal(calls.length, count);
  await manager.apply(7, true);
  assert.equal((await controller.read(7)).enabled, true);
});

test('concurrent rule saves do not overwrite each other', async () => {
  const { manager } = integration();
  await Promise.all([
    manager.save({ url: 'example.com', enabled: true }),
    manager.save({ url: 'other.example', enabled: true })
  ]);
  assert.equal((await manager.list()).length, 2);
});

test('automatic image mode never waits for CSS scripting on first activation', async () => {
  const { api, manager, controller } = integration();
  api.scripting.removeCSS = () => new Promise(() => {});
  await manager.save({ url: 'example.com', enabled: true });
  await manager.applyFromPopup(7);
  assert.equal((await controller.read(7)).enabled, true);
});

test('a stalled background tab does not prevent the popup request from completing', async () => {
  const { api, manager, controller } = integration();
  const get = api.tabs.get;
  api.tabs.get = id => id === 8 ? new Promise(() => {}) : get(id);
  api.tabs.query = async () => [{ id: 7 }, { id: 8 }];
  await manager.save({ url: 'example.com', enabled: true });
  await manager.applyFromPopup(7);
  assert.equal((await controller.read(7)).enabled, true);
});
