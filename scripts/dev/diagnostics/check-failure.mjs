// Exercise the failure collector deliberately; this is tooling validation, not a renderer defect.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { launchBrowser, closeBrowser, root, until } from './browser.mjs';
import { startServer } from './server.mjs';
import { assertEvidence, writeFailureEvidence } from './failure.mjs';

const directory = path.join(root, 'research-artifacts/diagnostics/failure-self-test-' + Date.now() + '-' + randomUUID().slice(0, 8));
await mkdir(directory, { recursive: true });
const server = await startServer();
let browser;
try {
  browser = await launchBrowser();
  const page = await browser.open(server.base + '/fixtures/diagnostics/cases.html?case=subtle-frame');
  await until(() => page.evaluate("!!document.querySelector('[data-audit-id=frame]')"), 'failure self-test fixture');
  const box = await page.evaluate("(()=>{const r=document.querySelector('[data-audit-id=frame]').getBoundingClientRect();return[r.width,r.height]})()");
  let failure;
  try { assertEvidence(false, 'deliberate-tooling-geometry-failure', { box: [box[0] + 1, box[1]] }, { box },
    { caseId: 'failure-evidence-self-test', element: 'frame', theme: 'source', level: 'off', state: 'default' }); }
  catch (error) { failure = error; }
  const report = await writeFailureEvidence({ directory, page, base: server.base, error: failure, results: [{ case: 'prior-control', passed: true }],
    environment: { platform: process.platform, browser: browser.version.product } });
  assert.equal(report.failed, true); assert.deepEqual(report.gaps, []);
  assert.deepEqual(report.assertion.actual.box, box);
  assert.equal(report.assertion.expected.box[0], box[0] + 1);
  const paint = JSON.parse(await readFile(path.join(directory, report.artifacts.paint), 'utf8'));
  assert.ok(paint.rows.some(row => row.key === 'fixture:frame' && row.context.length > 0 && row.layers.length === 3));
  for (const key of ['screenshot', 'element']) {
    const png = await readFile(path.join(directory, report.artifacts[key]));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.ok(png.length > 100);
  }
  const missing = await writeFailureEvidence({ directory: path.join(directory, 'missing'), page, base: server.base,
    error: Error('Deliberate missing-element check'), context: { element: 'not-present' } });
  assert.match(missing.gaps.join(' '), /no visible measured row/);
  assert.ok(missing.artifacts.screenshot); assert.equal(missing.artifacts.element, undefined);
  await page.send('Page.navigate', { url: 'about:blank' });
  await until(() => page.evaluate("location.href==='about:blank'"), 'non-fixture guard');
  const guarded = await writeFailureEvidence({ directory: path.join(directory, 'guarded'), page, base: server.base, error: failure });
  assert.deepEqual(guarded.artifacts, {}); assert.ok(guarded.gaps.length);
  console.log('Failure evidence passed: expected/actual facts, ancestors/generated layers, viewport/element PNGs, partial results and non-fixture guard. Artifacts: ' + directory);
} finally { try { await closeBrowser(browser); } finally { await server.close(); } }
