import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createBrowserCloser, closeBrowser } from '../scripts/dev/diagnostics/browser.mjs';
import { repeatAttempts } from '../scripts/dev/diagnostics/repetitions.mjs';

const profile = path.join(tmpdir(), 'ndm-lab-cleanup-unit-test');
function browserChild(exits = true) {
  const child = Object.assign(new EventEmitter(), { pid: 123, exitCode: null, signalCode: null });
  child.kill = () => { if (exits) { child.signalCode = 'SIGTERM'; child.emit('exit', null, 'SIGTERM'); } return true; };
  return child;
}

test('browser exit and profile removal are confirmed separately; closing is idempotent', async () => {
  let removals = 0;
  const close = createBrowserCloser({ child: browserChild(), profile, removeProfile: async (file, options) => {
    removals++; assert.equal(file, profile); assert.equal(options.maxRetries, 6); assert.equal(options.retryDelay, 300);
  } });
  const first = close(); assert.equal(close(), first);
  const result = await closeBrowser({ close });
  assert.equal(result.status, 'complete'); assert.equal(result.browser.status, 'complete');
  assert.equal(result.profile.status, 'complete'); assert.equal(removals, 1);
});

test('locked profile cannot be recorded as complete or let a repetition aggregate pass', async () => {
  const close = createBrowserCloser({ child: browserChild(), profile, removeProfile: async () => {
    throw Object.assign(Error('Profile locked'), { code: 'EBUSY' });
  } });
  const result = await close();
  assert.equal(result.status, 'incomplete'); assert.equal(result.browser.status, 'complete');
  assert.equal(result.profile.status, 'incomplete'); assert.equal(result.profilePath, profile);
  assert.equal(result.errors[0].code, 'EBUSY');
  await assert.rejects(closeBrowser({ close }), error => error.cleanup === result);
  let attempts = 0;
  const report = await repeatAttempts({ count: 2, attemptTimeoutMs: 100, totalTimeoutMs: 1000, persist: async () => {},
    execute: async () => { attempts++; return { status: 'passed', cleanup: result.status, cleanupDetails: result }; } });
  assert.equal(report.status, 'incomplete'); assert.equal(report.stopReason, 'cleanup-unconfirmed'); assert.equal(attempts, 1);
  assert.equal(report.attempts[0].cleanupDetails.profile.status, 'incomplete');
});

test('unconfirmed browser exit retains its profile and bounds the wait', async () => {
  let removed = false;
  const child = browserChild(false);
  const close = createBrowserCloser({ child, profile, exitTimeoutMs: 5, removeProfile: async () => { removed = true; } });
  const result = await close();
  assert.equal(result.status, 'incomplete'); assert.equal(result.browser.status, 'incomplete');
  assert.equal(result.profile.status, 'incomplete'); assert.equal(removed, false);
  assert.ok(result.errors.some(error => error.code === 'EXIT_UNCONFIRMED')); assert.equal(child.listenerCount('exit'), 0);
});

test('cleanup refuses a path outside the owned temporary profile namespace', async () => {
  let removed = false;
  const close = createBrowserCloser({ child: browserChild(), profile: path.join(tmpdir(), 'unowned-profile'),
    removeProfile: async () => { removed = true; } });
  assert.equal((await close()).status, 'incomplete'); assert.equal(removed, false);
});
