import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assertEvidence, boundedFacts, isLocalFixture, writeFailureEvidence } from '../scripts/dev/diagnostics/failure.mjs';

async function temporary(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'ndm-failure-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('assertion evidence identifies the exact predicate and freezes failure-time values', () => {
  assertEvidence(true, 'geometry', {}, {});
  const actual = { box: [10, 20] }, expected = { box: [10, 21] };
  let failure;
  try { assertEvidence(false, 'active-selector-geometry', expected, actual, { element: 'proxy', state: 'active' }); }
  catch (error) { failure = error; }
  actual.box[0] = 999; expected.box[0] = 999;
  assert.equal(failure.diagnostic.id, 'active-selector-geometry');
  assert.deepEqual(failure.diagnostic.actual.box, [10, 20]);
  assert.deepEqual(failure.diagnostic.expected.box, [10, 21]);
  assert.equal(failure.diagnostic.context.element, 'proxy');
  assert.ok(Date.parse(failure.diagnostic.observedAt));
});

test('failure evidence refuses non-fixture documents before computed or screenshot reads', async t => {
  for (const address of ['https://example.org/fixtures/test.html', 'http://127.0.0.1:9999/fixtures/test.html', 'about:blank', 'http://127.0.0.1:8787/tools/diagnostics/index.html']) {
    const directory = await temporary(t);
    const page = { evaluate: async expression => { assert.equal(expression, 'location.href'); return address; }, send: () => assert.fail('No screenshots allowed') };
    const report = await writeFailureEvidence({ directory, page, base: 'http://127.0.0.1:8787', error: Error('failed') });
    assert.equal(report.failed, true); assert.deepEqual(report.artifacts, {});
    assert.match(report.gaps.join(' '), /not an owned local fixture/);
    assert.ok(!JSON.stringify(report).includes(address));
  }
  assert.equal(isLocalFixture('http://127.0.0.1:8787/fixtures/x.html', 'http://127.0.0.1:8787'), true);
  assert.equal(isLocalFixture('http://user:pass@127.0.0.1:8787/fixtures/x.html', 'http://127.0.0.1:8787'), false);
});

test('a disconnected browser retains all completed results and the primary assertion', async t => {
  const directory = await temporary(t), results = Array.from({ length: 140 }, (_, n) => ({ case: 'control-' + n, passed: true }));
  const page = { evaluate: async () => { throw Error('private disconnect'); } };
  const report = await writeFailureEvidence({ directory, page, base: 'http://127.0.0.1:8787', error: Error('primary failure'), results });
  assert.equal(report.error.message, 'primary failure'); assert.equal(report.completedResults, 140);
  assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'partial-results.json'), 'utf8')), results);
  assert.equal(JSON.parse(await readFile(path.join(directory, 'failure.json'), 'utf8')).failed, true);
  assert.doesNotMatch(JSON.stringify(report), /private disconnect/);
});

test('resource references, content/value fields and unbounded structures do not enter failure facts', () => {
  const facts = boundedFacts({ text: 'PRIVATE', value: 'SECRET', outerHTML: '<input>', nested: { image: 'url("https://host/private?q=secret")', resource: 'data:image/png;base64,secret' }, long: 'x'.repeat(1000), many: Array(150).fill(1) });
  assert.doesNotMatch(JSON.stringify(facts), /PRIVATE|SECRET|<input>|host|secret/);
  assert.match(facts.long, /\[truncated\]$/);
  assert.deepEqual(facts.many.at(-1), { omittedItems: 50 });
});
