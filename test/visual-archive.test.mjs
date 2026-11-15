import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm,readFile,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { archiveCapture,readVisual,listVisuals,selectVisualReference,visualCompatibility } from '../scripts/dev/diagnostics/visual-archive.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZQAAAABJRU5ErkJggg==','base64');
const metadata={provenance:'local-fixture',fixturePath:'/fixtures/test.html',theme:'chromium',level:'off',state:'default',action:'steady-state',browser:'fixed',platform:'test',viewport:[100,100],dpr:1,zoom:['1','1'],scroll:[0,0],crop:'viewport',fonts:'loaded',readiness:{fontsReady:true,visibleImagesReady:true},settled:true,identityStatus:'match',fixtureHash:'fixture',rendererHash:'renderer'};
const testParent=fileURLToPath(new URL('../research-artifacts/',import.meta.url));
async function temporary(t){const root=await mkdtemp(path.join(testParent,'ndm-visual-test-'));t.after(async()=>{assert.equal(path.dirname(root),path.resolve(testParent));await rm(root,{recursive:true,force:true});});return root;}
test('archive retains originals, lists case/state and refuses overwrites, traversal and live capture',async t=>{
  const root=await temporary(t),args={caseId:'control',runId:'run-1',captureId:'control/1/chromium/off/default',png,metadata};
  await archiveCapture(args,root);
  await assert.rejects(archiveCapture(args,root),/EEXIST/);
  await assert.rejects(archiveCapture({...args,caseId:'../escape'},root),/Invalid/);
  await assert.rejects(archiveCapture({...args,metadata:{provenance:'live'}},root),/local/);
  assert.equal((await listVisuals('control',root))[0].captureId,args.captureId);
  const original=await readVisual('control','run-1',args.captureId,root);assert.equal(original.image.width,1);
});
test('explicit references retain history and are not replaced by new candidates',async t=>{
  const root=await temporary(t),id='control/chromium/off';
  await archiveCapture({caseId:'control',runId:'run-1',captureId:id,png,metadata},root);
  const selected=await selectVisualReference('control','run-1',id,root);
  await archiveCapture({caseId:'control',runId:'run-2',captureId:id,png,metadata},root);
  const history=await readFile(path.join(root,'control/references/history.jsonl'),'utf8');
  assert.equal(history.trim().split('\n').length,1);assert.equal(JSON.parse(history).runId,selected.runId);
  await selectVisualReference('control','run-2',id,root);
  assert.equal((await readFile(path.join(root,'control/references/history.jsonl'),'utf8')).trim().split('\n').length,2);
});
test('compatibility flags changed conditions and unknown evidence independently of renderer revisions',()=>{
  const a={caseId:'control',metadata,image:{width:1,height:1}}, b=structuredClone(a);
  b.metadata.rendererHash='new';assert.equal(visualCompatibility(a,b).status,'compatible');assert.equal(visualCompatibility(a,b).rendererChanged,true);
  b.metadata.dpr=2;assert.equal(visualCompatibility(a,b).status,'incompatible');
  const c=structuredClone(a);delete c.metadata.fonts;assert.equal(visualCompatibility(a,c).status,'unknown');
  c.metadata={...metadata,settled:false};assert.equal(visualCompatibility(c,c).status,'unknown');
});
test('corrupted image data cannot silently become a selected reference',async t=>{
  const root=await temporary(t),id='control/off';
  const {directory}=await archiveCapture({caseId:'control',runId:'run-1',captureId:id,png,metadata},root);
  await writeFile(path.join(directory,'image.png'),'corrupt');
  await assert.rejects(selectVisualReference('control','run-1',id,root),/checksum/);
});

test('missing or invalid dimensions remain unknown; known equal dimensions are compatible',()=>{
  const original={caseId:'control',metadata,image:{width:1,height:1}};
  assert.equal(visualCompatibility(original,structuredClone(original)).status,'compatible');
  for(const dimension of ['width','height'])for(const value of [undefined,null,0,-1,1.5,Infinity,'1']){
    const missing=structuredClone(original);missing.image[dimension]=value;
    for(const [a,b]of [[missing,missing],[original,missing],[missing,original]]){
      const result=visualCompatibility(a,b);assert.equal(result.status,'unknown');assert.ok(result.unknown.includes('image.'+dimension));
    }
  }
});

test('essential capture conditions cannot pass when absent on either or both sides',()=>{
  const original={caseId:'control',metadata,image:{width:1,height:1}};
  for(const field of ['dpr','viewport','zoom','theme','level'])for(const value of [undefined,null]){
    const missing=structuredClone(original);missing.metadata[field]=value;
    for(const [a,b]of [[missing,missing],[original,missing],[missing,original]]){
      const result=visualCompatibility(a,b);assert.equal(result.status,'unknown');assert.ok(result.unknown.includes(field));
    }
  }
});
