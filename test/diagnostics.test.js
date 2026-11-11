import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { color, composite, contrast, analyze, compare, validateReport } from '../tools/diagnostics/analysis.mjs';
import { cases } from '../tools/diagnostics/cases.mjs';
import { triage, summaryMarkdown } from '../tools/diagnostics/triage.mjs';

function sample({ ink = 'rgb(255, 255, 255)', background = [18, 18, 18, 1], width = .8, edge = 'rgb(60,60,60)' } = {}) {
  const layer = { pseudo: '', content: 'normal', color: ink, textFill: ink, backgroundColor: 'rgba(0,0,0,0)', backgroundImage: 'none', fontSize: 18, fontWeight: '400', opacity: '1', filter: 'none', mask: 'none', borders: Array.from({ length: 4 }, () => ({ width, style: 'solid', color: edge })) };
  return { key: 'fixture:control', identity: 'fixture', signature: 'div:0:', hasText: true, disabled: false, bounds: [0, 0, 100, 40], backdrop: { color: background, reason: 'test backing' }, outside: { color: background },
    layers: [layer, { ...structuredClone(layer), pseudo: '::before', content: 'none' }, { ...structuredClone(layer), pseudo: '::after', content: 'none' }] };
}
const report = (rows, extra = {}) => ({ format: 'native-dark-diagnostics', version: 1, environment: { browser: 'fixed', viewport: [1000, 900] },
  captures: [{ id: 'same', theme: 'chromium', level: 'off', state: 'default', scale: 1, settled: true, rows, ...extra }] });
test('diagnostics reference vectors cover alpha, polarity and supported CSS serialization', () => {
  assert.equal(contrast([0, 0, 0, 1], [255, 255, 255, 1]), 21);
  assert.equal(contrast([255, 255, 255, 1], [0, 0, 0, 1]), 21);
  assert.deepEqual(composite([0, 0, 0, .5], [255, 255, 255, 1]), [127.5, 127.5, 127.5, 1]);
  assert.deepEqual(color('rgb(100% 0% 0% / 50%)'), [255, 0, 0, .5]);
  assert.deepEqual(color('color(srgb 1 0 0 / 0.5)'), [255, 0, 0, .5]);
  assert.equal(color('oklch(50% .1 20)'), null);
  assert.equal(contrast([0, 0, 0, 1], [255, 255, 255, .5]), null);
});
test('same facts yield identical analysis and unknown backings never pass text checks', () => {
  const input = report([sample()]); const copy = structuredClone(input);
  assert.deepEqual(analyze(input), analyze(copy)); assert.deepEqual(input, copy);
  copy.captures[0].rows[0].backdrop = { color: null, reason: 'gradient' };
  assert.equal(analyze(copy).checks.find(c => c.kind === 'text').status, 'unsupported');
  copy.captures[0].settled = false;
  assert.equal(analyze(copy).checks.find(c => c.kind === 'text').status, 'unstable');
});
test('zero-sized pagination labels are not treated as visible text contrast failures', () => {
  const row = sample({ ink: 'rgba(0,0,0,0)' }); row.layers[0].fontSize = 0;
  const check = analyze(report([row])).checks.find(c => c.kind === 'text');
  assert.equal(check.status, 'not-applicable'); assert.equal(check.target, null);
});
test('fractional borders retain width; source amplification and exposed transparent sides are distinct defects', () => {
  const source = sample({ ink: 'rgb(0,0,0)', background: [247, 247, 248, 1], edge: 'rgb(247,247,248)' });
  const input = report([sample()]); input.captures.unshift({ ...input.captures[0], id: 'original', rows: [source] }); input.captures[1].sourceId = 'original';
  assert.equal(analyze(input).checks.find(c => c.capture === 'same' && c.kind === 'border').evidence.widthChanged, false);
  input.captures[1].rows[0].layers[0].borders[0].color = 'white'; // unsupported syntax stays unknown
  assert.equal(analyze(input).checks.find(c => c.capture === 'same' && c.kind === 'border').status, 'unsupported');
  input.captures[1].rows[0].layers[0].borders[0] = { width: 3, style: 'solid', color: 'rgb(255,255,255)' };
  let evidence = analyze(input).checks.find(c => c.capture === 'same' && c.kind === 'border').evidence;
  assert.equal(evidence.widthChanged, true); assert.equal(evidence.amplified, true);
  source.layers[0].borders[0].color = 'rgba(0,0,0,0)';
  evidence = analyze(input).checks.find(c => c.capture === 'same' && c.kind === 'border').evidence;
  assert.equal(evidence.exposed, true);
});
test('SVG measures actual ink and refuses nested or multiple-ink shortcuts', () => {
  const row = sample(); row.svg = { paints: ['rgb(30,30,30)'], geometry: [], reason: null };
  assert.equal(analyze(report([row])).checks.find(c => c.kind === 'svg').status, 'review');
  row.layers[0].filter = 'brightness(0) invert(1)';
  assert.equal(analyze(report([row])).checks.find(c => c.kind === 'svg').status, 'pass');
  row.layers[0].filter = 'none';
  row.svg.paints = ['rgb(255,255,255)'];
  assert.equal(analyze(report([row])).checks.find(c => c.kind === 'svg').status, 'pass');
  row.svg.reason = 'Nested backing';
  assert.equal(analyze(report([row])).checks.find(c => c.kind === 'svg').status, 'unsupported');
});
test('comparison resolves findings, records missing elements and refuses mismatched environments/structure', () => {
  const before = report([sample({ ink: 'rgb(30,30,30)' })]), after = report([sample()]);
  assert.equal(compare(before, after).changes.find(c => c.current?.kind === 'text').status, 'resolved');
  after.environment.browser = 'different';
  assert.equal(compare(before, after).changes[0].status, 'not-comparable');
  after.environment.browser = 'fixed'; after.captures[0].rows[0].signature = 'span:1:';
  assert.equal(compare(before, after).changes[0].status, 'not-comparable');
  assert.equal(compare(before, report([])).changes[0].status, 'missing');
  assert.throws(() => validateReport({ ...before, version: 99 }), /Unsupported/);
  assert.throws(() => validateReport(report([sample(), sample()])), /duplicate/);
});
test('gallery inventory accounts for every documented mechanism without claiming pending cases pass', async () => {
  const guide = await readFile(new URL('../docs/WEBSITE-THEME-RENDERING.md', import.meta.url), 'utf8');
  const symptoms = guide.split('## Rendering fixes and regression checks')[1].split('\n').filter(line => line.startsWith('| ') && !line.startsWith('| Symptom') && !line.startsWith('| ---')).map(line => line.split('|')[1].trim());
  const inventory = JSON.parse(await readFile(new URL('../tools/diagnostics/coverage.json', import.meta.url), 'utf8'));
  assert.deepEqual(inventory.map(i => i.symptom).sort(), symptoms.sort());
  assert.equal(new Set(inventory.map(i => i.id)).size, inventory.length);
  for (const entry of inventory) {
    assert.ok(['partial', 'pending'].includes(entry.status));
    for (const id of entry.cases) assert.ok(cases.some(c => c.id === id));
  }
});

test('triage groups border sides and themes while retaining every raw check', () => {
  const input = report([sample({ width: 3 })], { sourceId: 'original' });
  input.runId = 'one';
  input.captures.unshift({ ...input.captures[0], id: 'original', theme: 'source', rows: [sample()] });
  input.captures.push({ ...structuredClone(input.captures[1]), id: 'soft', theme: 'soft' });
  const queue = triage(input); const borders = queue.findings.filter(f => f.kind === 'border');
  assert.equal(borders.length, 1); assert.equal(borders[0].checks.length, 8);
  assert.deepEqual(borders[0].themes, ['chromium', 'soft']); assert.equal(borders[0].priority, 'high');
  assert.deepEqual(triage(input), queue); assert.match(summaryMarkdown(queue), /Border geometry changed/);
});

test('triage separates inherited low contrast from actual measured degradation', () => {
  const input = report([sample({ ink: 'rgb(80,80,80)' })], { sourceId: 'original' });
  input.captures.unshift({ ...input.captures[0], id: 'original', theme: 'source', rows: [sample({ ink: 'rgb(80,80,80)' })] });
  assert.equal(triage(input).findings.find(f => f.kind === 'text').priority, 'advisory');
  input.captures[0].rows = [sample()];
  assert.equal(triage(input).findings.find(f => f.kind === 'text').priority, 'candidate');
  input.captures[1].rows[0].signature = 'unmatched';
  assert.equal(triage(input).findings.find(f => f.kind === 'text').priority, 'advisory');
});

test('review decisions retain raw failures, reopen changed paint and do not cross report scopes', () => {
  const input = report([sample({ ink: 'rgb(50,50,50)' })]); input.runId = 'one';
  const group = triage(input).findings[0], reviews = [{ fingerprint: group.fingerprint, disposition: 'accepted' }];
  assert.equal(triage(input, undefined, reviews).findings[0].disposition, 'accepted');
  assert.equal(analyze(input).checks.find(c => c.kind === 'text').status, 'review');
  input.captures[0].rows[0].layers[0].textFill = 'rgb(55,55,55)';
  assert.equal(triage(input, undefined, reviews).findings[0].disposition, 'open');
  input.runId = 'two'; assert.equal(triage(input, undefined, reviews).findings[0].disposition, 'open');
});

test('unsupported paint remains counted without being promoted to a confirmed defect', () => {
  const row = sample(); row.backdrop.color = null;
  const queue = triage(report([row])); assert.ok(queue.counts.unsupported > 0); assert.equal(queue.findings.length, 0);
});

test('extended specimens are registered separately and assets are actual PNG/GIF files', async () => {
  const extended = cases.filter(c => c.id.startsWith('extended-')); assert.equal(extended.length, 6);
  const html = await readFile(new URL('../fixtures/diagnostics/specimens.html', import.meta.url), 'utf8');
  for (const entry of extended) assert.ok(html.includes(`data-group="${entry.id.slice(9)}"`));
  for (const filename of ['single-ink.png', 'multicolor.png', 'opaque-artwork.png', 'bright-picture.png', 'dark-picture.png']) {
    const bytes = await readFile(new URL('../fixtures/diagnostics/assets/' + filename, import.meta.url));
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  }
  for (const filename of ['static-transparent.gif', 'animated-transparent.gif', 'static-multicolor.gif', 'opaque.gif']) {
    const bytes = await readFile(new URL('../fixtures/diagnostics/assets/' + filename, import.meta.url));
    assert.equal(bytes.subarray(0, 6).toString(), 'GIF89a');
    assert.equal(bytes.includes(Buffer.from('NETSCAPE2.0')), filename.startsWith('animated'));
  }
});

test('captured site assets retain pinned bytes and fixture resource delivery semantics', async () => {
  const base = new URL('../fixtures/diagnostics/site-assets/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('sources.json', base), 'utf8'));
  assert.ok(manifest.length >= 20);
  for (const asset of manifest) {
    assert.match(asset.file, /^[\w-]+\.(svg|png|gif)$/);
    const bytes = await readFile(new URL(asset.file, base));
    assert.equal(bytes.length, asset.bytes, asset.file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, asset.file);
    if (asset.file.endsWith('.svg')) assert.doesNotMatch(bytes.toString(), /<script\b|\bon\w+\s*=/i);
  }
  const css = await readFile(new URL('../fixtures/diagnostics/site-elements.css', import.meta.url), 'utf8');
  assert.match(css, /data:image\/svg\+xml,/); // Embedded paint must stay embedded, as in the reported CSS.
  assert.doesNotMatch(css, /url\("site-assets\/(?:indeed-gradient|junta-level|junta-back)\.svg/);
  const html = await readFile(new URL('../fixtures/diagnostics/site-elements.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /\bon(?:click|change)\s*=/i);
  for (const label of ['Andaluc\u00eda', 'Espa\u00f1ol', 'Formaci\u00f3n', 'cualificaci\u00f3n']) assert.ok(html.includes(label), label);
  assert.doesNotMatch(html, /[\u00c2\u00c3][\u0080-\u00bf]|\ufffd/);
  assert.equal(cases.filter(c => c.id.startsWith('site-')).length, 5);
});
