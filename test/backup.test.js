import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackup, parseBackup, mergeRules, importBackup, MAX_BACKUP_BYTES } from '../extension/backup.js';
import { normalizeRule, RuleManager } from '../extension/rules.js';

const rule = (url, enabled = true, includeSubdomains = false) => normalizeRule({ url, scope: 'section', enabled, includeSubdomains });
const encode = rules => JSON.stringify(createBackup(rules));

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
  const backup = createBackup([regional]);
  assert.deepEqual(parseBackup(JSON.stringify(backup)), [regional]);
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
