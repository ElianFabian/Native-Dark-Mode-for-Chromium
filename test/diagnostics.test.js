import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { color, composite, contrast, analyze, compare, validateReport } from '../tools/diagnostics/analysis.mjs';
import { cases } from '../tools/diagnostics/cases.mjs';
import { triage, summaryMarkdown } from '../tools/diagnostics/triage.mjs';

test('viewBox-only arrow reproduction retains original public drawing bytes', async()=>{
  const css=await readFile(new URL('../fixtures/diagnostics/arrow-reproduction.css',import.meta.url),'utf8');
  const value=css.match(/background-image:(url\(".*"\));background-repeat/)[1];
  const svg=decodeURIComponent(JSON.parse(value.slice(4,-1)).split('data:image/svg+xml,')[1]);
  assert.equal(createHash('sha256').update(svg).digest('hex'),'4b1f5385634b07c02d433aa8f43fb7739a8d0bcbe3c041c35235afec27b73beb');
});

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
    assert.match(asset.file, /^[\w-]+\.(svg|png|gif|jpg|jpeg)$/);
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
  assert.equal(cases.filter(c => c.id.startsWith('site-')).length, 6);
});

test('reported course controls preserve embedded menu/filter drawings and mixed-logo context', async () => {
  const html=await readFile(new URL('../fixtures/diagnostics/spring-controls.html',import.meta.url),'utf8');
  const drawings=[...html.matchAll(/src="data:image\/svg\+xml,([^"]+)"/g)].map(([,encoded])=>decodeURIComponent(encoded));
  assert.deepEqual(drawings.map(svg=>createHash('sha256').update(svg).digest('hex')), [
    'e89acbc2ad96f303de7ba19de6e8bae77cef9290a08863ad6c7947899db076b9',
    '08e1ec5c952ed6661dd801842adac26d50950e6010ac1a8bf7e4cceae23c7ac6'
  ]);
  assert.match(drawings[1], /fill='%23272B30'|fill='#272B30'/);
  assert.match(html, /border-color \.15s ease-in-out/);
  assert.match(html, /<a class="brand"[^>]+><img[^>]+><span>Spring Academy<\/span>/);
  assert.match(html, /<a class="course"[^>]+>[\s\S]*<div class="footer"/);
  const metadata=[...html.matchAll(/<div class="icon-text" data-audit-id="metadata-[01]">(<svg.*?<\/svg>)/g)].map(([,svg])=>svg);
  assert.deepEqual(metadata.map(svg=>createHash('sha256').update(svg).digest('hex')), [
    '1bef41ecd6ace766a41fc4d64120adcef6f159674951b96e7585403c83f1237a',
    '2750aa95f2806ff63fe3887f019fc1543e87b4e39eefe2d0857b2a32ca041f29'
  ]);
  assert.doesNotMatch(html, /\bon(?:click|change)\s*=/i);
});

test('headed card image keeps the reported embedded SVG and contrasting image-only controls', async () => {
  const html=await readFile(new URL('../fixtures/diagnostics/spring-card-glyph.html',import.meta.url),'utf8');
  const drawings=[...html.matchAll(/src="data:image\/svg\+xml,([^"]+)"/g)].map(([,s])=>decodeURIComponent(s));
  assert.equal(drawings.length,3);
  for(const index of [0,2]) assert.equal(createHash('sha256').update(drawings[index]).digest('hex'),
    'dabd0ab743337e16d2eb3630d4bbd16ce3685e65e1097a2c482d44b4675cdc46');
  assert.match(html, /<div class="badge" data-audit-id="badge"><img[^>]+><\/div><h2>/);
  assert.match(html, /data-audit-id="plain-label"[^>]*><\/div><p>/);
  assert.match(html, /label,isolated/);
  assert.doesNotMatch(html, /\bon(?:click|change)\s*=/i);
});


test('auth and banner reproductions retain native field and clipped image context', async()=>{
  const auth=await readFile(new URL('../fixtures/diagnostics/spring-auth-panel.html',import.meta.url),'utf8');
  const banner=await readFile(new URL('../fixtures/diagnostics/clipped-heading-panel.html',import.meta.url),'utf8');
  assert.match(auth,/site-assets\/spring-auth-background\.svg/);
  assert.match(auth,/border:1px inset #334155/);
  assert.match(auth,/transition-duration:\.2s/);
  assert.match(auth,/<div class="email-field-wrap"><span class="email-field-icon"/);
  assert.match(banner,/background:#000 url\(banner-pattern\.svg\) no-repeat right center\/auto 150%/);
  assert.match(banner,/border-radius:16px;overflow:hidden/);
  assert.match(banner,/\.copy\{padding:32px\}/);
  for(const id of ['artwork','transparent','square','framed'])assert.ok(banner.includes('data-audit-id="'+id+'"'));
  assert.doesNotMatch(auth+banner,/\bon(?:click|change)\s*=/i);
});


test('JitPack reproduction retains original icon font and source paint context',async()=>{
  const font=await readFile(new URL('../fixtures/diagnostics/jitpack-fontawesome.woff2',import.meta.url));
  assert.equal(createHash('sha256').update(font).digest('hex'),'2adefcbc041e7d18fcf2d417879dc5a09997aa64d675b7a3c4b6ce33da13f3fe');
  const html=await readFile(new URL('../fixtures/diagnostics/jitpack-paint.html',import.meta.url),'utf8');
  assert.match(html,/border-bottom:2px solid #e2e8f0/);
  assert.match(html,/linear-gradient\(135deg,#1a1a2e 0%,#16213e 40%,#0f3460 100%\)/);
  assert.match(html,/opacity:\.3/);
  assert.match(html,/background:#3bc492!important;color:white!important/);
  assert.match(html,/\.support:hover\{background:#2fa87d!important\}/);
  assert.doesNotMatch(html,/\bon(?:click|change)\s*=/i);
});


test('Kotlin article reproduction retains sibling delivery and semantic note context',async()=>{
  const html=await readFile(new URL('../fixtures/diagnostics/kotlin-article.html',import.meta.url),'utf8');
  assert.match(html,/<span class="meta"><svg[\s\S]*?<\/svg><a href="#edit">Edit page<\/a><span>/);
  assert.match(html,/src="site-assets\/kotlin-github\.svg"[^>]+width="18"[^>]+><a href="#github">/);
  assert.match(html,/<blockquote class="prompt"><h3 class="a11y-title">tip<\/h3><div class="wrapper"/);
  assert.match(html,/padding:16px;gap:24px;background:rgba\(25,25,28,\.05\);border-radius:6px/);
  assert.match(html,/width:max-content;max-width:100%/);
  assert.match(html,/flex-direction:row-reverse/);
  assert.match(html,/type="button" class="button"/);
  assert.match(html,/padding:22px;border:1px solid rgba\(25,25,28,\.2\);border-radius:8px;background:rgba\(25,25,28,\.05\)/);
  for(const id of ['ordinary','unpaired','decoration'])assert.ok(html.includes('data-audit-id="'+id+'"'));
  assert.doesNotMatch(html,/\bon(?:click|change)\s*=/i);
});


test('CSS wordmark reproduction keeps original embedded SVG and generated-layer delivery',async()=>{
  const html=await readFile(new URL('../fixtures/diagnostics/background-wordmarks.html',import.meta.url),'utf8');
  const original=await readFile(new URL('../fixtures/diagnostics/site-assets/kotlin-jetbrains.svg',import.meta.url),'utf8');
  const embedded=[...html.matchAll(/url\("data:image\/svg\+xml,([^"\n]+)"\)/g)];
  assert.equal(embedded.length,2);
  for(const [,uri]of embedded)assert.equal(decodeURIComponent(uri),original);
  assert.match(html,/position:relative;width:149px;height:32px/);
  assert.match(html,/content:"";display:block;position:absolute;top:0;left:0;width:100%;height:100%/);
  assert.match(html,/background-size:contain;background-position:0% 0%;background-repeat:no-repeat/);
  assert.match(html,/\.brand::after\{content:"";display:none/);
  assert.doesNotMatch(html,/<img\b|\bon(?:click|change)\s*=/i);
});


test('feedback reproduction separates the borderless panel from authored control and state frames',async()=>{
  const html=await readFile(new URL('../fixtures/diagnostics/kotlin-feedback.html',import.meta.url),'utf8');
  assert.match(html,/padding:24px 32px;background:#f4f4f4;border:0;border-radius:4px;box-shadow:none/);
  assert.match(html,/\.inactive\{display:none\}/);
  assert.match(html,/border:1px solid rgba\(25,25,28,\.3\);border-radius:24px;padding:5px 15px/);
  assert.match(html,/transition:color \.1s,background-color \.1s,border-color \.1s/);
  for(const id of ['reported','yes','no','framed','outlined','transparent','square'])assert.ok(html.includes('data-audit-id="'+id+'"'));
  assert.doesNotMatch(html,/\bon(?:click|change)\s*=/i);
});

test('community glyph reproduction retains external delivery and nested separate labels',async()=>{
  const html=await readFile(new URL('../fixtures/diagnostics/kotlin-community.html',import.meta.url),'utf8');
  assert.match(html,/<a class="card"[^>]+><div class="wrapper"><div class="image"><img src="site-assets\/kotlin-community-x.svg"/);
  assert.match(html,/<div class="bottom"><div class="title">X<\/div>/);
  assert.match(html,/width:424px;padding:16px;background:white;border:1px solid rgba\(25,25,28,\.2\);border-radius:8px/);
  assert.match(html,/site-assets\/kotlin-community-slack.svg/);
  assert.doesNotMatch(html,/<svg\b|data:image|\bon(?:click|change)\s*=/i);
});
