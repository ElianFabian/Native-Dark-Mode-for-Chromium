import { readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startServer } from './server.mjs';
import { captureSuite } from './runner.mjs';
const server=await startServer();
try {
  const result=await captureSuite({base:server.base,url:server.base+'/fixtures/diagnostics/specimens.html?group=surfaces',
    selector:'[data-audit-id="image-text"]',issue:true,scales:[1],levels:['off'],themes:['chromium']});
  const report=JSON.parse(await readFile(path.join(result.directory,'capture.json'),'utf8'));
  const text=await readFile(path.join(result.directory,'issue.md'),'utf8');
  assert.equal(report.captures.length,2);
  const target=report.captures[1].rows.find(r=>r.key==='fixture:image-text');
  assert.ok(target.context.length>0&&target.context.length<=4);
  assert.equal(target.context[0].layers.length,3);
  assert.match(text,/"field":"textFill"/);
  assert.ok(report.captures.every(c=>c.screenshot===null&&c.settled));
  assert.ok(!JSON.stringify(report).includes('Check the actual region behind the letters'));
  assert.ok(!report.issue.url.includes('?'));
  await assert.rejects(captureSuite({base:server.base,url:server.base+'/fixtures/diagnostics/specimens.html?group=surfaces',
    selector:'#missing-element',issue:true,scales:[1],levels:['off'],themes:['chromium']}),/matched no element/);
  console.log('Issue bundle passed: source/themed differences, ancestor/pseudo evidence, label redaction, missing-selector failure and browser cleanup.');
} finally {await server.close();}
