import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, appendFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createMetrics, readHistory, summarizeHistory, sourceHashes } from '../scripts/dev/diagnostics/metrics.mjs';

async function temporary(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'ndm-metrics-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('history retains successful, failed and unfinished attempts without command or error contents', async t => {
  const file = path.join(await temporary(t), 'events.jsonl');
  const metrics = createMetrics({ file, category: 'test', scope: ['unit'], hashes: { codeHash: 'a'.repeat(64) } });
  const context = { caseId: 'local/control', url: 'https://private.example/?secret', selector: 'PRIVATE', input: 'SECRET' };
  assert.equal(await metrics.measure('collection', () => 42, context), 42);
  const sensitive = Error('SECRET COMMAND https://private.example/');
  await assert.rejects(metrics.measure('collection', () => { throw sensitive; }, context), error => error === sensitive);
  metrics.start('pending'); // A killed process leaves its durable start without inventing an end.
  const snapshot = await readFile(file, 'utf8');
  const child = createMetrics({ file, category: 'test', sessionId: metrics.sessionId });
  const end = child.start('run'); end(); end();
  assert.ok((await readFile(file, 'utf8')).startsWith(snapshot));
  assert.doesNotMatch(await readFile(file, 'utf8'), /SECRET|private|PRIVATE|selector|input/);
  const history = readHistory(file), summary = summarizeHistory(history);
  assert.equal(summary.unfinished, 1);
  const collection = summary.phases.find(row => row.phase === 'test/collection');
  assert.equal(collection.attempts, 2); assert.equal(collection.failed, 1);
  const records = history.events.filter(row => row.event === 'end' && row.phase === 'collection');
  assert.deepEqual(records.map(row => row.attempt), [1, 2]);
  assert.ok(records.every(row => row.durationMs >= 0 && row.startedAt && row.endedAt && row.codeHash === 'a'.repeat(64)));
  assert.equal(history.events.at(-1).sessionId, metrics.sessionId);
  assert.ok(metrics.overheadMs >= 0);
});

test('aborts, malformed lines and truncated tails remain distinguishable in summaries', async t => {
  const file = path.join(await temporary(t), 'events.jsonl');
  assert.deepEqual(readHistory(file), { events: [], invalidLines: 0 });
  const metrics = createMetrics({ file, category: 'test' });
  const error = Error('private abort reason'); error.name = 'AbortError';
  await assert.rejects(metrics.measure('navigation', () => { throw error; }));
  await appendFile(file, 'not json\n{"event": "start"}\n{"truncated":');
  const summary = summarizeHistory(readHistory(file));
  assert.equal(summary.invalidLines, 3); assert.equal(summary.unfinished, 0);
  assert.equal(summary.phases[0].aborted, 1); assert.equal(summary.phases[0].failed, 0);
});

test('source hashes change for fixture and tooling bytes independently', async t => {
  const root = await temporary(t);
  for (const dir of ['extension', 'scripts/dev', 'tools/diagnostics', 'test', 'fixtures']) await mkdir(path.join(root, dir), { recursive: true });
  const fixture = path.join(root, 'fixtures/control.html'), tool = path.join(root, 'scripts/dev/check.mjs');
  await writeFile(fixture, '<button>source</button>'); await writeFile(tool, 'original');
  const initial = await sourceHashes(root);
  await mkdir(path.join(root, 'test/__pycache__'));
  await writeFile(path.join(root, 'test/__pycache__/generated.pyc'), 'runtime cache');
  assert.deepEqual(await sourceHashes(root), initial);
  await writeFile(fixture, '<button>changed</button>');
  const updated = await sourceHashes(root);
  assert.equal(updated.codeHash, initial.codeHash); assert.notEqual(updated.fixtureHash, initial.fixtureHash);
  await writeFile(tool, 'changed');
  const final = await sourceHashes(root);
  assert.notEqual(final.codeHash, updated.codeHash); assert.equal(final.fixtureHash, updated.fixtureHash);
});

test('summary reports median and summed overlapping durations without claiming wall time', () => {
  const events = [10, 40, 20, 30].map((durationMs, n) => ({ event: 'end', eventId: String(n), category: 'test', phase: 'collection', durationMs, result: 'passed' }));
  const summary = summarizeHistory({ events });
  assert.deepEqual(summary.phases[0], { phase: 'test/collection', attempts: 4, failed: 0, aborted: 0, summedMs: 100, medianMs: 25, slowestMs: 40 });
});
