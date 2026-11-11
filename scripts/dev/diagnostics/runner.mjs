import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { launchBrowser, root, until } from './browser.mjs';
import { collectPaint } from '../../../tools/diagnostics/collect.mjs';
import { analyze, compare } from '../../../tools/diagnostics/analysis.mjs';
import { cases } from '../../../tools/diagnostics/cases.mjs';
import { triage, summaryMarkdown } from '../../../tools/diagnostics/triage.mjs';

async function fixtureDigest() {
  const hash = createHash('sha256');
  async function walk(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : 1)) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (/\.(html|css|mjs|svg|png|gif)$/.test(entry.name)) hash.update(path.relative(path.join(root, 'fixtures'), file).replaceAll('\\', '/')).update(await readFile(file));
    }
  }
  await walk(path.join(root, 'fixtures')); return hash.digest('hex');
}

async function stable(page, options) {
  let previous, since = performance.now(), sample;
  const end = performance.now() + 6000;
  do {
    sample = await page.evaluate(`(${collectPaint})(${JSON.stringify(options)})`);
    const signature = JSON.stringify(sample);
    if (signature !== previous) { since = performance.now(); previous = signature; }
    if (performance.now() - since >= 200) return { ...sample, settled: true };
    await delay(60);
  } while (performance.now() < end);
  return { ...sample, settled: false };
}
export async function captureSuite({ base, browser, url, selector, labels = false, gallery = false, outputDirectory, scales = [1.25], themes = ['chromium', 'soft', 'contrast'], levels = ['off', 'maximum'], full = false, comparison, signal } = {}) {
  if (full) { scales = [1, 1.25, 1.5]; levels = ['off', 'very-low', 'low', 'medium', 'high', 'maximum']; }
  const started = performance.now();
  const name = 'run-' + Date.now() + '-' + randomUUID().slice(0, 8);
  const directory = outputDirectory ? path.resolve(outputDirectory) : path.join(root, 'research-artifacts', 'diagnostics', name);
  await mkdir(directory, { recursive: true });
  const owned = await launchBrowser(browser);
  const abort = () => { void owned.close().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  const report = { format: 'native-dark-diagnostics', version: 1, runId: name, environment: { browser: owned.version.product, platform: process.platform,
    viewport: [1000, 900], deviceScaleFactor: 1, cssZoom: scales }, captures: [], assertions: [] };
  try {
    try { report.environment.commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { report.environment.commit = 'unknown'; }
    const renderer = await Promise.all(['chromium-colors.js', 'image-contrast.js', 'website-theme.js']
      .map(file => readFile(path.join(root, 'extension', file))));
    report.environment.rendererHash = renderer.reduce((hash, bytes) => hash.update(bytes), createHash('sha256')).digest('hex');
    report.environment.fixtureHash = await fixtureDigest();
    let page = await owned.open('about:blank');
    const selected = url ? [{ id: 'live', url }] : cases.filter(c => gallery ? c.extended : !c.extended && ['automated', 'capture-only'].includes(c.status));
    for (const specimen of selected) for (const scale of scales) {
      const address = specimen.url ?? (specimen.file ? `${base}/fixtures/${specimen.file}` : `${base}/fixtures/diagnostics/cases.html?case=${specimen.id}`);
      // Query is intentionally not a rule identity; reset before every canonical document load.
      const sourceId = `${specimen.id}/${scale}/source/off/default`;
      for (const theme of ['source', ...themes]) for (const level of theme === 'source' ? ['off'] : levels) {
        signal?.throwIfAborted();
        await owned.rule(address, 'source');
        // A fresh owned target avoids unload handlers and pending navigation in
        // the previous live page blocking the next authored/theme capture.
        await page.close(); page = await owned.open('about:blank');
        await page.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 900, deviceScaleFactor: 1, mobile: false });
        await page.send('Page.navigate', { url: address }); await page.send('Page.bringToFront');
        await until(() => page.evaluate(`document.readyState==='complete' && !!document.body && ${url ? 'true' : "document.documentElement.dataset.fixtureReady==='yes'"}`), 'specimen load');
        const readiness = await page.evaluate(`(async()=>{
          document.documentElement.style.zoom=${scale};
          const bounded=async work=>{let timer;try{return await Promise.race([work.then(()=>true,()=>false),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),2000)})]);}finally{clearTimeout(timer);}};
          const visible=[...document.images].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;});
          const [fontsReady,visibleImagesReady]=await Promise.all([bounded(document.fonts.ready),bounded(Promise.all(visible.map(e=>e.decode().catch(()=>{}))))]);
          return {fontsReady,visibleImagesReady,visibleImages:visible.length};
        })()`);
        if (theme !== 'source') {
          await owned.rule(address, theme, level);
          await until(() => page.evaluate("!!document.querySelector('[data-native-dark-mode-paint]')"), 'theme paint');
        }
        const sample = await stable(page, { targeted: !url, selector, labels: !url || labels });
        sample.readiness = readiness;
        if (!readiness.fontsReady || !readiness.visibleImagesReady) sample.settled = false;
        const id = `${specimen.id}/${scale}/${theme}/${level}/default`;
        const screenshot = `${String(report.captures.length).padStart(3, '0')}.png`;
        // Screenshots only for public local fixtures. Live capture defaults to computed facts.
        if (!url) {
          const image = await page.send('Page.captureScreenshot', { format: 'png' });
          await writeFile(path.join(directory, screenshot), Buffer.from(image.data, 'base64'));
        }
        const capture = { id, specimen: specimen.id, theme, level, scale, state: 'default', sourceId: theme === 'source' ? null : sourceId,
          screenshot: url ? null : screenshot, ...sample };
        report.captures.push(capture);
        console.log(`${id}: ${sample.rows.length} elements, ${sample.settled ? 'stable' : 'UNSTABLE'}`);
      }
    }
    const analysis = analyze(report);
    if (!url) {
      for (const capture of report.captures.filter(c => c.theme !== 'source' && cases.find(s => s.id === c.specimen)?.status === 'automated')) {
        const checks = analysis.checks.filter(c => c.capture === capture.id);
        const failures = checks.filter(c => ['geometry', 'border', 'svg'].includes(c.kind) && c.status === 'review');
        const required = capture.specimen === 'svg-glyph' ? checks.some(c => c.element === 'fixture:glyph' && c.kind === 'svg' && c.status === 'pass') :
          checks.some(c => c.kind === 'border' && c.status === 'pass');
        const original = report.captures.find(c => c.id === capture.sourceId);
        const drawingPreserved = capture.rows.every(row => !row.svg || JSON.stringify(row.svg.geometry) === JSON.stringify(original.rows.find(r => r.key === row.key)?.svg?.geometry));
        const multicolor = capture.rows.find(r => r.key === 'fixture:multicolor'), originalMulticolor = original.rows.find(r => r.key === 'fixture:multicolor');
        const negativePreserved = !multicolor || JSON.stringify(multicolor.svg.paints) === JSON.stringify(originalMulticolor.svg.paints) && multicolor.layers[0].filter === originalMulticolor.layers[0].filter;
        report.assertions.push({ id: capture.id, passed: capture.settled && required && drawingPreserved && negativePreserved && failures.length === 0,
          failures: failures.map(c => c.id), requiredMeasured: required, drawingPreserved, negativePreserved });
      }
      // Prove detection using a real DOM corruption, without editing the renderer.
      const testUrl = `${base}/fixtures/diagnostics/cases.html?case=subtle-frame`;
      await owned.rule(testUrl, 'source'); await page.send('Page.navigate', { url: testUrl });
      await until(() => page.evaluate("!!document.querySelector('[data-audit-id=frame]')"), 'fault specimen');
      const original = await stable(page, { targeted: true });
      await page.evaluate("document.querySelector('[data-audit-id=frame]').style.border='4px solid black'");
      const broken = await stable(page, { targeted: true });
      const faultReport = { ...report, captures: [{ id: 'fault-source', theme: 'source', level: 'off', scale: 1, state: 'default', ...original },
        { id: 'fault-after', sourceId: 'fault-source', theme: 'chromium', level: 'off', scale: 1, state: 'default', ...broken }] };
      const detected = analyze(faultReport).checks.some(c => c.kind === 'border' && c.evidence?.widthChanged);
      await page.evaluate("document.querySelector('[data-audit-id=frame]').style.removeProperty('border')");
      const repaired = await stable(page, { targeted: true });
      const repairedReport = { ...faultReport, captures: [faultReport.captures[0], { ...faultReport.captures[1], ...repaired }] };
      const resolved = compare(faultReport, repairedReport).changes.some(c => c.status === 'resolved' && c.current.kind === 'border');
      report.selfTest = { introducedBorderDetected: detected, repairedBorderResolved: resolved };
      report.assertions.push({ id: 'deliberate-dom-border-corruption-detected-and-repaired', passed: detected && resolved });
    }
    report.timings = { captureAndAnalysisMs: Math.round(performance.now() - started) };
    await writeFile(path.join(directory, 'capture.json'), JSON.stringify(report, null, 2));
    await writeFile(path.join(directory, 'analysis.json'), JSON.stringify(analysis, null, 2));
    const queue = triage(report, analysis);
    await writeFile(path.join(directory, 'triage.json'), JSON.stringify(queue, null, 2));
    await writeFile(path.join(directory, 'summary.md'), summaryMarkdown(queue));
    if (comparison) await writeFile(path.join(directory, 'comparison.json'), JSON.stringify(compare(JSON.parse(await readFile(comparison, 'utf8')), report), null, 2));
    const failed = report.assertions.filter(a => !a.passed);
    console.log(`Report: ${directory}\n${url ? 'Capture only: no fixture assertions. Review measurement and coverage results.' : `Assertions: ${report.assertions.length - failed.length}/${report.assertions.length}`}`);
    return { name, directory, assertions: report.assertions, passed: failed.length === 0 };
  } finally { signal?.removeEventListener('abort', abort); await owned.close(); }
}
