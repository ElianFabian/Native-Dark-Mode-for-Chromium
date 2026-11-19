import { spawn, spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createMetrics, sourceHashes } from './diagnostics/metrics.mjs';
import { selectRenderingCases, caseListing } from './diagnostics/case-selection.mjs';
import { repetitionOptions } from './diagnostics/repetitions.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const flags = process.argv.slice(2);
function takeOption(name) {
  const index = flags.indexOf(name);
  if (index === -1) return undefined;
  const value = flags[index + 1];
  if (!value || value.startsWith('--')) throw Error('Missing value for ' + name);
  flags.splice(index, 2); return value;
}
const focus = takeOption('--focus'), caseIds = takeOption('--cases');
const repeat = takeOption('--repeat'), attemptTimeout = takeOption('--attempt-timeout'), repeatTimeout = takeOption('--repeat-timeout');
if (repeat !== undefined && (!caseIds || focus)) throw Error('--repeat requires explicit --cases without --focus or full --browser.');
if (repeat === undefined && (attemptTimeout !== undefined || repeatTimeout !== undefined)) throw Error('Timeout options require --repeat.');
if (repeat !== undefined) repetitionOptions({count:repeat,attemptTimeout,totalTimeout:repeatTimeout});
const reduced = focus !== undefined || caseIds !== undefined;
const selection = reduced ? selectRenderingCases({groups:focus,cases:caseIds}) : undefined;
if (reduced && flags.includes('--browser')) throw Error('Choose --focus, --cases or full --browser verification.');
if (flags.includes('--list-cases')) {
  if (reduced || flags.length !== 1) throw Error('Use --list-cases by itself.');
  console.table(caseListing()); process.exit(0);
}
if (flags.some(flag => !['--quick', '--browser','--help'].includes(flag))) {
  console.error('Unknown option. Use npm run verify -- --help.');
  process.exit(1);
}
if (flags.includes('--help')) {
  console.log('npm run verify [-- --quick] [--browser]\nDefault: syntax, Node tests and launcher artifact tests.\n--focus GROUPS: syntax, Node tests and selected shared rendering groups.\n--cases IDS: syntax, Node tests and named cases including inseparable companions/controls.\n--list-cases: list IDs, groups and companions without launching a browser.\n--cases IDS --repeat 2..10: explicit fresh-browser attempts; any failure fails the aggregate.\n--attempt-timeout SECONDS (1..300, default 120); --repeat-timeout SECONDS (1..1800, default 600); work bounds, cleanup may extend them.\nReduced selections omit launchers, canonical smoke, lab UI and diagnostic self-tests; full --browser remains the release path.\n--quick: omit launcher tests.');
  process.exit(0);
}
const quick = flags.includes('--quick') || reduced;
const npm = process.env.npm_execpath;
if (!npm) {
  console.error('Start this command with npm run verify.');
  process.exit(1);
}
const results = [];
const testedSources = await sourceHashes();
const metrics = createMetrics({ category: 'verification', hashes: testedSources, scope: selection ? [selection.mode,...(caseIds?selection.requestedCases:selection.requestedGroups)] : ['syntax', 'unit', ...(quick ? [] : ['launchers']), ...(flags.includes('--browser') ? ['browser'] : [])] });
const finishRun = metrics.start('run', { artifact: 'research-artifacts/diagnostics/last-verification.json' });
async function run(name, executable, args) {
  console.log(`\n=== ${name} ===`);
  const start = performance.now();
  let code = 1;
  try {
    await metrics.measure(name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), async () => {
      code = await new Promise((resolve, reject) => {
        const child = spawn(executable, args, { cwd: root, stdio: 'inherit', windowsHide: true,
          env: { ...process.env, NDM_METRICS_SESSION: metrics.sessionId } });
        child.once('error', reject);
        child.once('exit', code => resolve(code ?? 1));
      });
      if (code) throw Error(`${name} failed (exit ${code}).`);
    });
  } finally {
    results.push({ name, code, seconds: ((performance.now() - start) / 1000).toFixed(2) });
  }

}
try {
  let python;
  if (!quick) {
    for (const [exe, args] of [['python', []], ['python3', []], ['py', ['-3']]]) {
      const probe = spawnSync(exe, [...args, '--version'], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 5000 });
      if (probe.status === 0 && /Python 3\./.test(probe.stdout + probe.stderr)) { python = [exe, args]; break; }
    }
    if (!python) throw Error('Python 3 is required for launcher artifact tests. Install it or use npm run verify -- --quick.');
  }
  await run('Syntax checks', process.execPath, [npm, 'run', 'check']);
  await run('Node tests', process.execPath, ['scripts/dev/run-unit.mjs']);
  if (python) await run('Launcher artifacts', python[0], [...python[1], '-m', 'unittest', 'discover', '-s', 'test', '-p', 'test_*.py', '-v']);
  if (flags.includes('--browser')) await run('Local rendering smoke', process.execPath, ['--experimental-websocket', 'scripts/dev/diagnose.mjs']);
  if (flags.includes('--browser')) await run('Lab interface and asset checks', process.execPath, ['--experimental-websocket', 'scripts/dev/diagnostics/check-ui.mjs']);
  if (flags.includes('--browser')) await run('Shared rendering regressions', process.execPath, ['--experimental-websocket', 'scripts/dev/diagnostics/check-rendering-cases.mjs']);
  if(flags.includes('--browser')) await run('Issue bundle checks',process.execPath,['--experimental-websocket','scripts/dev/diagnostics/check-issue.mjs']);
  if(flags.includes('--browser')) await run('Failure evidence checks',process.execPath,['--experimental-websocket','scripts/dev/diagnostics/check-failure.mjs']);
  if(flags.includes('--browser')) await run('Renderer identity checks',process.execPath,['--experimental-websocket','scripts/dev/diagnostics/check-identity.mjs']);
  if(flags.includes('--browser')) await run('Visual viewer checks',process.execPath,['--experimental-websocket','scripts/dev/diagnostics/check-visual-viewer.mjs']);
  if(flags.includes('--browser')) await run('Parent disconnect cleanup',process.execPath,['--experimental-websocket','scripts/dev/diagnostics/check-parent-disconnect.mjs']);
  if(flags.includes('--browser')) await run('Simulated Native source scheme',process.execPath,['--experimental-websocket','scripts/dev/diagnostics/check-source-scheme.mjs']);
  if(flags.includes('--browser')) await run('Stylesheet signature invalidation',process.execPath,['--experimental-websocket','scripts/dev/diagnostics/check-signature-invalidation.mjs']);
  if(flags.includes('--browser')) await run('Settled scroll collection',process.execPath,['--experimental-websocket','scripts/dev/diagnostics/check-empty-scroll.mjs']);
  if(focus) await run('Focused rendering: '+focus, process.execPath, ['--experimental-websocket','scripts/dev/diagnostics/check-rendering-cases.mjs','--groups',focus]);
  if(caseIds && repeat === undefined) await run('Selected rendering cases',process.execPath,['--experimental-websocket','scripts/dev/diagnostics/check-rendering-cases.mjs','--cases',caseIds]);
  if(repeat !== undefined) await run('Repeated rendering cases',process.execPath,['--experimental-websocket','scripts/dev/diagnostics/repeat-rendering-cases.mjs','--cases',caseIds,'--repeat',repeat,...(attemptTimeout?['--attempt-timeout',attemptTimeout]:[]),...(repeatTimeout?['--repeat-timeout',repeatTimeout]:[])]);
} catch (error) {
  console.error(`\nVerification failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  const finalSources = await sourceHashes();
  const unchanged = Object.keys(testedSources).every(key => testedSources[key] === finalSources[key]);
  if (!unchanged) { process.exitCode = 1; console.error('Verification sources changed during execution; this run cannot pass.'); }
  if (!process.exitCode) console.log(`\nVerification passed (${selection ? selection.mode+': '+(caseIds ?? focus) : quick ? 'quick' : 'standard'}). ${flags.includes('--browser') ? 'Local steady-state smoke checked; see its coverage limits.' : selection ? 'Explicit reduced scope checked; full release verification was not run.' : 'Browser rendering checks were not run.'}`);
  finishRun(process.exitCode ? 'failed' : 'passed');
  await mkdir(new URL('../../research-artifacts/diagnostics/', import.meta.url),{recursive:true});
  await writeFile(new URL('../../research-artifacts/diagnostics/last-verification.json',import.meta.url),JSON.stringify({sessionId:metrics.sessionId,metricsWriteMs:metrics.overheadMs,sources:{tested:testedSources,final:finalSources,unchanged,codeScope:['extension','scripts/dev','tools/diagnostics','test'],fixtureScope:['fixtures']},scope:selection ? {...selection,...(repeat!==undefined?{repetition:repetitionOptions({count:repeat,attemptTimeout,totalTimeout:repeatTimeout})}:{})} : flags,passed:!process.exitCode,results},null,2));
  for (const result of results) console.log(`${result.code ? 'FAIL' : 'PASS'}  ${result.name}: ${result.seconds}s`);
}
