// Pending regression: this standalone check intentionally reports the current defect.
// Natural class mutations only; isolated renderer copy has a read-only queue hook.
import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {launchBrowser,closeBrowser,root,until} from './browser.mjs';
import {startServer} from './server.mjs';
import {initializerFingerprint,expectedRendererIdentity,compareRendererIdentity} from './identity.mjs';
const dir=path.join(root,'research-artifacts/diagnostics/sampling-batch-inheritance-'+Date.now());await mkdir(dir,{recursive:true});
const ext=path.join(dir,'extension');await cp(path.join(root,'extension'),ext,{recursive:true});
let s=await readFile(process.env.NDM_BATCH_RENDERER ?? path.join(ext,'website-theme.js'),'utf8');
const sourceFingerprint=initializerFingerprint(s,'nativeDarkModeWebsiteTheme');
assert.equal(s.split('  requestPreset();').length,2);
s=s.replace('  requestPreset();',`  globalThis.__batchProbe={read(){return{active:!!preset,pending:pending.size,scanning:!!elements,idle:idleBatch!==undefined,viewport:viewportFrame!==undefined,dirty:dirtySurfaces.size,refresh:chromiumRefreshTimer!==undefined||deferredRefreshTimer!==undefined}}};\n  requestPreset();`);
await writeFile(path.join(ext,'website-theme.js'),s);
const report={status:'running',renderer:process.env.NDM_BATCH_RENDERER?'candidate':'production',sourceFingerprint,scope:'Synthetic batch-context probe using unused-class mutations and natural scheduling; not live equivalence.',results:[]};
const server=await startServer();let browser,page;
async function drain(active=true){let since;await until(async()=>{const r=(await browser.inRendererWorld(page,function(){return __batchProbe.read()}))[0]?.result;if(!r||r.active!==active||Object.entries(r).some(([k,v])=>k!=='active'&&v)){since=undefined;return false}since??=performance.now();return performance.now()-since>150},'drain',20000)}
const facts=()=>page.evaluate(`(()=>Object.fromEntries(['message','label','control'].map(id=>{const e=document.getElementById(id),s=getComputedStyle(e),r=e.getBoundingClientRect();return[id,{color:s.color,background:s.backgroundColor,fill:s.webkitTextFillColor,box:[r.x,r.y,r.width,r.height]}]})))()`);
try{
 browser=await launchBrowser(undefined,{extensionDirectory:ext});report.browser=browser.version.product;page=await browser.open('about:blank');
 await page.send('Emulation.setDeviceMetricsOverride',{width:1000,height:800,deviceScaleFactor:1,mobile:false});
 const url=server.base+'/fixtures/diagnostics/sampling-batch-inheritance.html';
 for(const theme of ['chromium','soft','contrast'])for(const level of ['off','maximum']){
  await browser.rule(url,'source');await page.send('Page.navigate',{url});await until(()=>page.evaluate("!!document.getElementById('label')"),'fixture');const authored=await facts();
  assert.equal(authored.label.color,'rgb(204, 12, 57)');assert.equal(authored.message.background,'rgb(255, 255, 255)');
  await browser.rule(url,theme,level);await drain();const initial=await facts();
  const expected=await expectedRendererIdentity();expected.initialized.renderer=initializerFingerprint(s,'nativeDarkModeWebsiteTheme');const identity=compareRendererIdentity(expected,await browser.rendererIdentity(page));assert.equal(identity.status,'match');
  const states=[];
  for(const ids of [['message','label'],['label'],['message','label'],['label']]){
   await page.evaluate(ids.length===2?'resampleMessage()':'resampleLabel()');await drain();states.push({ids,paint:await facts()});
  }
  for(const state of states){assert.deepEqual(state.paint.control,initial.control);for(const id of ['message','label','control'])assert.deepEqual(state.paint[id].box,authored[id].box)}
  await browser.rule(url,'source');await drain(false);assert.deepEqual(await facts(),authored);
  const row={theme,level,authored,initial,states,identity};report.results.push(row);console.log(JSON.stringify({theme,level,label:states.map(x=>x.paint.label.color),background:states.map(x=>x.paint.message.background)}));
 }
 report.mismatches=report.results.filter(row=>row.states.some(state=>JSON.stringify(row.states[0].paint)!==JSON.stringify(state.paint))).map(row=>({theme:row.theme,level:row.level,parentAndLabel:row.states[0].paint.label,labelOnly:row.states[1].paint.label}));
 assert.equal(report.mismatches.length,0,'Pending defect: settled paint depends on sampling batch membership');
 report.status='passed';
}catch(e){report.status='failed';report.error=e.stack;process.exitCode=1}finally{try{report.cleanup=await closeBrowser(browser)}finally{await server.close();await writeFile(path.join(dir,'results.json'),JSON.stringify(report,null,2));console.log('Evidence: '+dir)}}
