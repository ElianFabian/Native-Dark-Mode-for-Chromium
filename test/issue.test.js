import test from 'node:test';
import assert from 'node:assert/strict';
import { issueMarkdown } from '../tools/diagnostics/issue.mjs';
import { spawnSync } from 'node:child_process';
test('issue handoff is deterministic and distinguishes matched differences from unknown nodes',()=>{
  const original={key:'fixture:item',signature:'a:1:',bounds:[0,0,40,20],layers:[{pseudo:'',color:'black'}],
    context:[{key:'parent',tag:'section',layers:[{pseudo:'::after',opacity:'1'}]}]};
  const current=structuredClone(original);current.layers[0].color='white';current.context[0].layers[0].opacity='.2';
  const report={captures:[{id:'source',rows:[original]},{id:'themed',sourceId:'source',theme:'chromium',level:'off',scale:1,settled:true,
    rows:[current,{...current,key:'unmatched'}]}]};
  const before=structuredClone(report),text=issueMarkdown(report);
  assert.equal(text,issueMarkdown(report));assert.deepEqual(report,before);
  assert.match(text,/ancestor section ::after/);assert.match(text,/"original":"black"/);
  assert.match(text,/Unmatched node/);assert.match(text,/Matched nodes: 1\/2/);
});
test('focused verification rejects misspelled groups and conflicting full-suite flags',()=>{
  for(const args of [['--focus','borderz'],['--focus','borders','--browser']]) {
    const result=spawnSync(process.execPath,['scripts/dev/verify.mjs',...args],{encoding:'utf8',windowsHide:true});
    assert.notEqual(result.status,0);assert.match(result.stderr,/Use --focus|Choose --focus/);
  }
});
