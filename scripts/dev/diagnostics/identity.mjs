import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const fingerprintKind = 'initializer-source-sha256-lf-v1';
const modules = { renderer: ['website-theme.js', 'nativeDarkModeWebsiteTheme'], colors: ['chromium-colors.js', 'nativeDarkModeChromiumColors'],
  imageContrast: ['image-contrast.js', 'nativeDarkModeImageContrast'] };

// Trusted extension sources only. This deliberately excludes the surrounding file/license bytes.
export function initializerFingerprint(source, name) {
  const start = source.indexOf(`(function ${name}() {`), end = source.lastIndexOf('})();');
  if (start < 0 || end <= start || source.slice(end + 5).trim()) throw Error('Unknown renderer initializer structure');
  return createHash('sha256').update(source.slice(start + 1, end + 1).replace(/\r\n?/g, '\n')).digest('hex');
}

export async function expectedRendererIdentity() {
  const initialized = {};
  for (const [key, [file, name]] of Object.entries(modules)) {
    initialized[key] = initializerFingerprint(await readFile(new URL('../../../extension/' + file, import.meta.url), 'utf8'), name);
  }
  return { fingerprintKind, initialized };
}

export function compareRendererIdentity(expected, response) {
  if (response?.status !== 'observed') return { status: 'unavailable', reason: response?.reason ?? 'no-response', expected };
  const observed = response.observed;
  if (observed?.version !== 1 || observed.fingerprintKind !== fingerprintKind ||
      !/^[a-f0-9]{32}$/.test(observed.instanceId) || !Number.isFinite(Date.parse(observed.initializedAt))) {
    return { status: 'unknown', reason: 'unsupported-identity', expected };
  }
  if ([...Object.keys(modules).map(key => observed.initialized?.[key]), observed.currentDependencies?.colors,
    observed.currentDependencies?.imageContrast].some(value => typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))) {
    return { status: 'unknown', reason: 'incomplete-fingerprints', expected, observed };
  }
  const differences = [];
  for (const key of Object.keys(modules)) if (observed.initialized[key] !== expected.initialized[key]) differences.push('initialized.' + key);
  for (const key of ['colors', 'imageContrast']) if (observed.currentDependencies[key] !== observed.initialized[key]) differences.push('currentDependencies.' + key);
  return { status: differences.length ? 'mismatch' : 'match', expected, observed, differences };
}
