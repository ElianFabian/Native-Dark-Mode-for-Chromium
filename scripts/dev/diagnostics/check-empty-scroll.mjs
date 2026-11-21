// Synthetic preservation check for scroll collection after the page settles.
import assert from 'node:assert/strict';
import {cp, mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {closeBrowser, launchBrowser, root, until} from './browser.mjs';
import {compareRendererIdentity, expectedRendererIdentity, initializerFingerprint} from './identity.mjs';
import {sourceHashes} from './metrics.mjs';
import {startServer} from './server.mjs';

const directory = path.join(root, 'research-artifacts/diagnostics/empty-scroll-' + Date.now());
const extension = path.join(directory, 'extension');
await mkdir(directory, {recursive: true});
await cp(path.join(root, 'extension'), extension, {recursive: true});
const renderer = path.join(extension, 'website-theme.js');
const source = await readFile(process.env.NDM_SCROLL_RENDERER ?? renderer, 'utf8');
const anchor = '  requestPreset();';
assert.equal(source.split(anchor).length, 2);
const instrumented = source.replace(anchor, `  globalThis.__ndmScrollState = () => ({
    preset: preset ?? null, empty: scrollCollectionEmpty,
    retained: Boolean(scrollCandidates),
    unsampled: [document, ...shadowRoots].flatMap(root => [...root.querySelectorAll('*')].filter(element =>
      (element instanceof HTMLElement || element instanceof SVGSVGElement) && !element.matches(excluded) &&
      !sampledElements.has(element)).map(element => element.nodeName)),
    busy: Boolean(elements || pending.size || dirtySurfaces.size ||
      idleBatch !== undefined || viewportFrame !== undefined || chromiumRefreshTimer !== undefined ||
      deferredRefreshTimer !== undefined || horizontalScrollTimer !== undefined)
  });
  globalThis.__ndmRetainFarCard = () => {
    const far = document.getElementById('scroll-far-card');
    if (!far || !forgetSample(far)) throw Error('Expected a previously sampled far card');
    // Establish the nonempty cache before scrolling, in the same task as
    // forgetting the sample so idle collection cannot race the control.
    const visible = collectVisibleSurfaces(true, true, undefined, new Set(), true);
    return {retained: scrollCandidates?.get(document)?.has(far), collected: visible.has(far)};
  };
${anchor}`);
await writeFile(renderer, instrumented);
const expected = await expectedRendererIdentity();
expected.initialized.renderer = initializerFingerprint(instrumented, 'nativeDarkModeWebsiteTheme');
const report = {status: 'running', source: await sourceHashes(), states: {}};
const server = await startServer();
let browser, page;

function createScenario() {
  const style = document.createElement('style');
  style.textContent = '.scroll-card{background:#fff;color:#161616;display:block;width:120px;height:40px;margin:0}';
  document.head.append(style);
  const card = () => {
    const element = document.createElement('div');
    element.className = 'scroll-card';
    element.textContent = 'Card text';
    return element;
  };
  const mount = document.createElement('section');
  const shadowHost = document.createElement('div');
  const shadow = shadowHost.attachShadow({mode: 'closed'});
  shadow.append(style.cloneNode(true));
  const control = card();
  const shadowControl = card();
  const tail = document.createElement('section');
  tail.style.marginTop = '4400px';
  const pane = document.createElement('section');
  pane.style.cssText = 'width:160px;height:55px;overflow:auto';
  const paneSpacer = document.createElement('div');
  paneSpacer.style.height = '120px';
  pane.append(card(), paneSpacer);
  shadow.append(shadowControl);
  document.body.append(control, mount, shadowHost, pane, tail);
  function sample(element) {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return {background: style.backgroundColor, ink: style.webkitTextFillColor, size: [box.width, box.height]};
  }
  // The fixture queues its sample after the renderer's scroll callback. Any
  // mutations made by the action are delivered at the same task's checkpoint.
  function frame(action, scroller = document) {
    scroller.dispatchEvent(new Event('scroll'));
    const read = action();
    return new Promise(resolve => requestAnimationFrame(() => resolve(read())));
  }
  let far;
  window.scrollScenario = {
    controls: () => ({light: sample(control), shadow: sample(shadowControl)}),
    scan: () => frame(() => () => sample(control)),
    addVisible(location) {
      const parent = location === 'shadow' ? shadow : location === 'pane' ? pane : mount;
      return frame(() => {
        const next = card();
        if (location === 'pane') paneSpacer.after(next);
        else parent.append(next);
        if (location === 'pane') pane.scrollTop = pane.scrollHeight - pane.clientHeight;
        return () => sample(next);
      }, location === 'pane' ? pane : document);
    },
    addFar() {
      return frame(() => {
        far = card();
        far.id = 'scroll-far-card';
        tail.append(far);
        return () => ({paint: sample(far), y: far.getBoundingClientRect().top});
      });
    },
    revealFar() {
      return frame(() => {
        far.scrollIntoView({block: 'center'});
        return () => ({paint: sample(far), y: far.getBoundingClientRect().top});
      });
    },
    removeFar() {
      far.remove();
      far = undefined;
    },
    restore() {
      return frame(() => {
        window.scrollTo(0, 0);
        return () => sample(control);
      });
    },
    removeShadow() {
      return frame(() => {
        shadowHost.remove();
        return () => sample(control);
      });
    }
  };
}

const state = async () => (await browser.inRendererWorld(page, function () { return __ndmScrollState(); }))[0].result;
async function settle(preset) {
  await until(async () => {
    const current = await state();
    return current.preset === preset && !current.busy;
  }, 'renderer queues drained', 15000);
}
const action = (code) => page.evaluate('scrollScenario.' + code);
async function proveEmpty() {
  await action('scan()');
  const current = await state();
  assert.equal(current.empty, true, 'Expected verified empty collection after the page settled ' + JSON.stringify(current));
}

try {
  browser = await launchBrowser(undefined, {extensionDirectory: extension});
  report.browser = browser.version.product;
  page = await browser.open('about:blank');
  await page.send('Emulation.setDeviceMetricsOverride', {width: 1000, height: 800, deviceScaleFactor: 1, mobile: false});
  const url = server.base + '/fixtures/diagnostics/signature-invalidation.html';
  await browser.rule(url, 'source');
  await page.send('Page.navigate', {url});
  await until(() => page.evaluate("typeof changeFrame === 'function'"), 'fixture loaded');
  await page.evaluate('(' + createScenario.toString() + ')()');
  const authored = report.states.authored = await action('controls()');
  await browser.rule(url, 'chromium', 'off');
  await settle('chromium');
  report.identity = compareRendererIdentity(expected, await browser.rendererIdentity(page));
  assert.equal(report.identity.status, 'match');
  const themed = report.states.themed = await action('controls()');
  for (const key of ['light', 'shadow']) {
    assert.notEqual(themed[key].background, authored[key].background);
    assert.deepEqual(themed[key].size, authored[key].size);
  }
  for (const [location, reference] of [['light','light'], ['shadow','shadow'], ['pane','light']]) {
    await proveEmpty();
    const firstFrame = report.states[location + 'Insertion'] = await action('addVisible(' + JSON.stringify(location) + ')');
    assert.deepEqual(firstFrame, themed[reference], location + ' insertion must match themed control in its first sampled frame');
    await settle('chromium');
  }
  await proveEmpty();
  const below = report.states.offscreenInsertion = await action('addFar()');
  assert.ok(below.y > 3000);
  assert.equal((await state()).empty, false, 'Offscreen insertion must invalidate the collection proof');
  const reveal = report.states.offscreenReveal = await action('revealFar()');
  assert.ok(reveal.y >= 0 && reveal.y < 760);
  assert.deepEqual(reveal.paint, themed.light);
  assert.deepEqual(await action('restore()'), themed.light);
  await settle('chromium');
  const seedRetainedFar = async () => (await browser.inRendererWorld(page,
    function () { return __ndmRetainFarCard(); }))[0].result;
  const retained = report.states.retainedOffscreen = await seedRetainedFar();
  assert.deepEqual(retained, {retained:true, collected:false}, 'An unsampled far card must be retained without altering visible paint');
  const retainedReveal = report.states.retainedReveal = await action('revealFar()');
  assert.deepEqual(retainedReveal.paint, themed.light);
  assert.equal((await state()).unsampled.length, 0, 'The retained card must become sampled when scrolling into view');
  assert.deepEqual(await action('restore()'), themed.light);
  await settle('chromium');
  assert.deepEqual(await seedRetainedFar(), {retained:true, collected:false});
  assert.equal((await state()).retained, true);
  await action('removeFar()');
  assert.equal((await state()).retained, false, 'Removing the retained card must release its cached membership');
  await settle('chromium');
  await proveEmpty();
  assert.deepEqual(await action('removeShadow()'), themed.light);
  await settle('chromium');
  await proveEmpty();
  await browser.rule(url, 'source');
  await settle(null);
  assert.equal((await state()).empty, false);
  assert.deepEqual((await action('controls()')).light, authored.light);
  await browser.rule(url, 'chromium', 'maximum');
  await settle('chromium');
  await proveEmpty();
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  try {
    report.cleanup = await closeBrowser(browser);
    assert.equal(report.cleanup.status, 'complete');
  } finally {
    await server.close();
    report.finalSources = await sourceHashes();
    await writeFile(path.join(directory, 'results.json'), JSON.stringify(report, null, 2));
    assert.deepEqual(report.finalSources, report.source);
    console.log('Evidence: ' + directory);
  }
}
