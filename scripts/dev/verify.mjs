import { spawn, spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const flags = process.argv.slice(2);
const focusIndex=flags.indexOf('--focus');
let focus;
if(focusIndex!==-1){focus=flags[focusIndex+1];if(!focus||focus.startsWith('--')||focus.split(',').some(g=>!['icons','borders','images','surfaces','states','contact','cards'].includes(g))) throw Error('Use --focus icons,borders,images,surfaces,states,contact,cards');flags.splice(focusIndex,2);}
if(focus&&flags.includes('--browser')) throw Error('Choose --focus or full --browser verification.');
if (flags.includes('--help')) {
  console.log('npm run verify [-- --quick] [--browser]\nDefault: syntax, Node tests and launcher artifact tests.\n--focus GROUPS: syntax, Node tests and selected shared rendering groups; excludes launcher, smoke and lab UI suites.\n--quick: omit launcher tests. --browser: also run the isolated local rendering smoke suite.');
  process.exit(0);
}
if (flags.some(flag => !['--quick', '--browser'].includes(flag))) {
  console.error('Unknown option. Use npm run verify -- --help.');
  process.exit(1);
}
const quick = flags.includes('--quick') || Boolean(focus);
const npm = process.env.npm_execpath;
if (!npm) {
  console.error('Start this command with npm run verify.');
  process.exit(1);
}
const results = [];
async function run(name, executable, args) {
  console.log(`\n=== ${name} ===`);
  const start = performance.now();
  const code = await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: root, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
  results.push({ name, code, seconds: ((performance.now() - start) / 1000).toFixed(2) });
  if (code) throw Error(`${name} failed (exit ${code}).`);
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
  if(focus) await run('Focused rendering: '+focus, process.execPath, ['--experimental-websocket','scripts/dev/diagnostics/check-rendering-cases.mjs','--groups',focus]);
  console.log(`\nVerification passed (${focus ? 'focused: '+focus : quick ? 'quick' : 'standard'}). ${flags.includes('--browser') ? 'Local steady-state smoke checked; see its coverage limits.' : focus ? 'Selected rendering groups checked; full release verification was not run.' : 'Browser rendering checks were not run.'}`);
} catch (error) {
  console.error(`\nVerification failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mkdir(new URL('../../research-artifacts/diagnostics/', import.meta.url),{recursive:true});
  await writeFile(new URL('../../research-artifacts/diagnostics/last-verification.json',import.meta.url),JSON.stringify({scope:focus?{groups:focus.split(',')}:flags,passed:!process.exitCode,results},null,2));
  for (const result of results) console.log(`${result.code ? 'FAIL' : 'PASS'}  ${result.name}: ${result.seconds}s`);
}
