import { cases } from './cases.mjs';
import { analyze, compare, validateReport } from './analysis.mjs';
import { triage } from './triage.mjs';
const $ = selector => document.querySelector(selector);
const node = (tag, text, parent) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; parent?.append(e); return e; };
function tab(id) {
  for (const e of document.querySelectorAll('[data-tab]')) { const selected = e.dataset.tab === id; e.setAttribute('aria-pressed', selected); $('#' + e.dataset.tab).hidden = !selected; }
}
for (const e of document.querySelectorAll('[data-tab]')) e.onclick = () => tab(e.dataset.tab);
for (const entry of cases) {
  const card = node('article', undefined, $('#cases')); card.className = 'card';
  card.dataset.search = `${entry.title} ${entry.category} ${entry.expected} ${entry.evidence}`.toLowerCase();
  const badge = node('span', entry.automatedChecks ? 'Partially checked' : entry.status === 'capture-only' ? 'Measured · review required' : entry.status, card); badge.className = 'badge';
  badge.title = entry.automatedChecks ?? (entry.status === 'capture-only' ? 'Computed measurements are analyzed automatically. This specimen has no fixture-specific pass/fail assertions yet; unsupported artwork needs visual or pixel analysis.' : entry.status);
  node('h3', entry.title, card); node('p', entry.expected, card);
  if (entry.observed) { const notice = node('p', entry.observed, card); notice.className = 'case-warning'; }
  const url = entry.file ? '/fixtures/' + entry.file : '/fixtures/diagnostics/cases.html?case=' + entry.id;
  const frame = node('iframe', undefined, card); frame.title = entry.title + ' original preview'; frame.loading = 'lazy'; frame.src = entry.file ? url : url + '&preview=1';
  const link = node('a', 'Open original specimen', card); link.href = url; link.target = '_blank'; link.rel = 'noopener'; node('p', entry.evidence, card);
}
$('#case-search').oninput = () => { for (const card of $('#cases').children) card.hidden = !card.dataset.search.includes($('#case-search').value.toLowerCase()); };
fetch('/tools/diagnostics/coverage.json').then(r => r.json()).then(entries => {
  $('#coverage-count').textContent = `Known-case inventory · ${entries.length} mechanisms`;
  for (const entry of entries) node('li', `${entry.status}: ${entry.symptom}${entry.cases.length ? ' — ' + entry.cases.join(', ') : ''}`, $('#coverage'));
}).catch(error => { $('#coverage-count').textContent = error.message; });
let report, analysis, reportBase, queue, recordIndex;
let reviews;
try { reviews = JSON.parse(localStorage.getItem('diagnostic-reviews-v1') ?? '[]'); if (!Array.isArray(reviews)) reviews = []; } catch { reviews = []; }
function showQueue() {
  if (!report) return;
  queue = triage(report, analysis, reviews); $('#queue').replaceChildren();
  const open = queue.findings.filter(f => f.disposition === 'open');
  const important = open.filter(f => f.priority !== 'advisory');
  const selected = queue.findings.filter(f => $('#queue-filter').value === 'accepted' ? f.disposition === 'accepted' : f.disposition === 'open' && ($('#queue-filter').value === 'open' || f.priority !== 'advisory'));
  $('#queue-count').textContent = `${important.length} priority candidates · ${open.length - important.length} advisories · ${queue.findings.length - open.length} accepted · ${queue.counts.unsupported} unsupported raw measurements. ${queue.failedAssertions.length} failed fixture assertions. Showing ${Math.min(selected.length, 100)} of ${selected.length} groups.`;
  for (const finding of selected.slice(0, 100)) {
    const card = node('article', undefined, $('#queue')); node('span', finding.disposition === 'accepted' ? 'accepted appearance' : finding.priority, card).className = 'badge';
    node('h4', `${finding.kind} · ${finding.location}`, card); node('p', finding.reason, card);
    node('p', `${finding.themes.join(', ')} · ${finding.levels.join(', ')} · ${finding.checks.length} grouped measurements${finding.range ? ' · range ' + finding.range.map(v => v.toFixed(3)).join('–') : ''}`, card);
    const actions = node('div', undefined, card); actions.className = 'toolbar';
    node('button', 'Inspect evidence', actions).onclick = () => { inspect(analysis.checks.find(c => c.id === finding.representative)); $('#detail').scrollIntoView({ block: 'start' }); };
    node('button', finding.disposition === 'accepted' ? 'Reopen review' : 'Accept this appearance', actions).onclick = () => {
      reviews = reviews.filter(r => r.fingerprint !== finding.fingerprint);
      if (finding.disposition !== 'accepted') reviews.push({ fingerprint: finding.fingerprint, disposition: 'accepted', location: finding.location });
      try { localStorage.setItem('diagnostic-reviews-v1', JSON.stringify(reviews)); } catch { $('#summary').textContent = 'Review updated for this session; local storage unavailable. Export decisions to retain them.'; }
      showQueue();
    };
  }
}
$('#queue-filter').onchange = showQueue;
$('#import-reviews').onchange = async () => {
  try {
    const file = $('#import-reviews').files[0]; if (!file || file.size > 1024 * 1024) throw Error('Choose review JSON smaller than 1 MiB.');
    const data = JSON.parse(await file.text());
    if (data.format !== 'native-dark-reviews' || data.version !== 1 || !Array.isArray(data.reviews) || data.reviews.length > 5000 || data.reviews.some(r => !r || typeof r.fingerprint !== 'string' || r.fingerprint.length > 100 || r.disposition !== 'accepted')) throw Error('Invalid review decisions.');
    reviews = [...new Map([...reviews, ...data.reviews].map(r => [r.fingerprint, r])).values()];
    localStorage.setItem('diagnostic-reviews-v1', JSON.stringify(reviews)); showQueue();
  } catch (error) { $('#summary').textContent = error.message; }
};
$('#export-reviews').onclick = () => {
  const blob = new Blob([JSON.stringify({ format: 'native-dark-reviews', version: 1, reviews }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = node('a'); link.href = url; link.download = 'diagnostic-reviews.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const openFile = async file => {
  if (!file || file.size > 50 * 1024 * 1024) throw Error('Choose a capture JSON smaller than 50 MiB.');
  return validateReport(JSON.parse(await file.text()));
};
function load(value, base = null) {
  report = validateReport(value); analysis = analyze(report); reportBase = base;
  recordIndex = new Map(report.captures.map(c => [c.id, new Map(c.rows.map(r => [r.key, r]))]));
  const failed = report.assertions?.filter(a => !a.passed).length ?? 0;
  $('#summary').textContent = `${report.captures.length} captures · ${report.environment?.browser ?? 'unknown browser'} · ${analysis.policy} · ${failed} failed fixture assertions. Source/themed comparison is included. Unsupported ≠ passed.`;
  $('#detail').hidden = true; showQueue(); filter(); tab('report');
}
function filter() {
  if (!analysis) return;
  const max = $('#maximum').value === '' ? null : Number($('#maximum').value);
  const min = $('#minimum').value === '' ? null : Number($('#minimum').value);
  const metric = check => $('#metric').value === 'value' ? check.value : check.kind === 'border' ? check.evidence[$('#metric').value] : null;
  const checks = analysis.checks.filter(c => (!$('#theme').value || c.theme === $('#theme').value) && (!$('#status').value || c.status === $('#status').value) &&
    (!$('#level').value || c.level === $('#level').value) && (!$('#kind').value || c.kind === $('#kind').value) &&
    (max === null || metric(c) !== null && metric(c) <= max) && (min === null || metric(c) !== null && metric(c) >= min) &&
    ($('#metric').value === 'value' || metric(c) !== null) && (c.capture + c.element + (recordIndex.get(c.capture).get(c.element).location?.label ?? '')).toLowerCase().includes($('#search').value.toLowerCase()));
  $('#count').textContent = `${checks.length} matching measurements (showing at most 500).`;
  $('#rows').replaceChildren();
  for (const check of checks.slice(0, 500)) {
    const row = node('tr', undefined, $('#rows')), cell = node('td', undefined, row);
    const record = recordIndex.get(check.capture).get(check.element);
    const button = node('button', `${check.capture.split('/')[0]} · ${record.location?.label ?? check.element}`, cell); button.onclick = () => inspect(check);
    node('td', `${check.theme} · ${check.level}`, row); node('td', check.kind + ' ' + check.layer, row);
    const value = metric(check), target = $('#metric').value === 'value' ? check.target : null;
    node('td', `${value === null ? '—' : value.toFixed(3)} / ${target ?? '—'}`, row); node('td', check.status, row);
  }
}
for (const id of ['theme', 'level', 'status', 'kind', 'metric', 'minimum', 'maximum', 'search']) $('#' + id).oninput = filter;
function inspect(check) {
  const capture = report.captures.find(c => c.id === check.capture), row = capture.rows.find(r => r.key === check.element);
  const source = report.captures.find(c => c.id === capture.sourceId), original = source?.rows.find(r => r.key === row.key);
  $('#detail').hidden = false; $('#explanation').textContent = `${check.kind}: ${check.status}. ` + JSON.stringify(check.evidence);
  $('#raw').textContent = JSON.stringify({ check, original: original ?? null, themed: row, coverage: capture.coverage }, null, 2);
  $('#swatches').replaceChildren();
  for (const [label, data] of [['Original', original], ['Applied', row]]) if (data) {
    const wrap = node('span', label, $('#swatches'));
    for (const paint of [data.layers[0].textFill, data.layers[0].backgroundColor]) {
      const swatch = node('span', undefined, wrap); swatch.className = 'swatch'; swatch.title = paint;
      if (/^(?:rgba?\([\d.,\s]+\)|#[\da-f]{6})$/i.test(paint)) swatch.style.backgroundColor = paint;
    }
  }
  $('#pictures').replaceChildren();
  if (reportBase) for (const [label, c] of [['Original', source], ['Applied', capture]]) if (c?.screenshot && /^\d{3}\.png$/.test(c.screenshot)) {
    const figure = node('div', undefined, $('#pictures')); node('p', label, figure);
    const picture = node('div', undefined, figure); picture.className = 'picture';
    const image = node('img', undefined, picture); image.alt = label + ' specimen'; image.src = reportBase + c.screenshot;
    const record = c.rows.find(r => r.key === row.key);
    if (record) { const mark = node('span', undefined, picture); mark.className = 'highlight'; const [x, y, w, h] = record.bounds;
      Object.assign(mark.style, { left: x / c.viewport[0] * 100 + '%', top: y / c.viewport[1] * 100 + '%', width: w / c.viewport[0] * 100 + '%', height: h / c.viewport[1] * 100 + '%' }); }
  }
}
async function runs() {
  const names = await (await fetch('/api/reports')).json(); $('#runs').replaceChildren(node('option', 'Choose a run'));
  $('#runs').firstElementChild.value = '';
  for (const name of names) { const option = node('option', name, $('#runs')); option.value = name; }
}
$('#refresh').onclick = () => runs().catch(error => { $('#summary').textContent = error.message; });
$('#runs').onchange = async () => {
  const name = $('#runs').value; if (!/^run-[\w-]+$/.test(name)) return;
  try { const r = await fetch(`/reports/${name}/capture.json`); if (!r.ok) throw Error('Capture unavailable.'); load(await r.json(), `/reports/${name}/`); } catch (error) { $('#summary').textContent = error.message; }
};
$('#file').onchange = async () => { try { load(await openFile($('#file').files[0])); } catch (error) { $('#summary').textContent = error.message; } };
$('#diff').onclick = async () => {
  try { const result = compare(await openFile($('#before').files[0]), await openFile($('#after').files[0]));
    const counts = result.changes.reduce((all, c) => ({ ...all, [c.status]: (all[c.status] ?? 0) + 1 }), {});
    $('#diff-status').textContent = `Environment drift: ${result.environmentDrift.join(', ') || 'none'} · ${JSON.stringify(counts)}`;
    $('#diff-output').textContent = JSON.stringify(result, null, 2);
  } catch (error) { $('#diff-status').textContent = error.message; }
};
async function run(gallery = false) {
  $('#run').disabled = $('#run-gallery').disabled = true;
  try {
    const response = await fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gallery }) });
    if (!response.ok) throw Error((await response.json()).error);
    $('#job').textContent = 'Capturing local specimens in an isolated browser…';
    let job;
    do { await new Promise(resolve => setTimeout(resolve, 700)); job = await (await fetch('/api/job')).json(); } while (job.state === 'running');
    if (job.state === 'failed') throw Error(job.error);
    const failures = job.assertions.filter(a => !a.passed).length;
    $('#job').textContent = gallery ? `Extended gallery captured. ${job.assertions.length - failures}/${job.assertions.length} pipeline self-test passed; specimen paint remains capture-only.` : `Capture complete: ${job.assertions.length - failures}/${job.assertions.length} assertions passed.`;
    await runs(); $('#runs').value = job.report; await $('#runs').onchange();
  } catch (error) { $('#job').textContent = error.message; } finally { $('#run').disabled = $('#run-gallery').disabled = false; }
}
$('#run').onclick = () => run(); $('#run-gallery').onclick = () => run(true);
runs().catch(error => { $('#summary').textContent = error.message; });
