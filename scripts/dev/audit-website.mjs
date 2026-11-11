import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

// This developer tool always owns its browser/profile. It never attaches to a personal session.
const root = fileURLToPath(new URL('../../', import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, all) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1] ?? true]);
  return pairs;
}, []));
if (args.help || !args.url) {
  console.log('Usage: node --experimental-websocket scripts/dev/audit-website.mjs --url HTTPS_URL [--browser PATH] [--output-directory PATH] [--scales 1,1.25,1.5] [--themes chromium,soft,contrast] [--levels off,low,maximum]');
  process.exit(args.help ? 0 : 1);
}
const address = new URL(args.url);
if (!['http:', 'https:'].includes(address.protocol) || address.username || address.password) throw Error('Use an HTTP(S) URL without embedded credentials.');
const scales = String(args.scales || '1,1.25,1.5').split(',').map(Number);
const themes = String(args.themes || 'chromium,soft,contrast').split(',');
const levels = String(args.levels || 'off,low,maximum').split(',');
if (scales.some(x => !Number.isFinite(x) || x < .5 || x > 3) || themes.some(x => !['chromium', 'soft', 'contrast'].includes(x)) || levels.some(x => !['off', 'very-low', 'low', 'medium', 'high', 'maximum'].includes(x))) throw Error('Invalid scale, theme, or level.');
if (typeof WebSocket === 'undefined') throw Error('This Node version needs --experimental-websocket.');
const candidates = [args.browser, process.env.CHROMIUM_PATH,
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
let executable;
for (const candidate of candidates) { try { await access(candidate); executable = candidate; break; } catch {} }
if (!executable) throw Error('Specify an installed Brave/Chromium executable with --browser.');
const directory = path.resolve(args['output-directory'] || 'research-artifacts/website-audit');
await mkdir(directory, { recursive: true });
const profile = await mkdtemp(path.join(tmpdir(), 'native-dark-audit-'));
const connections = [];
let child;
async function until(fn, label, attempts = 100) {
  for (let i = 0; i < attempts; i++) { const result = await fn(); if (result) return result; await delay(100); }
  throw Error(`Timed out: ${label}`);
}
async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  socket.addEventListener('message', event => {
    const value = JSON.parse(event.data); const request = pending.get(value.id);
    if (!request) return;
    pending.delete(value.id); clearTimeout(request.timer);
    if (value.error) request.reject(Error(JSON.stringify(value.error))); else request.resolve(value.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); reject(Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(key, { resolve, reject, timer }); socket.send(JSON.stringify({ id: key, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  connections.push(socket); return { send, evaluate };
}

// Runs in the page. Do not include page text, form values, or image pixels in reports.
function collectPaint() {
  const rgb = value => {
    const m = /^rgba?\(([^)]+)\)$/.exec(value);
    if (!m) return null;
    const c = m[1].split(',').map(Number); if (c.length === 3) c.push(1); return c;
  };
  const lum = c => c.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
  const blend = (a, b) => [...a.slice(0, 3).map((v, i) => v * a[3] + b[i] * (1 - a[3])), 1];
  const ratio = (a, b) => { a = blend(a, b); return (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05); };
  const selector = e => {
    const parts = [];
    for (let node = e; node && node !== document.documentElement; node = node.parentElement) parts.unshift(`${node.localName}:nth-child(${[...node.parentElement.children].indexOf(node) + 1})`);
    return 'html > ' + parts.join(' > ');
  };
  const background = e => {
    if (!e) return null;
    const s = getComputedStyle(e);
    if (s.backgroundImage !== 'none' || s.filter !== 'none' || s.mixBlendMode !== 'normal' || Number(s.opacity) !== 1) return null;
    // Generated backings can obscure the element's CSS background.
    for (const pseudo of ['::before', '::after']) {
      const p = getComputedStyle(e, pseudo), c = rgb(p.backgroundColor);
      if (!['none', 'normal'].includes(p.content) && (c?.[3] || p.backgroundImage !== 'none')) return null;
    }
    const c = rgb(s.backgroundColor); if (!c) return null;
    if (c[3] === 1) return c;
    const below = background(e.parentElement); return below && blend(c, below);
  };
  const rows = []; let skipped = 0;
  for (const e of document.querySelectorAll('body *')) {
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    const s = getComputedStyle(e); if (s.visibility !== 'visible' || Number(s.opacity) === 0) continue;
    if (rows.length >= 1500) { skipped++; continue; }
    const bg = background(e);
    const text = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    const ink = rgb(s.webkitTextFillColor);
    const large = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.666 && Number(s.fontWeight) >= 700);
    const row = { selector: selector(e), tag: e.localName, width: r.width, height: r.height,
      background: s.backgroundColor, border: ['Top', 'Right', 'Bottom', 'Left'].map(side => ({ width: parseFloat(s[`border${side}Width`]), style: s[`border${side}Style`], color: s[`border${side}Color`], contrast: bg && rgb(s[`border${side}Color`]) ? ratio(rgb(s[`border${side}Color`]), bg) : null })),
      outline: s.outline, shadow: s.boxShadow, textContrast: text && ink && bg ? ratio(ink, bg) : null, textTarget: large ? 3 : 4.5,
      layers: ['::before', '::after'].map(p => { const v = getComputedStyle(e, p); return { pseudo: p, content: ['none', 'normal', '""'].includes(v.content) ? v.content : '[glyph]', borderWidth: v.borderTopWidth, borderColor: v.borderTopColor, background: v.backgroundColor, shadow: v.boxShadow }; }) };
    if (e instanceof SVGSVGElement && r.width <= 48 && r.height <= 48 && bg &&
        !e.querySelector('svg,use,image,foreignObject') && e.closest('a,button,[role="button"],[aria-hidden="true"]')) {
      const paints = [];
      for (const shape of e.querySelectorAll('path,circle,ellipse,line,rect,polygon,polyline')) {
        if (shape.closest('defs,clipPath,mask')) continue;
        const paint = getComputedStyle(shape);
        if (Number(paint.opacity) !== 1 || paint.filter !== 'none') continue;
        for (const property of ['fill', 'stroke']) {
          const c = rgb(paint[property]);
          if (c?.[3]) paints.push([...c.slice(0, 3), c[3] * Number(paint[property + 'Opacity'])]);
        }
      }
      if (paints.length && paints.every(c => c.every((v, i) => v === paints[0][i]))) row.iconContrast = ratio(paints[0], bg);
    }
    if (e.matches('input[placeholder],textarea[placeholder]') && !e.matches(':disabled') && !e.value && bg) {
      const hint = getComputedStyle(e, '::placeholder'), c = rgb(hint.webkitTextFillColor);
      if (c) row.placeholderContrast = ratio([...c.slice(0, 3), c[3] * Number(hint.opacity)], bg);
    }
    if (e instanceof HTMLImageElement && e.complete && e.naturalWidth && r.width <= 400 && r.height <= 200) {
      try {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
        const context = canvas.getContext('2d'); context.drawImage(e, 0, 0, 64, 64);
        const pixels = context.getImageData(0, 0, 64, 64).data;
        const colors = []; let transparent = 0;
        for (let i = 0; i < pixels.length; i += 4) { if (pixels[i + 3] < 32) transparent++; if (pixels[i + 3] >= 240) colors.push([pixels[i], pixels[i + 1], pixels[i + 2]]); }
        const first = colors[0];
        if (first && transparent > 200 && colors.every(c => c.every((v, i) => Math.abs(v - first[i]) <= 8))) row.artworkCandidate = { solidColor: first, contrast: bg ? ratio([...first, 1], bg) : null, staticEligibility: 'not verified; do not automatically tint' };
      } catch { row.imageAnalysis = 'unreadable pixels'; }
    }
    rows.push(row);
  }
  return { rows, skipped, documentOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth), devicePixelRatio, viewport: [innerWidth, innerHeight] };
}

try {
  child = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--load-extension=${path.join(root, 'extension')}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let launchError; child.on('error', error => { launchError = error; });
  const port = await until(async () => { if (launchError) throw launchError; try { return (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n'); } catch { return null; } }, 'browser startup');
  const endpoint = `http://127.0.0.1:${port[0]}`;
  const browser = await connect(`ws://127.0.0.1:${port[0]}${port[1]}`);
  const targets = async () => (await fetch(endpoint + '/json/list')).json();
  const open = async url => { const { targetId } = await browser.send('Target.createTarget', { url }); const target = await until(async () => (await targets()).find(t => t.id === targetId), 'tab'); return connect(target.webSocketDebuggerUrl); };
  const page = await open(address.href);
  const worker = await until(async () => (await targets()).find(t => t.type === 'service_worker' && t.url.endsWith('/background.js')), 'extension worker (use a browser supporting --load-extension)');
  const manager = await open(worker.url.replace('/background.js', '/options.html'));
  const rule = async (enabled, preset, level) => {
    const result = await manager.evaluate(`chrome.runtime.sendMessage(${JSON.stringify({ type: 'save', rule: { url: address.href, scope: 'website', enabled, preset, emphasizeSeparators: level === 'off' ? false : level === 'medium' ? true : level } })})`);
    if (result.error) throw Error(result.error);
  };
  const report = { format: 'native-dark-mode-audit', version: 1, date: new Date().toISOString(), url: address.origin + address.pathname, browser: (await browser.send('Browser.getVersion')).product,
    limitations: ['Viewport-only main-document scan; no certification.', 'Unknown backings, images, shadows, clipping and animation require manual review.', 'Selectors may drift when live content changes. No personal browser profile is used.'], cases: [] };
  for (const scale of scales) {
    await rule(false, 'chromium', 'off');
    await page.send('Page.navigate', { url: 'about:blank' });
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: scale, mobile: false });
    await page.send('Page.navigate', { url: address.href });
    await page.send('Page.bringToFront');
    await until(() => page.evaluate(`document.readyState==='complete' && !!document.body && location.origin===${JSON.stringify(address.origin)}`), 'page load'); await delay(600);
    // CSS zoom also exercises fractional computed border widths, not just screenshot resolution.
    await page.evaluate(`document.documentElement.style.zoom=${scale}`);
    const original = await page.evaluate(`(${collectPaint})()`);
    for (const theme of themes) for (const level of levels) {
      await rule(true, theme, level);
      await page.send('Page.bringToFront');
      await until(() => page.evaluate(theme === 'chromium' ?
        "getComputedStyle(document.documentElement).getPropertyValue('--native-dark-mode-chromium-active').trim()==='yes'" :
        `getComputedStyle(document.documentElement).backgroundColor===${JSON.stringify(theme === 'soft' ? 'rgb(37, 42, 52)' : 'rgb(8, 10, 14)')}`), 'active theme paint');
      await delay(700);
      const sample = await page.evaluate(`(${collectPaint})()`), before = new Map(original.rows.map(r => [r.selector, r]));
      const findings = [];
      if (sample.documentOverflow > 1) findings.push({ kind: 'document-horizontal-overflow', pixels: sample.documentOverflow });
      for (const row of sample.rows) {
        if (row.textContrast !== null && row.textContrast < row.textTarget) findings.push({ kind: 'text-contrast', selector: row.selector, measured: row.textContrast, target: row.textTarget });
        if (row.artworkCandidate?.contrast !== null && row.artworkCandidate?.contrast < 3) findings.push({ kind: 'transparent-monochrome-artwork', selector: row.selector, evidence: row.artworkCandidate });
        if (row.iconContrast !== undefined && row.iconContrast < 3) findings.push({ kind: 'icon-contrast', selector: row.selector, measured: row.iconContrast, target: 3 });
        if (row.placeholderContrast !== undefined && row.placeholderContrast < 4.5) findings.push({ kind: 'placeholder-contrast', selector: row.selector, measured: row.placeholderContrast, target: 4.5 });
        const source = before.get(row.selector); if (!source) continue;
        row.border.forEach((edge, i) => {
          const previous = source.border[i];
          if (Math.abs(edge.width - previous.width) > .01) findings.push({ kind: 'border-width-change', selector: row.selector, side: i, before: previous.width, after: edge.width });
          if (level === 'off' && previous.width > 0 && previous.contrast !== null && previous.contrast <= 1.8 && edge.contrast > 2) findings.push({ kind: 'subtle-border-amplified', selector: row.selector, side: i, before: previous.contrast, after: edge.contrast });
        });
      }
      report.cases.push({ theme, level, scale, source: original, sample, findings });
      console.log(`${theme} / ${level} / ${scale}: ${findings.length} review candidates`);
    }
  }
  await writeFile(path.join(directory, 'audit.json'), JSON.stringify(report, null, 2));
  await writeFile(path.join(directory, 'audit.md'), '# Website rendering audit\n\nThese are heuristic review candidates, not confirmed bugs.\n\n' + report.cases.map(c => `- ${c.theme}, ${c.level}, scale ${c.scale}: ${c.findings.length} candidates; ${c.sample.rows.length} sampled elements; overflow ${c.sample.documentOverflow}px.`).join('\n') + '\n\nSee audit.json for selectors, original/themed paint, layers and measurements.\n');
  console.log(`Reports: ${directory}`);
} finally {
  for (const socket of connections) socket.close();
  if (child && child.exitCode === null) { child.kill(); await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(3000)]); }
  // This exact temporary path was created by mkdtemp above; never delete the output directory.
  if (path.dirname(path.resolve(profile)) !== path.resolve(tmpdir()) || !path.basename(profile).startsWith('native-dark-audit-')) throw Error('Unexpected temporary profile path; cleanup refused.');
  await rm(profile, { recursive: true, force: true, maxRetries: 6, retryDelay: 300 }).catch(() => console.warn(`Temporary profile could not be removed: ${profile}`));
}
