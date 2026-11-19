import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cp, mkdir, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {launchBrowser, closeBrowser, root, until} from '../../scripts/dev/diagnostics/browser.mjs';
import {compareRendererIdentity, expectedRendererIdentity, initializerFingerprint} from '../../scripts/dev/diagnostics/identity.mjs';
import {sourceHashes} from '../../scripts/dev/diagnostics/metrics.mjs';
import {startServer} from '../../scripts/dev/diagnostics/server.mjs';

const live = process.argv.includes('--live');
const detail = process.argv.includes('--detail');
const probeMotion = process.argv.includes('--probe-motion');
const deferFirst = process.argv.includes('--defer-first');
assert.ok(!deferFirst || probeMotion, '--defer-first requires --probe-motion.');
const auditPaint = process.argv.includes('--audit-paint');
assert.ok(!auditPaint || (probeMotion && live), '--audit-paint requires --live --probe-motion.');
const phases = probeMotion || process.argv.includes('--phases');
const challengeColor = process.argv.includes('--challenge-color');
assert.ok(!challengeColor || (phases && !live && !probeMotion), '--challenge-color requires local --phases.');
const generatedFrame = process.argv.includes('--generated-frame');
const measureFrameCheck = generatedFrame || process.argv.includes('--measure-frame-check');
assert.ok(!generatedFrame || (!live && !probeMotion && !challengeColor), '--generated-frame requires the local class-driven carousel.');
assert.ok(!measureFrameCheck || phases, 'Frame measurements require --phases.');
assert.ok(!(detail && phases), 'Choose either individual helper timers or contiguous classification phases.');
const compareSource = !live || process.argv.includes('--compare-source');
const directory = path.join(root, 'research-artifacts/diagnostics/carousel-click-trace-' + (live ? 'live-' : 'local-') +
  (auditPaint ? 'paint-' : probeMotion ? 'motion-' : phases ? 'phases-' : detail ? 'detail-' : '') + Date.now());
const extension = path.join(directory, 'extension');
await mkdir(directory, {recursive: true});
await cp(path.join(root, 'extension'), extension, {recursive: true});
const renderer = path.join(extension, 'website-theme.js');
let source = (await readFile(renderer, 'utf8')).replace(/\r\n/g, '\n');
function replace(anchor, replacement) {
  assert.equal(source.split(anchor).length, 2, anchor);
  source = source.replace(anchor, () => replacement);
}
function wrap(name, label) {
  replace('function ' + name + '(', 'function traced_' + name + '(');
  return `function ${name}(...args) {
    if (!ndmClickTrace) return traced_${name}(...args);
    const previousOrigin = ndmOrigin;
    ${['viewport','idle'].includes(label) ? "ndmOrigin = '" + label + "';" : ''}
    const region = ndmStart('${label}');
    try { return traced_${name}(...args); }
    finally { ndmEnd(region); ndmOrigin = previousOrigin; }
  }`;
}
const wrappers = Object.entries({
  flushViewport: 'viewport', collectVisibleSurfaces: 'collect', inspectLocal: 'local', paintVisibleSurfaces: 'full',
  paintBatch: 'idle', applyRoles: 'apply', prepareImageInkBatch: 'image-batch'
}).map(([name,label]) => wrap(name,label));
if (phases) {
  // These intervals partition the common HTML path. The first few guards can
  // return before a later boundary. Record a section only when it completes.
  const boundaries = [
    ['const stickyTransition = hasStickyBackgroundTransition(element, style);', null],
    ['const artwork = artworkRepair(element, style, background, surface);', 'inkAndSurface'],
    ['const separators = chromiumSeparators(element, style, backdrops, shadow ?? style.boxShadow);', 'artworkAndTextContrast'],
    ['const panelEdge = formPanelEdge(element, backdropFor(element));', 'separatorsAndInitialPseudos'],
    ['const glyphText = glyphLabelTextPaint(element,style,backdropFor(element),color ?? foreground);', 'panelAndControlRepairs'],
    ['const chipBorder = subduedChipBorder(element, style, surface ?? background);', 'glyphAndGeneratedFrames'],
    ['const fallbackControlIcon = pseudoStyles.some(([, declarations])', 'bordersAndFinalRepairs'],
    ["return { declarations: declarations.join(''), transition, pseudoStyles };", 'composeOutput']
  ];
  for (const [anchor, name] of boundaries) {
    const start = name ? "ndmSection = ndmInterval('" + name + "', ndmSection);" :
      'let ndmSection = ndmClickTrace ? performance.now() : 0;';
    replace('    ' + anchor, '    ' + start + '\n    ' + anchor);
  }
  replace('      authoredPaint.set(element, {',
    '      const ndmSnapshot = ndmClickTrace ? performance.now() : 0;\n      authoredPaint.set(element, {');
  replace('      });\n    }\n    const root = element.shadowRoot',
    "      });\n      ndmInterval('authoredSnapshot', ndmSnapshot);\n    }\n    const root = element.shadowRoot");
  const equal = '      if (elementColorRules.get(element)?.key === key) continue;';
  replace(equal, `      if (ndmClickTrace) {
        const old = elementColorRules.get(element);
        const outcome = paint ? (old ? (old.key === key ? 'equal' : 'changed') : 'first') : old ? 'removed' : 'empty';
        ndmCount('output-' + outcome);
        if (outcome === 'equal' && !paint.pseudoStyles.length && !paint.transition &&
            /^color:[^;]+;$/u.test(paint.declarations)) ndmCount('equalColorOnly');
      }
` + equal);
  const scheduled = 'if (sampled || popup) scheduleDirtySurface(target);';
  replace(scheduled, `if (sampled || popup) {
                ndmRememberReason(target, attribute, record.oldValue, value);
                if (!ndmDeferMotion(attribute, record.oldValue, value, popup)) scheduleDirtySurface(target);
              }`);
  replace('              scheduleDirtySurface(node);', "              ndmRememberReason(node, 'insert');\n              scheduleDirtySurface(node);");
  const rootGuard = '      if (changedRoots && (!root.isConnected || roots.has(root.parentElement))) continue;';
  // The palette collector uses different indentation and a different output set.
  replace('\n' + rootGuard + '\n      for (const element', '\n' + rootGuard +
    '\n      const ndmPreviousSize = targets.size;\n      for (const element');
  const rootDone = '      if (!changedRoots) for (const shadow of shadowRoots) if (shadow.host.isConnected) roots.add(shadow);';
  replace(rootDone, `      if (ndmClickTrace && changedRoots && targets.size > ndmPreviousSize) {
        const reasons = ndmReasons.get(root);
        ndmCount('selected-' + (reasons ? [...reasons].sort().join('+') : 'unattributed'), targets.size - ndmPreviousSize);
        const inline = ndmInline.get(root);
        if (inline) ndmInlineSelections.push([performance.now(), targets.size - ndmPreviousSize, inline]);
        ndmInline.delete(root);
        ndmReasons.delete(root);
      }
` + rootDone);
}
if (detail) {
  for (const name of ['chromiumColors', 'rememberArtworkLayers', 'hasImageBackdrop', 'imageLabelPaint', 'listItemFramePaint',
    'artworkRepair', 'authoredSolidBackdrop', 'textBackdrop', 'chromiumSeparators', 'chromiumSurfaceColor', 'labelPseudoSurfaces',
    'backgroundArtworkPaint', 'externalSvgGlyph', 'separatedCardPaint']) {
    replace('function ' + name + '(', 'function measured_' + name + '(');
    wrappers.push(`function ${name}(...args) {
      if (!ndmClickTrace) return measured_${name}(...args);
      const start = performance.now();
      try { return measured_${name}(...args); }
      finally {
        if (ndmDetails.${name} === undefined) ndmDetails.${name} = [];
        ndmDetails.${name}.push([start,performance.now()]);
      }
    }`);
  }
  wrappers.push(`function getComputedStyle(...args) {
    if (!ndmClickTrace) return globalThis.getComputedStyle(...args);
    const start = performance.now();
    try { return globalThis.getComputedStyle(...args); }
    finally { (ndmDetails.getComputedStyle ??= []).push([start,performance.now()]); }
  }`);
}
replace('function inspect(', 'function traced_inspect(');
if (measureFrameCheck) {
  replace("      return preset === 'chromium' ? chromiumColors(element, backdrops, switchingRenderer) :",
    "      if (preset === 'chromium') ndmReadFrame(element);\n      return preset === 'chromium' ? chromiumColors(element, backdrops, switchingRenderer) :");
}
const colorCohort = phases ? `const previousBacking = ndmPriorBacking.get(args[0]);
    const previousFrame = ndmFrames.get(args[0]);
    const previousSource = authoredPaint.get(args[0]);
    const previousKey = elementColorRules.get(args[0])?.key;
    const eligible = ndmClickTrace && /^color:[^;]+;\\n\\n\\[\\]$/u.test(previousKey ?? '');
    const started = eligible ? performance.now() : 0;
    const paint = traced_inspect(...args);
    const elapsed = eligible ? performance.now() : 0;
    const backing = args[1].solid.get(args[0]);
    ndmPriorBacking.set(args[0], backing);
    if (eligible) {
      (ndmDetails.previousColorOnly ??= []).push([started,elapsed]);
      const current = authoredPaint.get(args[0]);
      if (previousSource && current && previousSource.color === current.color &&
          previousSource.webkitTextFillColor === current.webkitTextFillColor && backing && previousBacking &&
          backing.every((value,i) => value === previousBacking[i])) {
        const equal = paint && !paint.transition && !paint.pseudoStyles.length && previousKey.split('\\n')[0] === paint.declarations;
        ndmCount(equal ? 'predictionCorrect' : 'predictionWrong');
        if (JSON.stringify(previousSource) === JSON.stringify(current)) {
          ndmCount(equal ? 'snapshotCorrect' : 'snapshotWrong');
          const frame = ndmFrames.get(args[0]);
          if (previousFrame && frame && frame.slice(0,4).every((value,index) => value === previousFrame[index])) {
            ndmCount(equal ? 'frameWidthCorrect' : 'frameWidthWrong');
            if (frame[4] === previousFrame[4] && frame[5] === previousFrame[5]) {
              ndmCount(equal ? 'frameCorrect' : 'frameWrong');
            }
          }
        }
      }
    }
    return paint;` : 'return traced_inspect(...args);';
wrappers.push('function ndmInspectCohort(...args) {' + colorCohort + '}');
wrappers.push(`function inspect(...args) {
    if (!ndmClickTrace) return ndmInspectCohort(...args);
    const previous = ndmInspectionKeys;
    ndmInspectionKeys = new Set();
    ndmCount('inspected');
    ndmCount('inspected-' + ndmOrigin);
    const element = args[0];
    const id = ndmElementIds.get(element) ?? ++ndmNextElement;
    ndmElementIds.set(element,id);
    ndmVisits.push([performance.now(), id, ndmOrigin]);
    try { return ndmInspectCohort(...args); } finally { ndmInspectionKeys = previous; }
  }`);
replace('    const rootPaint = sheet.cssRules[0]?.style;\n    const localScheme', "    let ndmLocalPhase = ndmStart('scheme-setup');\n    const rootPaint = sheet.cssRules[0]?.style;\n    const localScheme");
replace('    for (const [element] of previous) element.removeAttribute(marker);',
  "    ndmCount('markersRemoved', previous.length);\n    ndmEnd(ndmLocalPhase);\n    ndmLocalPhase = ndmStart('marker-exposure');\n    for (const [element] of previous) element.removeAttribute(marker);");
replace("    for (const element of exposed) element.setAttribute(sampleMarker, 'source-scheme');",
  "    for (const element of exposed) element.setAttribute(sampleMarker, 'source-scheme');\n    ndmCount('schemeTokens', exposed.length);\n    ndmEnd(ndmLocalPhase);");
replace('      imageInkBatch = prepareImageInkBatch(elements);\n      const updates = [];',
  "      imageInkBatch = prepareImageInkBatch(elements);\n      ndmLocalPhase = ndmStart('classify');\n      const updates = [];");
replace('      imageInkBatch = previousImageInkBatch;\n      for (const [element, paint] of previous)',
  "      ndmEnd(ndmLocalPhase);\n      const restorationRegion = ndmStart('restore');\n      imageInkBatch = previousImageInkBatch;\n      for (const [element, paint] of previous)");
replace("      for (const element of exposed) element.removeAttribute(sampleMarker);\n      if (scheme) rootPaint.setProperty('color-scheme', scheme, schemePriority);",
  "      for (const element of exposed) element.removeAttribute(sampleMarker);\n      if (scheme) rootPaint.setProperty('color-scheme', scheme, schemePriority);\n      ndmEnd(restorationRegion);");
replace("    const colors = {};\n    if (style.transitionDuration === '0s' && style.transitionDelay === '0s') return colors;",
  "    const colors = {};\n    ndmCount('transitionCalls');\n    if (style.transitionDuration === '0s' && style.transitionDelay === '0s') return colors;\n    ndmCount('nonZeroTransitionCalls');");
replace('      const target = animation.effect?.getKeyframes().at(-1);', `      const start = ndmClickTrace ? performance.now() : 0;
      const target = animation.effect?.getKeyframes().at(-1);
      if (ndmClickTrace) {
        ndmCount('keyframes');
        ndmCount('keyframeUs', (performance.now() - start) * 1000);
        if (ndmInspectionKeys?.has(animation)) {
          ndmCount('repeatedKeyframesWithinInspection');
          ndmCount('repeatedKeyframeUs', (performance.now() - start) * 1000);
        }
        ndmInspectionKeys?.add(animation);
      }`);
replace('      for (const animation of document.getAnimations()) {',
  "      const scan = ndmStart('document-animations');\n      const animations = document.getAnimations();\n      ndmEnd(scan);\n      for (const animation of animations) {");
replace('      applyRoles(inspectLocal(targets, true));', `      const origin = ndmOrigin;
      ndmOrigin = 'hover-focus';
      try { applyRoles(inspectLocal(targets, true)); }
      finally { ndmOrigin = origin; }`);
replace('  requestPreset();', `
  let ndmClickTrace = false;
  let ndmTraceIndex = 0;
  let ndmInspectionKeys;
  let ndmTraceCounts = {};
  let ndmDetails = {};
  const ndmPriorBacking = new WeakMap();
  const ndmFrames = new WeakMap();
  function ndmReadFrame(element) {
    const eligible = ndmClickTrace && /^color:[^;]+;\\n\\n\\[\\]$/u.test(elementColorRules.get(element)?.key ?? '');
    const start = eligible ? performance.now() : 0;
    const before = getComputedStyle(element, '::before');
    const after = getComputedStyle(element, '::after');
    ndmFrames.set(element, [before.content, before.borderTopWidth, after.content, after.borderTopWidth,
      before.borderTopColor, after.borderTopColor]);
    if (eligible) ndmInterval('generatedFrameCheck', start);
  }
  let ndmReasons;
  let ndmInline, ndmInlineSelections;
  let ndmOrigin = 'other';
  let ndmElementIds, ndmVisits, ndmNextElement;
  let ndmClickStart;
  let ndmPolicy = 'current';
  function ndmDeferMotion(attribute, before, after, popup) {
    if (!${probeMotion} || !ndmClickTrace || attribute !== 'style' || popup ||
        (before?.length ?? 0) > 4096 || (after?.length ?? 0) > 4096) return false;
    const a = document.createElement('span').style, b = document.createElement('span').style;
    a.cssText = before ?? '';
    b.cssText = after ?? '';
    const different = [...new Set([...a, ...b])].filter(property =>
      a.getPropertyValue(property) !== b.getPropertyValue(property) || a.getPropertyPriority(property) !== b.getPropertyPriority(property));
    if (!different.some(property => property.startsWith('transition-')) ||
        !different.every(property => property === 'transform' || property.startsWith('transition-'))) return false;
    // This counterfactual deliberately leaves the normal idle scan active.
    // Even transform-only inline edits can match author selectors on descendants.
    function family(style) {
      const value = style.transitionProperty;
      if (!value) return 'unset';
      if (value === 'all' || value === 'none' || value === 'transform') return value;
      return 'other';
    }
    ndmCount('motion-edit-' + family(a) + '-to-' + family(b));
    return ndmPolicy === 'defer';
  }
  function ndmRememberReason(target, reason, before, after) {
    if (!ndmClickTrace) return;
    if (!ndmReasons.has(target)) ndmReasons.set(target, new Set());
    ndmReasons.get(target).add(reason);
    if (reason !== 'style') return;
    const pairs = ndmInline.get(target) ?? [];
    if (pairs.length < 16 && (before?.length ?? 0) <= 4096 && (after?.length ?? 0) <= 4096) pairs.push([before, after]);
    else if (pairs.at(-1) !== null) pairs.push(null);
    ndmInline.set(target, pairs);
  }
  function ndmStyleFields() {
    // Parse the observer's old value and delivered current value after tracing.
    // The detached CSS declarations and raw inline values stay in this world.
    const oldStyle = document.createElement('span').style;
    const newStyle = document.createElement('span').style;
    return ndmInlineSelections.map(([at, nodes, pairs]) => {
      const fields = new Set();
      for (const pair of pairs) {
        if (pair === null) { fields.add('truncated'); continue; }
        oldStyle.cssText = pair[0] ?? '';
        newStyle.cssText = pair[1] ?? '';
        let changed = false;
        for (const property of new Set([...oldStyle, ...newStyle])) {
          if (oldStyle.getPropertyValue(property) === newStyle.getPropertyValue(property) &&
              oldStyle.getPropertyPriority(property) === newStyle.getPropertyPriority(property)) continue;
          changed = true;
          fields.add(property.startsWith('--') ? 'custom-property' : property);
        }
        if (!changed) fields.add('equal-parsed-declarations');
      }
      return [at, nodes, [...fields].sort().join('+')];
    });
  }
  function ndmInterval(name, start) {
    if (!ndmClickTrace) return 0;
    const end = performance.now();
    (ndmDetails[name] ??= []).push([start, end]);
    return end;
  }
  function ndmCount(name, value = 1) {
    if (!ndmClickTrace) return;
    (ndmTraceCounts[name] ??= []).push([performance.now(), value]);
  }
  function ndmStart(name) {
    if (!ndmClickTrace) return;
    const id = 'ndm-region:' + (++ndmTraceIndex) + ':' + name;
    performance.mark(id + ':start');
    return id;
  }
  function ndmEnd(id) {
    if (id) performance.mark(id + ':end');
  }
  globalThis.__ndmClickTrace = {
    start(policy) {
      ndmPolicy = policy;
      ndmClickTrace = true;
      ndmTraceCounts = {};
      ndmDetails = {};
      ndmReasons = new WeakMap();
      ndmInline = new WeakMap();
      ndmInlineSelections = [];
      ndmElementIds = new WeakMap();
      ndmVisits = [];
      ndmNextElement = 0;
      ndmClickStart = performance.now();
    },
    stop() {
      ndmClickTrace = false;
      for (const mark of performance.getEntriesByType('mark')) {
        if (mark.name.startsWith('ndm-region:')) performance.clearMarks(mark.name);
      }
      const styleFields = ndmStyleFields();
      ndmInline = ndmInlineSelections = undefined;
      return {counts: ndmTraceCounts, details: ndmDetails, visits: ndmVisits, styleFields, since: ndmClickStart};
    },
    busy() {
      return {preset: preset ?? null, pending: pending.size, scanning: Boolean(elements), viewport: viewportFrame !== undefined, dirty: dirtySurfaces.size,
        idle: idleBatch !== undefined, hover: hoverFrame !== undefined, full: chromiumRefreshTimer !== undefined || deferredRefreshTimer !== undefined};
    }
  };
  ${wrappers.join('\n')}
  requestPreset();`);
new Function(source);
await writeFile(renderer, source);
const expected = await expectedRendererIdentity();
expected.initialized.renderer = initializerFingerprint(source, 'nativeDarkModeWebsiteTheme');
async function probeFingerprint() {
  return createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');
}
const report = {status: 'running', scope: live ? 'anonymous settled storefront' : probeMotion ?
  'synthetic inline motion and descendant paint' : 'synthetic multicolumn carousel',
  detail, phases, probeMotion, deferFirst, auditPaint, compareSource, sourceSeals: await sourceHashes(),
  probeSha256: await probeFingerprint(), actions: []};

async function connectTrace(browser) {
  const [port, endpoint] = (await readFile(path.join(tmpdir(), browser.isolation.profileId, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/);
  const socket = new WebSocket('ws://127.0.0.1:' + port + endpoint);
  await new Promise((resolve,reject) => {
    socket.addEventListener('open', resolve, {once: true});
    socket.addEventListener('error', reject, {once: true});
  });
  let nextId = 0, completion;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Tracing.tracingComplete') completion = message.params;
    const handler = pending.get(message.id);
    if (!handler) return;
    pending.delete(message.id);
    clearTimeout(handler.timer);
    if (message.error) handler.reject(Error(JSON.stringify(message.error)));
    else handler.resolve(message.result);
  });
  function send(method, params = {}) {
    return new Promise((resolve,reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(Error('Trace timeout: ' + method)); }, 15000);
      pending.set(id, {resolve,reject,timer});
      socket.send(JSON.stringify({id,method,params}));
    });
  }
  return {
    close() { socket.close(); },
    async start() {
      completion = undefined;
      await send('Tracing.start', {categories: 'devtools.timeline,blink.user_timing', transferMode: 'ReturnAsStream'});
    },
    async stop() {
      await send('Tracing.end');
      await until(() => completion, 'trace stream complete');
      assert.ok(completion.stream && !completion.dataLossOccurred);
      let bytes = 0;
      const parts = [];
      try {
        for (;;) {
          const part = await send('IO.read', {handle: completion.stream, size: 1048576});
          const data = Buffer.from(part.data, part.base64Encoded ? 'base64' : 'utf8');
          parts.push(data);
          bytes += data.length;
          assert.ok(bytes < 48 * 1024 * 1024, 'Trace exceeds 48 MiB');
          if (part.eof) break;
        }
      } finally {
        await send('IO.close', {handle: completion.stream});
      }
      return JSON.parse(Buffer.concat(parts).toString()).traceEvents;
    }
  };
}

function installLocalCarousel(challengeColor, generatedFrame) {
  const template = document.querySelector('.cards');
  const carousel = document.createElement('section');
  const style = document.createElement('style');
  style.textContent = '.probe-window{width:900px;overflow:hidden}.probe-track{display:grid;width:max-content;' +
    'grid-template-columns:repeat(13,157px);gap:6px;transition:transform .26s ease}' +
    '.probe-next .probe-track{transform:translateX(-489px)}.probe-track .cards{display:grid;gap:3px;background:white}' +
    '.probe-track .card{width:155px;height:81px;border-radius:6px}' +
    '.probe-track .text{inset:4px;transition:color .28s, background-color .28s}' +
    '.probe-track .text span,.probe-track h3{font-size:12px}' +
    '.probe-next .probe-track .text{color:#fff0bd}.probe-next .probe-track .authored{background-color:#473023}';
  if (challengeColor) style.textContent +=
    '.probe-next .probe-track *{box-shadow:0 0 0 32px white}' +
    '.probe-next .probe-track .cards::before{content:"";position:absolute;inset:0;border:1px solid #ccc;pointer-events:none}';
  if (generatedFrame) style.textContent +=
    '.frame-control{position:relative;color:#222}' +
    '.frame-control::before{content:"";position:absolute;inset:0;border:0 solid #ccc;pointer-events:none}' +
    '.probe-next .frame-positive::before{border-width:1px}' +
    '.frame-ink::before{border:1px solid transparent}.probe-next .frame-ink::before{border-color:#ccc}';
  document.head.append(style);
  carousel.innerHTML = '<button type="button">Next</button><button type="button">Previous</button>' +
    '<div class="probe-window"><div class="probe-track"></div></div>';
  template.replaceWith(carousel);
  const track = carousel.querySelector('.probe-track');
  for (let index = 0; index < 39; index++) {
    const group = template.cloneNode(true);
    if (generatedFrame) group.insertAdjacentHTML('afterbegin',
      '<div class="frame-control frame-positive" role="listitem">Generated frame</div>' +
      '<div class="frame-control frame-ink" role="listitem">Generated frame ink</div>' +
      '<div class="frame-control" role="listitem">Stable frame control</div>');
    track.append(group);
  }
  const [next, previous] = carousel.querySelectorAll('button');
  next.addEventListener('click', () => carousel.classList.add('probe-next'));
  previous.addEventListener('click', () => carousel.classList.remove('probe-next'));
  return {container: carousel, control: [next, previous], viewport: carousel.querySelector('.probe-window'),
    card: track.firstElementChild, cards: track.childElementCount};
}

function findLocalMotionCarousel() {
  const track = document.querySelector('.probe-track');
  const swatches = [...track.querySelectorAll('.motion-dependent,.motion-control')];
  return {container: track.closest('section'), control: [document.querySelector('#next'), document.querySelector('#previous')],
    viewport: track.parentElement, card: track.firstElementChild, cards: track.childElementCount,
    readPaint: () => swatches.map(element => getComputedStyle(element).backgroundColor)};
}

function makeLivePaintAudit(target) {
  const candidates = [...target.container.getElementsByTagName('*')].filter(node => node instanceof HTMLElement);
  const size = Math.min(96, candidates.length);
  const nodes = Array.from({length: size}, (_, i) => candidates[Math.floor((i + .5) * candidates.length / size)]);
  const properties = ['color','webkitTextFillColor','backgroundColor','borderTopColor','opacity','visibility'];
  const trials = [];
  function sample() {
    const clip = target.viewport.getBoundingClientRect();
    return nodes.map(node => {
      if (!node.isConnected || !target.container.contains(node)) return null;
      const box = node.getBoundingClientRect();
      const inside = Math.min(box.right, clip.right, innerWidth) > Math.max(box.left, clip.left, 0) &&
        Math.min(box.bottom, clip.bottom, innerHeight) > Math.max(box.top, clip.top, 0);
      const style = getComputedStyle(node);
      return {inside, values: properties.map(p => style[p])};
    });
  }
  return {
    sample,
    record(policy, direction, before) { trials.push({policy, direction, before, first: sample()}); },
    settle() { trials.at(-1).settled = sample(); },
    summary() {
      return [0,1].map(direction => {
        const rows = trials.filter(trial => trial.direction === direction && trial.policy !== 'source');
        const current = rows.filter(trial => trial.policy === 'current'), defer = rows.filter(trial => trial.policy === 'defer');
        if (current.length !== 2 || defer.length !== 2) throw Error('Incomplete paint audit');
        let overlapping = 0;
        const result = Object.fromEntries(properties.map(p => [p, {stable: 0, different: 0, converged: 0}]));
        for (let i = 0; i < size; i++) {
          if (!rows.every(t => t.before[i] && t.first[i]?.inside && t.settled[i])) continue;
          overlapping++;
          for (const [j,p] of properties.entries()) {
            const values = (trials, when) => new Set(trials.map(t => t[when][i].values[j]));
            if (values(rows,'before').size !== 1 || values(current,'first').size !== 1 || values(defer,'first').size !== 1) continue;
            result[p].stable++;
            if (values(rows,'first').size === 1) continue;
            result[p].different++;
            if (values(rows,'settled').size === 1) result[p].converged++;
          }
        }
        return {direction, sampled: size, overlapping, properties: result};
      });
    }
  };
}

function installInput(findCarousel, makePaintAudit) {
  const target = findCarousel();
  if (!target) return null;
  target.container.scrollIntoView({block:'center', behavior:'instant'});
  const audit = makePaintAudit?.(target);
  let action;
  function offset() { return target.card.getBoundingClientRect().left - target.viewport.getBoundingClientRect().left; }
  window.ndmClickInput = {
    point(direction) {
      const control = target.control[direction];
      if (!control?.isConnected) return null;
      const r = control.getBoundingClientRect(), x = r.x + r.width/2, y = r.y + r.height/2;
      if (!r.width || !r.height || !control.contains(document.elementFromPoint(x,y))) return null;
      return {x,y};
    },
    arm(direction, policy) {
      const control = target.control[direction];
      const from = offset();
      const current = action = {from, armed: performance.now(), beforePaint: target.readPaint?.()};
      const before = audit?.sample();
      function click(event) {
        if (!control.contains(event.target)) return;
        document.removeEventListener('click', click, true);
        current.click = performance.mark('ndm-input:click').startTime;
      }
      document.addEventListener('click', click, true);
      function frame() {
        const x = offset();
        if (current.click !== undefined) {
          const displacement = (x - from) * (direction ? 1 : -1);
          if (displacement >= 2 && current.motion === undefined) {
            current.motion = performance.mark('ndm-input:motion').startTime;
            current.firstDisplacement = displacement;
            current.firstMotionPaint = target.readPaint?.();
            audit?.record(policy, direction, before);
          }
          if (displacement >= 100) current.travel = displacement;
        }
        if (current.travel === undefined && performance.now() - current.armed < 5000) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    },
    ready() { return action?.travel !== undefined; },
    paint() { return target.readPaint?.() ?? null; },
    settleAudit() { audit.settle(); },
    summarizeAudit() { return audit.summary(); },
    structure() {
      return {connected: [target.container, target.card, ...target.control].every(node => node.isConnected),
        subtreeNodes: target.container.getElementsByTagName('*').length, viewportWidth: target.viewport.clientWidth};
    },
    read() {
      performance.clearMarks('ndm-input:click');
      performance.clearMarks('ndm-input:motion');
      return action;
    }
  };
  return {nodes: document.getElementsByTagName('*').length, cards: target.cards, width: target.viewport.clientWidth};
}

function findLiveCarousel() {
  for (const container of document.querySelectorAll('.a-carousel-container')) {
    const cards = container.querySelectorAll('.a-carousel-card');
    const next = container.querySelector('.a-carousel-goto-nextpage');
    const previous = container.querySelector('.a-carousel-goto-prevpage');
    const viewport = container.querySelector('.a-carousel-viewport');
    if (cards.length >= 10 && viewport?.clientWidth > 500 && next?.matches('a[href^="#"]') && previous?.matches('a[href^="#"]')) {
      return {container, control: [next, previous], viewport, card: cards[0], cards: cards.length};
    }
  }
  return null;
}

function overlap(rows, start, end) {
  const ranges = rows.map(row => [Math.max(row.ts, start), Math.min(row.ts + row.dur, end)]).filter(([a,b]) => b>a).sort((a,b) => a[0]-b[0]);
  let frontier = start, total = 0;
  for (const [a,b] of ranges) {
    total += Math.max(0,b - Math.max(frontier,a));
    frontier = Math.max(frontier,b);
  }
  return total / 1000;
}

function attribute(events, input, probe) {
  const click = events.find(e => e.name === 'ndm-input:click');
  const motion = events.find(e => e.name === 'ndm-input:motion' && e.pid === click?.pid && e.tid === click?.tid);
  assert.ok(click && motion && motion.ts > click.ts, 'Missing ordered click/motion markers');
  const elapsedMs = (motion.ts-click.ts)/1000;
  assert.ok(Math.abs(elapsedMs - (input.motion-input.click)) < 2, 'Trace and input clocks disagree');
  const lane = events.filter(e => e.pid === click.pid && e.tid === click.tid);
  const startRows = new Map(), regions = [];
  for (const event of lane) {
    if (!event.name?.startsWith('ndm-region:')) continue;
    const key = event.name.slice(0,event.name.lastIndexOf(':'));
    if (event.name.endsWith(':start')) startRows.set(key,event.ts);
    else if (startRows.has(key)) regions.push({name:key.split(':')[2], ts:startRows.get(key), dur:event.ts-startRows.get(key)});
  }
  const style = lane.filter(e => ['UpdateLayoutTree','RecalculateStyles'].includes(e.name) && e.ph === 'X');
  const layout = lane.filter(e => e.name === 'Layout' && e.ph === 'X');
  const labels = [...new Set(regions.map(e => e.name))];
  const summary = {};
  const timed = [...style,...layout];
  for (const name of labels) {
    const named = regions.filter(e => e.name === name);
    const nested = named.flatMap(region => timed.map(row => ({
      ts: Math.max(region.ts,row.ts),
      dur: Math.min(region.ts + region.dur,row.ts + row.dur) - Math.max(region.ts,row.ts)
    })));
    const ms = overlap(named,click.ts,motion.ts);
    if (ms > 0) summary[name] = {ms, browserStyleLayoutMs:overlap(nested,click.ts,motion.ts)};
  }
  const counts = Object.fromEntries(Object.entries(probe.counts).map(([name,rows]) =>
    [name,rows.filter(([at]) => at >= input.click && at <= input.motion).reduce((sum,[,value]) => sum+value,0)]));
  const details = Object.fromEntries(Object.entries(probe.details).map(([name,rows]) => {
    const inWindow = rows.filter(([start,end]) => start < input.motion && end >= input.click);
    const ms = inWindow.reduce((total,[start,end]) => total + Math.max(0,Math.min(end,input.motion)-Math.max(start,input.click)),0);
    return [name,{calls:inWindow.length,ms}];
  }));
  const visits = {unique: 0, repeated: 0, repeats: {}};
  const inlineSelections = {};
  for (const [at, nodes, fields] of probe.styleFields) {
    if (at < input.click || at > input.motion) continue;
    const group = inlineSelections[fields] ??= {roots: 0, nodes: 0};
    group.roots++;
    group.nodes += nodes;
  }
  const first = new Map();
  for (const [at,id,origin] of probe.visits) {
    if (at < input.click || at > input.motion) continue;
    if (!first.has(id)) first.set(id,origin);
    else {
      visits.repeated++;
      const path = first.get(id) + '→' + origin;
      visits.repeats[path] = (visits.repeats[path] ?? 0) + 1;
    }
  }
  visits.unique = first.size;
  const relevant = [...regions,...timed].filter(e => e.ts < motion.ts && e.ts + e.dur > click.ts)
    .map(({name,ts,dur}) => [name,ts-click.ts,dur]);
  return {elapsedMs, styleMs:overlap(style,click.ts,motion.ts), layoutMs:overlap(layout,click.ts,motion.ts),
    styleLayoutMs:overlap(timed,click.ts,motion.ts), regions:summary, counts, details, visits, inlineSelections, relevant};
}

const server = live ? null : await startServer();
let browser, page, trace;
async function save() { await writeFile(path.join(directory,'results.json'),JSON.stringify(report,null,2)); }
async function inRenderer(method, policy = 'current') {
  return (await browser.inRendererWorld(page,function (name, policy) { return __ndmClickTrace[name](policy); },[method, policy]))[0].result;
}
async function settle(preset) {
  await until(async () => {
    const state = await inRenderer('busy');
    return state.preset === preset && !state.pending && !state.scanning && !state.viewport && !state.dirty && !state.idle && !state.hover && !state.full;
  },'renderer queues drained',20000);
}
try {
  browser = await launchBrowser(undefined,{extensionDirectory:extension});
  report.browser = browser.version.product;
  page = await browser.open('about:blank');
  await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await page.send('Page.bringToFront');
  const fixture = probeMotion ? 'inline-motion-dependency.html' : 'large-image-label.html';
  const url = live ? 'https://www.amazon.es/?language=es_ES' : server.base + '/fixtures/diagnostics/' + fixture;
  await browser.rule(url,compareSource ? 'source' : 'chromium');
  await page.send('Page.navigate',{url});
  if (live) {
    await until(() => page.evaluate("location.origin==='https://www.amazon.es'&&!!document.querySelector('#nav-belt')&&document.querySelectorAll('*').length>=1000").catch(() => false),'normal anonymous storefront',15000);
  } else {
    await until(() => page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"), 'local source ready');
  }
  const locator = live ? findLiveCarousel : probeMotion ? findLocalMotionCarousel : installLocalCarousel;
  const locate = challengeColor || generatedFrame ?
    '() => (' + locator.toString() + ')(' + challengeColor + ', ' + generatedFrame + ')' : locator.toString();
  report.challengeColor = challengeColor;
  report.generatedFrame = generatedFrame;
  report.measureFrameCheck = measureFrameCheck;
  const install = '(' + installInput.toString() + ')(' + locate + ', ' + (auditPaint ? makeLivePaintAudit.toString() : 'null') + ')';
  report.workload = live ? await until(() => page.evaluate(install), 'supported storefront carousel', 12000) : await page.evaluate(install);
  assert.ok(report.workload?.cards >= 10);
  if (!live) await page.evaluate('Promise.all([...document.images].map(image=>image.decode())).then(()=>true)');
  trace = await connectTrace(browser);
  const blocks = probeMotion ? (deferFirst ? ['defer','current','current','defer'] :
    ['current','defer','defer','current']) : ['current'];
  if (compareSource) blocks.unshift('source');
  for (const [block,policy] of blocks.entries()) {
    const preset = policy === 'source' ? null : 'chromium';
    if (probeMotion && block && preset) {
      await browser.rule(url,'source');
      await settle(null);
    }
    if (preset && (compareSource || probeMotion)) await browser.rule(url,preset,'off');
    await settle(preset);
    const structure = await page.evaluate('ndmClickInput.structure()');
    assert.ok(structure.connected && structure.viewportWidth > 0, 'Original carousel is no longer available.');
    (report.blocks ??= []).push({block,policy,structure});
    const identity = compareRendererIdentity(expected,await browser.rendererIdentity(page));
    assert.equal(identity.status,'match');
    assert.equal(identity.observed.preset,preset);
    report.identity ??= [];
    report.identity.push(identity);
    for (const direction of probeMotion && preset ? [0,1] : [0,1,0,1]) {
      await settle(preset);
      if (live) {
        // Move inside the carousel to reveal its legitimate hover controls.
        await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:730,y:510});
      }
      const point = await until(() => page.evaluate('ndmClickInput.point(' + direction + ')'),'visible hit-tested carousel button',4500);
      await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
      await settle(preset);
      await trace.start();
      await inRenderer('start',policy);
      await page.evaluate('ndmClickInput.arm(' + direction + ',' + JSON.stringify(policy) + ')');
      for (const type of ['mousePressed','mouseReleased']) {
        await page.send('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});
      }
      await until(() => page.evaluate('ndmClickInput.ready()'),'carousel travel',5500);
      const input = await page.evaluate('ndmClickInput.read()');
      const probe = await inRenderer('stop');
      const row = {block,policy,preset,direction,input,...attribute(await trace.stop(),input,probe)};
      report.actions.push(row);
      await save();
      console.log(JSON.stringify({preset,direction,elapsedMs:row.elapsedMs,browserMs:row.styleLayoutMs,regions:row.regions,counts:row.counts}));
      // The same route reverses only after its authored transform has finished.
      if (!live) await until(() => page.evaluate("document.querySelector('.probe-track').getAnimations().length===0"),'motion settled');
      else await new Promise(resolve => setTimeout(resolve,450));
      if (!live && probeMotion) {
        await settle(preset);
        row.settledPaint = await page.evaluate('ndmClickInput.paint()');
      }
      if (auditPaint) {
        await settle(preset);
        await page.evaluate('ndmClickInput.settleAudit()');
      }
    }
  }
  if (!live && probeMotion) {
    const rows = report.actions;
    const byDirection = [0,1].map(direction => rows.find(row => row.policy === 'current' && row.direction === direction).settledPaint);
    assert.notEqual(byDirection[0][0], byDirection[1][0], 'The dependent swatch must respond to track motion.');
    assert.equal(byDirection[0][1], byDirection[1][1], 'The neighboring control must hold its paint.');
    report.preservation = {};
    for (const policy of ['source','current','defer']) {
      const trials = rows.filter(row => row.policy === policy);
      let firstMotionMismatches = 0;
      for (const row of trials) {
        const expected = policy === 'source' ? [row.direction ? 'rgb(238, 238, 238)' : 'rgb(166, 18, 72)', 'rgb(238, 238, 238)'] :
          byDirection[row.direction];
        assert.deepEqual(row.settledPaint, expected, policy + ' settled paint');
        assert.equal(row.input.firstMotionPaint[1], expected[1], policy + ' control at first motion');
        if (row.input.firstMotionPaint[0] !== expected[0]) firstMotionMismatches++;
      }
      report.preservation[policy] = {clicks: trials.length, firstMotionMismatches};
      if (policy !== 'defer') assert.equal(firstMotionMismatches, 0, policy + ' first-motion paint');
    }
  }
  if (auditPaint) report.paintAudit = await page.evaluate('ndmClickInput.summarizeAudit()');
  if (generatedFrame) {
    const forward = report.actions.filter(action => action.preset === 'chromium' && action.direction === 0);
    assert.equal(forward.length, 2);
    for (const {counts} of forward) {
      assert.ok(counts.frameWidthWrong > 0, 'A fixed-width generated border must invalidate the own-style prediction.');
      assert.ok(counts.snapshotWrong > counts.frameWidthWrong, 'The width check must detect some generated changes.');
      assert.equal(counts.frameWrong ?? 0, 0, 'The top-border color check must catch the fixed-width changes.');
      assert.ok(counts.frameCorrect > 0, 'The check must still admit unchanged controls.');
    }
  }
  report.status = 'complete';
} catch (error) {
  report.status = 'incomplete';
  report.error = live ? String(error.message).slice(0,200) : error.stack;
  if (live && page) report.page = await page.evaluate(`({expectedOrigin: location.origin==='https://www.amazon.es',
    ready:document.readyState, nav:Boolean(document.querySelector('#nav-belt')), nodes:document.getElementsByTagName('*').length,
    status:performance.getEntriesByType('navigation')[0]?.responseStatus})`).catch(() => null);
  process.exitCode = 1;
} finally {
  trace?.close();
  try { report.cleanup = await closeBrowser(browser); }
  catch (error) {
    report.status = 'incomplete';
    report.cleanup = error.cleanup ?? {status: 'incomplete'};
    process.exitCode = 1;
  }
  finally {
    await server?.close();
    report.finalSources = await sourceHashes();
    if (report.finalSources.codeHash !== report.sourceSeals.codeHash || report.finalSources.fixtureHash !== report.sourceSeals.fixtureHash ||
        report.probeSha256 !== await probeFingerprint()) {
      report.status = 'incomplete';
      report.error = 'Production, diagnostic or fixture sources changed during measurement.';
      process.exitCode = 1;
    }
    await save();
    console.log('Evidence: ' + directory);
    if (report.error) console.log(report.error);
  }
}
