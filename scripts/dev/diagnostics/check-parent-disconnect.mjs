// Observe the runner from outside its parent: kill only the parent, then inspect
// OS processes and the owned profile. No cooperation from the killed parent.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, open, readFile, access, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { root, until } from './browser.mjs';

const directory = path.join(root, 'research-artifacts/diagnostics/parent-disconnect-' + Date.now() + '-' + randomUUID().slice(0,8));
await mkdir(directory, { recursive: true });
const log = await open(path.join(directory, 'child.log'), 'w');
let parent, runnerPid, runDirectory, profile, before = [], evidence = { platform: process.platform, passed: false };

function processes() {
  if (process.platform === 'win32') {
    const command = "$p=$env:NDM_OBSERVED_PROFILE; $runner=[int]$env:NDM_OBSERVED_RUNNER; @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.ProcessId -eq $runner -or ($_.CommandLine -and $_.CommandLine.Contains('--user-data-dir=' + $p)) } | ForEach-Object { @{pid=[int]$_.ProcessId; started=$_.CreationDate.ToUniversalTime().ToString('o'); profile=[bool]($_.CommandLine -and $_.CommandLine.Contains('--user-data-dir=' + $p))} }) | ConvertTo-Json -Compress";
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      windowsHide: true, encoding: 'utf8', timeout: 10000,
      env: { ...process.env, NDM_OBSERVED_PROFILE: profile, NDM_OBSERVED_RUNNER: String(runnerPid) }
    });
    if (result.status !== 0) throw Error('Process observation failed: ' + (result.error?.message ?? result.stderr));
    const value = result.stdout.trim() ? JSON.parse(result.stdout) : [];
    return Array.isArray(value) ? value : [value];
  }
  const result = spawnSync('ps', ['-A', '-o', 'pid=,lstart=,args='], { encoding: 'utf8', timeout: 10000 });
  if (result.status !== 0) throw Error('Process observation failed');
  return result.stdout.split('\n').flatMap(line => {
    const match = line.match(/^\s*(\d+)\s+((?:\S+\s+){4}\S+)\s+(.*)$/);
    if (!match) return [];
    const pid = Number(match[1]), ownedProfile = match[3].includes('--user-data-dir=' + profile);
    return pid === runnerPid || ownedProfile ? [{ pid, started: match[2], profile: ownedProfile }] : [];
  });
}

try {
  const supervisor = `import {spawn} from 'node:child_process';
    const runner=spawn(process.execPath,['--experimental-websocket','scripts/dev/diagnostics/check-rendering-cases.mjs'],{windowsHide:true,detached:true,stdio:['ignore','inherit','inherit','ipc']});
    process.send({type:'runner',pid:runner.pid});
    runner.on('message',message=>{if(process.connected)process.send(message,()=>{});});
    runner.once('exit',code=>{process.exitCode=code??1;if(process.connected)process.disconnect();});`;
  parent = spawn(process.execPath, ['--input-type=module', '--eval', supervisor], {
    cwd: root, windowsHide: true, detached: true, stdio: ['ignore', log.fd, log.fd, 'ipc']
  });
  let parentError;
  parent.on('error', error => { parentError = error; });
  parent.on('message', message => {
    if (message?.type === 'runner') runnerPid = message.pid;
    if (message?.type === 'shared-run-started' && /^research-artifacts\/diagnostics\/shared-[a-zA-Z0-9-]+$/.test(message.directory)) runDirectory = path.join(root, message.directory);
  });
  const running = await until(async () => {
    if (parentError) throw parentError;
    if (!runDirectory || !runnerPid) return false;
    let run;
    try { run = JSON.parse(await readFile(path.join(runDirectory, 'run.json'), 'utf8')); } catch { return false; }
    if (run.status !== 'running') throw Error('Runner terminated before its browser was observed; see child.log');
    return run.environment?.browserIsolation && run;
  }, 'runner has a live isolated browser', 25000);
  const profileId = running.environment.browserIsolation.profileId;
  assert.match(profileId, /^ndm-lab-[a-zA-Z0-9]+$/);
  profile = path.resolve(tmpdir(), profileId);
  assert.equal(path.dirname(profile), path.resolve(tmpdir()));
  before = processes();
  assert.ok(before.some(p => p.pid === runnerPid)); assert.ok(before.some(p => p.profile), 'No live browser was observed before killing its parent');
  if (process.platform === 'win32') {
    // Intentionally omit /T: killing the runner too would never test disconnect.
    const killed = spawnSync('taskkill', ['/PID', String(parent.pid), '/F'], { windowsHide: true, encoding: 'utf8', timeout: 5000 });
    assert.equal(killed.status, 0, 'Could not terminate only the test supervisor');
  } else assert.equal(parent.kill('SIGKILL'), true);
  await until(() => parent.exitCode !== null || parent.signalCode !== null, 'supervisor exited', 5000);
  const terminal = await until(async () => {
    try { const run = JSON.parse(await readFile(path.join(runDirectory, 'run.json'), 'utf8')); return run.status !== 'running' && run; }
    catch { return false; }
  }, 'orphan runner records terminal cleanup', 45000);
  assert.equal(terminal.status, 'aborted'); assert.equal(terminal.abortReason, 'parent-disconnected');
  assert.equal(terminal.cleanup, 'complete');
  const after = await until(() => { const remaining = processes(); return remaining.length ? false : []; }, 'runner and browser processes exited', 10000);
  await assert.rejects(access(profile), error => error.code === 'ENOENT');
  evidence = { ...evidence, passed: true, browser: running.environment.browser, runnerPid, profileId,
    runDirectory: path.relative(root, runDirectory).replaceAll('\\','/'), before, after, profileRemoved: true,
    terminalStatus: terminal.status, abortReason: terminal.abortReason, cleanup: terminal.cleanup, cleanupDetails: terminal.cleanupDetails };
  console.log('Parent disconnect passed: parent terminated abruptly; OS process inspection found no runner/browser and the owned profile was removed. Evidence: ' + directory);
} catch (error) {
  evidence.error = error.message; throw error;
} finally {
  // Failure fallback only, restricted to the observed PID AND creation time.
  try { if (!evidence.passed) {
    if (parent && parent.exitCode === null && parent.signalCode === null) parent.kill();
    if (profile && runnerPid) {
      for (const observed of processes()) if (before.some(p => p.pid === observed.pid && p.started === observed.started)) {
        if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(observed.pid), '/T', '/F'], { windowsHide: true, timeout: 10000, stdio: 'ignore' });
        else { try { process.kill(observed.pid, 'SIGKILL'); } catch {} }
      }
    }
  } } catch (error) { evidence.fallbackError = error.message; }
  await writeFile(path.join(directory, 'results.json'), JSON.stringify(evidence, null, 2));
  await log.close();
}
