import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { initializerFingerprint, expectedRendererIdentity, compareRendererIdentity, fingerprintKind } from '../scripts/dev/diagnostics/identity.mjs';
import { fingerprintRendererSource } from '../extension/renderer-fingerprint.js';

test('expected fingerprints match executable initializer source and normalize CRLF', async () => {
  for (const [file, name] of [['website-theme.js', 'nativeDarkModeWebsiteTheme'], ['chromium-colors.js', 'nativeDarkModeChromiumColors'], ['image-contrast.js', 'nativeDarkModeImageContrast']]) {
    const source = await readFile(new URL('../extension/' + file, import.meta.url), 'utf8');
    const start = source.indexOf('(function ' + name), end = source.lastIndexOf('})();');
    // Parse, but do not invoke the renderer. The JS engine supplies Function#toString.
    const fn = runInNewContext(source.slice(start, end + 2));
    const expected = createHash('sha256').update(fn.toString().replace(/\r\n?/g, '\n')).digest('hex');
    assert.equal(initializerFingerprint(source, name), expected);
    assert.equal(initializerFingerprint(source.replace(/\r?\n/g, '\r\n'), name), expected);
    assert.notEqual(initializerFingerprint(source.replace('(function ' + name + '() {', '(function ' + name + '() { /* changed */'), name), expected);
  }
  assert.throws(() => initializerFingerprint('unexpected source', 'absent'), /structure/);
});

test('current, stale, changed dependencies and unavailable identities stay distinct', async () => {
  const expected = await expectedRendererIdentity();
  const observed = { version: 1, fingerprintKind, instanceId: 'a'.repeat(32), initializedAt: new Date().toISOString(),
    initialized: { ...expected.initialized }, currentDependencies: { colors: expected.initialized.colors, imageContrast: expected.initialized.imageContrast } };
  assert.equal(compareRendererIdentity(expected, { status: 'observed', observed }).status, 'match');
  const stale = structuredClone(observed); stale.initialized.renderer = 'b'.repeat(64);
  assert.deepEqual(compareRendererIdentity(expected, { status: 'observed', observed: stale }).differences, ['initialized.renderer']);
  const changed = structuredClone(observed); changed.currentDependencies.colors = 'b'.repeat(64);
  assert.deepEqual(compareRendererIdentity(expected, { status: 'observed', observed: changed }).differences, ['currentDependencies.colors']);
  assert.equal(compareRendererIdentity(expected, { status: 'unavailable', reason: 'no-receiver' }).status, 'unavailable');
  const partial = structuredClone(observed); partial.initialized.renderer = null;
  assert.equal(compareRendererIdentity(expected, { status: 'observed', observed: partial }).status, 'unknown');
  assert.equal(compareRendererIdentity(expected, { status: 'observed', observed: { version: 2 } }).status, 'unknown');
});

test('worker fallback hashes only bounded extension initializers using the same normalization', async () => {
  const source = 'function nativeDarkModeWebsiteTheme() {\r\n  return 1;\r\n}';
  assert.equal(await fingerprintRendererSource(source), createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex'));
  for (const invalid of [null, {}, 'function pageContent() {}', 'function nativeDarkModeWebsiteTheme() {' + 'x'.repeat(2097152) + '}']) {
    assert.equal(await fingerprintRendererSource(invalid), null);
  }
});
