import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { selectRenderingCases, sharedCaseUnits, expectedCaseVariants, resultVariants, caseListing } from '../scripts/dev/diagnostics/case-selection.mjs';

test('a named selection retains only its atomic unit, all variants and in-fixture controls', () => {
  const selected = selectRenderingCases({ cases: 'select-proxy-and-field-frames' });
  assert.equal(selected.mode, 'cases');
  assert.deepEqual(selected.includedCases, ['select-proxy-and-field-frames']);
  assert.deepEqual(selected.companions, []);
  assert.equal(selected.expectedResults, 18);
  assert.deepEqual([...new Set(expectedCaseVariants(selected.units[0]).map(row => row[1]))], ['chromium', 'soft', 'contrast']);
  assert.deepEqual([...new Set(expectedCaseVariants(selected.units[0]).map(row => row[2]))], ['off', 'very-low', 'low', 'medium', 'high', 'maximum']);
});

test('aliases retain inseparable companions once and preserve canonical execution order', () => {
  const selected = selectRenderingCases({ cases: 'short-shadow-card-emphasis,popup-first-paint' });
  assert.deepEqual(selected.units, ['popup-first-paint', 'verified-svg-scroll-state-stability']);
  assert.deepEqual(selected.companions, ['dynamic-catalogue-workload', 'dynamic-catalogue-varied-workload', 'verified-svg-scroll-state-stability']);
  assert.equal(selected.expectedResults, 15);
  assert.equal(selectRenderingCases({ cases: 'popup-first-paint,dynamic-catalogue-workload' }).units.length, 1);
  const cards = selectRenderingCases({ cases: 'article-page-surface-separation' });
  assert.equal(cards.expectedResults, 39);
  assert.deepEqual(cards.companions, ['clipped-heading-panel', 'headed-form-filter-surface']);
});

test('group/full selection preserves every registered case and variant', () => {
  const full = selectRenderingCases();
  assert.equal(full.units.length, 42); assert.equal(full.includedCases.length, 48); assert.equal(full.expectedResults, 375);
  const borders = selectRenderingCases({ groups: 'borders' });
  assert.equal(borders.expectedResults, 90);
  assert.deepEqual(borders.units, sharedCaseUnits.filter(unit => unit.groups.includes('borders')).map(unit => unit.id));
  assert.equal(selectRenderingCases({ groups: 'icons,borders,images,surfaces,states,contact,cards' }).expectedResults, 375);
  const variants = full.units.flatMap(expectedCaseVariants);
  assert.deepEqual(resultVariants(variants.map(([id,theme,level,cycle]) => ({case:id,theme,...(level?{level}:{}),...(cycle!==null?{cycle}:{})}))), variants);
});

test('unknown, empty, duplicate and conflicting selections fail instead of expanding to a full run', () => {
  for (const cases of ['', 'missing', 'embedded-vector-caption,', 'embedded-vector-caption,embedded-vector-caption', ' embedded-vector-caption']) {
    assert.throws(() => selectRenderingCases({cases}), /Invalid cases/);
  }
  for (const groups of ['', 'unknown', 'borders,borders']) assert.throws(() => selectRenderingCases({groups}), /Invalid groups/);
  assert.throws(() => selectRenderingCases({cases:'embedded-vector-caption',groups:'icons'}), /not both/);
});

test('every listed unit is wired once in canonical order and every reported result name has an inventory', async () => {
  const source = await readFile(new URL('../scripts/dev/diagnostics/check-rendering-cases.mjs', import.meta.url), 'utf8');
  const wired = [...source.matchAll(/^  await runCase\('([^']+)'/gm)].map(match => match[1]);
  assert.deepEqual(wired, sharedCaseUnits.map(unit => unit.id));
  const names = [...source.matchAll(/results\.push\(\{\s*case\s*:\s*['"]([^'"]+)/g)].map(match => match[1]);
  assert.deepEqual(names, sharedCaseUnits.flatMap(unit => unit.includes));
  assert.deepEqual(caseListing().map(row => row.id), names);
  for (const unit of sharedCaseUnits) assert.ok(expectedCaseVariants(unit.id).length > 0);
});

test('CLI rejects invalid selections without starting browser work; listing needs no npm environment', () => {
  const env = {...process.env}; delete env.npm_execpath;
  const root = fileURLToPath(new URL('../', import.meta.url));
  for (const [script,args] of [
    ['scripts/dev/verify.mjs',['--cases','unknown']],
    ['scripts/dev/verify.mjs',['--cases','embedded-vector-caption','--browser']],
    ['scripts/dev/verify.mjs',['--cases','embedded-vector-caption','--focus','icons']],
    ['scripts/dev/diagnostics/check-rendering-cases.mjs',['--cases','']],
    ['scripts/dev/diagnostics/check-rendering-cases.mjs',['--groups','borders','--cases','embedded-vector-caption']],
  ]) {
    const result = spawnSync(process.execPath, [script,...args], {cwd:root,env,encoding:'utf8',windowsHide:true});
    assert.notEqual(result.status, 0); assert.doesNotMatch(result.stdout, /Rendering scope|Syntax checks/);
  }
  const listing = spawnSync(process.execPath, ['scripts/dev/verify.mjs','--list-cases'], {cwd:root,env,encoding:'utf8',windowsHide:true});
  assert.equal(listing.status, 0, listing.stderr); assert.match(listing.stdout, /select-proxy-and-field-frames/);
});
