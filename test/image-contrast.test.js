import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/chromium-colors.js';
import '../extension/image-contrast.js';

const choose = globalThis.nativeDarkModeImageTextContrast;
const sample = (colors, weights = colors.map(() => 1)) => ({ colors, weights });

test('prepared perceptual samples match scalar equations, including translucent ink', () => {
  const backgrounds = [[0,0,0],[255,255,255],[255,98,0],[17,180,210]];
  const contrast = globalThis.nativeDarkModePerceptualContrast;
  const measure = contrast.prepare(backgrounds);
  for (const ink of [[18,18,18,1],[255,255,255,1],[40,80,130,.6]]) {
    const expected = backgrounds.map(bg=>contrast(ink.slice(0,3).map((v,i)=>v*ink[3]+bg[i]*(1-ink[3])),bg));
    assert.deepEqual(measure(ink),expected);
  }
});

test('image text chooses dark on bright pictures and light on dark pictures', () => {
  assert.deepEqual(choose(sample([[245,245,245]])).ink, [18,18,18,1]);
  assert.deepEqual(choose(sample([[20,20,20]])).ink, [255,255,255,1]);
  assert.equal(choose(sample([[245,245,245]])).uncertain, false);
});

test('image text preserves frequency: a small outlier cannot select all text ink', () => {
  const rare = choose(sample([[240,240,240],[0,0,0]], [99,1]));
  const common = choose(sample([[240,240,240],[0,0,0]], [1,99]));
  assert.equal(rare.ink[0], 18);
  assert.equal(common.ink[0], 255);
  // It remains evidence of a weak local region, even when the aggregate is good.
  assert.equal(rare.worst, 0);
  assert.equal(rare.uncertain, true);
  assert.deepEqual(rare, choose(sample([[240,240,240],[0,0,0]], [99,1])));
});

test('weighted aggregation matches expanded pixels and flags unsuitable mixed pictures', () => {
  const weighted = choose(sample([[10,10,10],[240,240,240]], [3,1]));
  const expanded = choose(sample([[10,10,10],[10,10,10],[10,10,10],[240,240,240]]));
  assert.deepEqual(weighted.ink, expanded.ink);
  assert.ok(Math.abs(weighted.mean - expanded.mean) < 1e-12);
  assert.ok(Math.abs(weighted.score - expanded.score) < 1e-12);
  assert.equal(weighted.coverage, expanded.coverage);
  const mixed = choose(sample([[0,0,0],[255,255,255]]));
  assert.equal(mixed.uncertain, true);
  assert.ok(mixed.coverage < .9);
});

test('font targets increase for smaller/thinner text and authored useful color survives', () => {
  const pixels = sample([[255,255,255]]);
  assert.equal(choose(pixels, {fontSize:24,fontWeight:700}).target,45);
  assert.equal(choose(pixels, {fontSize:18,fontWeight:700}).target,60);
  assert.equal(choose(pixels, {fontSize:18,fontWeight:400}).target,75);
  assert.equal(choose(pixels, {fontSize:12,fontWeight:300}).target,90);
  const authored=[5,15,20,1];
  assert.deepEqual(choose(pixels,{authored}).ink,authored);
  assert.notDeepEqual(choose(pixels,{authored:[250,250,250,1]}).ink,[250,250,250,1]);
});

test('image selection rejects missing, unbounded or invalid pixel evidence', () => {
  for (const value of [null, sample([]), sample([[0,0,0]],[-1]), sample([[NaN,0,0]]),
    sample([[0,0,0]],[]),sample(Array(9217).fill([0,0,0]))]) assert.equal(choose(value),null);
});

test('independent decoration adapts its source color only where the sampled backing favors it', () => {
  const authored = [0,102,153,1];
  const adapted = globalThis.nativeDarkModeChromiumColor(authored,'foreground');
  const options = {decoration:true,authored,adapted};
  const dark = choose(sample([[20,20,20]]),options);
  assert.deepEqual(dark.ink,adapted);
  assert.ok(dark.score > dark.candidates[0].score);
  assert.ok(dark.ink[2] > dark.ink[1] && dark.ink[1] > dark.ink[0]);
  assert.deepEqual(choose(sample([[245,245,245]]),options).ink,authored);
  assert.deepEqual(choose(sample([[20,20,20]]),{...options,authored:adapted}).ink,adapted);
  assert.equal(choose(sample([[20,20,20]]),{...options,adapted:null}),null);
});
