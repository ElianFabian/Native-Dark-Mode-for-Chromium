// Physical scroll benchmark on a fixed synthetic catalogue with loading images.
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { closeBrowser, launchBrowser, root, until } from '../../scripts/dev/diagnostics/browser.mjs';
import { compareRendererIdentity, expectedRendererIdentity, initializerFingerprint } from '../../scripts/dev/diagnostics/identity.mjs';
import { sourceHashes } from '../../scripts/dev/diagnostics/metrics.mjs';
import { startServer } from '../../scripts/dev/diagnostics/server.mjs';

function installWorkload() {
  const grid = document.querySelector('.grid');
  for (const tile of grid.querySelectorAll('.tile')) tile.style.height = '54px';
  const style = document.createElement('style');
  style.textContent = `
    .ndm-load-pane { position:fixed; inset:24px auto auto 24px; width:300px; height:330px;
      overflow:auto; overscroll-behavior:contain; background:#fff; color:#202020; z-index:2 }
    .ndm-load-card { box-sizing:border-box; height:112px; padding:6px; background:#fff; color:#222 }
    .ndm-load-card img { display:block; width:76px; height:66px; object-fit:cover }
    .ndm-load-notice { position:fixed; inset:24px 24px auto auto; width:190px; z-index:2 }
    .ndm-load-quiet { position:fixed; inset:auto 24px 24px auto; width:160px; z-index:2 }
  `;
  document.head.append(style);
  const card = (label, extra = '') => {
    const node = document.createElement('div');
    node.className = 'ndm-load-card ' + extra;
    node.textContent = label;
    return node;
  };
  const pane = document.createElement('section');
  pane.className = 'ndm-load-pane';
  pane.setAttribute('aria-label', 'Nested results');
  for (let index = 0; index < 24; index++) pane.append(card('Nested card ' + index));
  const quiet = card('Independent control', 'ndm-load-quiet');
  document.body.append(pane, quiet);
  const paint = node => {
    const computed = getComputedStyle(node);
    const box = node.getBoundingClientRect();
    return { color: computed.color, fill: computed.backgroundColor, size: [box.width, box.height] };
  };
  const offsets = [150, 300, 450, 600];
  let action;
  function insert(state) {
    const index = state.batches.length;
    const next = { move: state.position() - state.initial, firstFrame: null };
    state.batches.push(next);
    state.notice?.remove();
    state.notice = card('New arrivals ' + index, 'ndm-load-notice');
    document.body.append(state.notice);
    const notice = state.notice;
    const target = state.kind === 'pane' ? pane : grid;
    const fragment = document.createDocumentFragment();
    for (let item = 0; item < 8; item++) {
      const article = card('Loaded card ' + index + '.' + item);
      const image = document.createElement('img');
      image.alt = '';
      image.src = 'assets/multicolor.png?scroll-load=' + state.kind + '-' + index + '-' + item;
      article.append(image);
      fragment.append(article);
      state.images.push(image.decode().then(() => image.naturalWidth > 0));
    }
    target.append(fragment);
    queueMicrotask(() => requestAnimationFrame(() => {
      next.firstFrame = notice.isConnected ? paint(notice) : null;
    }));
  }
  return {
    quiet: () => paint(quiet),
    arm(kind) {
      const scrollTarget = kind === 'pane' ? pane : window;
      const position = () => kind === 'pane' ? pane.scrollTop : scrollY;
      const state = { kind, position, initial: position(), batches: [], images: [], frames: [], active: true };
      const onScroll = () => {
        if (state.batches.length < offsets.length && position() - state.initial >= offsets[state.batches.length]) insert(state);
      };
      scrollTarget.addEventListener('scroll', onScroll, {passive:true});
      state.stop = () => scrollTarget.removeEventListener('scroll', onScroll);
      action = state;
      let previous = performance.now();
      function frame(now) {
        if (!state.active) return;
        if (now >= previous) state.frames.push(now - previous);
        previous = now;
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    },
    async finish() {
      const state = action;
      state.active = false;
      state.stop();
      const decoded = (await Promise.all(state.images)).filter(Boolean).length;
      await new Promise(resolve => requestAnimationFrame(resolve));
      return { distance: state.position() - state.initial, decoded, batches: state.batches,
        frames: state.frames, quiet: paint(quiet), settled: paint(state.notice) };
    }
  };
}

const fields = ['TaskDuration','ScriptDuration','RecalcStyleDuration','LayoutDuration'];
const readMetrics = async page => Object.fromEntries((await page.send('Performance.getMetrics')).metrics
  .filter(metric => fields.includes(metric.name)).map(metric => [metric.name, metric.value]));
const percentile = (values, fraction) => [...values].sort((a,b) => a-b)[Math.ceil(values.length * fraction) - 1];
const out = path.join(root, 'research-artifacts/diagnostics/scroll-during-load-' + Date.now());
await mkdir(out, {recursive:true});
const report = { status:'running', startSources:await sourceHashes(), trials:[] };
const expected = await expectedRendererIdentity();
const attribute = process.argv.includes('--attribute');
const collector = process.argv.includes('--compare-collector');
const countInspections = process.argv.includes('--count-inspections');
assert.ok(!countInspections || attribute, 'Inspection counts require --attribute.');
const reverse = process.argv.includes('--reverse');
let extensionDirectory;
if (attribute || collector) {
  extensionDirectory = path.join(out, 'extension');
  await cp(path.join(root, 'extension'), extensionDirectory, {recursive:true});
  const renderer = path.join(extensionDirectory, 'website-theme.js');
  let source = (await readFile(renderer, 'utf8')).replace(/\r\n/g,'\n');
  if (collector) {
    const snapshot = 'const snapshot = verifyEmpty ? (scrollCandidates ??= new Map()) : null;';
    assert.equal(source.split(snapshot).length, 2);
    source = source.replace(snapshot, snapshot.replace('verifyEmpty ?', 'verifyEmpty && ndmUseScrollCandidates ?'));
  }
  const wrappers = [];
  if (countInspections) {
    const head = 'function inspect(element, backdrops, switchingRenderer = false) {';
    assert.equal(source.split(head).length, 2);
    source = source.replace(head, head + `
    if (ndmLoadInspections) {
      const phase = ndmLoadInspectOrigin ?? 'other';
      const stats = ndmLoadInspections[phase] ??= {initial:0,alreadySampled:0,repeatedInGesture:0};
      stats[sampledElements.has(element) ? 'alreadySampled' : 'initial']++;
      if (ndmLoadSeen.has(element)) stats.repeatedInGesture++;
      ndmLoadSeen.add(element);
    }`);
  }
  const phases = ['paintBatch','flushViewport','collectVisibleSurfaces','inspectLocal','sampleSignature'];
  for (const name of attribute ? phases : []) {
    const anchor = 'function ' + name + '(';
    assert.equal(source.split(anchor).length, 2, name);
    source = source.replace(anchor, 'function measured_' + name + '(');
    const countsOrigin = countInspections && (name === 'paintBatch' || name === 'flushViewport');
    wrappers.push(`function ${name}(...args) {
      if (!ndmLoadPhases) return measured_${name}(...args);
      const start = performance.now();
      ${countsOrigin ? 'const origin = ndmLoadInspectOrigin; ndmLoadInspectOrigin = ' + JSON.stringify(name) + ';' : ''}
      try { return measured_${name}(...args); }
      finally {
        const phase = ndmLoadPhases.${name} ??= {calls:0,ms:0};
        phase.calls++;
        phase.ms += performance.now() - start;
        ${countsOrigin ? 'ndmLoadInspectOrigin = origin;' : ''}
      }
    }`);
  }
  const anchor = '  requestPreset();';
  assert.equal(source.split(anchor).length, 2);
  source = source.replace(anchor, `
  let ndmLoadPhases;
  let ndmLoadInspections, ndmLoadSeen, ndmLoadInspectOrigin;
  let ndmUseScrollCandidates = false;
  globalThis.ndmLoadUseCandidate = enabled => {
    ndmUseScrollCandidates = enabled;
    invalidateScrollCollection();
    return true;
  };
  globalThis.ndmMeasureLoad = enabled => {
    if (enabled) {
      ndmLoadPhases = {};
      if (${countInspections}) {
        ndmLoadInspections = {};
        ndmLoadSeen = new WeakSet();
      }
      return true;
    }
    const result = ndmLoadPhases;
    if (ndmLoadInspections) result.inspections = ndmLoadInspections;
    ndmLoadPhases = undefined;
    ndmLoadInspections = ndmLoadSeen = undefined;
    return result;
  };
  globalThis.ndmLoadBusy = () => Boolean(elements || pending.size || dirtySurfaces.size ||
    idleBatch !== undefined || viewportFrame !== undefined || chromiumRefreshTimer !== undefined ||
    deferredRefreshTimer !== undefined || horizontalScrollTimer !== undefined);
  ${wrappers.join('\n')}
${anchor}`);
  await writeFile(renderer, source);
  expected.initialized.renderer = initializerFingerprint(source, 'nativeDarkModeWebsiteTheme');
}
const server = await startServer();
const url = server.base + '/fixtures/diagnostics/dynamic-catalogue.html?cards=300&css=heavy';
const paintReferences = new Map();
let browser;
try {
  browser = await launchBrowser(undefined, {extensionDirectory});
  report.browser = browser.version.product;
  const first = reverse ? 'candidate' : 'baseline', second = reverse ? 'baseline' : 'candidate';
  const comparison = [first,second,second,first,first,second,second,first];
  const order = collector ? ['baseline','baseline',...comparison] :
    attribute ? ['chromium','chromium'] :
    ['source','chromium','chromium','source','source','chromium','chromium','source'];
  for (const variant of order) {
    const policy = collector ? 'chromium' : variant;
    const row = {policy, variant, gestures:[]};
    report.trials.push(row);
    const page = await browser.open('about:blank');
    try {
      await page.send('Emulation.setDeviceMetricsOverride', {width:1440,height:1000,deviceScaleFactor:1,mobile:false});
      await page.send('Page.bringToFront');
      await page.send('Performance.enable');
      await browser.rule(url, 'source');
      await page.send('Page.navigate', {url});
      await until(() => page.evaluate("document.documentElement?.dataset.fixtureReady==='yes'"), 'catalogue ready');
      await page.evaluate('window.ndmLoadScroll = (' + installWorkload.toString() + ')()');
      if (collector) await browser.inRendererWorld(page,
        function (candidate) { return ndmLoadUseCandidate(candidate); }, [variant === 'candidate']);
      const source = await page.evaluate('ndmLoadScroll.quiet()');
      await browser.rule(url, policy, 'off');
      const quiet = await until(async () => {
        const current = await page.evaluate('ndmLoadScroll.quiet()');
        if (policy === 'source' ? current.fill === source.fill : current.fill !== source.fill) return current;
      }, 'control paint ready');
      assert.deepEqual(quiet.size, source.size);
      const identity = await browser.rendererIdentity(page);
      assert.equal(compareRendererIdentity(expected, identity).status, 'match');
      assert.equal(identity.observed.preset, policy === 'source' ? null : policy);
      const measure = async enabled => (await browser.inRendererWorld(page,
        function (value) { return ndmMeasureLoad(value); }, [enabled]))[0].result;
      const totalStart = await readMetrics(page);
      for (const [kind, x, y] of [['window',840,540],['pane',155,175]]) {
        if (attribute) await measure(true);
        const before = await readMetrics(page);
        await page.evaluate('ndmLoadScroll.arm(' + JSON.stringify(kind) + ')');
        await page.send('Input.synthesizeScrollGesture',
          {x,y,yDistance:-800,speed:850,gestureSourceType:'mouse',preventFling:true});
        const result = await page.evaluate('ndmLoadScroll.finish()');
        const after = await readMetrics(page);
        const phases = attribute ? await measure(false) : undefined;
        assert.ok(result.distance >= 790, kind + ' scroll route');
        assert.equal(result.decoded, 32, kind + ' decoded image count');
        assert.equal(result.batches.length, 4, kind + ' mutation count');
        assert.deepEqual(result.quiet, quiet, kind + ' independent control paint');
        assert.ok(result.frames.length >= 4, kind + ' frame observations');
        assert.deepEqual(result.settled.size, [190,112]);
        const firstPaintMismatches = result.batches.filter(batch =>
          JSON.stringify(batch.firstFrame) !== JSON.stringify(result.settled)).length;
        if (collector) {
          assert.equal(firstPaintMismatches, 0, kind + ' first-frame paint');
          const paint = [result.quiet, result.settled];
          if (!paintReferences.has(kind)) paintReferences.set(kind, paint);
          assert.deepEqual(paint, paintReferences.get(kind), kind + ' baseline paint');
        }
        const work = Object.fromEntries(fields.map(key => [key, (after[key] - before[key]) * 1000]));
        row.gestures.push({kind, ...result, p95:percentile(result.frames,.95), max:Math.max(...result.frames),
          firstPaintMismatches, work, phases});
      }
      if (collector) {
        await until(async () => !(await browser.inRendererWorld(page,
          function () { return ndmLoadBusy(); }))[0].result, 'renderer queues drained');
        const totalEnd = await readMetrics(page);
        row.throughDrain = Object.fromEntries(fields.map(key => [key, (totalEnd[key] - totalStart[key]) * 1000]));
      }
      console.log(JSON.stringify({variant, gestures:row.gestures.map(({kind,p95,max,firstPaintMismatches,work}) =>
        ({kind,p95,max,firstPaintMismatches,work}))}));
    } finally {
      await page.close();
    }
  }
  report.status = 'complete';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack;
  throw error;
} finally {
  try { report.cleanup = await closeBrowser(browser); }
  finally {
    await server.close();
    report.endSources = await sourceHashes();
    await writeFile(path.join(out, 'results.json'), JSON.stringify(report,null,2));
    console.log('Evidence: ' + out);
    assert.deepEqual(report.endSources, report.startSources);
  }
}
