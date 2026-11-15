import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { repeatAttempts, repetitionOptions } from '../scripts/dev/diagnostics/repetitions.mjs';
import { failureSignature } from '../scripts/dev/diagnostics/failure.mjs';

test('repeat bounds reject invalid, fractional, infinite and excessive work', () => {
  assert.deepEqual(repetitionOptions({count:'2'}), {count:2,attemptTimeoutMs:120000,totalTimeoutMs:600000});
  for(const count of ['0','1','11','2.5','Infinity','2x',''])assert.throws(()=>repetitionOptions({count}));
  for(const attemptTimeout of ['0','301','1.2','NaN'])assert.throws(()=>repetitionOptions({count:2,attemptTimeout}));
  assert.throws(()=>repetitionOptions({count:2,totalTimeout:'1801'}));
});

test('alternating failures and passes retain every attempt and never retry to green', async () => {
  const saved=[], completed=[];
  const report=await repeatAttempts({count:4,attemptTimeoutMs:100,totalTimeoutMs:1000,
    persist:async value=>saved.push(value),onAttemptComplete:async attempt=>completed.push(attempt.status),
    execute:async({number})=>({status:number%2?'failed':'passed',runDirectory:'attempt-'+number,cleanup:'complete'})});
  assert.equal(report.status,'unstable'); assert.equal(report.attempts.length,4);
  assert.deepEqual(completed,['failed','passed','failed','passed']);
  assert.deepEqual(report.attempts.map(a=>a.runDirectory),['attempt-1','attempt-2','attempt-3','attempt-4']);
  for(let number=1;number<=4;number++)assert.ok(saved.some(s=>s.attempts[number-1]?.status==='running'));
  assert.equal(saved.at(-1).status,'unstable');assert.equal(saved[0].attempts.length,0);
});

test('all-pass and all-fail outcomes stay distinct and execute the requested count', async () => {
  for(const status of ['passed','failed']){
    let calls=0;
    const report=await repeatAttempts({count:3,attemptTimeoutMs:100,totalTimeoutMs:1000,persist:async()=>{},
      execute:async()=>{calls++;return{status,cleanup:'complete'}}});
    assert.equal(calls,3);assert.equal(report.status,status);
  }
});

test('heterogeneous error signatures are retained without redefining all-failed', async () => {
  const first = failureSignature(Error('First failure'), 'control');
  const second = failureSignature(Error('Second failure'), 'control');
  assert.deepEqual(first, failureSignature(Error('First failure'), 'control')); assert.notDeepEqual(first, second);
  assert.doesNotMatch(JSON.stringify(first), /First failure/);
  const report = await repeatAttempts({ count: 3, attemptTimeoutMs: 100, totalTimeoutMs: 1000, persist: async () => {},
    execute: async ({ number }) => ({ status: 'failed', cleanup: 'complete', failureSignature: number === 2 ? second : first }) });
  assert.equal(report.status, 'failed');
  assert.deepEqual(report.failureGroups, [{ signature: first, attempts: [1,3] }, { signature: second, attempts: [2] }]);
});

test('total budget caps active work and leaves missing attempts incomplete', async () => {
  let clock=0;const limits=[];
  const report=await repeatAttempts({count:3,attemptTimeoutMs:500,totalTimeoutMs:150,now:()=>clock,persist:async()=>{},
    execute:async({timeoutMs})=>{limits.push(timeoutMs);clock+=timeoutMs;return{status:'timed-out',cleanup:'complete'}}});
  assert.deepEqual(limits,[150]);assert.equal(report.status,'incomplete');
  assert.equal(report.stopReason,'time-budget-exhausted');assert.equal(report.attempts.length,1);
});

test('cleanup gaps, source drift and infrastructure exceptions stop subsequent attempts', async () => {
  for(const result of [{status:'timed-out',cleanup:'unconfirmed'},{status:'incompatible',cleanup:'complete'},null]){
    let calls=0;
    const report=await repeatAttempts({count:3,attemptTimeoutMs:100,totalTimeoutMs:1000,persist:async()=>{},
      execute:async()=>{calls++;if(!result)throw Error('private failure details');return result}});
    assert.equal(calls,1);assert.equal(report.status,'incomplete');assert.ok(report.stopReason);
    assert.doesNotMatch(JSON.stringify(report),/private failure/);
  }
});

test('fresh-state claims require unique browser/profile identities and an empty initial rule list', async () => {
  const report=await repeatAttempts({count:3,attemptTimeoutMs:100,totalTimeoutMs:1000,persist:async()=>{},metadata:{requireFreshIsolation:true},
    execute:async()=>({status:'passed',cleanup:'complete',isolation:{browserInstanceId:'same',profileId:'same',initialRuleCount:0}})});
  assert.equal(report.status,'incomplete');assert.equal(report.attempts[0].status,'passed');assert.equal(report.attempts[1].status,'incompatible');
  const contaminated=await repeatAttempts({count:2,attemptTimeoutMs:100,totalTimeoutMs:1000,persist:async()=>{},metadata:{requireFreshIsolation:true},
    execute:async()=>({status:'failed',cleanup:'complete',isolation:{browserInstanceId:'new',profileId:'new',initialRuleCount:1}})});
  assert.equal(contaminated.status,'incomplete');assert.equal(contaminated.attempts[0].status,'incompatible');assert.equal(contaminated.attempts.length,1);
});

test('repeat CLI requires named cases and rejects invalid limits before any browser work', () => {
  const root=fileURLToPath(new URL('../',import.meta.url)), env={...process.env};delete env.npm_execpath;
  for(const args of [['--repeat','2'],['--cases','unknown','--repeat','2'],['--cases','embedded-vector-caption','--repeat','1'],
    ['--cases','embedded-vector-caption','--repeat','2','--browser'],['--focus','icons','--repeat','2'],
    ['--cases','embedded-vector-caption','--attempt-timeout','1'],['--cases','embedded-vector-caption','--repeat','2','--repeat-timeout','0']]){
    const result=spawnSync(process.execPath,['scripts/dev/verify.mjs',...args],{cwd:root,env,encoding:'utf8',windowsHide:true});
    assert.notEqual(result.status,0);assert.doesNotMatch(result.stdout,/Syntax checks|Repetition 1/);
  }
});
