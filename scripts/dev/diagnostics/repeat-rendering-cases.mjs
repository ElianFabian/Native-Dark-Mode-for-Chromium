import { repeatRenderingCases, repetitionOptions } from './repetitions.mjs';
import { selectRenderingCases } from './case-selection.mjs';

const args = process.argv.slice(2), options = {};
for (let index = 0; index < args.length; index += 2) {
  const name = args[index];
  if (!['--cases','--repeat','--attempt-timeout','--repeat-timeout'].includes(name) || Object.hasOwn(options,name) ||
    !args[index+1] || args[index+1].startsWith('--')) throw Error('Use --cases IDS --repeat 2..10 [--attempt-timeout SECONDS] [--repeat-timeout SECONDS]');
  options[name] = args[index+1];
}
if (!options['--cases'] || !options['--repeat']) throw Error('Explicit --cases and --repeat are required.');
selectRenderingCases({cases:options['--cases']});
repetitionOptions({count:options['--repeat'],attemptTimeout:options['--attempt-timeout'],totalTimeout:options['--repeat-timeout']});
const result = await repeatRenderingCases({cases:options['--cases'],count:options['--repeat'],attemptTimeout:options['--attempt-timeout'],
  totalTimeout:options['--repeat-timeout'],sessionId:process.env.NDM_METRICS_SESSION});
if (!result.passed) process.exitCode = 1;
