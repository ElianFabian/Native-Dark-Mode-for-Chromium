import { spawn } from 'node:child_process';
import { mkdir, readFile, rename, writeFile, open } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { selectRenderingCases } from './case-selection.mjs';
import { createMetrics, sourceHashes } from './metrics.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
export function repetitionOptions({ count, attemptTimeout, totalTimeout } = {}) {
  function integer(value, fallback, min, max, name) {
    if (value === undefined) return fallback;
    if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) throw Error(`Use ${name} ${min}..${max} (integer).`);
    return Number(value);
  }
  return { count: integer(count, 2, 2, 10, '--repeat'),
    attemptTimeoutMs: integer(attemptTimeout, 120, 1, 300, '--attempt-timeout') * 1000,
    totalTimeoutMs: integer(totalTimeout, 600, 1, 1800, '--repeat-timeout') * 1000 };
}

export function repetitionOutcome(report) {
  if (report.attempts.length !== report.requested || report.attempts.some(a => !['passed','failed'].includes(a.status) || a.cleanup !== 'complete') || report.stopReason) return 'incomplete';
  const passed = report.attempts.filter(a => a.status === 'passed').length;
  return passed === report.requested ? 'passed' : passed ? 'unstable' : 'failed';
}

// No retry-to-green: every requested attempt is independently retained, unless a budget or isolation gap stops work.
export async function repeatAttempts({ count, attemptTimeoutMs, totalTimeoutMs, execute, persist, onAttemptComplete, now = () => performance.now(), metadata = {} }) {
  if (!Number.isInteger(count) || count < 2 || count > 10 || !(attemptTimeoutMs > 0) || !(totalTimeoutMs > 0)) throw Error('Invalid repetition bounds');
  const started = now();
  const report = { format: 'native-dark-case-repetitions', version: 1, ...metadata, requested: count,
    attemptTimeoutMs, totalTimeoutMs, status: 'running', attempts: [], startedAt: new Date().toISOString() };
  await persist(structuredClone(report));
  for (let number = 1; number <= count; number++) {
    const remaining = totalTimeoutMs - (now() - started);
    if (remaining <= 0) { report.stopReason = 'time-budget-exhausted'; break; }
    const attempt = { number, status: 'running', startedAt: new Date().toISOString() };
    report.attempts.push(attempt); await persist(structuredClone(report));
    const attemptStart = now();
    try { Object.assign(attempt, await execute({ number, timeoutMs: Math.min(attemptTimeoutMs, remaining) })); }
    catch { attempt.status = 'infrastructure-error'; attempt.cleanup = 'unconfirmed'; }
    if (!['passed','failed','timed-out','infrastructure-error','incompatible'].includes(attempt.status)) attempt.status = 'infrastructure-error';
    if (metadata.requireFreshIsolation && ['passed','failed'].includes(attempt.status) && (!attempt.isolation?.browserInstanceId ||
      !attempt.isolation?.profileId || attempt.isolation.initialRuleCount !== 0 ||
      report.attempts.slice(0,-1).some(previous => previous.isolation?.browserInstanceId === attempt.isolation.browserInstanceId || previous.isolation?.profileId === attempt.isolation.profileId))) {
      attempt.status = 'incompatible';
    }
    attempt.durationMs = now() - attemptStart; attempt.endedAt = new Date().toISOString();
    if (attempt.status === 'incompatible') report.stopReason = 'source-scope-or-isolation-drift';
    if (attempt.cleanup !== 'complete') report.stopReason = 'cleanup-unconfirmed';
    await onAttemptComplete?.(attempt);
    await persist(structuredClone(report));
    if (report.stopReason) break;
  }
  report.failureGroups = [];
  for (const attempt of report.attempts.filter(a => a.status === 'failed')) {
    const signature = attempt.failureSignature ?? null;
    let group = report.failureGroups.find(g => JSON.stringify(g.signature) === JSON.stringify(signature));
    if (!group) { group = { signature, attempts: [] }; report.failureGroups.push(group); }
    group.attempts.push(attempt.number);
  }
  report.status = repetitionOutcome(report); report.elapsedMs = now() - started; report.endedAt = new Date().toISOString();
  await persist(structuredClone(report)); return report;
}

function ownedRunDirectory(relative) {
  if (typeof relative !== 'string' || !/^research-artifacts\/diagnostics\/shared-[a-zA-Z0-9-]+$/.test(relative)) return null;
  return path.join(root, ...relative.split('/'));
}

async function terminateOwnedChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform !== 'win32') { process.kill(-child.pid, 'SIGKILL'); return; }
  await new Promise(resolve => {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {windowsHide:true,stdio:'ignore'});
    const timer = setTimeout(() => { killer.kill(); resolve(); }, 5000); timer.unref();
    const done = () => { clearTimeout(timer); resolve(); };
    killer.once('error', done); killer.once('exit', done);
  });
}

export async function executeRepeatedCase({ cases, number, timeoutMs, directory, sessionId, expectedHashes, selection }) {
  const logName = `attempt-${String(number).padStart(2,'0')}.log`, log = await open(path.join(directory, logName), 'w');
  let relativeRun, finished, timedOut = false, forced = false, unconfirmed = false, graceTimer, hardTimer;
  let child;
  try {
    const exit = await new Promise(resolve => {
      let settled = false;
      const done = result => { if (!settled) { settled = true; resolve(result); } };
      child = spawn(process.execPath, ['--experimental-websocket','scripts/dev/diagnostics/check-rendering-cases.mjs','--cases',cases], {
        cwd:root, windowsHide:true, detached:true, stdio:['ignore',log.fd,log.fd,'ipc'],
        env:{...process.env,NDM_METRICS_SESSION:sessionId}
      });
      child.on('message', message => {
        if (message?.type === 'shared-run-started' && ownedRunDirectory(message.directory)) relativeRun = message.directory;
        if (message?.type === 'shared-run-finished') finished = message;
      });
      child.once('error', () => done({code:null,spawnError:true}));
      child.once('close', (code, signal) => done({code,signal}));
      const timer = setTimeout(() => {
        timedOut = true;
        if (child.connected) child.send({type:'abort-shared-run'}, () => {});
        graceTimer = setTimeout(() => {
          forced = true; void terminateOwnedChild(child).catch(() => {});
          hardTimer = setTimeout(() => { unconfirmed = true; if(child.connected)child.disconnect(); child.unref(); done({code:null}); }, 10000);
        }, 45000);
      }, timeoutMs);
      child.once('exit', () => clearTimeout(timer)); child.once('error', () => clearTimeout(timer));
    });
    clearTimeout(graceTimer); clearTimeout(hardTimer);
    let manifest;
    if (relativeRun) { try { manifest = JSON.parse(await readFile(path.join(ownedRunDirectory(relativeRun), 'run.json'), 'utf8')); } catch {} }
    const cleanup = !unconfirmed && !forced && finished?.cleanup === 'complete' && manifest?.cleanup === 'complete' ? 'complete' : 'unconfirmed';
    const environment = manifest?.environment;
    const compatible = environment && environment.codeHash === expectedHashes.codeHash && environment.fixtureHash === expectedHashes.fixtureHash &&
      JSON.stringify(environment.selection?.units) === JSON.stringify(selection.units);
    let status = timedOut ? 'timed-out' : exit.code === 0 && finished?.status === 'passed' && manifest?.status === 'passed' ? 'passed' :
      exit.code !== 0 && manifest?.status === 'failed' && environment?.browserIsolation ? 'failed' : 'infrastructure-error';
    if (environment && !compatible) status = 'incompatible';
    if (status === 'passed' && cleanup !== 'complete') status = 'infrastructure-error';
    return { status, exitCode:exit.code, log:logName, runDirectory:relativeRun ?? null, cleanup, cleanupDetails:manifest?.cleanupDetails, failureSignature:manifest?.failureSignature ?? null, forcedTermination:forced,
      workTimedOut:timedOut, runId:environment?.runId, browser:environment?.browser, isolation:environment?.browserIsolation,
      codeHash:environment?.codeHash, fixtureHash:environment?.fixtureHash };
  } finally { clearTimeout(graceTimer); clearTimeout(hardTimer); await log.close(); }
}

export async function repeatRenderingCases({ cases, count, attemptTimeout, totalTimeout, sessionId }) {
  const options = repetitionOptions({count,attemptTimeout,totalTimeout}), selection = selectRenderingCases({cases});
  if (selection.mode !== 'cases') throw Error('Repetition requires explicit named cases.');
  const directory = path.join(root, 'research-artifacts/diagnostics/repeat-' + Date.now() + '-' + randomUUID().slice(0,8));
  await mkdir(directory, {recursive:true});
  const hashes = await sourceHashes(), metrics = createMetrics({category:'repetition',sessionId,hashes,scope:selection.requestedCases});
  const attemptEnds = new Map();
  const finish = metrics.start('run', {artifact:path.relative(root,directory).replaceAll('\\','/')});
  const persist = async report => {
    await writeFile(path.join(directory,'summary.next.json'), JSON.stringify(report,null,2));
    await rename(path.join(directory,'summary.next.json'), path.join(directory,'summary.json'));
  };
  try {
    const report = await repeatAttempts({...options, metadata:{selection,sessionId:metrics.sessionId,...hashes,requireFreshIsolation:true,
      isolationPolicy:'fresh-owned-browser-and-profile-per-attempt; original selected-unit state sequence retained; OS caches retained',cleanupGraceMs:45000},persist,
      onAttemptComplete: attempt => {
        attemptEnds.get(attempt.number)?.(attempt.status === 'passed' ? 'passed' : attempt.status === 'timed-out' ? 'aborted' : 'failed');
        attemptEnds.delete(attempt.number);
        console.log(`Attempt ${attempt.number}: ${attempt.status}; evidence ${attempt.runDirectory ?? '(unavailable)'}`);
      },
      execute: async options => {
        console.log(`Repetition ${options.number}/${count}; work timeout ${(options.timeoutMs/1000).toFixed(1)}s.`);
        attemptEnds.set(options.number, metrics.start('attempt', {caseId:'attempt-'+options.number}));
        return executeRepeatedCase({cases,directory,sessionId:metrics.sessionId,expectedHashes:hashes,selection,...options});
      }});
    finish(report.status === 'passed' ? 'passed' : 'failed');
    console.log(`Repetitions: ${report.status}; ${report.attempts.length}/${count} attempted. Summary: ${path.join(directory,'summary.json')}`);
    return {passed:report.status === 'passed',directory,report};
  } catch (error) { for(const end of attemptEnds.values())end('failed'); finish('failed'); throw error; }
}
