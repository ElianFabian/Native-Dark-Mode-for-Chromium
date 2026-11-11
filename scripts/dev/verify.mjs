import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const flags = process.argv.slice(2);
if (flags.includes('--help')) {
  console.log('npm run verify [-- --quick] [--browser]\nDefault: syntax, Node tests and launcher artifact tests.\n--quick: omit launcher tests. --browser: also run the isolated local rendering smoke suite.');
  process.exit(0);
}
if (flags.some(flag => !['--quick', '--browser'].includes(flag))) {
  console.error('Unknown option. Use npm run verify -- --help.');
  process.exit(1);
}
const quick = flags.includes('--quick');
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
  await run('Node tests', process.execPath, ['--test']);
  if (python) await run('Launcher artifacts', python[0], [...python[1], '-m', 'unittest', 'discover', '-s', 'test', '-p', 'test_*.py', '-v']);
  if (flags.includes('--browser')) await run('Local rendering smoke', process.execPath, ['--experimental-websocket', 'scripts/dev/diagnose.mjs']);
  if (flags.includes('--browser')) await run('Lab interface and asset checks', process.execPath, ['--experimental-websocket', 'scripts/dev/diagnostics/check-ui.mjs']);
  if (flags.includes('--browser')) await run('Shared rendering regressions', process.execPath, ['--experimental-websocket', 'scripts/dev/diagnostics/check-rendering-cases.mjs']);
  console.log(`\nVerification passed (${quick ? 'quick' : 'standard'}). ${flags.includes('--browser') ? 'Local steady-state smoke checked; see its coverage limits.' : 'Browser rendering checks were not run.'}`);
} catch (error) {
  console.error(`\nVerification failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  for (const result of results) console.log(`${result.code ? 'FAIL' : 'PASS'}  ${result.name}: ${result.seconds}s`);
}
