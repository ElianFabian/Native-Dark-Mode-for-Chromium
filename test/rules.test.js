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

test('www is optional with subdomains enabled and exact otherwise', async () => {
  const family = rule('www.android.com/guide', true, { includeSubdomains: true });
  assert.equal(family.host, 'android.com');
  assert.equal(matchingRule([family], 'https://developer.android.com/guide/topics').enabled, true);
  assert.equal(matchingRule([family], 'https://android.com/guide').enabled, true);
  const exact = rule('www.android.com');
  assert.equal(exact.host, 'www.android.com');
  assert.equal(matchingRule([exact], 'https://developer.android.com/'), undefined);
  const { api, manager } = integration();
  const legacy = { ...rule('www.android.com'), includeSubdomains: true };
  await api.storage.local.set({ rules: [legacy, rule('android.com', false, { includeSubdomains: true })] });
  const migrated = await manager.list();
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].enabled, false);
});

test('Amazon regional rules share a scope and respect path and host exclusions', () => {
  const group = rule('www.amazon.es/deals', true, { includeRegionalDomains: true });
  assert.equal(group.id, rule('amazon.com.au/deals', true, { includeRegionalDomains: true }).id);
  for (const url of ['https://www.amazon.com.au/deals/today', 'https://www.amazon.com/deals', 'https://amazon.es/deals']) {
    assert.equal(matchingRule([group], url).enabled, true);
  }
  for (const url of ['https://amazon.net/deals', 'https://amazon.com.evil.example/deals', 'https://www.amazon.com.au/deals-extra',
    'https://seller.amazon.com/deals', 'https://amazon.com:8443/deals']) {
    assert.equal(matchingRule([group], url), undefined);
  }
  const family = rule('amazon.com/deals', true, { includeRegionalDomains: true, includeSubdomains: true });
  assert.equal(matchingRule([family], 'https://seller.amazon.com.au/deals').enabled, true);
  const exclusion = rule('www.amazon.com.au/deals', false);
  assert.equal(matchingRule([group, exclusion], 'https://www.amazon.com.au/deals').enabled, false);
  assert.throws(() => rule('example.com', true, { includeRegionalDomains: true }), /not available/);
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

test('legacy image settings are ignored without losing saved website rules', async () => {
  const { api, controller, manager, calls } = integration();
  const legacy = { ...rule('example.com'), applyToImages: false };
  await api.storage.local.set({ rules: [legacy] });
  await manager.apply(7);
  assert.equal((await controller.read(7)).enabled, true);
  assert.equal(calls.some(call => ['insertCSS', 'removeCSS'].includes(call[0])), false);
  const [saved] = await manager.list();
  assert.equal(saved.host, 'example.com');
  assert.equal('applyToImages' in saved, false);
  await manager.update(saved.id, { enabled: false });
  await manager.apply(7);
  assert.equal((await controller.read(7)).enabled, false);
  assert.equal((await manager.list()).length, 1);
  assert.equal('applyToImages' in (await api.storage.local.get('rules')).rules[0], false);
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

test('checkbox scope changes preserve state and reject collisions with saved rules', async () => {
  const { manager } = integration();
  const [original] = await manager.save({ url: 'amazon.es', enabled: false });
  const [regional] = await manager.replaceScope(original.id, {
    url: 'amazon.es', includeRegionalDomains: true, enabled: true
  });
  assert.equal(regional.enabled, false);
  assert.equal(regional.includeRegionalDomains, true);
  assert.equal((await manager.list()).length, 1);
  const [, local] = await manager.save({ url: 'amazon.es', enabled: true });
  const before = await manager.list();
  await assert.rejects(manager.replaceScope(local.id, { url: 'amazon.es', includeRegionalDomains: true }), /already exists/);
  assert.deepEqual(await manager.list(), before);
});

test('unchecking subdomains keeps an existing exact rule and removes the broader scope', async () => {
  const { manager } = integration();
  const [exact] = await manager.save({ url: 'www.example.com/articles', scope: 'section', enabled: false });
  const [, broader] = await manager.save({ url: 'www.example.com/articles', scope: 'section', includeSubdomains: true, enabled: true });
  const rules = await manager.replaceScope(broader.id, { url: 'www.example.com/articles', scope: 'section' });
  assert.deepEqual(rules, [exact]);
  assert.equal(matchingRule(rules, 'https://docs.example.com/articles'), undefined);
  assert.equal(matchingRule(rules, 'https://www.example.com/articles').enabled, false);
});

test('unchecking regional domains keeps an existing single-domain rule and its subdomain setting', async () => {
  const { manager } = integration();
  const localInput = { url: 'www.amazon.com.au/deals', scope: 'section', includeSubdomains: true, enabled: false };
  const [local] = await manager.save(localInput);
  const [, regional] = await manager.save({ ...localInput, includeRegionalDomains: true, enabled: true });
  const rules = await manager.replaceScope(regional.id, localInput);
  assert.deepEqual(rules, [local]);
  assert.equal(matchingRule(rules, 'https://seller.amazon.com.au/deals').enabled, false);
  assert.equal(matchingRule(rules, 'https://www.amazon.com/deals'), undefined);
});

test('native activation requires no CSS scripting even with a legacy input field', async () => {
  const { api, manager, controller } = integration();
  api.scripting.removeCSS = () => new Promise(() => {});
  await manager.save({ url: 'example.com', enabled: true, applyToImages: false });
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
