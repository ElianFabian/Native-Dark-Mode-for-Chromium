import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { collectPaint } from '../../../tools/diagnostics/collect.mjs';

// Exact errors can be grouped without exporting their messages into repetition summaries.
// A shared signature is evidence of the same error text, not proof of a common root cause.
export function failureSignature(error, caseId) {
  if (!error) return null;
  const token = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value) ? value : null;
  const name = token(error.name), assertionId = token(error.diagnostic?.id), scope = token(caseId);
  return { kind: 'exact-error-sha256-v1', name, caseId: scope, assertionId,
    sha256: createHash('sha256').update(JSON.stringify([name,scope,assertionId,String(error.message ?? '')])).digest('hex') };
}

// Assertion-time facts are kept separately from the later browser observation.
export function assertEvidence(condition, id, expected, actual, context = {}) {
  if (condition) return;
  const error = new Error(`Diagnostic assertion failed: ${id}`);
  error.diagnostic = boundedFacts({ id, expected, actual, context, observedAt: new Date().toISOString() });
  throw error;
}

export function boundedFacts(value, depth = 0) {
  if (depth > 10) return '[depth limit]';
  if (value == null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : '[non-finite]';
  if (typeof value === 'string') {
    const redacted = value.replace(/url\([\s\S]*?\)/gi, '[resource]').replace(/(?:https?:\/\/|data:)[^\s"'<>]+/gi, '[resource]');
    return redacted.length > 512 ? redacted.slice(0, 512) + '[truncated]' : redacted;
  }
  if (Array.isArray(value)) return [...value.slice(0, 100).map(item => boundedFacts(item, depth + 1)),
    ...(value.length > 100 ? [{ omittedItems: value.length - 100 }] : [])];
  if (typeof value === 'object') {
    const entries = Object.entries(value), facts = Object.fromEntries(entries.slice(0, 100)
      .filter(([key]) => !['text', 'label', 'value', 'innerHTML', 'outerHTML', 'url', 'selector', 'stack'].includes(key))
      .map(([key, item]) => [key.slice(0, 100), boundedFacts(item, depth + 1)]));
    if (entries.length > 100) facts.omittedKeys = entries.length - 100;
    return facts;
  }
  return '[unsupported]';
}

export function isLocalFixture(address, base) {
  try {
    const url = new URL(address), allowed = new URL(base);
    return allowed.protocol === 'http:' && allowed.hostname === '127.0.0.1' && url.origin === allowed.origin &&
      !url.username && !url.password && url.pathname.startsWith('/fixtures/');
  } catch { return false; }
}

export async function writeFailureEvidence({ directory, page, base, error, context = {}, results = [], environment = {} }) {
  await mkdir(directory, { recursive: true });
  const report = {
    format: 'native-dark-local-failure', version: 1, failed: true,
    createdAt: new Date().toISOString(), environment: boundedFacts(environment),
    context: boundedFacts(error.diagnostic?.context ?? context),
    assertion: error.diagnostic ? boundedFacts(error.diagnostic) : null,
    error: { name: boundedFacts(error.name), message: boundedFacts(error.message) },
    completedResults: results.length, artifacts: {}, gaps: [],
    limitation: 'Assertion facts describe the failure instant. Browser observations and screenshots are collected afterwards; they do not prove intermediate-frame behavior.',
  };
  // Preserve the primary facts even if the page/browser is already unavailable.
  await writeFile(path.join(directory, 'partial-results.json'), JSON.stringify(results.map(row => boundedFacts(row)), null, 2));
  await writeFile(path.join(directory, 'failure.json'), JSON.stringify(report, null, 2));
  let address;
  try { address = page && await page.evaluate('location.href'); }
  catch { report.gaps.push('Page location unavailable.'); }
  if (!isLocalFixture(address, base)) {
    report.gaps.push('Browser evidence omitted: current document is not an owned local fixture.');
  } else {
    const url = new URL(address);
    report.fixture = { path: url.pathname, group: url.searchParams.get('group'), case: url.searchParams.get('case') };
    const element = report.context?.element;
    const selector = typeof element === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(element) ? `[data-audit-id="${element}"]` : undefined;
    let bounds;
    try {
      const facts = await page.evaluate(`(${collectPaint})(${JSON.stringify({ targeted: true, context: true, selector, limit: 50, labels: false })})`);
      if (selector) {
        bounds = facts.rows?.find(row => row.key === `fixture:${element}`)?.bounds;
        if (!bounds) report.gaps.push('Identified element has no visible measured row; it may be missing, hidden, outside the viewport or beyond collection limits.');
      } else if (!facts.rows?.length) report.gaps.push('No visible audit rows in the post-failure observation.');
      await writeFile(path.join(directory, 'observed-paint.json'), JSON.stringify(boundedFacts(facts), null, 2));
      report.artifacts.paint = 'observed-paint.json';
    } catch { report.gaps.push('Post-failure computed paint unavailable.'); }
    try {
      const state = await page.evaluate(`(()=>({viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,zoom:getComputedStyle(document.documentElement).zoom,bodyZoom:document.body&&getComputedStyle(document.body).zoom,scroll:[scrollX,scrollY],fonts:document.fonts.status,observedAt:new Date().toISOString()}))()`);
      report.observation = boundedFacts(state);
      const image = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(path.join(directory, 'viewport.png'), Buffer.from(image.data, 'base64'));
      report.artifacts.screenshot = 'viewport.png';
      if (bounds?.length === 4 && bounds.every(Number.isFinite)) {
        const [x, y, width, height] = bounds, left = Math.max(0, x - 12), top = Math.max(0, y - 12);
        const clip = { x: left, y: top, width: Math.min(state.viewport[0], x + width + 12) - left,
          height: Math.min(state.viewport[1], y + height + 12) - top, scale: 1 };
        if (clip.width > 0 && clip.height > 0) {
          try {
            const crop = await page.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: false });
            await writeFile(path.join(directory, 'element.png'), Buffer.from(crop.data, 'base64'));
            report.artifacts.element = 'element.png'; report.crop = clip;
          } catch { report.gaps.push('Post-failure element crop unavailable; viewport evidence is retained.'); }
        }
      }
    } catch { report.gaps.push('Post-failure viewport screenshot unavailable.'); }
  }
  await writeFile(path.join(directory, 'failure.json'), JSON.stringify(report, null, 2));
  return report;
}
