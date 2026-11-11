import { readFile, writeFile } from 'node:fs/promises';
import { startServer } from './diagnostics/server.mjs';
import { captureSuite } from './diagnostics/runner.mjs';
import { analyze, compare } from '../../tools/diagnostics/analysis.mjs';
import { triage, summaryMarkdown } from '../../tools/diagnostics/triage.mjs';
const args = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i++) {
  const key = args[i];
  if (['--help', '--full', '--labels', '--gallery', '--summary', '--issue'].includes(key)) options[key.slice(2)] = true;
  else if (['--url', '--selector', '--scales', '--themes', '--levels', '--browser', '--output-directory', '--analyze', '--before', '--after', '--output'].includes(key) && args[i + 1] && !args[i + 1].startsWith('--')) options[key.slice(2)] = args[++i];
  else throw Error('Unknown or missing option: ' + key);
}
if(options.issue && (!options.url || !options.selector || options.gallery || options.full || options.analyze || options.before || options.after)) throw Error('--issue requires --url and --selector, without gallery/full/offline modes.');
if (options.summary && !options.analyze) throw Error('--summary requires --analyze.');
if (options.gallery && options.url) throw Error('Choose --gallery or --url, not both.');
if (options.help) {
  console.log('npm run diagnose [-- --full | --gallery | --url HTTP_URL | --analyze capture.json [--summary] --output FILE | --before old.json --after new.json --output diff.json]\nIssue bundle: --issue --url HTTP_URL --selector CSS (defaults: 100% zoom, Off, all custom themes). No live screenshots, HTML, labels or input values by default.\nOptional: --browser PATH --output-directory PATH --selector CSS --scales 1,1.25 --themes chromium,soft,contrast --levels off,maximum. --labels opts in to exporting visible live labels (never input values). --summary writes a grouped Markdown review queue. Default: local smoke suite. --gallery captures extended visual specimens; --full expands levels/scales, not state coverage.');
} else if (options.analyze || options.before || options.after) {
  if (!options.output) throw Error('--output is required for offline operations.');
  if (options.analyze && (options.before || options.after) || !options.analyze && (!options.before || !options.after)) throw Error('Choose --analyze, or supply both --before and --after.');
  const load = async file => JSON.parse(await readFile(file, 'utf8'));
  if (options.summary && !options.analyze) throw Error('--summary requires --analyze.');
  const input = options.analyze && await load(options.analyze);
  const result = options.analyze ? (options.summary ? summaryMarkdown(triage(input)) : analyze(input)) : compare(await load(options.before), await load(options.after));
  await writeFile(options.output, typeof result === 'string' ? result : JSON.stringify(result, null, 2)); console.log('Written:', options.output);
} else {
  if (options.url) { const url = new URL(options.url); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error('Use HTTP(S) without embedded credentials.'); }
  const matrix = options.issue ? {scales:[1],levels:['off']} : {};
  for (const [key, valid] of [['scales', x => Number.isFinite(Number(x)) && Number(x) >= .5 && Number(x) <= 3],
    ['themes', x => ['chromium', 'soft', 'contrast'].includes(x)], ['levels', x => ['off', 'very-low', 'low', 'medium', 'high', 'maximum'].includes(x)]]) {
    if (!options[key]) continue;
    const values = options[key].split(',');
    if (values.some(v => !valid(v)) || new Set(values).size !== values.length) throw Error('Invalid matrix: ' + key);
    matrix[key] = key === 'scales' ? values.map(Number) : values;
  }
  const server = await startServer();
  try {
    const result = await captureSuite({ base: server.base, url: options.url, selector: options.selector, labels: options.labels, issue: options.issue, gallery: options.gallery, browser: options.browser, full: options.full, outputDirectory: options['output-directory'], ...matrix });
    if (!result.passed) process.exitCode = 1;
  } finally { await server.close(); }
}
