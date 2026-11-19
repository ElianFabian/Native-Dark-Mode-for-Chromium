// Differential synthetic guard: a restyle must match a fresh classification
// of the same authored state. A read-only hook in an isolated renderer copy
// waits for actual queue completion; no production scheduling is altered.
import assert from 'node:assert/strict';
import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {launchBrowser,closeBrowser,root,until} from './browser.mjs';
import {startServer} from './server.mjs';
import {initializerFingerprint,expectedRendererIdentity,compareRendererIdentity} from './identity.mjs';
import {decodeScreenshotPng} from './png-pixels.mjs';
import {pixelDifference} from '../../../tools/diagnostics/pixel-diff.mjs';
const dir=path.join(root,'research-artifacts/diagnostics/signature-invalidation-'+Date.now());
await mkdir(dir,{recursive:true});
const extension=path.join(dir,'extension');await cp(path.join(root,'extension'),extension,{recursive:true});
const source=await readFile(process.env.NDM_SIGNATURE_RENDERER ?? path.join(extension,'website-theme.js'),'utf8');
const anchor='  requestPreset();';assert.equal(source.split(anchor).length,2);
const instrumented=source.replace(anchor,`  globalThis.__ndmSignatureQueues=()=>({active:!!preset, pending:pending.size, scanning:!!elements,
    idle:idleBatch!==undefined, viewport:viewportFrame!==undefined, dirty:dirtySurfaces.size,
    debounce:chromiumRefreshTimer!==undefined, deferred:deferredRefreshTimer!==undefined});\n${anchor}`);
await writeFile(path.join(extension,'website-theme.js'),instrumented);
const report={status:'running',sourceFingerprint:initializerFingerprint(source,'nativeDarkModeWebsiteTheme'),results:[]};
const server=await startServer();let browser,page;
async function capture(name){const png=Buffer.from((await page.send('Page.captureScreenshot',{format:'png'})).data,'base64');await writeFile(path.join(dir,name+'.png'),png);return decodeScreenshotPng(png);}
const facts=`(()=>Object.fromEntries(['pseudo','control','edge'].map(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return[id,{box:[r.x,r.y,r.width,r.height],layers:[null,'::before'].map(p=>{const s=getComputedStyle(e,p);return Object.fromEntries(['color','backgroundColor','borderColor','borderWidth','borderStyle','boxShadow','content'].map(k=>[k,s[k]]));})}]})))()`;
async function settle(active=true){let since;await until(async()=>{
  const state=(await browser.inRendererWorld(page,function(){return globalThis.__ndmSignatureQueues?.();}))[0]?.result;
  if(!state||state.active!==active||state.pending||state.scanning||state.idle||state.viewport||state.dirty||state.debounce||state.deferred){since=undefined;return false;}
  since??=performance.now();return performance.now()-since>=150;
},'signature queues drained',20000);}
try{
 browser=await launchBrowser(undefined,{extensionDirectory:extension});report.browser=browser.version.product;report.platform=process.platform;
 page=await browser.open('about:blank');await page.send('Emulation.setDeviceMetricsOverride',{width:1000,height:800,deviceScaleFactor:1,mobile:false});
 for(const theme of ['chromium','soft','contrast'])for(const level of ['off','maximum']){
  const url=server.base+'/fixtures/diagnostics/signature-invalidation.html';
  await browser.rule(url,'source');await page.send('Page.navigate',{url});await until(()=>page.evaluate("typeof changeFrame==='function'"),'fixture ready');
  const authored=await page.evaluate(facts);
  await browser.rule(url,theme,level);await settle();
  const expected=await expectedRendererIdentity();expected.initialized.renderer=initializerFingerprint(instrumented,'nativeDarkModeWebsiteTheme');
  const identity=compareRendererIdentity(expected,await browser.rendererIdentity(page));assert.equal(identity.status,'match');
  const initial=await page.evaluate(facts);
  // Establish both full-pass and idle signatures before the relevant mutation.
  await page.evaluate("document.getElementById('changes').textContent='/* prime */'");await settle();
  await page.evaluate('changeFrame(true)');await settle();const changed=await page.evaluate(facts);
  const changedPixels=await capture(theme+'-'+level+'-changed');
  await browser.rule(url,'source');await settle(false);const changedSource=await page.evaluate(facts);
  await browser.rule(url,theme,level);await settle();const fresh=await page.evaluate(facts);
  const freshPixels=await capture(theme+'-'+level+'-fresh');
  const pixels=pixelDifference(new Uint8ClampedArray(changedPixels.pixels),new Uint8ClampedArray(freshPixels.pixels),freshPixels.width,freshPixels.height,0);
  await page.evaluate('changeFrame(false)');await settle();const restored=await page.evaluate(facts);
  await browser.rule(url,'source');await settle(false);const off=await page.evaluate(facts);
  const row={theme,level,identity,pixels,authored,initial,changed,changedSource,fresh,restored,off};report.results.push(row);
  assert.deepEqual(changed,fresh,`${theme}/${level}: cached restyle differs from fresh classification`);
  assert.equal(pixels.changed,0,'Cached restyle pixels differ from fresh classification');
  assert.deepEqual(restored,initial,`${theme}/${level}: source restoration leaves stale paint`);
  assert.deepEqual(changed.control,initial.control,'Independent control changed');
  assert.deepEqual(off,authored,'Off did not restore authored state');
  assert.equal(await page.evaluate("document.querySelectorAll('[data-native-dark-mode-paint],[data-native-dark-mode-sampling]').length"),0,'Off left renderer markers');
  for(const id of Object.keys(authored))assert.deepEqual(changed[id].box,authored[id].box,'Geometry changed');
 }
 report.status='passed';console.log('Signature invalidation passed: three themes, Off/Maximum, generated/side borders, fresh-state equivalence and cleanup.');
}catch(error){report.status='failed';report.error=error.stack;process.exitCode=1;}
finally{try{report.cleanup=await closeBrowser(browser);}finally{await server.close();await writeFile(path.join(dir,'results.json'),JSON.stringify(report,null,2));console.log('Evidence: '+dir);}}
