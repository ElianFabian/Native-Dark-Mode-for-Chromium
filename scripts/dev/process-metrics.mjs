import { historyFile, readHistory, summarizeHistory } from './diagnostics/metrics.mjs';

if (process.argv.length > 2) throw Error('Use npm run metrics without arguments.');
const summary = summarizeHistory(readHistory());
console.log(`Local history: ${historyFile}`);
console.log(`Unfinished phases (running or interrupted): ${summary.unfinished}; invalid/partial lines: ${summary.invalidLines}`);
console.table(summary.phases.map(row => ({ ...row, summedMs: Math.round(row.summedMs), medianMs: Math.round(row.medianMs), slowestMs: Math.round(row.slowestMs) })));
console.log('Summed phase times overlap with parent phases and subprocesses; they are not elapsed session time. No previous result skips a test.');
