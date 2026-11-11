import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRule, matchingRule, orderRules, groupRulesByDomain, inheritedExclusion, isExtensionStore,
  RuleManager } from '../extension/rules.js';
import { regionalDomain } from '../extension/domains.js';
import { DarkModeController } from '../extension/controller.js';

const rule = (url, enabled = true, extra = {}) => normalizeRule({ url, enabled, scope: 'section', ...extra });

test('exact paths exclude descendants and distinguish the home page from the full website', () => {
  const section = rule('example.com/blog', false, { includeSubpaths: false });
  const website = rule('example.com');
  const home = rule('example.com', false, { includeSubpaths: false });
  assert.notEqual(home.id, website.id);
  assert.equal(matchingRule([website, home], 'https://example.com/?query#hash'), home);
  assert.equal(matchingRule([website, section], 'https://example.com/blog/'), section);
  assert.equal(matchingRule([website, section], 'https://example.com/blog/post'), website);
  assert.equal(matchingRule([section], 'https://example.com/blogger'), undefined);
});

test('group removal moves only the confirmed rules to trash', async () => {
  const { manager } = integration();
  const first = rule('example.com');
  const second = rule('example.com/blog', false, { includeSubpaths: false });
  await manager.save({ url: 'example.com', enabled: true });
  await manager.save({ url: 'example.com/blog', includeSubpaths: false });
  await manager.save({ url: 'example.com/shop', enabled: true });
  await manager.removeMany([first.id, second.id]);
  assert.deepEqual((await manager.list()).map(entry => entry.path), ['/shop']);
  const trash = await manager.listTrash();
  assert.deepEqual(trash.map(entry => entry.rule.id), [first.id, second.id]);
  assert.equal(trash[1].rule.includeSubpaths, false);
});

test('domain grouping keeps regional exceptions and ordinary subdomains together', () => {
  const exception = rule('www.amazon.com.au', false);
  const regional = rule('amazon.es', true, { includeRegionalDomains: true, includeSubdomains: true });
  const android = rule('android.com');
  const developer = rule('developer.android.com');
  const separate = rule('android.org');
  const rules = [exception, developer, regional, android, separate];
  assert.deepEqual([...groupRulesByDomain(rules, rules, 'newest', 'en')], [
    ['amazon.*', [exception, regional]], ['android.com', [developer, android]], ['android.org', [separate]]
  ]);
  assert.deepEqual([...groupRulesByDomain([exception], rules, 'alphabetical', 'en')], [['amazon.*', [exception]]]);
});

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

test('www aliases the base domain independently of the subdomain setting', async () => {
  const family = rule('www.android.com/guide', true, { includeSubdomains: true });
  assert.equal(family.host, 'android.com');
  assert.equal(matchingRule([family], 'https://developer.android.com/guide/topics').enabled, true);
  assert.equal(matchingRule([family], 'https://android.com/guide').enabled, true);
  const exact = rule('www.android.com');
  assert.equal(exact.host, 'android.com');
  assert.equal(exact.id, rule('android.com').id);
  assert.equal(matchingRule([exact], 'https://www.android.com/'), exact);
  assert.equal(matchingRule([exact], 'https://android.com/'), exact);
  assert.equal(matchingRule([exact], 'https://developer.android.com/'), undefined);
  const { api, manager } = integration();
  const legacy = { ...exact, host: 'www.android.com', includeSubdomains: true };
  await api.storage.local.set({ rules: [legacy, rule('android.com', false, { includeSubdomains: true })] });
  const migrated = await manager.list();
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].enabled, false);
});

test('regional rules use the registrable name across public suffixes', () => {
  const group = rule('www.amazon.es/deals', true, { includeRegionalDomains: true });
  assert.equal(group.id, rule('amazon.com.au/deals', true, { includeRegionalDomains: true }).id);
  for (const url of ['https://www.amazon.com.au/deals/today', 'https://www.amazon.com/deals', 'https://amazon.es/deals', 'https://amazon.co.uk/deals']) {
    assert.equal(matchingRule([group], url).enabled, true);
  }
  for (const url of ['https://other.net/deals', 'https://amazon.evil.com/deals', 'https://amazon.github.io/deals', 'https://www.amazon.com.au/deals-extra',
    'https://seller.amazon.com/deals', 'https://amazon.com:8443/deals']) {
    assert.equal(matchingRule([group], url), undefined);
  }
  const family = rule('amazon.com/deals', true, { includeRegionalDomains: true, includeSubdomains: true });
  assert.equal(matchingRule([family], 'https://seller.amazon.com.au/deals').enabled, true);
  const exclusion = rule('www.amazon.com.au/deals', false);
  assert.equal(matchingRule([group, exclusion], 'https://www.amazon.com.au/deals').enabled, false);
  const another = rule('example.co.uk', true, { includeRegionalDomains: true });
  assert.equal(matchingRule([another], 'https://example.de/').enabled, true);
  assert.throws(() => rule('localhost', true, { includeRegionalDomains: true }), /not available/);
});

test('regional subdomain rules preserve the prefix and override broader regional rules', () => {
  const settings = { includeRegionalDomains: true };
  const exact = rule('fonts.google.com/icons', false, settings);
  const family = rule('fonts.google.com/icons', true, { ...settings, includeSubdomains: true });
  const parent = rule('fonts.google.com/icons', true, { ...settings, includeParentDomain: true });
  assert.equal(exact.id, rule('fonts.google.co.uk/icons', false, settings).id);
  assert.equal(parent.id, rule('google.com/icons', true, { ...settings, includeSubdomains: true }).id);
  assert.equal(matchingRule([parent, family, exact], 'https://fonts.google.es/icons/next'), exact);
  assert.equal(matchingRule([parent, exact, family], 'https://cdn.fonts.google.co.uk/icons'), family);
  assert.equal(matchingRule([exact], 'https://maps.google.es/icons'), undefined);
  assert.equal(matchingRule([exact], 'https://fonts.google.es/iconset'), undefined);
  const local = rule('fonts.google.es/icons');
  assert.equal(matchingRule([exact, local], 'https://fonts.google.es/icons'), local);
  assert.equal(inheritedExclusion(family, 'https://cdn.fonts.google.co.uk/icons').host, 'cdn.fonts.google.co.uk');
});

test('applying to the base domain covers the base and sibling subdomains on the same suffix', () => {
  const parent = rule('fonts.google.com/icons', true, { includeParentDomain: true });
  assert.equal(parent.id, rule('google.com/icons', true, { includeSubdomains: true }).id);
  assert.equal(matchingRule([parent], 'https://google.com/icons'), parent);
  assert.equal(matchingRule([parent], 'https://maps.google.com/icons'), parent);
  assert.equal(matchingRule([parent], 'https://maps.google.es/icons'), undefined);
});

test('regional scope honors suffix exceptions and upgrades legacy rules', async () => {
  assert.deepEqual(regionalDomain('x.y.ck'), { name: 'x', domain: 'x.y.ck', subdomain: '' });
  assert.deepEqual(regionalDomain('www.ck'), { name: 'www', domain: 'www.ck', subdomain: '' });
  const { api, manager } = integration();
  await api.storage.local.set({ rules: [{ id: '["amazon.es","/deals",false,true]', host: 'amazon.es',
    path: '/deals', includeSubdomains: false, includeRegionalDomains: true, enabled: true, createdAt: 10 }] });
  const [saved] = await manager.list();
  assert.equal(saved.createdAt, 10);
  assert.equal(saved.regionalName, 'amazon');
  assert.equal(matchingRule([saved], 'https://amazon.de/deals').enabled, true);
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

test('separator emphasis follows the winning rule across custom themes', async () => {
  const { api, manager, tab, calls } = integration();
  api.tabs.sendMessage = async (id, message) => { calls.push(message); return true; };
  await manager.save({ url: 'example.com', enabled: true, preset: 'chromium' });
  const section = normalizeRule({ url: 'example.com/articles', scope: 'section' });
  await manager.save({ url: 'example.com/articles', scope: 'section', enabled: true, preset: 'chromium' });
  await manager.update(section.id, { emphasizeSeparators: true });
  assert.equal((await manager.apply(tab.id)).emphasizeSeparators, true);
  assert.equal(calls.at(-1).emphasizeSeparators, true);
  tab.url = 'https://example.com/shop';
  assert.equal((await manager.apply(tab.id)).emphasizeSeparators, undefined);
  assert.equal(calls.at(-1).emphasizeSeparators, undefined);
  await manager.update(section.id, { preset: 'soft' });
  tab.url = 'https://example.com/articles';
  assert.equal((await manager.apply(tab.id)).emphasizeSeparators, true);
  assert.equal(calls.at(-1).emphasizeSeparators, true);
  await manager.update(section.id, { preset: 'contrast', emphasizeSeparators: 'maximum' });
  assert.equal((await manager.apply(tab.id)).emphasizeSeparators, 'maximum');
  await manager.update(section.id, { preset: 'native' });
  assert.equal((await manager.apply(tab.id)).emphasizeSeparators, undefined);
  assert.equal((await manager.list()).find(rule => rule.id === section.id).emphasizeSeparators, 'maximum');
  await manager.update(section.id, { preset: 'chromium' });
  assert.equal((await manager.apply(tab.id)).emphasizeSeparators, 'maximum');
});

test('the extension store is protected without changing saved rules', async () => {
  assert.equal(isExtensionStore('https://chrome.google.com/webstore/detail/example'), true);
  assert.equal(isExtensionStore('https://chrome.google.com/other'), false);
  assert.equal(isExtensionStore('https://chromewebstore.google.com.example.org/'), false);
  assert.equal(isExtensionStore(undefined), false);
  const { manager, tab, calls } = integration();
  tab.url = 'https://chromewebstore.google.com/detail/example';
  for (const preset of [undefined, 'chromium']) {
    await manager.save({ url: tab.url, enabled: true, preset });
    assert.deepEqual(await manager.apply(tab.id), { enabled: false });
    assert.equal((await manager.list())[0].enabled, true);
  }
  assert.deepEqual(calls, []);
});

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

test('broadening a saved section replaces only that section and keeps sibling exclusions', async () => {
  const { manager } = integration();
  const root = { url: 'https://example.com/', scope: 'website', enabled: false };
  const section = { url: 'https://example.com/articles', scope: 'section', enabled: true };
  const sibling = { url: 'https://example.com/private', scope: 'section', enabled: false };
  await manager.save(root);
  await manager.save(section);
  await manager.save(sibling);
  await manager.save({ ...root, enabled: true }, normalizeRule(section).id);
  const rules = await manager.list();
  assert.equal(rules.length, 2);
  assert.equal(matchingRule(rules, section.url)?.path, '/');
  assert.equal(matchingRule(rules, section.url)?.enabled, true);
  assert.equal(matchingRule(rules, sibling.url)?.enabled, false);
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

test('the subdomain action excludes the current host at the inherited section and keeps sibling rules', async () => {
  const { manager, tab } = integration();
  const [parent] = await manager.save({ url: 'www.amazon.es/deals', scope: 'section',
    includeRegionalDomains: true, includeSubdomains: true, enabled: true });
  tab.url = 'https://seller.amazon.com.au/deals/today';
  await assert.rejects(manager.excludeInheritedHost(7, 'https://seller.amazon.com/deals/today'), /no longer inherits/);
  const rules = await manager.excludeInheritedHost(7, tab.url);
  assert.deepEqual(rules[0], parent);
  assert.equal(rules[1].path, '/deals');
  assert.equal(matchingRule(rules, tab.url).enabled, false);
  assert.equal(matchingRule(rules, 'https://other.amazon.com.au/deals').enabled, true);
  await assert.rejects(manager.excludeInheritedHost(7, tab.url), /no longer inherits/);
});

test('a regional rule offers an exact exclusion for its www alias without subdomains enabled', async () => {
  const { manager, tab } = integration();
  const [regional] = await manager.save({ url: 'amazon.es', includeRegionalDomains: true, enabled: true });
  assert.equal(inheritedExclusion(regional, 'https://amazon.es/'), undefined);
  assert.equal(inheritedExclusion(regional, 'https://www.amazon.es/'), undefined);
  tab.url = 'https://www.amazon.com.au/';
  assert.equal(inheritedExclusion(regional, tab.url).host, 'amazon.com.au');
  const rules = await manager.excludeInheritedHost(7, tab.url);
  assert.equal(matchingRule(rules, tab.url).enabled, false);
  assert.equal(matchingRule(rules, 'https://www.amazon.es/').enabled, true);
  assert.equal(matchingRule(rules, 'https://amazon.com.au/').enabled, false);
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
test('date sorting keeps the saved sequence for legacy rules and tied timestamps', () => {
  const rules = [rule('c.example'), rule('b.example'), { ...rule('a.example'), createdAt: 10 },
    { ...rule('d.example'), createdAt: 10 }];
  assert.deepEqual(orderRules(rules, 'newest', 'en').map(rule => rule.host), ['d.example', 'a.example', 'b.example', 'c.example']);
  assert.deepEqual(orderRules(rules, 'oldest', 'en'), rules);
  assert.deepEqual(orderRules(rules, 'alphabetical', 'en').map(rule => rule.host), ['a.example', 'b.example', 'c.example', 'd.example']);
});
