import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { launchBrowser, closeBrowser, root, until } from './browser.mjs';
import { startServer } from './server.mjs';
import { expectedRendererIdentity, compareRendererIdentity } from './identity.mjs';

const directory = path.join(root, 'research-artifacts/diagnostics/identity-self-test-' + Date.now() + '-' + randomUUID().slice(0, 8));
const staged = path.join(directory, 'extension');
await mkdir(directory, { recursive: true });
await cp(path.join(root, 'extension'), staged, { recursive: true });
const rendererFile = path.join(staged, 'website-theme.js'), colorFile = path.join(staged, 'chromium-colors.js');
const rendererSource = await readFile(rendererFile, 'utf8'), colorSource = await readFile(colorFile, 'utf8');
// Same behavior/version, deliberately different loaded source. Only the ignored copy is edited.
await writeFile(rendererFile, rendererSource.replace('function nativeDarkModeWebsiteTheme() {', 'function nativeDarkModeWebsiteTheme() { /* controlled stale source */'));
const expected = await expectedRendererIdentity(), evidence = { expected, observations: {} };
const server = await startServer(); let browser;
try {
  browser = await launchBrowser(undefined, { extensionDirectory: staged, insecureLocalOrigin: true });
  const url = server.base + '/fixtures/diagnostics/cases.html?case=subtle-frame';
  let page = await browser.open(url);
  const inspect = async () => compareRendererIdentity(expected, await browser.rendererIdentity(page));
  const stale = await until(async () => { const result = await inspect(); return result.status === 'mismatch' && result; }, 'stale instance identity');
  assert.deepEqual(stale.differences, ['initialized.renderer']);
  evidence.observations.stale = stale;
  const unchanged = () => page.evaluate("({marked:document.querySelectorAll('[data-native-dark-mode-paint]').length,sheets:document.adoptedStyleSheets.length,body:getComputedStyle(document.body).backgroundColor})");
  const offBefore = await unchanged();
  await writeFile(rendererFile, rendererSource); // Current bytes on disk must not relabel an old closure.
  const afterDiskChange = await inspect();
  assert.equal(afterDiskChange.status, 'mismatch'); assert.equal(afterDiskChange.observed.instanceId, stale.observed.instanceId);
  assert.deepEqual(await unchanged(), offBefore);
  evidence.observations.diskChangedWithoutInjection = afterDiskChange;
  await browser.reinjectRenderer(page);
  assert.equal((await inspect()).observed.instanceId, stale.observed.instanceId);
  assert.equal((await inspect()).status, 'mismatch');
  // Replace an actual dependency bootstrap while the theme listener is deduplicated.
  await writeFile(colorFile, colorSource.replace('function nativeDarkModeChromiumColors() {', 'function nativeDarkModeChromiumColors() { /* controlled changed dependency */'));
  await browser.reinjectRenderer(page);
  const changed = await inspect();
  assert.ok(changed.differences.includes('currentDependencies.colors'));
  assert.equal(changed.observed.initialized.colors, stale.observed.initialized.colors);
  evidence.observations.changedDependency = changed;
  await writeFile(colorFile, colorSource); await browser.reinjectRenderer(page);
  for (const theme of ['chromium', 'soft', 'contrast']) {
    await browser.rule(url, theme, 'maximum');
    await until(async () => (await inspect()).observed?.preset === theme, 'identity active preset ' + theme);
    const active = await inspect(); assert.equal(active.observed.separatorLevel, 'maximum');
    assert.equal(active.observed.instanceId, stale.observed.instanceId);
  }
  await browser.rule(url, 'source');
  await until(async () => (await inspect()).observed?.preset === null, 'identity theme off');
  const senderGuard = await browser.inRendererWorld(page, () => {
    let replies = 0;
    const result = globalThis.nativeDarkModeWebsiteThemeListenerV4({ type: 'diagnose-renderer-identity-v1' }, { id: 'foreign-extension' }, () => replies++);
    return { ignored: result === undefined, replies };
  });
  assert.deepEqual(senderGuard[0].result, { ignored: true, replies: 0 });
  const blank = await browser.open('about:blank');
  assert.equal((await browser.rendererIdentity(blank)).status, 'unavailable');
  await blank.close();
  // Real extension reload: observe the old document without applying a preset/recovery.
  evidence.observations.reload = await browser.reloadExtension();
  const afterReload = await inspect(); evidence.observations.existingDocumentAfterReload = afterReload;
  assert.ok(['unavailable', 'match', 'mismatch'].includes(afterReload.status));
  const again = await inspect(); assert.equal(again.status, afterReload.status);
  assert.equal(again.observed?.instanceId, afterReload.observed?.instanceId);
  if (!evidence.observations.reload.extensionContextAvailable) {
    assert.equal(afterReload.status, 'unavailable');
    // Separate fresh-process experiment, not a side effect of querying the invalidated document.
    await closeBrowser(browser);
    browser = await launchBrowser(undefined, { extensionDirectory: staged, insecureLocalOrigin: true });
    page = await browser.open(url);
    evidence.freshInstanceExperiment = 'new-owned-browser-after-reload-invalidation';
  } else {
    await page.send('Page.navigate', { url });
    evidence.freshInstanceExperiment = 'navigation-after-reload';
  }
  const current = await until(async () => { const result = await inspect(); return result.status === 'match' && result; }, 'fresh current instance');
  assert.notEqual(current.observed.instanceId, stale.observed.instanceId);
  evidence.observations.freshCurrent = current;
  await browser.reinjectRenderer(page);
  assert.equal((await inspect()).observed.instanceId, current.observed.instanceId);
  await page.evaluate(`(()=>{const f=document.createElement('iframe');f.src=${JSON.stringify(url)};document.body.append(f)})()`);
  const frames = await until(async () => {
    const found = await browser.inRendererWorld(page, () => typeof globalThis.nativeDarkModeWebsiteThemeListenerV4 === 'function', [], null);
    return found.length >= 2 && found.every(frame => frame.result) && found;
  }, 'eligible child instance');
  const child = compareRendererIdentity(expected, await browser.rendererIdentity(page, frames.find(frame => frame.frameId !== 0).frameId));
  assert.equal(child.status, 'match'); assert.notEqual(child.observed.instanceId, current.observed.instanceId);
  evidence.observations.child = child;
  // Reserved .test host resolves only to our loopback server; extension isolated-world crypto must work on HTTP too.
  const http = await browser.open(url.replace('127.0.0.1', 'ndm-identity.test'));
  const insecure = await until(async () => {
    const result = compareRendererIdentity(expected, await browser.rendererIdentity(http)); evidence.observations.httpAttempt = result;
    return result.status === 'match' && result;
  }, 'HTTP isolated identity').catch(async error => {
    evidence.observations.httpContext = await browser.inRendererWorld(http, () => ({ secure:isSecureContext,subtle:!!crypto.subtle,listener:typeof globalThis.nativeDarkModeWebsiteThemeListenerV4 }));
    throw error;
  });
  evidence.observations.http = insecure;
  evidence.passed = true; evidence.browser = browser.version.product; evidence.platform = process.platform;
  await writeFile(path.join(directory, 'results.json'), JSON.stringify(evidence, null, 2));
  console.log('Renderer identity passed: loaded/disk mismatch, dependency change, reinjection, all presets/Off, sender guard, missing receiver, real reload, fresh document, child and local-mapped HTTP. Evidence: ' + directory);
} catch (error) {
  evidence.passed = false; evidence.failure = error.message;
  await writeFile(path.join(directory, 'results.json'), JSON.stringify(evidence, null, 2));
  throw error;
} finally { try { await closeBrowser(browser); } finally { await server.close(); } }
