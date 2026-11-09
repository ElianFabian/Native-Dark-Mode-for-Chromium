import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackup, parseBackup, mergeRules, importBackup, previewRemovals, MAX_BACKUP_BYTES } from '../extension/backup.js';
import { normalizeRule, RuleManager } from '../extension/rules.js';

test('backup version 2 round-trips custom presets and rejects unknown presets', () => {
  const rule = normalizeRule({ url: 'example.com', enabled: true, preset: 'soft' });
  const backup = createBackup([rule]);
  assert.equal(backup.version, 2);
  assert.deepEqual(parseBackup(JSON.stringify(backup)), [rule]);
  assert.throws(() => parseBackup(JSON.stringify({ ...backup, version: 1 })), /invalid/i);
  backup.rules[0].preset = 'unknown';
  assert.throws(() => parseBackup(JSON.stringify(backup)), /invalid/i);
});

const rule = (url, enabled = true, includeSubdomains = false) => normalizeRule({ url, scope: 'section', enabled, includeSubdomains });
const encode = rules => JSON.stringify(createBackup(rules));

test('backup version 3 preserves exact-only path rules', () => {
  const home = normalizeRule({ url: 'example.com', scope: 'section', includeSubpaths: false, preset: 'soft' });
  const backup = createBackup([home, rule('example.com')]);
  assert.equal(backup.version, 3);
  assert.deepEqual(parseBackup(JSON.stringify(backup)), [home, rule('example.com')]);
  assert.throws(() => parseBackup(JSON.stringify({ ...backup, version: 2 })), /invalid/i);
});

test('import preview resolves older removal IDs without losing the confirmation list', () => {
  const removed = rule('example.com/old');
  const kept = rule('example.com/new');
  assert.deepEqual(previewRemovals({ removedRules: [removed] }), [removed]);
  assert.deepEqual(previewRemovals({ removedIds: [removed.id] }, [removed, kept]), [removed]);
  assert.throws(() => previewRemovals({ removedIds: [removed.id] }, [kept]), /changed since/);
  assert.throws(() => previewRemovals({}), /preview is unavailable/);
});

test('backup round trip preserves scopes, exclusions, ports and subdomain settings', () => {
  const rules = [rule('example.com', true, true), rule('example.com/photos', false),
    rule('example.com:8765/articles'), rule('http://example.com:443/articles')];
  assert.deepEqual(parseBackup(encode(rules)), rules);
  const exported = createBackup([{ ...rules[0], error: 'private diagnostic', applyToImages: false }]);
  assert.deepEqual(Object.keys(exported.rules[0]).sort(), ['enabled', 'host', 'includeSubdomains', 'path']);
  assert.equal('id' in exported.rules[0], false);
});

test('backups preserve regional rules and reject unsupported groups', () => {
  const regional = normalizeRule({ url: 'www.amazon.com.au/deals', scope: 'section', enabled: true, includeRegionalDomains: true });
  const subdomain = normalizeRule({ url: 'fonts.google.com/icons', scope: 'section', enabled: false, includeRegionalDomains: true });
  const backup = createBackup([regional, subdomain]);
  assert.deepEqual(parseBackup(JSON.stringify(backup)), [regional, subdomain]);
  backup.rules[0].host = 'localhost';
  assert.throws(() => parseBackup(JSON.stringify(backup)), /invalid/);
});

test('malformed, incompatible, oversized, ambiguous and duplicate backups are rejected', () => {
  const document = createBackup([rule('example.com')]);
  assert.throws(() => parseBackup('not JSON'), /valid JSON/);
  assert.throws(() => parseBackup(' '.repeat(MAX_BACKUP_BYTES + 1)), /1 MiB/);
  assert.throws(() => parseBackup(JSON.stringify({ ...document, version: 99 })), /Unsupported/);
  for (const invalid of [
    { host: 'name:secret@example.com' }, { host: 'example.com/path' },
    { path: '/a/../b' }, { path: '/a?query' },
    { enabled: 'false' }, { includeSubdomains: 1 }
  ]) {
    assert.throws(() => parseBackup(JSON.stringify({ ...document, rules: [{ ...document.rules[0], ...invalid }] })), /invalid/);
  }
  assert.throws(() => parseBackup(JSON.stringify({ ...document, rules: [document.rules[0], document.rules[0]] })), /duplicate/);
});

test('www subdomain aliases are normalized before duplicate detection', () => {
  const document = createBackup([rule('android.com', true, true)]);
  const alias = { ...document.rules[0], host: 'www.android.com' };
  assert.equal(parseBackup(JSON.stringify({ ...document, rules: [alias] }))[0].host, 'android.com');
  assert.throws(() => parseBackup(JSON.stringify({ ...document, rules: [alias, document.rules[0]] })), /duplicate/);
});

test('merge defaults to keeping existing settings and can explicitly replace matches', () => {
  const existing = [rule('example.com', false), rule('other.example')];
  const incoming = [rule('example.com', true), rule('new.example')];
  const kept = mergeRules(existing, incoming);
  assert.deepEqual(kept.summary, { added: 1, updated: 0, skipped: 1 });
  assert.equal(kept.rules[0].enabled, false);
  const replaced = mergeRules(existing, incoming, 'replace');
  assert.deepEqual(replaced.summary, { added: 1, updated: 1, skipped: 0 });
  assert.equal(replaced.rules[0].enabled, true);
  assert.equal(replaced.rules.some(rule => rule.host === 'other.example'), true);
  assert.throws(() => mergeRules(existing, incoming, 'unknown'));
});

test('invalid imports and storage failures preserve existing rules', async () => {
  let saved = [rule('example.com', false)];
  const original = structuredClone(saved);
  let writes = 0;
  let rejectWrite = false;
  const manager = new RuleManager({ storage: { local: {
    get: async () => ({ rules: structuredClone(saved) }),
    set: async value => { writes++; if (rejectWrite) throw new Error('Storage quota exceeded'); saved = structuredClone(value.rules); }
  } } }, {});
  await assert.rejects(importBackup(manager, 'bad JSON', 'replace'));
  assert.equal(writes, 0);
  rejectWrite = true;
  await assert.rejects(importBackup(manager, encode([rule('new.example')]), 'replace'), /quota/);
  assert.deepEqual(saved, original);
  rejectWrite = false;
  await Promise.all([
    importBackup(manager, encode([rule('new.example')]), 'keep'),
    manager.save({ url: 'another.example', enabled: true })
  ]);
  assert.equal(saved.length, 3);
});

test('replacing a backup only removes rules covered by the import preview', async () => {
  const current = rule('example.com', false);
  const obsolete = rule('obsolete.example');
  const incoming = [rule('example.com'), rule('new.example')];
  let saved = [current, obsolete];
  const manager = new RuleManager({ storage: { local: {
    get: async () => ({ rules: saved }),
    set: async value => { saved = value.rules; }
  } } }, {});
  const preview = mergeRules(saved, incoming, 'replace-all');
  assert.deepEqual(preview.removedIds, [obsolete.id]);
  assert.deepEqual(preview.summary, { added: 1, updated: 1, skipped: 0 });
  await manager.save({ url: 'other.example', enabled: true });
  const before = saved;
  await assert.rejects(importBackup(manager, encode(incoming), 'replace-all', preview.removedIds), /changed since/);
  assert.deepEqual(saved, before);
  const updatedPreview = mergeRules(saved, incoming, 'replace-all');
  await importBackup(manager, encode(incoming), 'replace-all', updatedPreview.removedIds);
  assert.deepEqual(saved.map(rule => [rule.host, rule.enabled]), [['example.com', true], ['new.example', true]]);
});
