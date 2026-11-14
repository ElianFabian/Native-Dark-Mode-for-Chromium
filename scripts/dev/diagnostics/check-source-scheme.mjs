// Functional source-context controls, not a machine-dependent speed threshold.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {launchBrowser,closeBrowser,root,until} from './browser.mjs';
import {startServer} from './server.mjs';
import {expectedRendererIdentity,compareRendererIdentity} from './identity.mjs';
const directory=path.join(root,'research-artifacts/diagnostics/source-scheme-'+Date.now());await mkdir(directory,{recursive:true});
const server=await startServer();let browser,page;const report={status:'running',scope:'Simulated Native source-context guards. Palette child-frame restoration observations remain separate pending research.',results:[]};
const expression=`(()=>{
 const child=document.querySelector('iframe').contentDocument,shadow=document.getElementById('shadow-host').shadowRoot;
 const roots=[document,shadow,child,child.getElementById('shadow-host').shadowRoot];
 const fields=e=>{const s=e.ownerDocument.defaultView.getComputedStyle(e),r=e.getBoundingClientRect();return[e.tagName,s.color,s.backgroundColor,s.colorScheme,s.opacity,r.width,r.height]};
 const paintTree=root=>[...root.querySelectorAll('*')].filter(e=>!e.matches('script,style,link,meta,template,noscript')).map(e=>{const view=e.ownerDocument.defaultView,s=view.getComputedStyle(e),r=e.getBoundingClientRect(),hasBox=e.getClientRects().length>0;return[e.tagName,...['color','webkitTextFillColor','backgroundColor','colorScheme','opacity','filter','boxShadow','fill','stroke','outlineStyle','outlineColor','outlineWidth','borderTopColor','borderRightColor','borderBottomColor','borderLeftColor','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','font','display','visibility'].map(p=>s[p]),hasBox,hasBox?r.x+view.scrollX:0,hasBox?r.y+view.scrollY:0,r.width,r.height]});
 const native=[...document.querySelectorAll('.panel')].map(e=>{const s=getComputedStyle(e.querySelector('button'));return[s.color,s.backgroundColor]});
 return{paintTrees:roots.map(paintTree),head:['head-dependent','head-independent'].map(id=>fields(document.getElementById(id))),main:[...document.querySelectorAll('button,input,select,a,.panel,.glyph,#tail')].map(fields),shadow:[...shadow.querySelectorAll('button,a')].map(fields),child:[...child.querySelectorAll('button,input,select,a')].map(fields),native,
 rootScheme:getComputedStyle(document.documentElement).colorScheme,childProbe:child.defaultView.getComputedStyle(child.documentElement).getPropertyValue('--native-dark-mode-chromium-active').trim(),
 childPalette:child.defaultView.getComputedStyle(child.documentElement).getPropertyValue('--native-dark-mode-palette-active').trim(),
 owned:roots.map(r=>r.querySelectorAll('[data-native-dark-mode-paint]').length)};
})()`;
async function stable(accepts,label){let previous,since=0;return until(async()=>{const facts=await page.evaluate(expression),key=JSON.stringify(facts),now=performance.now();if(!accepts(facts)){previous=undefined;return false;}if(key!==previous){previous=key;since=now;return false;}return now-since>=250&&facts;},label,20000);}
const geometry=f=>['main','shadow','child'].map(key=>f[key].map(row=>row.slice(-2)));
// Classification can legitimately need a different number of markers after a
// resample. Keep counts for activation/Off cleanup, and compare actual paint.
const paintFacts=({owned,...facts})=>facts;
try{
 browser=await launchBrowser();report.browser=browser.version.product;report.platform=process.platform;page=await browser.open('about:blank');await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 for(const theme of ['chromium'])for(const level of ['off','maximum']){
  const url=server.base+'/fixtures/diagnostics/source-scheme-sampling.html';await browser.rule(url,'source');await page.send('Page.navigate',{url});
  await until(()=>page.evaluate("document.documentElement?.dataset.fixtureReady==='yes'&&document.querySelector('iframe')?.contentDocument?.documentElement?.dataset.fixtureReady==='yes'"),'eligible source/child');
  const source=await stable(f=>f.owned.every(n=>n===0),'authored source stable');
  assert.deepEqual(source.native[0],source.native[1],'Source normal/light native controls must be equivalent for this probe');
  await page.evaluate(`(()=>{const record=window.sourceSchemeFrames={active:true,count:0,wrong:0};function tick(){if(!record.active)return;const s=getComputedStyle(document.documentElement),active=s.getPropertyValue('--native-dark-mode-chromium-active').trim()==='yes'||s.getPropertyValue('--native-dark-mode-palette-active').trim();if(active&&!document.documentElement.className){record.count++;if(!s.colorScheme.startsWith('dark'))record.wrong++;if(document.querySelector('[data-native-dark-mode-sampling~="source-scheme"]'))record.wrong++;}requestAnimationFrame(tick)}requestAnimationFrame(tick)})()`);
  await browser.rule(url,theme,level);
  const active=f=>theme==='chromium'?f.childProbe==='yes':f.childPalette===(theme==='soft'?'#252a34':'#080a0e');
  const first=await stable(f=>active(f)&&f.owned.every(n=>n>0),'themed document, shadow and child stable');
  assert.deepEqual(geometry(first),geometry(source),'Theme changed source geometry');
  if(theme==='chromium')assert.deepEqual(first.native[0],first.native[1],'Inherited normal source control no longer matches explicit light source control');
  for(const mode of ['author-light','author-dark']){
   await page.evaluate(`document.documentElement.className=${JSON.stringify(mode)}`);
   const state=await stable(active,'authored scheme state stable');assert.deepEqual(geometry(state),geometry(source));
   if(theme==='chromium'){assert.equal(state.rootScheme,mode==='author-light'?'light':'dark');assert.deepEqual(state.native[0],state.native[mode==='author-light'?1:2],'Authored native scheme context lost');}
  }
  await page.evaluate("document.documentElement.className='';document.querySelector('.panel a').focus()");
  assert.equal(await page.evaluate("document.activeElement===document.querySelector('.panel a')"),true);
  await stable(active,'focused source context');await page.evaluate('document.activeElement.blur()');
  const restored=await stable(active,'same source backing restored');assert.deepEqual(paintFacts(restored),paintFacts(first),'Sampling drift after source-scheme and focus changes');
  // A new visible subtree and window scrolling can share the next viewport flush.
  const firstLateFrame=await page.evaluate("new Promise(resolve=>{createLateSourceContext();document.querySelector('#tail').scrollIntoView({block:'center'});queueMicrotask(()=>requestAnimationFrame(()=>resolve({ink:getComputedStyle(lateSourceShadow.querySelector('span')).color,readable:getComputedStyle(lateSourceShadow.querySelector('.readable')).color,scheme:getComputedStyle(document.documentElement).colorScheme})))})");
  assert.notEqual(firstLateFrame.ink,'rgb(34, 34, 34)','New shadow label missed the foreground viewport pass');assert.equal(firstLateFrame.readable,'rgb(238, 238, 238)');assert.equal(firstLateFrame.scheme.split(' ')[0],'dark');
  await until(()=>page.evaluate("getComputedStyle(document.querySelector('.late-source-context span')).color!=='rgb(34, 34, 34)'"),'late label adapted');
  const late=await page.evaluate("(()=>{const e=document.querySelector('.late-source-context button'),s=getComputedStyle(e);return{native:[s.color,s.backgroundColor],scheme:getComputedStyle(document.documentElement).colorScheme}})()");
  assert.deepEqual(late.native,first.native[0],'Combined dirty/scroll sampling lost native source colors');assert.equal(late.scheme.split(' ')[0],'dark');
  const lateImageRead=()=>page.evaluate("Object.fromEntries([...document.querySelectorAll('[data-late-image]')].map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return[e.dataset.lateImage,{loaded:e.complete&&e.naturalWidth>0,filter:s.filter,background:s.backgroundColor,content:s.content,box:[r.width,r.height]}]}))");
  let lateImages,lastImages,sinceImages=0;
  await until(async()=>{const f=await lateImageRead(),key=JSON.stringify(f);if(!f.static.loaded||!f.pulse.loaded||f.static.filter==='none'||f.pulse.filter==='none'){lastImages=undefined;return false}if(key!==lastImages){lastImages=key;sinceImages=performance.now();return false}if(performance.now()-sinceImages<250)return false;lateImages=f;return true},'new static and opacity images adapted');
  assert.equal(lateImages.static.filter,lateImages.pulse.filter,'Inserted static/opacity source glyphs received different tints');
  for(const image of Object.values(lateImages)){assert.deepEqual(image.box,[160,56]);assert.equal(image.background,'rgba(0, 0, 0, 0)');assert.equal(image.content,'normal')}
  await page.evaluate("document.querySelector('.late-source-context').remove();scrollTo(0,0)");
  await until(()=>page.evaluate('lateSourceShadow.adoptedStyleSheets.length===0'),'detached new shadow sheets cleaned');
  await stable(active,'late subtree removed');
  const dirtyOnlyFrame=await page.evaluate("new Promise(resolve=>{createLateSourceContext('closed');queueMicrotask(()=>requestAnimationFrame(()=>resolve({closed:lateSourceShadow.host.shadowRoot===null,ink:getComputedStyle(lateSourceShadow.querySelector('span')).color,readable:getComputedStyle(lateSourceShadow.querySelector('.readable')).color,scheme:getComputedStyle(document.documentElement).colorScheme})))})");
  assert.equal(dirtyOnlyFrame.closed,true);
  assert.notEqual(dirtyOnlyFrame.ink,'rgb(34, 34, 34)','Dirty-only shadow label missed the foreground pass');assert.equal(dirtyOnlyFrame.readable,'rgb(238, 238, 238)');assert.equal(dirtyOnlyFrame.scheme.split(' ')[0],'dark');
  await page.evaluate("document.querySelector('.late-source-context').remove()");
  await until(()=>page.evaluate('lateSourceShadow.adoptedStyleSheets.length===0'),'dirty-only shadow sheets cleaned');
  await stable(active,'dirty-only subtree removed');
  await page.evaluate("(()=>{const script=document.createElement('script');script.type='application/x-ndm-probe';document.head.append(script)})()");
  const headChanged=await stable(f=>active(f)&&f.head[0][1]!==first.head[0][1],'head-dependent source ink updated');
  assert.deepEqual(headChanged.head[1],first.head[1],'Head script changed independent control');assert.deepEqual(geometry(headChanged),geometry(source));
  await page.evaluate("document.head.querySelector('script[type=\"application/x-ndm-probe\"]').remove()");
  const headRestored=await stable(f=>active(f)&&f.head[0][1]===first.head[0][1],'head-dependent source ink restored');assert.deepEqual(paintFacts(headRestored),paintFacts(first));
  await page.evaluate("document.querySelector('#tail').scrollIntoView({block:'center'})");const tail=await stable(active,'offscreen controls exposed');assert.deepEqual(geometry(tail),geometry(source));
  const frames=await page.evaluate('sourceSchemeFrames.active=false;({count:sourceSchemeFrames.count,wrong:sourceSchemeFrames.wrong})');assert.ok(frames.count>0);assert.equal(frames.wrong,0,'Source sampling scheme escaped across a browser frame');
  const identity=compareRendererIdentity(await expectedRendererIdentity(),await browser.rendererIdentity(page));assert.equal(identity.status,'match');assert.equal(identity.observed.preset,theme);assert.equal(identity.observed.separatorLevel,level);
  await browser.rule(url,'source');const off=await stable(f=>f.owned.every(n=>n===0)&&!f.childProbe&&!f.childPalette,'Off source restored');assert.deepEqual(off,source,'Off did not restore main/shadow/child source facts');
  report.results.push({theme,level,frames,source,first,restored,firstLateFrame,dirtyOnlyFrame,late,lateImages,headChanged,headRestored,tail,off,identity});
 }
 report.status='passed';console.log('Source scheme passed: native inherited/explicit colors, source geometry, main/shadow/child states, focus/restoration, Off and frame boundaries; Simulated Native at Off/Maximum. Evidence: '+directory);
}catch(error){report.status='failed';report.error=error.stack;throw error;}
finally{try{report.cleanup=await closeBrowser(browser);}finally{await server.close();await writeFile(path.join(directory,'results.json'),JSON.stringify(report,null,2));}}
