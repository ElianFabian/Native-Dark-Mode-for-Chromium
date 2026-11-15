// Local append-only process evidence. Never serialize commands, errors or page facts.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
export const historyFile = path.join(root, 'research-artifacts/process-metrics/events.jsonl');
const token = value => typeof value === 'string' && /^[a-zA-Z0-9_./,-]{1,160}$/.test(value) ? value : undefined;

export async function sourceHashes(base = root) {
  async function digest(directories) {
    const hash = createHash('sha256');
    async function walk(directory) {
      for (const item of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
        const file = path.join(directory, item.name);
        if (item.isDirectory() && item.name !== '__pycache__') await walk(file);
        else if (item.isFile()) hash.update(path.relative(base, file).replaceAll('\\', '/')).update('\0').update(await readFile(file)).update('\0');
      }
    }
    for (const directory of directories) await walk(path.join(base, directory));
    return hash.digest('hex');
  }
  return { codeHash: await digest(['extension', 'scripts/dev', 'tools/diagnostics', 'test']), fixtureHash: await digest(['fixtures']) };
}

export function createMetrics({ file = historyFile, category, sessionId, hashes = {}, scope = [] } = {}) {
  if (!['verification', 'capture', 'shared', 'repetition', 'test'].includes(category)) throw Error('Unknown metrics category');
  mkdirSync(path.dirname(file), { recursive: true });
  const session = token(sessionId) || randomUUID(), runId = randomUUID(), attempts = new Map();
  const identity = Object.fromEntries(['codeHash', 'fixtureHash'].filter(key => /^[a-f0-9]{64}$/.test(hashes[key])).map(key => [key, hashes[key]]));
  let overheadMs = 0;
  function write(event) {
    const start = performance.now();
    appendFileSync(file, JSON.stringify({ version: 1, sessionId: session, runId, category, ...identity, ...event }) + '\n', 'utf8');
    overheadMs += performance.now() - start;
  }
  function start(phase, context = {}) {
    if (!token(phase)) throw Error('Invalid metrics phase');
    const caseId = token(context.caseId), key = `${phase}/${caseId || ''}`;
    const attempt = (attempts.get(key) || 0) + 1; attempts.set(key, attempt);
    const eventId = randomUUID(), startedAt = new Date().toISOString(), clock = performance.now();
    const artifact = typeof context.artifact === 'string' && /^research-artifacts\/[a-zA-Z0-9_./-]+$/.test(context.artifact) && !context.artifact.split('/').includes('..') ? context.artifact : undefined;
    const fields = { eventId, phase, caseId, artifact, attempt, scope: scope.map(token).filter(Boolean) };
    write({ ...fields, event: 'start', startedAt });
    let finished = false;
    return (result = 'passed') => {
      if (finished) return;
      if (!['passed', 'failed', 'aborted'].includes(result)) throw Error('Invalid metrics result');
      finished = true;
      write({ ...fields, event: 'end', startedAt, endedAt: new Date().toISOString(), durationMs: performance.now() - clock, result, metricsWriteMs: overheadMs });
    };
  }
  return {
    sessionId: session, runId, start,
    get overheadMs() { return overheadMs; },
    async measure(phase, action, context) {
      const end = start(phase, context);
      try { const result = await action(); end(); return result; }
      catch (error) { end(error?.name === 'AbortError' ? 'aborted' : 'failed'); throw error; }
    },
  };
}

export function readHistory(file = historyFile) {
  let input;
  try { input = readFileSync(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return { events: [], invalidLines: 0 }; throw error; }
  const events = []; let invalidLines = 0;
  for (const line of input.split('\n').filter(line => line.trim())) {
    try {
      const event = JSON.parse(line);
      if (event.version !== 1 || !['start', 'end'].includes(event.event) || !token(event.phase) || !token(event.eventId) || !token(event.runId)) throw Error();
      if (event.event === 'end' && (!Number.isFinite(event.durationMs) || event.durationMs < 0 || !['passed', 'failed', 'aborted'].includes(event.result))) throw Error();
      events.push(event);
    } catch { invalidLines++; }
  }
  return { events, invalidLines };
}

export function summarizeHistory({ events, invalidLines = 0 }) {
  const starts = new Map(), ends = new Map();
  for (const event of events) (event.event === 'start' ? starts : ends).set(event.eventId, event);
  const phases = new Map();
  for (const event of ends.values()) {
    const key = `${event.category}/${event.phase}`;
    const rows = phases.get(key) || []; rows.push(event); phases.set(key, rows);
  }
  return { invalidLines, unfinished: [...starts.values()].filter(event => !ends.has(event.eventId)).length,
    phases: [...phases].map(([phase, rows]) => {
      const times = rows.map(row => row.durationMs).sort((a, b) => a - b), n = times.length;
      return { phase, attempts: n, failed: rows.filter(row => row.result === 'failed').length, aborted: rows.filter(row => row.result === 'aborted').length,
        summedMs: times.reduce((a, b) => a + b, 0), medianMs: (times[Math.floor((n - 1) / 2)] + times[Math.floor(n / 2)]) / 2,
        slowestMs: times[n - 1] };
    }).sort((a, b) => b.summedMs - a.summedMs) };
}
