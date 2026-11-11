import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/chromium-colors.js';

test('perceptual contrast distinguishes light and dark text on the same orange', () => {
  const contrast = globalThis.nativeDarkModePerceptualContrast;
  const orange = [255, 98, 0];
  assert.ok(Math.abs(contrast([32, 32, 32], orange) - 45.676) < .001);
  assert.ok(Math.abs(contrast([255, 255, 255], orange) + 60.917) < .001);
  assert.equal(contrast(orange, orange), 0);
});

const transform = globalThis.nativeDarkModeChromiumColor;
const gray = (value, alpha = 1) => [value, value, value, alpha];

test('Chromium runtime classifiers use strict role-specific brightness thresholds', () => {
  assert.equal(transform(gray(150), 'foreground'), null);
  assert.deepEqual(transform(gray(149), 'foreground'), gray(115));
  assert.equal(transform(gray(205), 'background'), null);
  assert.deepEqual(transform(gray(206), 'background'), gray(64));
  assert.equal(transform(gray(24), 'background'), null);
  assert.equal(transform(gray(232), 'foreground'), null);
  assert.equal(transform([0, 255, 3, 1], 'foreground'), null);
  assert.ok(transform([0, 255, 2, 1], 'foreground'));
});

test('Lab lightness inversion reproduces Blink neutral vectors and preserves alpha', () => {
  assert.deepEqual(transform(gray(255), 'background'), gray(18));
  assert.deepEqual(transform(gray(255, 0.5), 'background'), gray(18, 0.5));
  assert.deepEqual(transform(gray(0), 'foreground'), gray(255));
  assert.deepEqual(transform(gray(0, 0.25), 'foreground'), gray(255, 0.25));
});

test('Lab inversion carries chroma through the conversion and clips to sRGB', () => {
  assert.deepEqual(transform([255, 0, 0, 1], 'foreground'), [255, 18, 3, 1]);
  assert.deepEqual(transform([0, 0, 255, 0.75], 'foreground'), [220, 152, 255, 0.75]);
  assert.deepEqual(transform([255, 255, 0, 1], 'background'), [45, 36, 0, 1]);
});
