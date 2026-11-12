// Independent fixture expectations: sample displayed ink, retain negative controls,
// and assert computed geometry instead of trusting renderer classification tokens.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startServer } from './server.mjs';
import { launchBrowser, root, until } from './browser.mjs';
import { color, contrast, composite } from '../../../tools/diagnostics/analysis.mjs';
const groups = ['icons','borders','images','surfaces','states','contact','cards'];
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--groups')) throw Error('Use --groups icons,borders,images,surfaces,states,contact,cards');
const selected = args.length ? args[1].split(',') : groups;
if (!selected.length || selected.some(g=>!groups.includes(g)) || new Set(selected).size!==selected.length) throw Error('Invalid rendering groups');
const wanted = group => selected.includes(group);
const started = performance.now();
const server = await startServer(), browser = await launchBrowser(), results = [];
const directory = path.join(root, 'research-artifacts', 'diagnostics'); await mkdir(directory, { recursive: true });
try {
  const page = await browser.open('about:blank');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 1000, deviceScaleFactor: 1, mobile: false });
  async function settled(read, accepts, label) {
    let previous, since=0;
    return until(async()=>{
      const facts=await read(),key=JSON.stringify(facts),now=performance.now();
      if(!accepts(facts)){previous=undefined;since=0;return false;}
      if(key!==previous){previous=key;since=now;return false;}
      return now-since>=200&&facts;
    },label);
  }
  async function open(group) {
    const url = `${server.base}/fixtures/diagnostics/specimens.html?group=${group}`;
    await browser.rule(url, 'source'); await page.send('Page.navigate', { url });
    await until(() => page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"), 'fixture ' + group);
    await page.evaluate('Promise.all([...document.images].map(i=>i.decode()))'); return url;
  }
  if(wanted('icons')||wanted('images')||wanted('states')){
    const url=server.base+'/fixtures/diagnostics/embedded-svg-wordmark.html';await browser.rule(url,'source');await page.send('Page.navigate',{url});await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'embedded vector caption source');
    const read=()=>page.evaluate("(()=>({body:getComputedStyle(document.body).backgroundColor,items:Object.fromEntries([...document.querySelectorAll('[data-audit-id]')].map(e=>{const s=getComputedStyle(e);return[e.dataset.auditId,{image:s.backgroundImage,display:s.display,bg:s.backgroundColor,opacity:s.opacity,parentOpacity:getComputedStyle(e.parentElement).opacity,box:[e.clientWidth,e.clientHeight],size:s.backgroundSize,position:s.backgroundPosition}]}))}))()");const source=await read();
    for(const theme of ['chromium','soft','contrast'])for(const level of ['off','maximum']){
      await browser.rule(url,theme,level);const f=await settled(read,f=>color(f.body)[0]<128&&f.items.reported.image!==source.items.reported.image,theme+' visible vector caption');
      if(f.items['hidden-caption'].display!=='none')throw Error('Hidden HTML caption was made visible');
      for(const[id,item]of Object.entries(f.items)){
        for(const prop of ['box','opacity','parentOpacity','size','position'])if(JSON.stringify(item[prop])!==JSON.stringify(source.items[id][prop]))throw Error('Vector-caption source geometry/opacity/crop changed '+id+'/'+prop);
        if(id!=='reported'&&item.image!==source.items[id].image)throw Error('Vector-caption preservation control changed '+id);
      }
      if(color(f.items.reported.bg)[3]!==0)throw Error('Vector caption gained a rectangular backing');
      const pixels=await page.evaluate(`(async()=>{const source=${JSON.stringify(source.items.reported.image)}.slice(5,-2),applied=getComputedStyle(document.querySelector('[data-audit-id=reported]')).backgroundImage.slice(5,-2),metadata=u=>{const s=new DOMParser().parseFromString(decodeURIComponent(u.slice(u.indexOf(',')+1)),'image/svg+xml');return{geometry:[...s.querySelectorAll('svg,path')].map(e=>[e.tagName,e.getAttribute('d'),e.getAttribute('viewBox'),e.getAttribute('width'),e.getAttribute('height')]),stops:[...s.querySelectorAll('stop')].map(e=>e.outerHTML)}};const a=metadata(source),b=metadata(applied);if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Original vector paths/gradient changed');const render=async u=>{const i=new Image();i.src=u;await i.decode();const c=document.createElement('canvas');c.width=139;c.height=18;const x=c.getContext('2d');x.drawImage(i,0,0);return x.getImageData(0,0,139,18).data};const [original,repaired]=await Promise.all([render(source),render(applied)]);let gray=0,blue=0;for(let n=0;n<original.length;n+=4){if(Math.abs(original[n+3]-repaired[n+3])>1)throw Error('Vector alpha changed');const v=[...original.slice(n,n+3)];if(original[n+3]>=224&&Math.max(...v)-Math.min(...v)<=12&&v[0]>=50&&v[0]<=130){gray++;if(Math.min(...repaired.slice(n,n+3))<235)throw Error('Visible gray caption still dim')}if(original[n+3]>=32&&Math.max(...v)-Math.min(...v)>45){blue++;if(v.some((c,i)=>Math.abs(c-repaired[n+i])>1))throw Error('Brand gradient pixels recolored')}}return{gray,blue}})()`);
      if(pixels.gray<8||pixels.blue<8)throw Error('Missing original neutral/gradient pixel evidence');
      await page.evaluate("document.querySelector('.examples').classList.toggle('resample')");await settled(read,g=>g.items.reported.image===f.items.reported.image,theme+' stable embedded caption');
      if(level==='off')await writeFile(path.join(directory,'embedded-svg-caption-'+theme+'.png'),Buffer.from((await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
      results.push({case:'embedded-vector-caption',theme,level,pixels,passed:true});
    }
  }
  if(wanted('icons')||wanted('states')){
    const url=server.base+'/fixtures/diagnostics/background-crop-burst.html';
    for(const theme of ['chromium','soft','contrast']){
      await browser.rule(url,'source');await page.send('Network.enable');await page.send('Network.emulateNetworkConditions',{offline:false,latency:120,downloadThroughput:-1,uploadThroughput:-1});
      try{
        await page.send('Page.navigate',{url});await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'background capacity workload');
        const source=await page.evaluate("[...document.querySelectorAll('[data-probe]')].map(e=>[getComputedStyle(e).backgroundImage,e.clientWidth,e.clientHeight])");
        const start=performance.now();await browser.rule(url,theme);
        await until(()=>page.evaluate("[...document.querySelectorAll('[data-probe]')].every(e=>getComputedStyle(e).filter!=='none')"),theme+' capacity retries without hover',10000);
        const facts=await page.evaluate("({items:[...document.querySelectorAll('[data-probe]')].map(e=>[getComputedStyle(e).backgroundImage,e.clientWidth,e.clientHeight]),negative:getComputedStyle(document.querySelector('[data-negative]')).filter})");
        if(JSON.stringify(facts.items)!==JSON.stringify(source)||facts.negative!=='none')throw Error('Capacity retry changed resource/geometry/disabled crop');
        results.push({case:'background-crop-capacity-retry',theme,elapsed:performance.now()-start,passed:true});
      }finally{await page.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1})}
    }
  }
  if(wanted('icons')||wanted('borders')||wanted('states')){
    const url=server.base+'/fixtures/diagnostics/compact-action-paint.html';await browser.rule(url,'source');await page.send('Page.navigate',{url});await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'compact action source');
    const read=()=>page.evaluate("(()=>({body:getComputedStyle(document.body).backgroundColor,items:Object.fromEntries([...document.querySelectorAll('[data-audit-id]')].map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return[e.dataset.auditId,{ink:s.color,fill:s.webkitTextFillColor,bg:s.backgroundColor,edge:s.borderTopColor,width:s.borderTopWidth,shadow:s.boxShadow,filter:s.filter,image:s.backgroundImage,size:s.backgroundSize,position:s.backgroundPosition,opacity:s.opacity,glyph:getComputedStyle(e,'::before').color,box:[r.width,r.height],xy:[r.x,r.y],parent:getComputedStyle(e.parentElement).backgroundColor}]}))}))()");
    const source=await read();
    for(const theme of ['chromium','soft','contrast']){let off;
      for(const level of ['off','maximum']){
        await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0});await browser.rule(url,theme,level);
        const f=await settled(read,f=>color(f.body)[0]<128&&['dropdown','right','quantity-arrow'].every(id=>f.items[id].filter!=='none'),theme+' compact sprites');
        if(level==='off')off=f;
        for(const[id,item]of Object.entries(f.items))if(item.width!==source.items[id].width||item.opacity!==source.items[id].opacity||JSON.stringify(item.box)!==JSON.stringify(source.items[id].box)||item.image!==source.items[id].image||item.size!==source.items[id].size||item.position!==source.items[id].position)throw Error('Compact control source geometry/resource/state changed '+id);
        if(contrast(color(f.items['standalone-font-arrow'].glyph),color(f.body))<6.99)throw Error('Neutral standalone font glyph remains dim');
        if(['unpaired','disabled','mixed','visible-overlay'].some(id=>f.items[id].filter!=='none'))throw Error('Unsupported compact sprite tinted');
        for(const id of ['dropdown-frame','quantity-frame'])if(level==='off'&&contrast(color(f.items[id].edge),color(f.items[id].bg))>contrast(color(source.items[id].edge),color(source.items[id].bg))+.15)throw Error('Split frame acquired glyph-white emphasis in Off');
        if(level==='maximum'&&(!['dropdown-frame','quantity-frame'].every(id=>f.items[id].shadow.includes('inset'))||color(f.items.signin.edge)[3]<=color(off.items.signin.edge)[3]))throw Error('Action frames ignore emphasis '+JSON.stringify({theme,off:off.items.signin,now:f.items.signin,dropdown:f.items['dropdown-frame']}));
        if(theme==='chromium'&&f.items['bright-picture-action'].ink!==source.items['bright-picture-action'].ink)throw Error('Weak glass fill over an unchanged bright picture lost source ink');
        if(parseFloat(f.items['glass-decoration'].width)!==0||f.items['glass-decoration'].shadow!=='none')throw Error('Unframed glass decoration gained an action frame');
        if(contrast(color(f.items['short-label'].fill),color(f.items['short-label'].parent))<Math.min(14,contrast([255,255,255,1],color(f.items['short-label'].parent)))-.1)throw Error('Short action label remains dim');
        const [x,y]=f.items.signin.xy,[width,height]=f.items.signin.box;await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+width/2,y:y+height/2});
        const hover=await settled(read,g=>color(g.items.signin.ink)[0]>180&&g.items['signin-icon'].glyph===g.items.signin.ink,theme+' glass hover label and inherited font glyph');
        if(JSON.stringify(hover.items.signin.box)!==JSON.stringify(source.items.signin.box))throw Error('Hover changed source geometry');
        const samples=await page.evaluate("(async()=>{const out=[];for(const id of ['dropdown','right','quantity-arrow']){const e=document.querySelector('[data-audit-id='+id+']'),s=getComputedStyle(e),i=new Image();i.src=s.backgroundImage.slice(5,-2);await i.decode();const c=document.createElement('canvas');c.width=e.clientWidth;c.height=e.clientHeight;const x=c.getContext('2d');x.filter=s.filter;const [left,top]=s.backgroundPosition.split(' ').map(parseFloat);x.drawImage(i,left,top,400,900);const p=x.getImageData(0,0,c.width,c.height).data;const at=p.findIndex((v,n)=>n%4===3&&v>=224)-3;out.push({id,ink:at<0?null:[...p.slice(at,at+3),p[at+3]/255]})}return out})()");
        if(samples.some(p=>!p.ink||contrast(composite(p.ink,composite(color(f.items[p.id].parent),color(f.body))),composite(color(f.items[p.id].parent),color(f.body)))<4.5))throw Error('Actual compact raster ink remains dark '+JSON.stringify({theme,level,samples,parents:samples.map(p=>f.items[p.id].parent),body:f.body}));
        if(level==='off')await writeFile(path.join(directory,'compact-actions-'+theme+'.png'),Buffer.from((await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
        results.push({case:'compact-action-followup',theme,level,passed:true});
      }
    }
  }
  if(wanted('images')||wanted('icons')){
    const url=server.base+'/fixtures/diagnostics/static-masked-logo.html';await browser.rule(url,'source');await page.send('Page.navigate',{url});await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'static masked logo');
    const read=()=>page.evaluate("(()=>({body:getComputedStyle(document.body).backgroundColor,items:Object.fromEntries([...document.images].map(e=>{const r=e.getBoundingClientRect();return[e.dataset.auditId,{src:e.currentSrc,filter:getComputedStyle(e).filter,box:[r.width,r.height]}]}))}))()");const source=await read();
    for(const theme of ['chromium','soft','contrast'])for(const level of ['off','maximum']){
      await browser.rule(url,theme,level);const f=await settled(read,f=>color(f.body)[0]<128&&f.items.logo.filter!=='none',theme+' static masked logo ink');
      for(const[id,item]of Object.entries(f.items))if(item.src!==source.items[id].src||JSON.stringify(item.box)!==JSON.stringify(source.items[id].box))throw Error('Static masked image source/geometry changed');
      if(['readable','mixed'].some(id=>f.items[id].filter!=='none'))throw Error('Readable/mixed mask control tinted');
      const pixel=await page.evaluate("(async()=>{const e=document.querySelector('[data-audit-id=logo]'),c=document.createElement('canvas');c.width=e.naturalWidth;c.height=e.naturalHeight;const x=c.getContext('2d');x.filter=getComputedStyle(e).filter;x.drawImage(e,0,0);const p=x.getImageData(0,0,c.width,c.height).data;const n=p.findIndex((v,i)=>i%4===3&&v===255)-3;return [...p.slice(n,n+3),1]})()");
      if(contrast(pixel,color(f.body))<7)throw Error('Displayed masked logo remains dark');results.push({case:'static-internal-mask',theme,level,passed:true});
    }
  }
  if(wanted('states')||wanted('surfaces')){
    const url=server.base+'/fixtures/diagnostics/embedded-count.html';await browser.rule(url,'source');await page.send('Page.navigate',{url});await until(()=>page.evaluate("document.querySelectorAll('iframe').length===2&&[...document.querySelectorAll('iframe')].every(f=>f.contentDocument?.documentElement?.dataset.fixtureReady==='yes')"),'embedded source canvases');
    const read=()=>page.evaluate("(()=>({body:getComputedStyle(document.body).backgroundColor,frames:[...document.querySelectorAll('iframe')].map(f=>{const d=f.contentDocument;return{root:getComputedStyle(d.documentElement).backgroundColor,body:getComputedStyle(d.body).backgroundColor,count:getComputedStyle(d.querySelector('.gh-count')).backgroundColor,box:[d.querySelector('.gh-count').getBoundingClientRect().width,d.querySelector('.gh-count').getBoundingClientRect().height],rect:f.getBoundingClientRect().toJSON()}})}))()");const source=await read();
    for(const theme of ['chromium','soft','contrast']){
      await browser.rule(url,theme);const f=await settled(read,f=>color(f.body)[0]<128&&color(f.frames[0].root)[3]===0&&color(f.frames[0].body)[3]===0&&color(f.frames[1].body)[3]===1,theme+' transparent embedded canvas').catch(async error=>{throw Error(error.message+' '+JSON.stringify(await read()))});
      if(f.frames.some((n,i)=>JSON.stringify(n.box)!==JSON.stringify(source.frames[i].box)))throw Error('Counter geometry changed');
      const {data}=await page.send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(directory,'embedded-count-'+theme+'.png'),Buffer.from(data,'base64'));
      const [r]=f.frames.map(f=>f.rect),pixel=await page.evaluate(`(async()=>{const i=new Image();i.src='data:image/png;base64,${data}';await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);return [...x.getImageData(${Math.floor(r.x+180)},${Math.floor(r.y+35)},1,1).data]})()`);
      if(pixel.slice(0,3).some((v,i)=>Math.abs(v-color(f.body)[i])>1))throw Error('Transparent iframe still has a rectangular pixel backing '+theme+'/'+pixel);results.push({case:'transparent-embedded-canvas',theme,passed:true});
    }
  }
  if(wanted('states')){
    const url=server.base+'/fixtures/diagnostics/popup-opening.html';
    for(const theme of ['chromium','soft','contrast']){
      await browser.rule(url,'source');await page.send('Page.navigate',{url});await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'popup source');
      const source=await page.evaluate("(()=>{const d=document.querySelector('.decorative');return{color:getComputedStyle(d).backgroundColor,disabled:document.querySelector('[aria-disabled=true]').getAttribute('aria-disabled')}})()");
      await browser.rule(url,theme);await until(()=>page.evaluate("getComputedStyle(document.body).backgroundColor!=='rgb(255, 255, 255)'"),'popup active');
      const trace=await page.evaluate("new Promise(resolve=>{const menu=document.querySelector('.menu'),out=[];let n=0;const tick=()=>{if(n===0)menu.style.display='block';if(n===4)document.body.classList.add('scrolled');queueMicrotask(()=>out.push({n,bg:getComputedStyle(menu).backgroundColor,inks:[...menu.querySelectorAll('[role^=menuitem]')].map(e=>getComputedStyle(e).color),sticky:getComputedStyle(document.querySelector('.sticky')).backgroundColor}));if(++n<10)requestAnimationFrame(tick);else setTimeout(()=>resolve(out),0)};requestAnimationFrame(tick)})");
      if(trace.slice(1).some(f=>color(f.bg)[0]>=128||f.inks.some(c=>color(c)[0]<180))||trace.slice(5).some(f=>color(f.sticky)[0]>=128))throw Error('Popup/root state waits for hover or exposes light frames '+theme+'/'+JSON.stringify(trace));
      await until(()=>page.evaluate("[...document.querySelectorAll('.clip')].every(e=>getComputedStyle(e).filter!=='none')"),'new menu glyph cohort');
      if(await page.evaluate("getComputedStyle(document.querySelector('.decorative')).backgroundColor")!==source.color||!await page.evaluate("document.querySelector('[aria-disabled=true]').matches('[aria-disabled=true]')"))throw Error('Popup repair changed preservation controls');
      await page.evaluate("document.querySelector('.menu').style.display='none'");await until(()=>page.evaluate("getComputedStyle(document.querySelector('.menu')).display==='none'"),'popup closed');await page.evaluate("document.querySelector('.menu').style.display='block'");await until(()=>page.evaluate("getComputedStyle(document.querySelector('.menu')).backgroundColor!=='rgb(255, 255, 255)'"),'popup reopened');results.push({case:'popup-first-paint',theme,trace,passed:true});
    }
    const workload=server.base+'/fixtures/diagnostics/dynamic-catalogue.html';await browser.rule(workload,'source');await page.send('Page.navigate',{url:workload});await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'catalogue workload');
    for(const theme of ['chromium','soft','contrast']){
      await page.send('Performance.enable');const before=(await page.send('Performance.getMetrics')).metrics;await browser.rule(workload,theme);await until(()=>page.evaluate("getComputedStyle(document.querySelector('.card h2')).color!=='rgb(37, 47, 61)'"),'catalogue initial paint');await page.evaluate("document.querySelector('#batch').click()");await until(()=>page.evaluate("getComputedStyle(document.querySelector('.grid a')).color!=='rgb(49, 93, 138)'"),'nested catalogue insertion');const after=(await page.send('Performance.getMetrics')).metrics;results.push({case:'dynamic-catalogue-workload',theme,before,after,passed:true});
    }
  }
  if(wanted('images')||wanted('surfaces')){
    const url=server.base+'/fixtures/diagnostics/large-image-label.html';await browser.rule(url,'source');await page.send('Page.navigate',{url});await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'large image label');
    const read=()=>page.evaluate("(()=>({body:getComputedStyle(document.body).backgroundColor,items:Object.fromEntries([...document.querySelectorAll('[data-audit-id]')].map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return[e.dataset.auditId,{ink:s.color,background:s.backgroundColor,font:s.font,box:[r.width,r.height]}]})),images:[...document.images].map(e=>({src:e.currentSrc,filter:getComputedStyle(e).filter}))}))()");const source=await read();
    for(const theme of ['chromium','soft','contrast'])for(const level of ['off','maximum']){
      await browser.rule(url,theme,level);const f=await settled(read,f=>color(f.body)[0]<128&&['subtitle','title','small'].every(id=>color(f.items[id].background)[3]===0&&(id==='small'||color(f.items[id].ink)[0]>=235)),theme+' retained accepted image ink').catch(async error=>{throw Error(error.message+' '+JSON.stringify(await read()))});
      for(const id of ['subtitle','title','small','authored'])if(f.items[id].font!==source.items[id].font||JSON.stringify(f.items[id].box)!==JSON.stringify(source.items[id].box))throw Error('Image-label repair changed typography/geometry');
      if(JSON.stringify(f.images)!==JSON.stringify(source.images)||color(f.items.authored.background)[3]===0)throw Error('Image-label repair changed artwork/authored backing');
      await page.evaluate("document.querySelector('.cards').classList.toggle('resample')");await settled(read,g=>['subtitle','title'].every(id=>color(g.items[id].background)[3]===0),theme+' stable no-strip label');
      if(level==='off')await writeFile(path.join(directory,'large-image-label-'+theme+'.png'),Buffer.from((await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
      results.push({case:'accepted-large-image-label',theme,level,passed:true});
    }
  }
  if(wanted('icons')||wanted('states')){
    const url=server.base+'/fixtures/diagnostics/document-toolbar-controls.html';await browser.rule(url,'source');await page.send('Page.navigate',{url});await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'toolbar follow-up controls');
    const read=()=>page.evaluate("(()=>({background:getComputedStyle(document.querySelector('.toolbar')).backgroundColor,items:Object.fromEntries([...document.querySelectorAll('[data-audit-id]')].map(e=>{const s=getComputedStyle(e),p=getComputedStyle(e.parentElement),r=e.getBoundingClientRect();return[e.dataset.auditId,{ink:s.webkitTextFillColor,background:s.backgroundColor,content:s.content,mask:s.maskImage,filter:p.filter,left:s.left,top:s.top,opacity:s.opacity,edge:s.borderBottomColor,box:[r.width,r.height]}]}))}))()");
    const source=await read(),glyphs=['zoom-arrow','style-arrow','font-arrow','minus','color'];
    if(await page.evaluate("Boolean(document.querySelector('[data-audit-id=outside]').closest('[role=toolbar]'))"))throw Error('Invalid fixture: outside control nested inside toolbar');
    for(const theme of ['chromium','soft','contrast'])for(const level of ['off','maximum']){
      await browser.rule(url,theme,level);const f=await settled(read,f=>color(f.background)[0]<128&&glyphs.every(id=>f.items[id].filter!=='none')&&contrast(color(f.items.bold.background),color(f.items['bold-control'].background))>=6.9,theme+' toolbar glyph families');
      for(const id of ['style','font','zoom']){
        const ink=composite(color(f.items[id].ink),color(f.background)),minimum=Math.min(12,contrast([255,255,255,1],color(f.background)));
        if(contrast(ink,color(f.background))<minimum-.1)throw Error('Toolbar label remains dim '+theme+'/'+id+'/'+JSON.stringify(f.items[id]));
      }
      for(const id of ['bold',...glyphs])for(const prop of ['left','top','content','mask','box'])if(JSON.stringify(f.items[id][prop])!==JSON.stringify(source.items[id][prop]))throw Error('Toolbar geometry/resource changed '+id+'/'+prop);
      const samples=await page.evaluate("(async()=>{const out=[];for(const id of ['style-arrow','minus','color']){const e=document.querySelector('[data-audit-id='+id+']'),s=getComputedStyle(e),p=e.parentElement,i=new Image();i.src=s.content.slice(5,-2);await i.decode();const c=document.createElement('canvas');c.width=p.clientWidth;c.height=p.clientHeight;const x=c.getContext('2d');x.filter=getComputedStyle(p).filter;x.drawImage(i,parseFloat(s.left),parseFloat(s.top));const pixels=x.getImageData(0,0,c.width,c.height).data;let at=3;for(let n=7;n<pixels.length;n+=4)if(pixels[n]>pixels[at])at=n;out.push({id,ink:[...pixels.slice(at-3,at),pixels[at]/255]})}return out})()");
      if(samples.some(s=>contrast(composite(s.ink,color(f.background)),color(f.background))<3))throw Error('Actual thin toolbar pixels remain unreadable '+JSON.stringify(samples));
      if(f.items.indicator.edge!==source.items.indicator.edge)throw Error('Formatting color indicator changed '+theme+'/'+f.items.indicator.edge);
      if(!await page.evaluate("document.querySelector('[aria-label=Bold]').matches('[aria-pressed=true]')"))throw Error('Bold selection changed');
      if(level==='off')await writeFile(path.join(directory,'toolbar-controls-'+theme+'.png'),Buffer.from((await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
      results.push({case:'toolbar-control-families',theme,level,passed:true});
    }
  }
  if(wanted('surfaces')||wanted('states')){
    const url=server.base+'/fixtures/diagnostics/field-surfaces.html';await browser.rule(url,'source');await page.send('Page.navigate',{url});await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'field surface');
    const read=()=>page.evaluate("(()=>({body:getComputedStyle(document.body).backgroundColor,items:Object.fromEntries([...document.querySelectorAll('[data-audit-id]')].map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return[e.dataset.auditId,{background:s.backgroundColor,image:s.backgroundImage,ink:s.webkitTextFillColor,opacity:s.opacity,box:[r.width,r.height],disabled:e.disabled,readonly:e.readOnly}]}))}))()");
    const source=await read();
    for(const theme of ['chromium','soft','contrast'])for(const level of ['off','maximum']){
      await browser.rule(url,theme,level);const f=await settled(read,f=>color(f.body)[0]<128,theme+' separated editable surfaces');
      for(const[id,item]of Object.entries(f.items))if(JSON.stringify(item.box)!==JSON.stringify(source.items[id].box)||item.opacity!==source.items[id].opacity||item.disabled!==source.items[id].disabled||item.readonly!==source.items[id].readonly||item.image!==source.items[id].image)throw Error('Field surface changed geometry/state/image '+id);
      if(color(f.items.transparent.background)[3]!==0||f.items.status.background!==f.items['status-control'].background)throw Error('Field surface manufactured backing/changed status fill');
      if(['text','email','notes'].some(id=>contrast(color(f.items[id].ink),color(f.items[id].background))<4.49))throw Error('Raised field lost text contrast');
      results.push({case:'field-surface-policy-preservation',theme,level,passed:true});
    }
  }
  if(wanted('states')){
    const url=server.base+'/fixtures/diagnostics/nested-job-pane.html';await browser.rule(url,'source');await page.send('Page.navigate',{url});await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'nested job pane');
    for(const theme of ['chromium','soft','contrast']){
      await browser.rule(url,theme);await until(()=>page.evaluate("parseInt(getComputedStyle(document.body).backgroundColor.slice(4))<128"),theme+' nested pane theme');
      await page.send('Performance.enable');const before=(await page.send('Performance.getMetrics')).metrics;
      const trace=await page.evaluate("new Promise(resolve=>{const e=document.querySelector('#pane'),trace=[];let n=0,last=performance.now();function step(){const now=performance.now();trace.push(now-last);last=now;e.scrollTop=(n%2?1:-1)*80+e.scrollTop+100;n++;if(n<40)requestAnimationFrame(step);else resolve(trace)}requestAnimationFrame(step)})");
      const after=(await page.send('Performance.getMetrics')).metrics;
      await until(()=>page.evaluate("(()=>{const p=document.querySelector('#pane').getBoundingClientRect();return [...document.querySelectorAll('#pane a')].filter(e=>{const r=e.getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom}).every(e=>e.hasAttribute('data-native-dark-mode-paint'))})()"),theme+' exposed nested links painted');
      await page.evaluate("(()=>{const p=document.createElement('p');p.id='dynamic-pane-text';p.style.color='black';p.textContent='New synthetic pane text';document.querySelector('#pane header').append(p)})()");
      await until(()=>page.evaluate("parseInt(getComputedStyle(document.querySelector('#dynamic-pane-text')).color.slice(4))>128"),theme+' nested mutation remains observed');
      await page.evaluate("document.querySelector('#dynamic-pane-text').remove();document.querySelector('#pane').scrollTop=0");
      const metrics=Object.fromEntries(['ScriptDuration','LayoutDuration','RecalcStyleDuration'].map(name=>[name,after.find(m=>m.name===name).value-before.find(m=>m.name===name).value]));
      results.push({case:'nested-job-pane-scroll',theme,trace,metrics,passed:true});
    }
  }
  if(wanted('states')){
    const url=server.base+'/fixtures/diagnostics/sprite-batch.html';
    for(const theme of ['chromium','soft','contrast']){
      await browser.rule(url,'source');await page.send('Page.navigate',{url});
      await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'cold sprite cohort');
      const geometry=await page.evaluate("[...document.querySelectorAll('.crop')].map(e=>getComputedStyle(e).left)");
      await page.evaluate("window.trace=[];window.tracking=true;window.started=performance.now();function tick(){const n=[...document.querySelectorAll('.clip')].filter(e=>getComputedStyle(e).filter!=='none').length;if(trace.at(-1)?.n!==n)trace.push({n,ms:performance.now()-started});if(tracking)requestAnimationFrame(tick)}requestAnimationFrame(tick)");
      await browser.rule(url,theme);
      await until(()=>page.evaluate('trace.at(-1)?.n===32'),'all resource crops published together');
      const facts=await page.evaluate("tracking=false;({trace,geometry:[...document.querySelectorAll('.crop')].map(e=>getComputedStyle(e).left)})");
      if(facts.trace.some(f=>f.n!==0&&f.n!==32))throw Error('Sprite cohort visibly repainted one by one '+JSON.stringify(facts.trace));
      if(JSON.stringify(geometry)!==JSON.stringify(facts.geometry))throw Error('Sprite cohort changed crop offsets');
      results.push({case:'grouped-sprite-publication',theme,...facts,passed:true});
    }
  }
  if(wanted('borders')){
    const url=server.base+'/fixtures/diagnostics/file-activation-frame.html';await browser.rule(url,'source');await page.send('Page.navigate',{url});
    await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'file activation frame');await page.evaluate("document.body.style.zoom='1.25'");
    const read=()=>page.evaluate("(()=>({body:getComputedStyle(document.body).backgroundColor,items:Object.fromEntries([...document.querySelectorAll('[data-audit-id]')].map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return[e.dataset.auditId,{ink:s.borderTopColor,width:s.borderTopWidth,shadow:s.boxShadow,opacity:s.opacity,box:[r.width,r.height],after:getComputedStyle(e,'::after').content}]}))}))()");
    const source=await read();
    for(const theme of ['chromium','soft','contrast']){let ink;
      for(const level of ['off','very-low','low','medium','high','maximum']){
        await browser.rule(url,theme,level);const f=await settled(read,f=>color(f.body)[0]<128&&contrast(color(f.items.upload.ink),color(f.body))>=4.49&&(level==='off'?f.items.upload.shadow==='none':f.items.upload.shadow.includes('inset')),theme+' file frame '+level);
        if(level==='off')ink=f.items.upload.ink;else if(f.items.upload.ink!==ink)throw Error('File frame emphasis changed repaired blue');
        const blue=color(f.items.upload.ink);if(blue[2]<=blue[0]||blue[2]<=blue[1])throw Error('File frame lost blue hue');
        for(const [id,item]of Object.entries(f.items))if(item.width!==source.items[id].width||JSON.stringify(item.box)!==JSON.stringify(source.items[id].box)||item.opacity!==source.items[id].opacity)throw Error('File frame changed geometry/opacity '+id);
        if(f.items.upload.after!=='none'||f.items.file.opacity!=='0'||color(f.items.reserved.ink)[3]!==0)throw Error('File frame became an overlay/revealed a reserved layer');
        if(['disabled','visible','decoration'].some(id=>f.items[id].shadow!=='none'))throw Error('Non-action file wrapper gained reinforcement');
        if(level==='maximum')await writeFile(path.join(directory,'file-frame-'+theme+'.png'),Buffer.from((await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
        results.push({case:'file-activation-frame',theme,level,passed:true});
      }
    }
  }
  if(wanted('borders')){
    const url=server.base+'/fixtures/diagnostics/inline-label-frames.html';await browser.rule(url,'source');await page.send('Page.navigate',{url});
    await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'actual inline label frame');await page.evaluate("document.body.style.zoom='1.25'");
    const read=()=>page.evaluate("(()=>({background:getComputedStyle(document.documentElement).backgroundColor,items:Object.fromEntries([...document.querySelectorAll('[data-audit-id]')].map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return[e.dataset.auditId,{ink:s.borderTopColor,width:s.borderTopWidth,box:[r.width,r.height]}]}))}))()");
    const source=await read();
    for(const theme of ['chromium','soft','contrast']){let first,last=0;
      for(const level of ['off','very-low','low','medium','high','maximum']){
        await browser.rule(url,theme,level);const f=await settled(read,f=>color(f.background)?.[3]===1&&contrast(color(f.items.tag.ink),color(f.background))>=2.99,theme+' inline tag '+level);
        const ratio=contrast(color(f.items.tag.ink),color(f.background));if(ratio<last-.01)throw Error('Inline capsule emphasis decreased');last=ratio;
        if(level==='off')first=ratio;
        if(level==='maximum'&&ratio<=first+.1)throw Error('Inline capsule emphasis ineffective');
        for(const id of ['tag','long','reserved','status','explicit'])if(f.items[id].width!==source.items[id].width||JSON.stringify(f.items[id].box)!==JSON.stringify(source.items[id].box))throw Error('Inline capsule geometry changed');
        if(color(f.items.reserved.ink)[3]!==0)throw Error('Reserved inline frame became visible');
        await page.evaluate("document.querySelector('.ij-List').classList.toggle('resample')");await settled(read,g=>g.items.tag.ink===f.items.tag.ink,theme+' inline tag resampling');
        results.push({case:'transparent-inline-label-frame',theme,level,ratio,passed:true});
      }
    }
  }
  if(wanted('states')){
    const url=server.base+'/fixtures/diagnostics/document-toolbar-fields.html';await browser.rule(url,'source');await page.send('Page.navigate',{url});
    await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'toolbar placeholder');
    const read=()=>page.evaluate("(()=>{const e=document.querySelector('[data-audit-id=hint]'),s=getComputedStyle(e,'::placeholder'),r=e.getBoundingClientRect();return {background:getComputedStyle(document.querySelector('.goog-toolbar')).backgroundColor,ink:s.webkitTextFillColor,opacity:Number(s.opacity),hidden:Number(getComputedStyle(document.querySelector('[data-audit-id=hidden]'),'::placeholder').opacity),box:[r.width,r.height]}})()");
    const source=await read();
    for(const theme of ['chromium','soft','contrast'])for(const level of ['off','maximum']){
      await browser.rule(url,theme,level);const f=await settled(read,f=>color(f.background)[0]<128&&contrast(composite([...color(f.ink).slice(0,3),color(f.ink)[3]*f.opacity],color(f.background)),color(f.background))>=8.49,theme+' toolbar hint contrast');
      if(f.hidden!==0||JSON.stringify(f.box)!==JSON.stringify(source.box))throw Error('Placeholder repair changed hidden state/geometry '+JSON.stringify({theme,level,source,f}));
      if(level==='off')await writeFile(path.join(directory,'toolbar-hint-'+theme+'.png'),Buffer.from((await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
      results.push({case:'toolbar-placeholder-readability',theme,level,ink:f.ink,ratio:contrast(composite([...color(f.ink).slice(0,3),color(f.ink)[3]*f.opacity],color(f.background)),color(f.background)),passed:true});
    }
  }
  if(wanted('icons')||wanted('images')){
    const url=server.base+'/fixtures/diagnostics/document-content-sprite.html';await browser.rule(url,'source');await page.send('Page.navigate',{url});
    await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'CSS content sprite crop');
    const read=()=>page.evaluate("(()=>({background:getComputedStyle(document.querySelector('.bar')).backgroundColor,items:Object.fromEntries([...document.querySelectorAll('[data-audit-id]')].map(e=>{const s=getComputedStyle(e),p=getComputedStyle(e.parentElement),r=e.getBoundingClientRect(),q=e.parentElement.getBoundingClientRect();return[e.dataset.auditId,{content:s.content,filter:p.filter,ownFilter:s.filter,left:s.left,top:s.top,box:[r.width,r.height,q.width,q.height]}]}))}))()");
    const source=await read(),positive=['star','folder','cloud','plus','back-enabled','mono','allowed'],muted=['back','disabled'];
    for(const theme of ['chromium','soft','contrast'])for(const level of ['off','maximum']){
      await browser.rule(url,theme,level);const f=await settled(read,f=>color(f.background)[0]<128&&[...positive,...muted].every(id=>f.items[id].filter!=='none'),theme+' actual CSS content crop ink');
      for(const[id,facts]of Object.entries(f.items)){
        for(const prop of ['content','left','top','ownFilter','box'])if(JSON.stringify(facts[prop])!==JSON.stringify(source.items[id][prop]))throw Error('CSS content sprite geometry/resource changed '+id+'/'+prop);
        if(![...positive,...muted].includes(id)&&facts.filter!=='none')throw Error('Mixed/readable/disabled/animated/denied/unpaired crop tinted '+id);
      }
      const samples=await page.evaluate("(async()=>{const result=[];for(const id of ['star','folder','cloud','plus','back-enabled','back','disabled','mono','allowed']){const e=document.querySelector('[data-audit-id='+id+']'),s=getComputedStyle(e),p=e.parentElement,i=new Image();i.crossOrigin='anonymous';i.src=s.content.slice(5,-2);await i.decode();const c=document.createElement('canvas');c.width=p.clientWidth;c.height=p.clientHeight;const x=c.getContext('2d');x.filter=getComputedStyle(p).filter;x.drawImage(i,-parseFloat(s.left)*i.naturalWidth/e.clientWidth,-parseFloat(s.top)*i.naturalHeight/e.clientHeight,p.clientWidth*i.naturalWidth/e.clientWidth,p.clientHeight*i.naturalHeight/e.clientHeight,0,0,c.width,c.height);const pixels=x.getImageData(0,0,c.width,c.height).data;let at=-1;for(let n=3;n<pixels.length;n+=4)if(pixels[n]>=224){at=n-3;break}result.push({id,ink:at<0?null:[...pixels.slice(at,at+3),pixels[at+3]/255]})}return result})()");
      for(const sample of samples){
        if(!sample.ink)throw Error('Missing CSS crop pixel sample');
        const opacity=sample.id==='disabled'?.4:1,ratio=contrast(composite([...sample.ink.slice(0,3),sample.ink[3]*opacity],color(f.background)),color(f.background));
        if(ratio<(sample.id==='disabled'?2.95:sample.id==='back'?4.49:6.9))throw Error('Actual CSS content crop pixels remain unreadable '+theme+' '+JSON.stringify({sample,ratio}));
      }
      const back=samples.find(s=>s.id==='back').ink,enabled=samples.find(s=>s.id==='back-enabled').ink;
      if(back[0]>=enabled[0]-20)throw Error('Disabled Back lost its muted distinction');
      if(!await page.evaluate("document.querySelector('[aria-label=Back]').matches('[aria-disabled=true]')"))throw Error('Back action was enabled');
      await page.evaluate("document.querySelector('.bar').classList.toggle('resample');scrollTo(0,10);scrollTo(0,0)");
      await settled(read,g=>positive.every(id=>g.items[id].filter===f.items[id].filter),theme+' stable content crop resampling');
      if(level==='off')await writeFile(path.join(directory,'content-sprite-'+theme+'.png'),Buffer.from((await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
      results.push({case:'verified-css-content-sprite-crop',theme,level,passed:true});
    }
  }
  if(wanted('states')){
    const url=server.base+'/fixtures/diagnostics/document-title.html';await browser.rule(url,'source');await page.send('Page.navigate',{url});
    await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'camouflaged editable title');
    const read=()=>page.evaluate("(()=>({background:getComputedStyle(document.querySelector('.bar')).backgroundColor,items:Object.fromEntries([...document.querySelectorAll('[data-audit-id]')].map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return[e.dataset.auditId,{ink:s.webkitTextFillColor,visibility:s.visibility,shadow:s.textShadow,stroke:s.webkitTextStrokeWidth,font:s.font,box:[r.width,r.height]}]}))}))()");
    const source=await read();
    for(const theme of ['chromium','soft','contrast'])for(const level of ['off','maximum']){
      await browser.rule(url,theme,level);
      let f=await settled(read,f=>color(f.items.input.ink)[3]===0&&contrast(color(f.items.label.ink),color(f.background))>=4.5,theme+' single resting title');
      for(const id of ['input','label'])if(f.items[id].font!==source.items[id].font||JSON.stringify(f.items[id].box)!==JSON.stringify(source.items[id].box)||f.items[id].shadow!=='none'||parseFloat(f.items[id].stroke)!==0)throw Error('Title repair changed font/geometry/stroke');
      for(const id of ['visible','different','ordinary'])if(color(f.items[id].ink)[3]===0)throw Error('Ordinary input incorrectly hidden '+id);
      await page.evaluate("document.querySelector('[data-audit-id=input]').focus()");
      await settled(read,f=>f.items.label.visibility==='hidden'&&color(f.items.input.ink)[3]===1&&contrast(color(f.items.input.ink),color(f.background))>=4.5,theme+' title editing');
      await page.evaluate("document.activeElement.blur();document.querySelector('[data-audit-id=component]').classList.toggle('resample')");
      f=await settled(read,f=>f.items.label.visibility==='visible'&&color(f.items.input.ink)[3]===0,theme+' title blur restoration');
      if(level==='off')await writeFile(path.join(directory,'title-'+theme+'.png'),Buffer.from((await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
      results.push({case:'camouflaged-editable-title',theme,level,passed:true});
    }
  }
  if(wanted('borders')||wanted('states')){
    const url=server.base+'/fixtures/diagnostics/composite-search.html';await browser.rule(url,'source');await page.send('Page.navigate',{url});
    await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'composite search frame');await page.evaluate("document.body.style.zoom='1.25'");
    const read=()=>page.evaluate("(()=>({body:getComputedStyle(document.body).backgroundColor,items:Object.fromEntries([...document.querySelectorAll('[data-audit-id]')].map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return[e.dataset.auditId,{edge:s.borderTopColor,width:s.borderTopWidth,shadow:s.boxShadow,outline:s.outlineStyle,layer:(()=>{const a=getComputedStyle(e,'::after');return {content:a.content,shadow:a.boxShadow,top:a.top,pointer:a.pointerEvents}})(),overflow:s.overflow,display:s.display,rect:[r.x,r.y,r.width,r.height]}]}))}))()");
    const source=await read();
    for(const theme of ['chromium','soft','contrast'])for(const level of ['off','maximum']){
      await browser.rule(url,theme,level);
      const f=await settled(read,f=>color(f.body)[0]<128&&(level==='off'?f.items.frame.layer.content==='none':f.items.frame.layer.content==='""'),theme+' composite frame '+level);
      for(const id of ['frame','negative'])if(f.items[id].width!==source.items[id].width||JSON.stringify(f.items[id].rect)!==JSON.stringify(source.items[id].rect)||f.items[id].overflow!=='visible')throw Error('Composite frame changed layout/clipped menus');
      if(f.items.negative.layer.content!=='none')throw Error('Transparent inner fields received unnecessary overlay');
      if(level==='maximum'){
        const spread=f.items.frame.layer.shadow.replace(/rgba?\([^)]*\)/g,'').match(/-?[\d.]+px/g)?.[3];if(parseFloat(spread)<=parseFloat(f.items.frame.width)||parseFloat(f.items.frame.layer.top)>=0||f.items.frame.layer.pointer!=='none')throw Error('Composite reinforcement not aligned with existing frame');
        const [x,y,width,height]=f.items.frame.rect,{data}=await page.send('Page.captureScreenshot',{format:'png',clip:{x,y,width,height,scale:1},captureBeyondViewport:true});
        await writeFile(path.join(directory,'composite-'+theme+'.png'),Buffer.from(data,'base64'));
        const uniform=await page.evaluate(`(async()=>{const i=new Image();i.src='data:image/png;base64,${data}';await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);const p=x.getImageData(60,2,i.width-120,1).data;let bright=0;for(let n=0;n<p.length;n+=4)if(Math.min(p[n],p[n+1],p[n+2])>220)bright++;return bright/(p.length/4)})()`);
        if(uniform<.95)throw Error('Rounded descendants still occlude reinforced composite frame '+theme+'/'+uniform);
      }
      await page.evaluate("document.querySelector('input').focus()");
      const focus=await read();if(focus.items.menu.display==='none'||focus.items.menu.rect[1]+focus.items.menu.rect[3]<=focus.items.frame.rect[1]+focus.items.frame.rect[3])throw Error('Composite overlay hid suggestions');
      await page.evaluate('document.activeElement.blur()');
      results.push({case:'composite-rounded-field-frame',theme,level,passed:true});
    }
  }
  if(wanted('borders')||wanted('icons')){
    const url=server.base+'/fixtures/diagnostics/select-proxy-fields.html';
    await browser.rule(url,'source');await page.send('Page.navigate',{url});
    await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'select replacement fields');
    await page.evaluate("document.body.style.zoom='1.25';document.querySelector('[data-audit-id=proxy]').classList.add('chosen-with-drop')");
    const read=()=>page.evaluate("(()=>({body:getComputedStyle(document.body).backgroundColor,items:Object.fromEntries([...document.querySelectorAll('[data-audit-id]')].map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return[e.dataset.auditId,{ink:s.webkitTextFillColor,background:s.backgroundColor,image:s.backgroundImage,filter:s.filter,position:s.backgroundPosition,size:s.backgroundSize,repeat:s.backgroundRepeat,edge:s.borderTopColor,width:s.borderTopWidth,shadow:s.boxShadow,box:[r.width,r.height],outline:s.outlineStyle,opacity:Number(s.opacity),disabled:e.previousElementSibling?.matches('select')?e.previousElementSibling.disabled:null}]}))}))()");
    const source=await read(),ids=['proxy','search','text','email','number','denied','denied-search','transparent-search'];
    for(const theme of ['chromium','soft','contrast']){
      const strengths=[];let off;
      for(const level of ['off','very-low','low','medium','high','maximum']){
        await browser.rule(url,theme,level);
        const f=await settled(read,f=>f.body===({chromium:'rgb(18, 18, 18)',soft:'rgb(48, 55, 69)',contrast:'rgb(17, 21, 29)'})[theme]&&
          f.items.proxy.image.startsWith('url("data:image/svg+xml,')&&['denied','hint-proxy','disabled-proxy','generic-proxy'].every(id=>f.items[id].image==='none')&&['label','denied-label','generic-label','denied-search','transparent-search'].every(id=>contrast(color(f.items[id].ink),color(f.items.proxy.background))>=4.5),theme+'/'+level+' verified field glyphs').catch(async error=>{const f=await read();throw Error(error.message+' '+JSON.stringify({body:f.body,items:Object.fromEntries(['proxy','search','label','denied-label','denied-search','transparent-search'].map(id=>[id,{...f.items[id],image:f.items[id].image.slice(0,90)}]))}))});
        for(const state of ['hint','disabled']){
          const frame=f.items[state+'-proxy'],label=f.items[state+'-label'],outside=color(f.body),backing=composite([...color(frame.background).slice(0,3),frame.opacity],outside);
          const visible=composite([...color(label.ink).slice(0,3),frame.opacity],outside);
          if(contrast(visible,backing)<(state==='hint'?5.99:3.49))throw Error('Proxy '+state+' label remains unreadable '+theme+' '+JSON.stringify({frame,label,backing,visible}));
          if(frame.opacity!==source.items[state+'-proxy'].opacity||frame.disabled!==source.items[state+'-proxy'].disabled||JSON.stringify(frame.box)!==JSON.stringify(source.items[state+'-proxy'].box))throw Error('Proxy state/opacity/geometry changed '+state);
          if(frame.image!=='none')throw Error('Semantic state indicator was not isolated from unsupported PNG');
        }
        const arrows=await page.evaluate("['denied','hint-proxy','disabled-proxy','generic-proxy'].map(id=>{const e=document.querySelector('[data-audit-id='+id+']'),slot=e.querySelector('.chosen-single>:last-child'),s=getComputedStyle(slot,'::after');return{id,image:getComputedStyle(e).backgroundImage,content:s.content,background:s.backgroundColor,ink:s.borderBottomColor,width:s.borderBottomWidth,pointer:s.pointerEvents}})");
        if(arrows.some(a=>a.image!=='none'||a.content!=='\"\"'||color(a.background)?.[3]!==0||parseFloat(a.width)<=0||a.pointer!=='none'))throw Error('Semantic dropdown arrow missing/opaque '+JSON.stringify(arrows));
        for(const id of ids){
          if(contrast(color(f.items[id].edge),composite(color(f.items[id].background),color(f.body)))<2.49)throw Error('Field edge remains unreadable '+id);
          if(f.items[id].width!==source.items[id].width||JSON.stringify(f.items[id].box)!==JSON.stringify(source.items[id].box))throw Error('Field frame changed geometry '+id);
        }
        for(const id of ['proxy','search'])for(const prop of ['filter','position','size','repeat'])if(f.items[id][prop]!==source.items[id][prop])throw Error('Field glyph host/crop changed '+id+'/'+prop);
        for(const id of ['multicolor','picture','overlap','denied-search','transparent-search'])if(f.items[id].image!==source.items[id].image)throw Error('Unsupported field image recolored');
        if(theme==='chromium'&&f.items['overlap-label'].ink!==source.items['overlap-label'].ink)throw Error('Unverified overlapping image region treated as solid label backing');
        strengths.push(ids.map(id=>contrast(color(f.items[id].edge),composite(color(f.items[id].background),color(f.body)))));
        if(level==='off'){
          off=f;
          // Decode the actual generated resource and verify its alpha/geometry,
          // rather than treating a computed background-image URL as a pass.
          const pixels=await page.evaluate("(async()=>{const result=[];for(const id of ['proxy','search']){const e=document.querySelector('[data-audit-id='+id+']');const urls=[getComputedStyle(e).backgroundImage.slice(5,-2),new URL(id==='proxy'?'site-assets/infojobs-select-arrow.png':'site-assets/infojobs-search-glyph.png',location.href).href];const images=[];for(const url of urls){const i=new Image();i.src=url;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);images.push({width:i.width,height:i.height,pixels:[...x.getImageData(0,0,i.width,i.height).data]})}result.push({id,images})}return result})()");
          for(const {id,images:[tinted,original]}of pixels){
            if(tinted.width!==original.width||tinted.height!==original.height||tinted.pixels.some((v,i)=>i%4===3&&Math.abs(v-original.pixels[i])>1))throw Error('Field PNG alpha/extent changed '+id);
            const i=tinted.pixels.findIndex((v,i)=>i%4===3&&v>=224)-3;
            if(i<0||contrast(composite(tinted.pixels.slice(i,i+3).concat(tinted.pixels[i+3]/255),color(f.items[id].background)),color(f.items[id].background))<4.5)throw Error('Actual field glyph pixels remain dark '+id);
          }
          await writeFile(path.join(directory,'select-fields-'+theme+'.png'),Buffer.from((await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
        }
        if(['invalid','disabled'].some(id=>off&&f.items[id].edge!==off.items[id].edge))throw Error('Field emphasis overwrote status/disabled state');
        results.push({case:'select-proxy-and-field-frames',theme,level,passed:true});
      }
      for(const state of ['chosen-container-active','active-current'])for(const level of ['off','maximum']){
        await browser.rule(url,theme,level);await page.evaluate(`for(const id of ['proxy','denied'])document.querySelector('[data-audit-id='+id+']').classList.add('${state}','chosen-with-drop')`);
        const active=await settled(read,f=>['proxy','denied'].every(id=>contrast(color(f.items[id].edge),color(f.items[id].background))>=4.49),theme+' active selector edge '+state+'/'+level);
        for(const id of ['proxy','denied']){const ink=color(active.items[id].edge);if(ink[2]<=ink[0]||JSON.stringify(active.items[id].box)!==JSON.stringify(source.items[id].box))throw Error('Active selector edge lost blue/geometry');if(level==='maximum'&&!active.items[id].shadow?.includes('inset'))throw Error('Active selector did not strengthen inward')}
        await page.evaluate(`for(const id of ['proxy','denied'])document.querySelector('[data-audit-id='+id+']').classList.remove('${state}')`);
      }
      if(strengths.some((values,i)=>i&&values.some((v,j)=>v<strengths[i-1][j]-.01))||strengths[5].some((v,j)=>v<=strengths[0][j]+.1))throw Error('Field emphasis does not increase from repaired Off');
      await page.evaluate("document.querySelector('[data-audit-id=text]').focus()");
      await until(async()=>(await read()).items.text.outline==='solid',theme+' retained field focus');
      await page.evaluate("document.activeElement.blur();document.querySelector('[data-audit-id=proxy]').classList.remove('chosen-with-drop');scrollTo(0,10);scrollTo(0,0)");
      await settled(read,f=>f.items.proxy.image.startsWith('url("data:image/svg+xml,'),theme+' closed select resampling');
      await page.evaluate("document.querySelector('[data-audit-id=proxy]').classList.add('chosen-with-drop')");
    }
  }
  if(wanted('borders')||wanted('surfaces')){
    const url=server.base+'/fixtures/diagnostics/progress-indicator.html';await browser.rule(url,'source');await page.send('Page.navigate',{url});
    await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'semantic progress indicator');
    await page.evaluate("document.body.style.zoom='1.25'");
    const read=()=>page.evaluate("(()=>({body:getComputedStyle(document.body).backgroundColor,items:Object.fromEntries([...document.querySelectorAll('[data-audit-id]')].map(e=>{const s=getComputedStyle(e),c=getComputedStyle(e.firstElementChild),r=e.getBoundingClientRect(),f=e.firstElementChild.getBoundingClientRect();return[e.dataset.auditId,{background:s.backgroundColor,edge:s.borderTopColor,width:s.borderTopWidth,ink:c.backgroundColor,image:c.backgroundImage,box:[r.width,r.height,f.width,f.height],transform:c.transform,state:e.getAttribute('aria-valuenow')}]}))}))()");
    const source=await read();
    for(const theme of ['chromium','soft','contrast'])for(const level of ['off','maximum']){
      await browser.rule(url,theme,level);const f=await settled(read,f=>Math.max(...color(f.body).slice(0,3))<128&&['complete','partial','translated'].every(id=>contrast(color(f.items[id].ink),color(f.items[id].background))>=4.5),theme+' progress contrast');
      for(const id of ['complete','partial','translated']){
        if(contrast(color(f.items[id].edge),color(f.items[id].background))<4.5||f.items[id].ink!==f.items[id].edge)throw Error('Progress fill/frame inks diverge');
        if(JSON.stringify(f.items[id].box)!==JSON.stringify(source.items[id].box)||f.items[id].state!==source.items[id].state||f.items[id].width!==source.items[id].width||f.items[id].transform!==source.items[id].transform)throw Error('Progress state/geometry changed');
        const [r,g,b]=color(f.items[id].ink);if(b<=g||g<=r)throw Error('Progress blue hue lost');
      }
      if(f.items.readable.ink!==source.items.readable.ink||f.items.complex.image!==f.items['complex-control'].image)throw Error('Readable/complex progress policy changed '+theme+'/'+level+' '+JSON.stringify([f.items.readable.ink,source.items.readable.ink,f.items.complex.image,f.items['complex-control'].image]));
      await page.evaluate("document.querySelector('[data-audit-id=partial]').classList.toggle('resample');scrollTo(0,10);scrollTo(0,0)");
      await settled(read,g=>g.items.partial.ink===f.items.partial.ink,theme+' progress resampling');
      results.push({case:'thin-semantic-progress',theme,level,passed:true});
    }
  }
  if(wanted('surfaces')||wanted('cards')){
    const url=server.base+'/fixtures/diagnostics/infojobs-validation.html';await browser.rule(url,'source');await page.send('Page.navigate',{url});
    await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'translucent validation gradient');
    const read=()=>page.evaluate("(()=>({body:getComputedStyle(document.body).backgroundColor,items:Object.fromEntries([...document.querySelectorAll('[data-audit-id]')].map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return[e.dataset.auditId,{ink:s.color,fill:s.webkitTextFillColor,background:s.backgroundColor,image:s.backgroundImage,width:s.borderTopWidth,edge:s.borderTopColor,edgeStyle:s.borderTopStyle,box:[r.width,r.height],text:e.querySelector('p')&&getComputedStyle(e.querySelector('p')).webkitTextFillColor}]})),close:getComputedStyle(document.querySelector('.ij-CloseButton path')).fill}))()");
    const source=await read();
    const backgrounds=f=>[...f.items.card.image.matchAll(/(?:color|rgba?)\([^()]*\)/g)].map(([v])=>composite(color(v),color(f.body)));
    if(backgrounds(source).length!==2||!source.items.card.image.includes('/ 0.08'))throw Error('Validation source alpha gradient changed');
    for(const theme of ['chromium','soft','contrast'])for(const level of ['off','maximum']){
      await browser.rule(url,theme,level);
      const expectedBody={chromium:'rgb(18, 18, 18)',soft:'rgb(48, 55, 69)',contrast:'rgb(17, 21, 29)'}[theme];
      const f=await settled(read,f=>f.body===expectedBody&&backgrounds(f).every(bg=>['title','description'].every(id=>contrast(color(f.items[id].fill),bg)>=4.5)),theme+' translucent gradient text');
      const bgs=backgrounds(f),actionBgs=bgs.map(bg=>composite(color(f.items.action.background),bg));
      for(const id of ['title','description'])if(color(f.items[id].background)[3]!==0)throw Error('Gradient label gained a backing');
      if(actionBgs.some(bg=>contrast(color(f.items['action-label'].fill),bg)<4.5)||bgs.some(bg=>contrast(color(f.close),bg)<4.5))throw Error('Translucent gradient control ink is unreadable');
      if(f.items.card.image!==source.items.card.image||f.items.action.edgeStyle!=='dashed'||f.items.action.width!==source.items.action.width)throw Error('Validation card source drawing changed');
      if(actionBgs.some(bg=>contrast(color(f.items.action.edge),bg)<3))throw Error('Selected dashed action edge remains dark');
      if(contrast(color(f.items.light.text),[255,255,255,1])<7)throw Error('Known bright backing got a light label '+theme+'/'+level+' '+JSON.stringify(f.items.light));
      for(const id of Object.keys(source.items))if(JSON.stringify(f.items[id].box)!==JSON.stringify(source.items[id].box))throw Error('Gradient repair changed geometry: '+theme+'/'+level+' '+id+' '+JSON.stringify([source.items[id].box,f.items[id].box]));
      for(const id of ['unknown','layered'])if(f.items[id].image!==source.items[id].image)throw Error('Unknown/layered gradient paint changed');
      if(contrast(color(f.items.tag.edge),color(f.body))<3)throw Error('Neutral source-light tag border stays dark');
      const stable=JSON.stringify([f.items.title.fill,f.items.description.fill,f.items['action-label'].fill]);
      await page.evaluate("document.querySelector('[data-audit-id=card]').classList.toggle('resample');scrollTo(0,20);scrollTo(0,0)");
      await settled(read,g=>JSON.stringify([g.items.title.fill,g.items.description.fill,g.items['action-label'].fill])===stable,theme+' gradient resampling');
      results.push({case:'translucent-validation-gradient',theme,level,textContrast:Math.min(...bgs.map(bg=>contrast(color(f.items.description.fill),bg))),passed:true});
    }
  }
  if(wanted('states')){
    const url=server.base+'/fixtures/diagnostics/navigation-underlines.html';await browser.rule(url,'source');await page.send('Page.navigate',{url});
    await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'navigation wrapper underline');
    await page.evaluate("document.body.style.zoom='1.25'");
    const read=()=>page.evaluate("(()=>({background:getComputedStyle(document.querySelector('nav')).backgroundColor,items:Object.fromEntries([...document.querySelectorAll('[data-audit-id]')].map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return[e.dataset.auditId,{ink:s.borderBottomColor,width:s.borderBottomWidth,shadow:s.boxShadow,box:[r.width,r.height],x:r.x+r.width/2,y:r.y+r.height/2}]}))}))()");
    const source=await read();
    for(const theme of ['chromium','soft','contrast']){let off;
      for(const level of ['off','very-low','low','medium','high','maximum']){
        await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1});await browser.rule(url,theme,level);
        const rest=await settled(read,f=>color(f.background)[0]<128&&contrast(color(f.items.current.ink),color(f.background))>=4.5,theme+'/'+level+' navigation current ink');
        if(color(rest.items.hover.ink)[3]!==0||rest.items.hover.shadow!=='none')throw Error('Navigation transparent resting side became visible');
        const {x,y}=rest.items.hover;await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
        const hovered=await settled(read,f=>contrast(color(f.items.hover.ink),color(f.background))>=4.5,theme+'/'+level+' wrapper hover ink');
        for(const id of ['hover','current','own']){
          if(hovered.items[id].width!==source.items[id].width||JSON.stringify(hovered.items[id].box)!==JSON.stringify(source.items[id].box))throw Error('Navigation underline changed layout');
          if(level==='off'&&hovered.items[id].shadow!=='none')throw Error('Off added a navigation shadow');
          if(off&&hovered.items[id].ink!==off.items[id].ink)throw Error('Navigation emphasis washed out semantic blue');
          if(level==='maximum'&&!hovered.items[id].shadow.includes('inset'))throw Error('Navigation emphasis did not extend underline');
        }
        if(level==='off')off=hovered;
        await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1});
        await settled(read,f=>color(f.items.hover.ink)[3]===0&&f.items.hover.shadow==='none',theme+' underline hover cleared');
        results.push({case:'navigation-hover-selection-underline',theme,level,passed:true});
      }
    }
  }
  if(wanted('states')){
    const url=server.base+'/fixtures/diagnostics/navigation-surfaces.html';
    await browser.rule(url,'source');await page.send('Page.navigate',{url});
    await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'navigation surfaces');
    const read=()=>page.evaluate("(()=>({canvas:getComputedStyle(document.body).backgroundColor,nav:getComputedStyle(document.querySelector('nav')).backgroundColor,items:Object.fromEntries([...document.querySelectorAll('[data-audit-id]')].map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return[e.dataset.auditId,{fill:s.backgroundColor,ink:s.color,border:s.borderBottomColor,width:s.borderBottomWidth,box:[r.width,r.height],x:r.x+r.width/2,y:r.y+r.height/2}]}))}))()");
    const source=await read(),ids=['home','reviews','selected','icon','account','transparent'];
    for(const theme of ['chromium','soft','contrast'])for(const level of ['off','maximum']){
      await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1});
      await browser.rule(url,theme,level);
      const rest=await settled(read,f=>Math.max(...color(f.canvas).slice(0,3))<128&&ids.every(id=>color(f.items[id].fill)[3]===0||contrast(color(f.items[id].fill),color(f.nav))<1.08),theme+' resting navigation');
      if(contrast(color(rest.items.action.fill),color(rest.canvas))<1.5)throw Error('Navigation repair flattened an independent action');
      for(const id of ids)if(JSON.stringify(rest.items[id].box)!==JSON.stringify(source.items[id].box)||rest.items[id].width!==source.items[id].width)throw Error('Navigation geometry changed: '+id);
      for(const id of ['home','icon','account']){
        await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:rest.items[id].x,y:rest.items[id].y});
        await settled(read,f=>f.items[id].fill!==rest.items[id].fill,theme+' '+id+' hover appears');
        await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1});
        await settled(read,f=>f.items[id].fill===rest.items[id].fill,theme+' '+id+' hover clears');
      }
      await page.evaluate("document.querySelector('[data-audit-id=home]').focus();scrollTo(0,20);scrollTo(0,0);document.activeElement.blur()");
      await settled(read,f=>ids.every(id=>f.items[id].fill===rest.items[id].fill),theme+' navigation after focus/scroll');
      results.push({case:'navigation-rest-hover-separation',theme,level,passed:true});
    }
  }
  if(wanted('icons')){
    const url=server.base+'/fixtures/diagnostics/loading-wordmark.html';await browser.rule(url,'source');await page.send('Page.navigate',{url});await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'loading wordmark');
    const read=()=>page.evaluate("(()=>{const e=document.querySelector('[data-audit-id=wordmark]'),r=e.getBoundingClientRect(),p=e.querySelector('path'),bar=document.querySelector('#preloader');return{ink:getComputedStyle(p).fill,path:p.getAttribute('d'),box:[r.width,r.height],background:getComputedStyle(document.body).backgroundColor,progress:[bar.outerHTML,getComputedStyle(bar.querySelector('#loading-line-main')).animationName],animated:[...document.querySelectorAll('[data-audit-id=animated],[data-audit-id=css-animated]')].map(e=>e.outerHTML),mixed:[...document.querySelector('[data-audit-id=mixed]').querySelectorAll('path')].map(p=>getComputedStyle(p).fill)}})()");const source=await read();
    for(const theme of ['chromium','soft','contrast'])for(const level of ['off','maximum']){
      await browser.rule(url,theme,level);const f=await settled(read,f=>contrast(color(f.ink),color(f.background))>=6.9,theme+' unlinked inline wordmark');
      if(f.path!==source.path||JSON.stringify(f.box)!==JSON.stringify(source.box)||JSON.stringify(f.progress)!==JSON.stringify(source.progress)||JSON.stringify(f.animated)!==JSON.stringify(source.animated)||JSON.stringify(f.mixed)!==JSON.stringify(source.mixed))throw Error('Loading vector geometry, progress animation or palette changed');
      results.push({case:'unlinked-inline-loading-wordmark',theme,level,ratio:contrast(color(f.ink),color(f.background)),passed:true});
    }
  }
  if (['icons','images'].some(wanted)) {
    const url=server.base+'/fixtures/diagnostics/opacity-artwork.html';
    await browser.rule(url,'source');await page.send('Page.navigate',{url});
    await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'opacity artwork');
    const read=()=>page.evaluate("(()=>Object.fromEntries([...document.images].map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return[e.dataset.auditId,{src:e.getAttribute('src'),filter:s.filter,content:s.content,box:[r.width,r.height],own:s.backgroundColor,background:getComputedStyle(document.body).backgroundColor}]})))()");
    const source=await read();
    for(const theme of ['chromium','soft','contrast'])for(const level of ['off','maximum']){
      await browser.rule(url,theme,level);
      const f=await settled(read,f=>f.pulse.filter!=='none'&&f.static.filter!=='none'&&f['static-mixed'].own==='rgb(255, 255, 255)'&&f.pulse.background===({chromium:'rgb(18, 18, 18)',soft:'rgb(48, 55, 69)',contrast:'rgb(17, 21, 29)'})[theme],theme+' opacity-only glyph tint and static mixed backing');
      if(f['static-mixed'].filter!=='none'||f['static-mixed'].own!=='rgb(255, 255, 255)'||color(f.pulse.own)?.[3]!==0||color(f.static.own)?.[3]!==0)throw Error('Mixed artwork backing leaked into uniform glyph tint: '+JSON.stringify({theme,level,f}));
      if(f.static.filter!==f.pulse.filter)throw Error('Equivalent static/opacity source inks received different opaque tints');
      for(const[id,paint]of Object.entries(f)){
        if(paint.src!==source[id].src||JSON.stringify(paint.box)!==JSON.stringify(source[id].box)||paint.content!=='normal')throw Error('Opacity image resource/geometry/animation replaced: '+id);
        if(!['static','pulse'].includes(id)&&paint.filter!=='none')throw Error('Unsupported animation or readable ink tinted: '+id);
      }
      const ink=await page.evaluate("(()=>{const e=document.querySelector('[data-audit-id=static]'),c=document.createElement('canvas');c.width=160;c.height=56;const x=c.getContext('2d');x.filter=getComputedStyle(e).filter;x.drawImage(e,0,0);return [...x.getImageData(20,20,1,1).data].slice(0,3).concat(1)})()");
      if(contrast(ink,color(f.pulse.background))<7||contrast(composite([...ink.slice(0,3),.8],color(f.pulse.background)),color(f.pulse.background))<4.5)throw Error('Opacity-extreme glyph contrast insufficient: '+JSON.stringify({theme,ink,background:f.pulse.background,ratio:contrast(ink,color(f.pulse.background)),dim:contrast(composite([...ink.slice(0,3),.8],color(f.pulse.background)),color(f.pulse.background)),filter:f.pulse.filter}));
      if(level==='off'){
        const clip=await page.evaluate("(()=>{const r=document.querySelector('[data-audit-id=pulse]').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()");
        const pixels=[];
        for(let i=0;i<7;i++){
          await page.evaluate("document.querySelector('.images').classList.toggle('resample');scrollTo(0,0)");
          const current=await read();if(current['static-mixed'].own!=='rgb(255, 255, 255)'||current.static.filter!==f.static.filter||current.pulse.filter!==f.pulse.filter)throw Error('Animated/static artwork repair flickered during resampling');
          const{data}=await page.send('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:true});
          pixels.push(await page.evaluate(`(async()=>{const i=new Image();i.src='data:image/png;base64,${data}';await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);return [...x.getImageData(20,20,1,1).data].slice(0,3).concat(1)})()`));
          // Samples intentionally span the 2s source cycle to verify real
          // animation, not a fixed replacement image with a plausible filter.
          await page.evaluate('new Promise(r=>setTimeout(r,280))');
        }
        await writeFile(path.join(directory,'opacity-'+theme+'.png'),Buffer.from((await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
        if(new Set(pixels.map(p=>p.join(','))).size<2||pixels.some(p=>contrast(p,color(f.pulse.background))<4.4))throw Error('Opacity animation froze or lost visible-state contrast: '+JSON.stringify({theme,pixels,background:f.pulse.background,filter:f.pulse.filter}));
      }
      results.push({case:'verified-opacity-only-artwork',theme,level,passed:true});
    }
  }
  if (wanted('cards')) {
    const url=server.base+'/fixtures/diagnostics/dark-source-panel.html';await browser.rule(url,'source');await page.send('Page.navigate',{url});await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'dark source panel');
    const read=()=>page.evaluate("(()=>Object.fromEntries([...document.querySelectorAll('[data-audit-id]')].map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();let p=e.parentElement,bg;while(p){bg=getComputedStyle(p).backgroundColor;if(bg.startsWith('rgb('))break;p=p.parentElement}return[e.dataset.auditId,{background:s.backgroundColor,parent:bg,box:[r.width,r.height],border:s.borderBottomWidth,outline:s.outlineStyle,shadow:s.boxShadow}]})))()");
    const source=await read();
    for(const theme of ['chromium','soft','contrast'])for(const level of ['off','maximum']){
      await browser.rule(url,theme,level);const f=await settled(read,f=>contrast(color(f.positive.background),color(f.positive.parent))>=1.2,theme+' source-separated dark panel');
      for(const[id,p]of Object.entries(f))if(JSON.stringify(p.box)!==JSON.stringify(source[id].box)||p.border!==source[id].border)throw Error('Dark panel geometry changed');
      if(level==='off'&&(f.positive.outline!=='none'||f.positive.shadow!=='none'))throw Error('Dark panel acquired an Off frame');
      if(theme==='chromium'&&f['dark-parent'].background!==source['dark-parent'].background)throw Error('Dark-parent preservation changed');
      if(theme==='chromium'&&f.flat.background!==source.flat.background)throw Error('Unpadded band lifted');
      results.push({case:'source-separated-dark-panel',theme,level,ratio:contrast(color(f.positive.background),color(f.positive.parent)),passed:true});
    }
  }
  if (wanted('states')) {
    const url=server.base+'/fixtures/scroll-banner.html';await browser.rule(url,'source');await page.send('Page.navigate',{url});
    await until(()=>page.evaluate("document.querySelectorAll('article').length===240"),'scroll link case');
    await page.evaluate("document.querySelector('article').insertAdjacentHTML('beforeend','<a data-audit-id=authored-link href=\"#content\" style=\"color:#236abe\">Authored blue link</a><span style=\"color-scheme:dark\"><a data-audit-id=authored-scheme href=\"#content\">Authored dark scheme</a></span>')");
    const boxes=await page.evaluate("[...document.querySelectorAll('[data-audit-id=scroll-link],[data-audit-id=authored-link],[data-audit-id=authored-scheme]')].map(e=>{const r=e.getBoundingClientRect();return[r.width,r.height]})");
    for(const theme of ['chromium','soft','contrast'])for(const level of ['off','maximum']){
      await browser.rule(url,theme,level);
      await until(()=>page.evaluate("document.querySelector('[data-audit-id=scroll-link]').hasAttribute('data-native-dark-mode-paint')"),'scroll link paint');
      await settled(()=>page.evaluate("({body:getComputedStyle(document.body).backgroundColor,links:[...document.querySelectorAll('[data-audit-id=scroll-link],[data-audit-id=authored-link],[data-audit-id=authored-scheme]')].map(e=>({marker:e.getAttribute('data-native-dark-mode-paint'),ink:getComputedStyle(e).color,fill:getComputedStyle(e).webkitTextFillColor}))})"),f=>f.body===({chromium:'rgb(18, 18, 18)',soft:'rgb(48, 55, 69)',contrast:'rgb(17, 21, 29)'})[theme]&&(theme==='chromium'?f.links[0].marker?.startsWith('chromium-'):f.links[0].marker?.startsWith('link')),theme+' incoming link renderer ready');
      const frames=await page.evaluate("new Promise(resolve=>{const rows=[];let index=0;const es=[...document.querySelectorAll('[data-audit-id=scroll-link],[data-audit-id=authored-link],[data-audit-id=authored-scheme]')];function frame(){scrollTo(0,index%40<20?150:0);rows.push(es.map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return{color:s.color,fill:s.webkitTextFillColor,scheme:s.colorScheme,box:[r.width,r.height]}}));if(++index<120)requestAnimationFrame(frame);else resolve(rows)}requestAnimationFrame(frame)})");
      for(let n=0;n<3;n++){
        if(new Set(frames.map(f=>f[n].color+'|'+f[n].fill)).size!==1)throw Error('Scroll link ink changed between frames: '+theme+'/'+n);
        if(frames.some(f=>JSON.stringify(f[n].box)!==JSON.stringify(boxes[n])))throw Error('Scroll link geometry changed');
      }
      if(theme==='chromium'&&frames.some(f=>f[2].scheme!=='dark'))throw Error('Authored dark color-scheme was not retained');
      results.push({case:'scroll-default-link-stability',theme,level,frames:frames.length,passed:true});
    }
  }
  if (['icons','images'].some(wanted)) {
    const url=server.base+'/fixtures/diagnostics/kotlin-community.html';
    await browser.rule(url,'source');await page.send('Page.navigate',{url});
    await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'nested card image');
    const read=()=>page.evaluate(`(async()=>{const out={};for(const e of document.querySelectorAll('img')){
      const s=getComputedStyle(e),r=e.getBoundingClientRect();let n=e,bg;
      while(n){const c=getComputedStyle(n).backgroundColor;if(/^rgb\\(/.test(c)){bg=c;break;}n=n.parentElement;}
      const c=document.createElement('canvas');c.width=e.naturalWidth;c.height=e.naturalHeight;const x=c.getContext('2d');x.filter=s.filter;x.drawImage(e,0,0);
      const a=x.getImageData(0,0,c.width,c.height).data,inks=[];for(let i=0;i<a.length;i+=4)if(a[i+3]>=224)inks.push([...a.slice(i,i+3),1]);
      out[e.dataset.auditId]={src:e.getAttribute('src'),box:[r.width,r.height],filter:s.filter,content:s.content,background:bg,own:s.backgroundColor,inks};
    }return out})()`);
    const source=await read();
    for(const theme of ['chromium','soft','contrast'])for(const level of ['off','maximum']){
      await browser.rule(url,theme,level);
      await until(async()=>{const f=await read();return f.reported.filter!=='none'&&f.reported.inks.length&&f.reported.inks.every(i=>i.slice(0,3).every(v=>v>=248)&&contrast(i,color(f.reported.background))>=6.9);},theme+' nested neutral card glyph brightness/contrast');
      const f=await read();
      for(const id of Object.keys(source)){
        if(f[id].src!==source[id].src||JSON.stringify(f[id].box)!==JSON.stringify(source[id].box)||f[id].content!=='normal'||color(f[id].own)?.[3]!==0)throw Error('Nested glyph resource, geometry or backing changed: '+id);
        if(!['reported','white','large','unlabeled','unlinked','deep'].includes(id)&&f[id].filter!==source[id].filter)throw Error('Nested glyph tint leaked to preservation control: '+id);
      }
      for(const id of ['large','unlabeled','unlinked','deep'])if(f[id].filter==='none'||f[id].inks.some(i=>contrast(i,color(f[id].background))<6.9))throw Error('Verified neutral silhouette stayed dark: '+id);
      if(f.white.filter==='none'||f.white.inks.some(i=>contrast(i,color(f.white.background))<6.9))throw Error('Originally white image wrapper lost glyph contrast');
      if(f.multicolor.inks.some((ink,i)=>JSON.stringify(ink)!==JSON.stringify(source.multicolor.inks[i])))throw Error('Nested multicolor palette changed');
      await page.evaluate("document.querySelector('[data-audit-id=card]').classList.toggle('resample');scrollTo(0,100);scrollTo(0,0)");
      // Observe a real backdrop transition rather than assuming a fixed number
      // of milliseconds is enough for the mutation/resource batch to finish.
      await page.evaluate("document.querySelector('[data-audit-id=reported]').parentElement.style.setProperty('background-color','#fff','important')");
      await until(async()=>{const a=await read();return a.reported.filter==='none';},theme+' nested bright backing restores source glyph');
      await page.evaluate("document.querySelector('[data-audit-id=reported]').parentElement.style.removeProperty('background-color')");
      await until(async()=>{const a=await read();return a.reported.filter===f.reported.filter;},theme+' nested dark backing restores glyph contrast');
      const again=await read();if(again.reported.filter!==f.reported.filter||again.reported.background!==f.reported.background)throw Error('Nested glyph resampling instability');
      results.push({case:'nested-card-image-glyph',theme,level,contrast:Math.min(...f.reported.inks.map(i=>contrast(i,color(f.reported.background)))),passed:true});
    }
    await browser.rule(url,'source');
    await until(async()=>{const f=await read();return f.reported.filter==='none'&&f.reported.background===source.reported.background;},'nested image source restored');
  }
  if(wanted('images')){
    const url=server.base+'/fixtures/diagnostics/background-wordmarks.html';
    await browser.rule(url,'source');await page.send('Page.navigate',{url});
    await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'CSS wordmarks');
    const read=()=>page.evaluate("(()=>Object.fromEntries([...document.querySelectorAll('[data-audit-id]')].map(e=>{const r=e.getBoundingClientRect();return[e.dataset.auditId,{box:[r.width,r.height],marker:e.getAttribute('data-native-dark-mode-paint'),layers:['','::before','::after'].map(p=>{const s=getComputedStyle(e,p);return{background:s.backgroundColor,image:s.backgroundImage,filter:s.filter,opacity:s.opacity,display:s.display,width:s.width,height:s.height,position:s.backgroundPosition,size:s.backgroundSize,repeat:s.backgroundRepeat}})}]})))()");
    const pixels=async()=>{
      const clip=await page.evaluate("(()=>{const r=document.querySelector('[data-audit-id=reported]').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()");
      const {data}=await page.send('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:true});
      return page.evaluate(`(async()=>{const i=new Image();i.src='data:image/png;base64,${data}';await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);return [...x.getImageData(0,0,c.width,c.height).data]})()`);
    };
    // Source screenshot waits for the CSS resource, not just document.readyState.
    await page.evaluate("(async()=>{const s=getComputedStyle(document.querySelector('[data-audit-id=reported]'),'::before'),i=new Image();i.src=JSON.parse(s.backgroundImage.slice(4,-1));await i.decode()})()");
    const original=await read(),baseline=await pixels();
    for(const theme of ['chromium','soft','contrast'])for(const level of ['off','very-low','low','medium','high','maximum']){
      await browser.rule(url,theme,level);
      // Captions increase the gallery height. Exercise each target in view;
      // offscreen lazy paint is not a failed resource classification.
      for(const id of ['fade','dark','hero']){
        await page.evaluate(`document.querySelector('[data-audit-id=${id}]').scrollIntoView({block:'center'})`);
        await until(async()=>color((await read())[id].layers[1].background)?.[0]===255,theme+' visible wordmark '+id);
      }
      await page.evaluate('scrollTo(0,0)');

      const f=await settled(read,f=>color(f.reported.layers[1].background)?.[0]>=240&&color(f.own.layers[0].background)?.[0]===255&&['unlinked','repeat','crop','hero','fade','dark'].every(id=>color(f[id].layers[1].background)?.[0]===255&&(theme==='chromium'?f[id].marker?.startsWith('chromium-'):f[id].marker?.includes('paint-'))),theme+' settled CSS artwork backings').catch(async e=>{throw Error(e.message+' '+JSON.stringify(Object.fromEntries(Object.entries(await read()).map(([id,f])=>[id,{marker:f.marker,bg:f.layers[1].background,opacity:f.layers[0].opacity}]))));});
      for(const id of Object.keys(original)){
        if(JSON.stringify(f[id].box)!==JSON.stringify(original[id].box))throw Error('CSS artwork host geometry changed: '+id);
        for(let i=0;i<3;i++)for(const property of ['image','filter','opacity','display','width','height','position','size','repeat'])if(f[id].layers[i][property]!==original[id].layers[i][property])throw Error('CSS artwork source/geometry altered: '+id+'/'+property);
      }
      for(const id of ['readable','opaque','animated'])if(color(f[id].layers[1].background)?.[3]!==0)throw Error('CSS artwork backing leaked to preservation control: '+id);
      for(const id of ['unlinked','repeat','crop','hero','fade','dark'])if(color(f[id].layers[1].background)?.[0]!==255)throw Error('Static CSS artwork lost its necessary backing: '+JSON.stringify({id,theme,level,paint:f[id]}));
      if(color(f.white.layers[1].background)?.[0]!==255||f.reported.layers[2].display!=='none')throw Error('Authored backing or hidden layer lost');
      if(level==='off'){
        const frames=await page.evaluate("new Promise(done=>{const ids=['reported','own','unlinked','repeat','crop','hero'],es=ids.map(id=>document.querySelector('[data-audit-id='+id+']')),rows=[];let i=0;function frame(){document.querySelector('.row').classList.toggle('resample');rows.push(es.map(e=>getComputedStyle(e,e.dataset.auditId==='own'?'':'::before').backgroundColor));if(++i<30)requestAnimationFrame(frame);else done(rows)}requestAnimationFrame(frame)})");
        if(frames.some(row=>row.some(bg=>!color(bg)||color(bg)[3]!==1||color(bg)[0]<240)))throw Error('CSS wordmark backing flickered during class resampling: '+theme);
      }
      // Flattening a fractional-alpha ancestor can shift antialiased channels by
      // up to three 8-bit levels. Resource strings and geometry remain exact.
      if(level==='off'||level==='maximum')await until(async()=>{const a=await pixels();return a.every((v,i)=>Math.abs(v-baseline[i])<=3);},theme+' unchanged mixed-artwork pixels').catch(async e=>{const a=await pixels();await writeFile(path.join(directory,'wordmark-pixel-debug.json'),JSON.stringify({baseline,actual:a,facts:await read()}));throw e;});
      results.push({case:'background-wordmarks',theme,level,passed:true});
    }
  }
  if (['icons','images'].some(wanted)) {
    const url=server.base+'/fixtures/diagnostics/spring-card-glyph.html';
    await browser.rule(url,'source');await page.send('Page.navigate',{url});
    await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'headed card glyph');
    await page.evaluate('Promise.all([...document.images].map(i=>i.decode()))');
    const read=()=>page.evaluate(`(async()=>{const out={};for(const id of ['headset','plain-label','backed-negative','unlabeled-negative']){
      const e=document.querySelector('[data-audit-id='+id+']'),s=getComputedStyle(e),r=e.getBoundingClientRect(),p=getComputedStyle(e.parentElement);
      const image=new Image();image.src=s.content.startsWith('url(')?JSON.parse(s.content.slice(4,-1)):e.currentSrc;await image.decode();
      const svg=new DOMParser().parseFromString(decodeURIComponent(image.src.slice(image.src.indexOf(',')+1)),'image/svg+xml');
      const c=document.createElement('canvas');c.width=e.naturalWidth;c.height=e.naturalHeight;const x=c.getContext('2d');x.filter=s.filter;x.drawImage(image,0,0);
      const a=x.getImageData(0,0,c.width,c.height).data,inks=[];for(let i=0;i<a.length;i+=4)if(a[i+3]>=224)inks.push([...a.slice(i,i+3),1]);
      out[id]={src:e.getAttribute('src'),box:[r.width,r.height],filter:s.filter,content:s.content,background:p.backgroundColor,inks,
        geometry:[svg.documentElement.getAttribute('viewBox'),...[...svg.querySelectorAll('path')].map(e=>e.getAttribute('d'))]};}return out;})()`);
    const source=await read();
    for(const theme of ['chromium','soft','contrast']) for(const level of ['off','maximum']) {
      await browser.rule(url,theme,level);
      await until(async()=>{const f=await read();return f.headset.content.startsWith('url(');},theme+' headed image ink');
      const facts=await read(),glyph=facts.headset;
      if(JSON.stringify(facts['plain-label'].inks)!==JSON.stringify(glyph.inks))throw Error('Equivalent heading/plain label glyph inks differ: '+theme);
      if(!glyph.inks.length||glyph.inks.some(ink=>contrast(ink,color(glyph.background))<7||ink[2]-ink[0]<80)) throw Error('Card glyph lost contrast or blue chroma: '+theme);
      if(theme==='chromium'&&glyph.inks.some(ink=>ink.slice(0,3).some((v,i)=>Math.abs(v-[127,188,240][i])>1))) throw Error('Simple blue SVG lost its native-derived ink');
      for(const id of Object.keys(facts)) {
        if(facts[id].src!==source[id].src||JSON.stringify(facts[id].box)!==JSON.stringify(source[id].box)||JSON.stringify(facts[id].geometry)!==JSON.stringify(source[id].geometry)) throw Error('Card glyph resource or geometry changed: '+id);
        if(!['headset','plain-label'].includes(id)&&(facts[id].filter!=='none'||facts[id].content!=='normal')) throw Error('Card glyph preservation control tinted: '+id);
      }
      await page.evaluate("scrollTo(0,100);scrollTo(0,0);document.querySelector('[data-audit-id=badge]').classList.toggle('resample')");
      await page.evaluate('new Promise(r=>setTimeout(r,200))');
      const again=await read();if(again.headset.content!==glyph.content||again.headset.filter!==glyph.filter||again.headset.background!==glyph.background) throw Error('Card glyph resampling changed paint');
      if(level==='maximum') {
        await page.evaluate("document.querySelector('[data-audit-id=badge]').style.setProperty('background-color','#fff','important')");
        await until(async()=>{const f=await read();return f.headset.content==='normal'&&f.headset.filter==='none';},theme+' bright backing restores source ink');
        await page.evaluate("document.querySelector('[data-audit-id=badge]').style.removeProperty('background-color')");
        await until(async()=>{const f=await read();return f.headset.content.startsWith('url(');},theme+' dark backing restores adapted ink');
      }
      results.push({case:'headed-compact-image-glyph',theme,level,contrast:Math.min(...glyph.inks.map(ink=>contrast(ink,color(glyph.background)))),passed:true});
    }
  }
  if (['borders','images','icons'].some(wanted)) {
    const url = server.base + '/fixtures/diagnostics/spring-controls.html';
    await browser.rule(url, 'source'); await page.send('Page.navigate', { url });
    await until(() => page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"), 'reported course controls');
    await page.evaluate('document.documentElement.style.zoom=1.25');
    await page.evaluate('Promise.all([...document.images].map(i=>i.decode()))');
    const read = () => page.evaluate(`(()=>Object.fromEntries([...document.querySelectorAll('[data-audit-id]')].map(e=>{
      const s=getComputedStyle(e),r=e.getBoundingClientRect();let n=e,bg;
      while(n){const c=getComputedStyle(n).backgroundColor;if(/^rgb\\(/.test(c)){bg=c;break;}n=n.parentElement;}
      const img=e.querySelector('img');return[e.dataset.auditId,{background:bg,own:s.backgroundColor,edge:s.borderTopColor,
        widths:['Top','Right','Bottom','Left'].map(x=>s['border'+x+'Width']),box:[r.width,r.height],color:s.color,
        filter:s.filter,content:s.content,outline:[s.outlineStyle,s.outlineWidth],glyphs:[...e.querySelectorAll('svg path,path')].map(p=>[getComputedStyle(p).fill,p.getAttribute('d')]),transitions:[s.transitionProperty,s.transitionDuration],src:e.getAttribute('src')??img?.getAttribute('src'),
        imageFilter:img?getComputedStyle(img).filter:null,imageContent:img?getComputedStyle(img).content:null}];})))()`);
    const original=await read();
    await page.evaluate("document.querySelector('[data-audit-id=focus-negative]').focus()");
    const originalOutline=(await read())['focus-negative'].outline;
    await page.evaluate('document.activeElement.blur()');
    for(const theme of ['chromium','soft','contrast']) {
      let previous=[0,0];
      for(const level of ['off','very-low','low','medium','high','maximum']) {
        await browser.rule(url,theme,level);
        await until(async()=>{const f=await read();return color(f.logo.background)?.[0]>240&&
          ['course-divider','filter'].every((id,i)=>{const ratio=contrast(color(f[id].edge),color(f[id].background));
            return level==='off'?ratio<2:ratio>previous[i]+.05;})&&
          color(f.register.background)?.[0]<60&&f.filter.imageFilter!=='none';},theme+'/'+level+' reported control paint')
          .catch(async error=>{throw Error(error.message+' '+JSON.stringify(await read()));});
        const facts=await read();
        for(const id of Object.keys(original)) {
          if(JSON.stringify(facts[id].box)!==JSON.stringify(original[id].box)||
            JSON.stringify(facts[id].widths)!==JSON.stringify(original[id].widths)) throw Error('Reported control geometry: '+theme+'/'+level+'/'+id);
        }
        for(const [i,id] of ['course-divider','filter'].entries()) {
          const ratio=contrast(color(facts[id].edge),color(facts[id].background));
          const sourceRatio=contrast(color(original[id].edge),color(original[id].background));
          if(level==='off'&&(ratio<sourceRatio||ratio>sourceRatio*1.3)||level!=='off'&&ratio<previous[i]+.05)
            throw Error('Source-relative course boundary: '+theme+'/'+level+'/'+id+' '+ratio);
          previous[i]=ratio;
        }
        if(contrast(color(facts.register.color),color(facts.register.background))<(theme==='contrast'?7:4.5)||
          color(facts.register.background).slice(0,3).some(v=>v>70)) throw Error('Outlined action fill/text: '+theme);
        if(facts.logo.filter!=='none'||facts.logo.content!=='normal'||facts.brand.own!=='rgba(0, 0, 0, 0)'||
          facts.logo.src!==original.logo.src||facts.menu.src!==original.menu.src||facts.menu.imageFilter!=='none'||facts.menu.imageContent!=='normal')
          throw Error('Logo/menu drawing or surrounding link changed: '+theme);
        if(color(facts['transparent-negative'].edge)?.[3]!==0) throw Error('Reserved border became painted');
        for(const id of ['metadata-0','metadata-1']) {
          if(facts[id].glyphs.length!==1||contrast(color(facts[id].glyphs[0][0]),color(facts[id].background))<7||
            facts[id].glyphs[0][1]!==original[id].glyphs[0][1]) throw Error('Large-viewBox metadata glyph: '+theme+'/'+id);
        }
        if(JSON.stringify(facts['unlabeled-glyph'].glyphs)!==JSON.stringify(original['unlabeled-glyph'].glyphs)) throw Error('Unlabeled drawing was treated as a metadata icon');
        if(level==='off') {
          const inks=await page.evaluate(`(async()=>{const e=document.querySelector('[data-audit-id=filter] img'),s=getComputedStyle(e),c=document.createElement('canvas');
            c.width=e.naturalWidth;c.height=e.naturalHeight;const x=c.getContext('2d');x.filter=s.filter;x.drawImage(e,0,0);
            const p=x.getImageData(0,0,c.width,c.height).data,a=[];for(let i=0;i<p.length;i+=4)if(p[i+3]>=224)a.push([...p.slice(i,i+3),1]);return a;})()`);
          if(!inks.length||inks.some(ink=>contrast(ink,color(facts.filter.background))<7)) throw Error('Image-only filter glyph lacks pixel contrast: '+theme);
        }
        if(theme==='chromium'&&level==='off'&&facts['dark-negative'].edge!==original['dark-negative'].edge)
          throw Error('An already-dark edge was attenuated: '+JSON.stringify({actual:facts['dark-negative'],source:original['dark-negative']}));
        // These controls have the public 150ms border-color transition. A
        // source resample must not capture the previous themed transition ink.
        const [properties,durations]=facts.filter.transitions.map(list=>list.split(', '));
        const guard=properties.lastIndexOf('border-top-color');
        if(guard<0||parseFloat(durations[guard%durations.length])!==0) throw Error('Missing border sampling transition guard: '+theme);
        // Scroll/resample the same facts; a cached ancestor must retain authored
        // border sides rather than using its already adapted foreground policy.
        await page.evaluate("scrollBy(0,10);scrollTo(0,0);document.querySelector('[data-audit-id=filter]').classList.toggle('resample')");
        await page.evaluate('new Promise(r=>setTimeout(r,220))');
        const again=await read();
        if(again['course-divider'].edge!==facts['course-divider'].edge||again.filter.edge!==facts.filter.edge||again.logo.background!==facts.logo.background)
          throw Error('Reported control resampling changed paint: '+theme+'/'+level);
        await page.evaluate("document.querySelector('[data-audit-id=filter]').focus()");
        const focused=await read();
        if(focused.filter.edge!==facts.filter.edge) throw Error('Focus restored the pale source filter boundary: '+theme+'/'+level);
        await page.evaluate("document.querySelector('[data-audit-id=focus-negative]').focus()");
        const focusNegative=await read();
        if(JSON.stringify(focusNegative['focus-negative'].outline)!==JSON.stringify(originalOutline)||originalOutline[0]!=='solid') throw Error('Authored keyboard outline lost: '+JSON.stringify({theme,level,source:originalOutline,applied:focusNegative['focus-negative'].outline}));
        await page.evaluate('document.activeElement.blur()');
      }
      results.push({case:'linked-course-boundary-and-mixed-logo',theme,passed:true});
    }
    for(const theme of ['chromium','soft','contrast']) for(let cycle=0;cycle<2;cycle++) {
      await browser.rule(url,'native');
      await until(()=>page.evaluate("!document.querySelector('[data-native-dark-mode-paint]')"),'Native handoff cleared custom paint');
      await browser.rule(url,theme,'off');
      await until(async()=>{const f=await read();return color(f.filter.background)?.[0]<60&&
        contrast(color(f.filter.edge),color(f.filter.background))<2;},'Native to '+theme+' repaired frame');
      const frames=await page.evaluate(`new Promise(resolve=>{const rows=[];function frame(){const e=document.querySelector('[data-audit-id=filter]'),s=getComputedStyle(e);
        rows.push({edge:s.borderTopColor,background:s.backgroundColor,width:s.borderTopWidth});if(rows.length===24)resolve(rows);else requestAnimationFrame(frame);}frame();})`);
      if(frames.some(f=>contrast(color(f.edge),color(f.background))>=2||f.width!==original.filter.widths[0]))
        throw Error('Native handoff reintroduced a bright filter border: '+theme+' '+JSON.stringify(frames));
      results.push({case:'native-return-boundary',theme,cycle,frames,passed:true});
    }
  }
  if (wanted('icons')) {
  const readIcons = () => page.evaluate(`(async()=>{
    async function ink(selector,pseudo='',spriteX=0){
      const e=document.querySelector(selector),s=getComputedStyle(e,pseudo),image=new Image();
      image.src=JSON.parse(s.backgroundImage.slice(4,-1));await image.decode();
      const c=document.createElement('canvas');c.width=c.height=32;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.filter=s.filter;
      if(selector.includes('png-')) {ctx.beginPath();ctx.rect(0,0,11,15);ctx.clip();ctx.drawImage(image,-105,-7,400,900);}
      else if(selector.includes('menu')||selector.includes('flag'))ctx.drawImage(image,-spriteX,0);else ctx.drawImage(image,0,0,24,18);
      const pixels=ctx.getImageData(0,0,32,32).data,inks=[];for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>=224)inks.push([...pixels.slice(i,i+3),1]);
      let parent=pseudo?e:e.parentElement,bg;while(parent){const v=getComputedStyle(parent);if(v.backgroundImage==='none'&&/^rgb\\(/.test(v.backgroundColor)){bg=v.backgroundColor;break;}parent=parent.parentElement;}
      const svg=image.src.startsWith('data:image/svg+xml,')?new DOMParser().parseFromString(decodeURIComponent(image.src.slice(image.src.indexOf(',')+1)),'image/svg+xml'):null;
      return {filter:s.filter,inks,background:bg,size:[e.getBoundingClientRect().width,e.getBoundingClientRect().height],transform:s.transform,geometry:svg?[svg.documentElement.getAttribute('viewBox'),...[...svg.querySelectorAll('path')].map(p=>p.getAttribute('d'))]:null};
    }
    return {menu:await ink('.menu'),flag:await ink('.flag','',32),background:await ink('.background-icon'),contact:await ink('.contact','::after'),viewbox:await ink('[data-audit-id=viewbox-arrow] i'),flipped:await ink('[data-audit-id=viewbox-flipped] i'),compact:await ink('[data-audit-id=viewbox-compact] i'),png:await ink('[data-audit-id=png-arrow] i'),visible:await ink('[data-audit-id=png-visible-label] i')};
  })()`);
  const iconsUrl = await open('icons'), originalIcons = await readIcons();
  for (const theme of ['chromium', 'soft', 'contrast']) {
    await browser.rule(iconsUrl, theme, 'off');
    await until(async () => {const f=await readIcons();return f.menu.filter !== 'none' && f.png.filter !== 'none';}, theme + ' verified sprite ink');
    const icons = await readIcons();
    await until(()=>page.evaluate("new Set([...document.querySelectorAll('[data-audit-id^=viewbox],[data-audit-id=png-arrow]')].map(e=>getComputedStyle(e).backgroundColor)).size===1"),theme+' equivalent arrow control fills');
    for (const id of ['menu', 'background', 'contact','viewbox','flipped','compact','png']) {
      const record = icons[id];
      if (!record.inks.length || record.inks.some(ink => contrast(ink, color(record.background)) < 7)) throw Error(theme + ': insufficient sampled glyph contrast: ' + id);
    }
    for(const id of ['viewbox','flipped','compact']) if(JSON.stringify(icons[id].size)!==JSON.stringify(originalIcons[id].size)||icons[id].transform!==originalIcons[id].transform||JSON.stringify(icons[id].geometry)!==JSON.stringify(originalIcons[id].geometry)) throw Error('ViewBox arrow geometry/rotation changed');
    if (JSON.stringify(icons.flag.inks) !== JSON.stringify(originalIcons.flag.inks) || icons.flag.filter !== 'none') throw Error('Multicolor sprite crop changed');
    if(icons.visible.filter!=='none'||JSON.stringify(icons.png.size)!==JSON.stringify(originalIcons.png.size)) throw Error('Sprite tint affected visible child content or glyph geometry');
    if(await page.evaluate("getComputedStyle(document.querySelector('.clipped-label')).clipPath")!=='circle(0px)') throw Error('Accessible sprite label became visible');
    if (icons.background.background === icons.contact.background &&
        JSON.stringify(icons.background.inks) !== JSON.stringify(icons.contact.inks)) throw Error('Equivalent glyphs on equal backings receive different ink');
    const palette = await page.evaluate("(()=>{const e=document.querySelector('[data-audit-id=multicolor-label]'),s=getComputedStyle(e);return{backing:s.backgroundColor,inks:[...e.querySelectorAll('path')].map(p=>getComputedStyle(p).fill),negative:[...document.querySelectorAll('[data-audit-id=multicolor-negative] path')].map(p=>getComputedStyle(p).fill)}})()");
    if (palette.inks.some(ink=>contrast(color(ink),color(palette.backing))<4.5) || palette.negative.join()!=='rgb(8, 112, 33),rgb(211, 44, 94)') throw Error('Labeled inline palette or unlabeled negative changed incorrectly: '+theme+' '+JSON.stringify(palette));
    const signature = JSON.stringify([icons.menu.filter, icons.flag.filter, icons.background.filter, icons.contact.filter]);
    for (let sample = 0; sample < 3; sample++) {
      await page.evaluate("for(const e of document.querySelectorAll('.sprite,.background-icon,.contact'))e.classList.toggle('resample-probe')");
      await page.evaluate('new Promise(r=>setTimeout(r,150))');
      const repeated = await readIcons();
      if (JSON.stringify([repeated.menu.filter, repeated.flag.filter, repeated.background.filter, repeated.contact.filter]) !== signature) throw Error('Glyph filter flickers on resampling');
    }
    results.push({ case: 'sprite-and-background-glyphs', theme, passed: true });
  }
  }
  if(wanted('borders')){
    const url=server.base+'/fixtures/generated-frames.html';await browser.rule(url,'source');await page.send('Page.navigate',{url});await until(()=>page.evaluate("document.querySelectorAll('li').length===5"),'generated strong frame');
    const read=()=>page.evaluate("(()=>{let e=document.querySelector('li.strong'),s=getComputedStyle(e,'::before'),r=e.getBoundingClientRect();return{ink:s.borderTopColor,width:s.borderTopWidth,shadow:s.boxShadow,box:[r.width,r.height],background:getComputedStyle(document.body).backgroundColor,reserved:getComputedStyle(document.querySelector('li.reserved'),'::before').borderTopColor,transform:getComputedStyle(document.querySelector('li.arrow'),'::before').transform}})()");const original=await read();
    for(const theme of ['chromium','soft','contrast'])for(const level of ['off','maximum']){
      await browser.rule(url,theme,level);const f=await settled(read,f=>contrast(color(f.ink),color(f.background))>=3&&(level==='off'?f.shadow==='none':f.shadow.includes('inset')),theme+' strong generated frame');
      if(f.width!==original.width||JSON.stringify(f.box)!==JSON.stringify(original.box)||color(f.reserved)[3]!==0||f.transform!==original.transform)throw Error('Generated frame geometry or transparency changed');
      results.push({case:'strong-generated-frame',theme,level,passed:true});
    }
  }
  if (wanted('borders')) {
  const bordersUrl = await open('borders');
  const readBorders = () => page.evaluate("(()=>{const out={};for(const id of ['matching-chip','fractional-edge','transparent-edge','generated-edge','compact-social','shadow-card','near-white-card','authored-dark-frame','authored-strong-frame','selected-card','linked-heading-card','matching-blue-fill']){const e=document.querySelector('[data-audit-id='+id+']'),s=getComputedStyle(e),p=getComputedStyle(e,'::after'),r=e.getBoundingClientRect();let n=e,bg;while(n){const t=getComputedStyle(n);if(/^rgb\\(/.test(t.backgroundColor)){bg=t.backgroundColor;break;}n=n.parentElement;}out[id]={box:[r.width,r.height],width:s.borderTopWidth,edge:s.borderTopColor,background:bg,shadow:s.boxShadow,outline:s.outlineStyle,afterWidth:p.borderTopWidth,after:p.borderTopColor};}return out})()");
  const sourceBorders = await readBorders();
  const selectedPixels = async () => {
    const clip=await page.evaluate("(()=>{const r=document.querySelector('[data-audit-id=linked-heading-card]').getBoundingClientRect();return{x:r.left+scrollX,y:r.top+scrollY+r.height/2,width:6,height:1,scale:1}})()");
    const {data}=await page.send('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:true});
    return page.evaluate(`(async()=>{const i=new Image();i.src=${JSON.stringify('data:image/png;base64,') }+${JSON.stringify(data)};await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);return Array.from(x.getImageData(0,0,c.width,1).data)})()`);
  };
  for (const theme of ['chromium','soft','contrast']) {
    let previous = [0,0,0], previousDark = [0,0], selectedInk = ['', ''], selectedSpread = [0,0];
    let offStrokePixels=0;
    for (const level of ['off','very-low','low','medium','high','maximum']) {
      await browser.rule(bordersUrl,theme,level);
      await until(async()=>{
        const f=await readBorders(),ratios=['matching-chip','fractional-edge','generated-edge'].map(id=>contrast(color(id==='generated-edge'?f[id].after:f[id].edge),color(f[id].background)));
        if(Object.values(f).some(v=>color(v.background).slice(0,3).reduce((a,b)=>a+b,0)>300)||
            f['shadow-card'].background!==f['near-white-card'].background||
            (level!=='off'&&!f['compact-social'].shadow.includes('inset'))) return false;
        return level==='off'?ratios[0]<1.8&&ratios[1]<3&&ratios[2]<2:ratios.every((v,i)=>v+.05>=previous[i])&&ratios.some((v,i)=>v>previous[i]+.02);
      },theme+'/'+level+' border paint');
      const facts=await readBorders();
      for(const id of Object.keys(facts)) if(JSON.stringify(facts[id].box)!==JSON.stringify(sourceBorders[id].box)||facts[id].width!==sourceBorders[id].width||facts[id].afterWidth!==sourceBorders[id].afterWidth) throw Error('Border geometry changed: '+theme+'/'+level+'/'+id);
      for(const [index,id] of ['selected-card','linked-heading-card'].entries()) {
        const ink=color(facts[id].edge);
        const ratio=contrast(ink,color(facts[id].background));
        if(ratio<4.5||ink[2]<=ink[0]||ink[2]<ink[1]) throw Error('Colored card edge lacks contrast or loses blue hue: '+theme+'/'+level+' '+JSON.stringify(facts[id]));
        if(level==='off') selectedInk[index]=facts[id].edge;
        if(facts[id].edge!==selectedInk[index]) throw Error('Selected edge changed its Off ink: '+theme+'/'+level);
        if(facts[id].outline!=='none') throw Error('Selected border received a covering outline: '+theme+'/'+level);
        if(level==='off') {
          if(facts[id].shadow!==sourceBorders[id].shadow) throw Error('Off selected shadow changed');
        } else {
          const match=/^(rgba?\([^)]*\)) 0px 0px 0px ([\d.]+)px inset, /.exec(facts[id].shadow);
          if(!match||match[1]!==facts[id].edge||Number(match[2])<=selectedSpread[index]||
              !facts[id].shadow.endsWith(', '+sourceBorders[id].shadow)) throw Error('Selection stroke extension lost its ink, level or source shadow: '+theme+'/'+level+' '+facts[id].shadow);
          selectedSpread[index]=Number(match[2]);
        }
      }
      if(level==='off'||level==='maximum') {
        const pixels=await selectedPixels(),ink=color(facts['linked-heading-card'].edge);
        let count=0;for(let n=0;n<pixels.length;n+=4) if(ink.slice(0,3).every((v,i)=>Math.abs(v-pixels[n+i])<=2)) count++;
        if(level==='off') offStrokePixels=count;
        else if(count<=offStrokePixels) throw Error('Selected frame did not visibly grow in its original ink: '+theme+' '+offStrokePixels+' -> '+count);
      }
      if(facts['matching-blue-fill'].edge!==(theme==='chromium'?sourceBorders['matching-blue-fill'].edge:theme==='soft'?'rgb(146, 158, 175)':'rgb(194, 204, 220)')) throw Error('Matching colored button fill was given an artificial frame: '+theme+'/'+level+' '+JSON.stringify(facts['matching-blue-fill']));
      if(color(facts['transparent-edge'].edge)?.[3]!==0) throw Error('Transparent reservation became visible');
      const ratios=['matching-chip','fractional-edge','generated-edge'].map(id=>contrast(color(id==='generated-edge'?facts[id].after:facts[id].edge),color(facts[id].background)));
      if(level==='off'&&(ratios[0]>1.8||ratios[1]>3||ratios[2]>2)) throw Error('Off border amplified: '+theme+' '+JSON.stringify(ratios));
      if(ratios.some((v,i)=>v+.05<previous[i])) throw Error('Border emphasis decreased: '+theme+'/'+level+' '+JSON.stringify(ratios));
      previous=ratios;
      if(theme==='chromium') {
        const ids=['authored-dark-frame','authored-strong-frame'];
        const darkRatios=ids.map(id=>contrast(color(facts[id].edge),color(facts[id].background)));
        if(level==='off'&&ids.some(id=>facts[id].edge!==sourceBorders[id].edge||facts[id].background!==sourceBorders[id].background)) throw Error('Already dark source frame was attenuated');
        if(darkRatios.some((value,i)=>value+.02<previousDark[i])) throw Error('Dark source emphasis decreased: '+level+' '+JSON.stringify(darkRatios));
        if(level==='very-low'&&darkRatios.some((value,i)=>value<previousDark[i]+.2)) throw Error('Very low must increase the authored dark frame');
        previousDark=darkRatios;
      }
      if(level!=='off'&&!facts['compact-social'].shadow.includes('inset')) throw Error('Accessible single-glyph control ignores emphasis');
      if(facts['shadow-card'].background!==facts['near-white-card'].background) throw Error('Equivalent source card surfaces diverged: '+theme+'/'+level+' '+JSON.stringify([facts['shadow-card'],facts['near-white-card']]));
    }
    results.push({case:'neutral-border-levels-and-glyph-control',theme,passed:true});
  }
  }
  if (wanted('images')) {
  const imagesUrl = await open('images');
  for (const theme of ['chromium', 'soft', 'contrast']) {
    await browser.rule(imagesUrl, theme, 'off');
    await until(() => page.evaluate("getComputedStyle(document.querySelector('[data-audit-id=static-gif]')).filter!=='none'"), theme + ' static GIF');
    await page.evaluate("document.querySelector('[data-audit-id=wordmark]').scrollIntoView({block:'center'})");
    await until(()=>page.evaluate("getComputedStyle(document.querySelector('[data-audit-id=wordmark]').parentElement).backgroundColor==='rgb(255, 255, 255)'"),theme+' visible wordmark backing');
    await page.evaluate("document.querySelector('[data-audit-id=wordmark-backing]').scrollIntoView({block:'center'})");
    await until(() => page.evaluate("getComputedStyle(document.querySelector('[data-audit-id=wordmark-backing]')).backgroundColor==='rgb(255, 255, 255)'"), 'padded artwork backing');
    const imageFacts = await page.evaluate("(()=>{const s=id=>getComputedStyle(document.querySelector('[data-audit-id='+id+']'));return{animatedFilter:s('animated-gif').filter,animatedBackground:s('animated-gif').backgroundColor,multiPngFilter:s('multicolor-png').filter,multiGifFilter:s('multicolor-gif').filter,wordmark:s('wordmark').backgroundColor,wordmarkParent:getComputedStyle(document.querySelector('[data-audit-id=wordmark]').parentElement).backgroundColor}})()");
    if (imageFacts.animatedFilter !== 'none' || imageFacts.multiPngFilter !== 'none' || imageFacts.multiGifFilter !== 'none') throw Error('Animated or multicolor negative was tinted');
    if (imageFacts.animatedBackground !== 'rgb(247, 247, 247)' || (imageFacts.wordmark !== 'rgb(255, 255, 255)' && imageFacts.wordmarkParent !== 'rgb(255, 255, 255)')) throw Error('Original artwork backing lost: '+theme+' '+JSON.stringify(imageFacts));
    await page.evaluate("document.querySelector('[data-audit-id=bare-static-gif]').scrollIntoView({block:'center'})");
    await until(() => page.evaluate("getComputedStyle(document.querySelector('[data-audit-id=bare-static-gif]')).filter!=='none'"), theme + ' captioned static GIF');
    await until(() => page.evaluate("getComputedStyle(document.querySelector('[data-audit-id=bare-wordmark]')).backgroundColor==='rgb(255, 255, 255)'"), theme + ' captioned wordmark backing');
    const bare = await page.evaluate("(()=>{const s=getComputedStyle(document.querySelector('[data-audit-id=bare-animated-gif]'));return{filter:s.filter,background:s.backgroundColor}})()");
    if (bare.filter !== 'none' || bare.background !== 'rgb(255, 255, 255)') throw Error('Captioned animated artwork lost its original backing or was tinted');
    results.push({ case: 'static-versus-animated-artwork', theme, passed: true });
  }
  }
  if (wanted('surfaces')) {
  const surfacesUrl = await open('surfaces');
  const readLabels = () => page.evaluate(`(()=>{
    return [...document.querySelectorAll('.photo-card>strong,.photo-card>span')].map(e=>{
      const s=getComputedStyle(e),r=e.getBoundingClientRect(),link=getComputedStyle(e.closest('a'));
      const decoration=s.textDecorationLine==='none'?link:s;
      return {shadow:s.textShadow,decoration:decoration.textDecorationLine,thickness:decoration.textDecorationThickness,
        offset:decoration.textUnderlineOffset,linkDecoration:link.textDecorationLine,linkThickness:link.textDecorationThickness,
        stroke:s.webkitTextStrokeWidth,size:[r.width,r.height]};
    });
  })()`);
  const sourceLabels = await readLabels();
  for (const theme of ['chromium', 'soft', 'contrast']) {
    await browser.rule(surfacesUrl, theme, 'off'); await page.evaluate('new Promise(r=>setTimeout(r,300))');
    const facts = await page.evaluate(`(()=>{
      const panel=document.querySelector('.decorative-panel'),image=getComputedStyle(panel).backgroundImage;
      const encoded=/^url\\("data:image\\/svg\\+xml,(.*)"\\)$/.exec(image)?.[1];
      const xml=encoded&&new DOMParser().parseFromString(decodeURIComponent(encoded),'image/svg+xml');
      const h=panel.querySelector('h3'),labels=[...document.querySelectorAll('.photo-card>strong,.photo-card>span')].map(e=>{const s=getComputedStyle(e);return{id:e.closest('a').dataset.auditId,ink:s.webkitTextFillColor,backing:s.backgroundColor,shadow:s.textShadow}});
      return{ink:getComputedStyle(h).webkitTextFillColor,stops:xml?[...xml.querySelectorAll('stop')].map(e=>e.getAttribute('stop-color')):[],labels};
    })()`);
    if (!facts.stops.length || facts.stops.some(stop => contrast(color(facts.ink), color(stop)) < (theme === 'contrast' ? 7 : 4.5))) throw Error('Pale SVG heading contrast: ' + theme + ' ' + JSON.stringify(facts));
    // Selecting foreground ink must not add a rectangle, letter/underline
    // outline or extra geometry. Existing authored shadows stay unchanged.
    for (const label of facts.labels) {
      const backing=color(label.backing),ink=color(label.ink);
      if (!ink || backing?.[3]!==0) throw Error('Flow label received a solid backing');
      const expectedLight = label.id !== 'bright-image-text';
      if (expectedLight ? ink.slice(0,3).some(v=>v<245) : ink.slice(0,3).some(v=>v>30)) {
        throw Error('Picture text polarity failed: '+theme+' '+JSON.stringify(label));
      }
    }
    const appliedLabels = await readLabels();
    if (JSON.stringify(appliedLabels)!==JSON.stringify(sourceLabels)) throw Error('Flow text shadow, underline, stroke or geometry changed: '+theme);
    const lineColors=await page.evaluate("[...document.querySelectorAll('.photo-card>strong,.photo-card>span')].map(e=>{const s=getComputedStyle(e),a=e.closest('a');return{id:a.dataset.auditId,ink:s.color,line:s.textDecorationColor}})");
    const expectedLines={'image-text-colored-line':'rgb(109, 178, 234)','bright-image-text':'rgb(0, 102, 153)','dark-image-text':'rgb(177, 209, 244)'};
    if(lineColors.some(v=>v.line!==(expectedLines[v.id]||v.ink))) throw Error('Underline lost adaptive source color or preservation control: '+theme+' '+JSON.stringify(lineColors));

    await page.evaluate("document.querySelector('[data-audit-id=image-text]').scrollIntoView({block:'center'})");
    await page.evaluate("document.querySelector('[data-audit-id=image-text]').focus()");
    if (JSON.stringify(await readLabels())!==JSON.stringify(sourceLabels)) throw Error('Focus changed text decoration geometry');
    await page.evaluate("document.activeElement.blur()");
    for (const selector of ['[data-audit-id=image-text-shadow]','[data-audit-id=image-text-colored-line]']) {
      const hoverBox=await page.evaluate(`(()=>{const r=document.querySelector('${selector}').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
      await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',...hoverBox});
      await until(()=>page.evaluate(`getComputedStyle(document.querySelector('${selector}')).textDecorationLine==='none'&&[...document.querySelector('${selector}').children].every(e=>getComputedStyle(e).textDecorationLine==='none')`),'source hover underline removal');
      await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0});
      await until(()=>page.evaluate(`getComputedStyle(document.querySelector('${selector}>strong')).textDecorationLine==='underline'`),'source hover underline restoration');
    }
    const inkFrames=await page.evaluate(`(async()=>{
      const frames=[];
      for(let i=0;i<24;i++){
        document.body.classList.toggle('resample-probe');scrollTo(0,i%2?24:0);
        await new Promise(requestAnimationFrame);
        frames.push([...document.querySelectorAll('.photo-card>strong,.photo-card>span')].map(e=>{const s=getComputedStyle(e);return[s.webkitTextFillColor,s.textDecorationColor]}));
      }
      scrollTo(0,0);return frames;
    })()`);
    if(new Set(inkFrames.map(frame=>JSON.stringify(frame))).size!==1) throw Error('Picture text polarity flickered during resampling: '+theme);
    await writeFile(path.join(directory,'flow-text-'+theme+'.json'),JSON.stringify({labels:facts.labels,lineColors,stableFrames:inkFrames.length},null,2));
    await writeFile(path.join(directory,'flow-text-'+theme+'.png'),Buffer.from((await page.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    results.push({ case: 'gradient-and-picture-labels', theme, passed: true });
  }
  }
  if (wanted('states')) {
  const statesUrl = await open('states');
  for(const theme of ['chromium','soft','contrast']) {
    await browser.rule(statesUrl,theme,'off');
    await until(()=>page.evaluate("[...document.querySelectorAll('.icon-state-card img')].every(e=>getComputedStyle(e).filter!=='none')"),theme+' verified SVG state probes');
    const steady=await page.evaluate("(async()=>{const out=[];for(let i=0;i<24;i++){document.body.classList.toggle('resample-probe');scrollTo(0,i%2?20:0);await new Promise(requestAnimationFrame);out.push([...document.querySelectorAll('.icon-state-card')].map(e=>({background:getComputedStyle(e).backgroundColor,filter:getComputedStyle(e.querySelector('img')).filter})));}return out})()");
    for(let index=0;index<2;index++) if(new Set(steady.map(pair=>JSON.stringify(pair[index]))).size!==1) throw Error('SVG ink flickered on an unchanged backdrop: '+theme);
    const frames=await page.evaluate(`(async()=>{
      const out=[];let previous=getComputedStyle(document.querySelector('.icon-state-card')).backgroundColor;
      for(let phase=0;phase<4;phase++) {
        document.body.classList.toggle('scroll-probe',phase%2===0);scrollTo(0,phase%2?0:20);
        let changed=false;
        for(let frame=0;frame<120;frame++) {
          await new Promise(requestAnimationFrame);
          const pair=[...document.querySelectorAll('.icon-state-card')].map(e=>({background:getComputedStyle(e).backgroundColor,filter:getComputedStyle(e.querySelector('img')).filter}));
          out.push(pair);
          if(pair[0].background!==previous){previous=pair[0].background;changed=true;break;}
        }
        if(!changed) throw Error('Changed-backing phase did not settle');
      }
      document.body.classList.remove('scroll-probe');scrollTo(0,0);return out;
    })()`);
    await writeFile(path.join(directory,'svg-scroll-'+theme+'.json'),JSON.stringify(frames,null,2));
    if(frames.some(pair=>pair.some(c=>c.filter==='none'))) throw Error('Verified SVG filter flashed: '+theme);
    await until(()=>page.evaluate("(()=>{const cards=[...document.querySelectorAll('.icon-state-card')].map(e=>getComputedStyle(e).backgroundColor);return cards[0]===cards[1]})()"),theme+' settled equivalent card surfaces');
    if(new Set(frames.map(pair=>pair[0].background)).size<2) throw Error('Scroll probe did not exercise a changed backing');
    results.push({case:'verified-svg-scroll-state-stability',theme,passed:true,frames:frames.length,filterStates:[...new Set(frames.map(pair=>pair[0].filter))]});
  }
  await browser.rule(statesUrl,'source');
  const original = await page.evaluate("(()=>{const e=document.querySelector('.track .shadow-card'),r=e.getBoundingClientRect();return{size:[r.width,r.height],shadow:getComputedStyle(e).boxShadow}})()");
  for (const theme of ['chromium', 'soft', 'contrast']) {
    const shadows = [];
    for (const level of ['off', 'maximum']) {
      await browser.rule(statesUrl, theme, level); await page.evaluate('new Promise(r=>setTimeout(r,250))');
      const facts = await page.evaluate("(()=>{const e=document.querySelector('.track .shadow-card'),s=getComputedStyle(e),r=e.getBoundingClientRect();return{size:[r.width,r.height],shadow:s.boxShadow}})()");
      if (facts.size.some((v, i) => Math.abs(v - original.size[i]) > .05)) throw Error('Slide card geometry changed');
      if (!facts.shadow.includes('255, 255, 255')) throw Error('Card outer shadow did not adapt: ' + theme + '/' + level + ' ' + JSON.stringify(facts));
      if (level === 'maximum' && !facts.shadow.includes('inset')) throw Error('Short slide ignores border emphasis');
      shadows.push(facts.shadow);
    }
    if (shadows[0] === shadows[1]) throw Error('Card border levels have no effect');
    results.push({ case: 'short-shadow-card-emphasis', theme, passed: true });
  }
  }
  if (wanted('contact')) {
  const contactUrl = server.base + '/fixtures/contact-glyphs.html';
  await browser.rule(contactUrl, 'source'); await page.send('Page.navigate', { url: contactUrl });
  await until(() => page.evaluate("document.readyState==='complete'&&!!document.querySelector('#media')"), 'contact controls');
  const readContact = () => page.evaluate(`(()=>{
    const result={};
    for(const id of ['paragraph','nested','direct','readable','multicolor','large','pattern','media','unlabeled','threecolor','complex']) {
      const e=document.getElementById(id),s=getComputedStyle(e),rect=e.getBoundingClientRect();let p=e,bg;
      while(p){const v=getComputedStyle(p);if(/^rgb\\(/.test(v.backgroundColor)){bg=v.backgroundColor;break;}p=p.parentElement;}
      const data=/^url\\("data:image\\/svg\\+xml,(.*)"\\)$/.exec(s.backgroundImage)?.[1];
      const xml=data&&new DOMParser().parseFromString(decodeURIComponent(data),'image/svg+xml');
      result[id]={image:s.backgroundImage,background:bg,ink:s.webkitTextFillColor,repeat:s.backgroundRepeat,
        size:s.backgroundSize,position:s.backgroundPosition,box:[rect.width,rect.height],
        geometry:xml?[...xml.querySelectorAll('path')].map(n=>n.getAttribute('d')):[],
        paints:xml?[...xml.querySelectorAll('path')].map(n=>n.getAttribute('fill')??xml.documentElement.getAttribute('fill')).filter(c=>c&&c!=='none'):[]};
    }return result;
  })()`);
  const hue = ink => {
    const [r,g,b]=color(ink).slice(0,3).map(v=>v/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
    return !d ? NaN : ((max===r?(g-b)/d:max===g?(b-r)/d+2:(r-g)/d+4)*60+360)%360;
  };
  const contactSource = await readContact();
  for (const theme of ['chromium', 'soft', 'contrast']) {
    await browser.rule(contactUrl, theme, 'off'); await page.evaluate('new Promise(r=>setTimeout(r,200))');
    const facts = await readContact();
    await until(()=>page.evaluate("getComputedStyle(document.querySelector('#media img')).content.includes('data:image/svg+xml,')"),'labeled compact SVG image');
    for (const id of ['paragraph', 'nested', 'direct', 'media']) if (!facts[id].paints.length || facts[id].paints.some(ink => contrast(color(ink), color(facts[id].background)) < 10)) throw Error('Compact contact glyph contrast: ' + theme + '/' + id);
    for (const id of ['readable', 'large', 'unlabeled', 'complex']) if (facts[id].image !== contactSource[id].image) throw Error('Contact negative modified: ' + id);
    for (const id of ['multicolor','threecolor','pattern']) {
      const current=facts[id],source=contactSource[id];
      if (!current.paints.length || current.paints.some(ink=>contrast(color(ink),color(current.background))<(id==='pattern'?7:4.5))) throw Error('Labeled palette/tile contrast: '+theme+'/'+id);
      if (JSON.stringify([current.geometry,current.repeat,current.size,current.position,current.box])!==JSON.stringify([source.geometry,source.repeat,source.size,source.position,source.box])) throw Error('Glyph geometry or repetition changed: '+id);
      if (contrast(color(current.ink),color(current.background))<4.5) throw Error('Label lost contrast beside adapted drawing');
    }
    for (let i=0;i<2;i++) {
      const delta=Math.abs(hue(facts.multicolor.paints[i])-hue(contactSource.multicolor.paints[i]));
      if (!Number.isFinite(delta) || Math.min(delta,360-delta)>25) throw Error('Two-ink hue was lost');
    }
    const child=await page.evaluate("(()=>{const e=document.querySelector('#media img'),s=getComputedStyle(e);const encoded=/^url\\(\"data:image\\/svg\\+xml,(.*)\"\\)$/.exec(s.content)?.[1];const xml=encoded&&new DOMParser().parseFromString(decodeURIComponent(encoded),'image/svg+xml');return{source:e.getAttribute('src'),filter:s.filter,inks:xml?[...xml.querySelectorAll('path')].map(p=>p.getAttribute('fill')):[],geometry:xml?[...xml.querySelectorAll('path')].map(p=>p.getAttribute('d')):[]}})()");
    if (child.filter!=='none'||child.source!=='multicolor-artwork.svg'||child.inks.length!==3||child.inks.some(ink=>contrast(color(ink),color(facts.media.background))<4.5)) throw Error('Small labeled SVG lost readable palette or source');
    results.push({ case: 'contact-positives-and-conservative-negatives', theme, passed: true,
      child, glyphs: Object.fromEntries(['paragraph', 'nested', 'direct', 'media', 'multicolor', 'pattern'].map(id => [id, {
        ink: facts[id].paints, background: facts[id].background,
        contrast: facts[id].paints.map(ink => contrast(color(ink), color(facts[id].background)))
      }])) });
    if (theme === 'chromium') await page.evaluate("document.querySelector('#multicolor').scrollIntoView({block:'center'})");
    if (theme === 'chromium') await writeFile(path.join(directory, 'contact-glyphs-corrected.png'),
      Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  }
  }
  if (wanted('contact')) {
    const url=server.base+'/fixtures/diagnostics/jitpack-paint.html';await browser.rule(url,'source');await page.send('Page.navigate',{url});
    await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'JitPack font fixture');
    const read=()=>page.evaluate("(()=>Object.fromEntries([...document.querySelectorAll('[data-audit-id]')].map(e=>{const s=getComputedStyle(e),p=getComputedStyle(e,'::before'),r=e.getBoundingClientRect();let n=e,b;while(n){b=getComputedStyle(n).backgroundColor;if(b!=='rgba(0, 0, 0, 0)')break;n=n.parentElement}return[e.dataset.auditId,{color:s.color,background:b,pseudo:p.color,opacity:+s.opacity,edge:s.borderBottomColor,width:s.borderBottomWidth,box:[r.width,r.height]}]})))()");
    await page.evaluate('Promise.all([...document.images].map(i=>i.decode()))');
    const source=await read();
    const gradientHistory=new Map();
    for(const theme of ['chromium','soft','contrast'])for(const level of ['off','very-low','low','medium','high','maximum']){
      await browser.rule(url,theme,level);
      await until(async()=>{const f=await read();return contrast(color(f.document.pseudo),color(f.document.background))>=4.4;},theme+' font glyph');
      const f=await read();
      for(const id of ['line','document','snow','support'])if(JSON.stringify(f[id].box)!==JSON.stringify(source[id].box))throw Error('JitPack source geometry changed: '+id);
      const snow=color(f.snow.pseudo),bg=color(f.snow.background),op=f.snow.opacity;const effective=snow.map((v,i)=>i===3?1:v*op+bg[i]*(1-op));
      if(contrast(effective,bg)<2.95||f.disabled.opacity!==.3)throw Error('Status glyph unreadable or disabled opacity changed');
      await until(async()=>{const f=await read();return contrast(color(f.support.color),color(f.support.background))>=6.95&&f['support-icon'].pseudo===f.support.color;},theme+' small support label and inherited icon');
      const supportBox=await page.evaluate("(()=>{const r=document.querySelector('[data-audit-id=support]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()");
      await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',...supportBox});
      await until(async()=>{const f=await read();return f.support.background==='rgb(47, 168, 125)'&&contrast(color(f.support.color),color(f.support.background))>=6.95&&f['support-icon'].pseudo===f.support.color;},theme+' support hover label/icon');
      await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:2,y:2});
      await page.evaluate("(()=>{const e=document.querySelector('[data-audit-id=support]');e.style.visibility='hidden';e.style.visibility='visible';e.focus()})()");
      await until(async()=>{const f=await read();return contrast(color(f.support.color),color(f.support.background))>=6.95&&f['support-icon'].pseudo===f.support.color;},theme+' support focus and late visibility');
      await page.evaluate("document.querySelector('[data-audit-id=support]').blur()");
      if(f.line.width!==source.line.width||f.strong.width!==source.strong.width)throw Error('Horizontal width changed');
      if(level==='off'&&f.line.edge===source.line.edge)throw Error('Dark gradient edge still overly bright');
      const edgeInk=color((await read()).line.edge);
      if(Math.max(...edgeInk.slice(0,3))-Math.min(...edgeInk.slice(0,3))>24)throw Error('Neutral source frame borrowed the gradient hue');
      const gradientRatio=contrast(edgeInk,[15,52,96,1]);
      if(gradientRatio<=(gradientHistory.get(theme)??1)+.05)throw Error('Gradient frame emphasis did not increase');
      gradientHistory.set(theme,gradientRatio);
      await until(()=>page.evaluate("[...document.querySelectorAll('.partners img')].slice(0,2).every(e=>getComputedStyle(e).backgroundColor!=='rgba(0, 0, 0, 0)')"),theme+' wordmark backings');
      const logos=await page.evaluate("[...document.querySelectorAll('.partners img')].map(e=>({src:e.getAttribute('src'),backing:getComputedStyle(e).backgroundColor,filter:getComputedStyle(e).filter}))");
      if(logos.some(e=>e.filter!=='none'||!e.src.startsWith('site-assets/jitpack-')))throw Error('Mixed logo pixels/source modified');
      if(!logos.slice(0,2).every(e=>color(e.backing)[3]===1))throw Error('Dark mixed wordmark lost its required light backing');
      if(color(logos[2].backing)[3]!==0)throw Error('Readable GitLab artwork acquired an unnecessary backing');
      const row=color((await read()).partners.background);
      if(contrast([140,146,157,1],row)<contrast([140,146,157,1],color(source.partners.background)))throw Error('Original GitLab wordmark lost contrast compared with its light backing');
      results.push({case:'jitpack-paint',theme,level,logos,passed:true});
    }
  }
  if(wanted('cards')){
    const url=server.base+'/fixtures/diagnostics/kotlin-feedback.html';await browser.rule(url,'source');await page.send('Page.navigate',{url});
    await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'feedback panel');
    const read=()=>page.evaluate("(()=>Object.fromEntries([...document.querySelectorAll('[data-audit-id]')].map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return[e.dataset.auditId,{background:s.backgroundColor,color:s.color,shadow:s.boxShadow,widths:['Top','Right','Bottom','Left'].map(p=>s['border'+p+'Width']),outline:s.outlineStyle,outlineWidth:s.outlineWidth,outlineColor:s.outlineColor,box:[r.width,r.height],radius:s.borderRadius,canvas:getComputedStyle(document.body).backgroundColor}]})))()");
    const source=await read();
    const edge=f=>f.outline==='solid'?f.outlineColor:f.shadow.includes('inset')?f.shadow.match(/rgba?\([^)]+\)/)?.[0]:null;
    for(const theme of ['chromium','soft','contrast']){let previous=1,off;
      for(const level of ['off','very-low','low','medium','high','maximum','off']){
        await browser.rule(url,theme,level);
        await until(async()=>{const f=(await read()).reported;return contrast(color(f.background),color(f.canvas))>1.1&&(level==='off'?f.outline==='none'&&f.shadow==='none':edge(f)&&contrast(color(edge(f)),color(f.background))>previous+.05);},theme+'/'+level+' feedback frame')
          .catch(async e=>{throw Error(e.message+' '+JSON.stringify(await read()));});
        const f=await read();
        for(const id of Object.keys(source))if(JSON.stringify(f[id].box)!==JSON.stringify(source[id].box)||JSON.stringify(f[id].widths)!==JSON.stringify(source[id].widths)||f[id].radius!==source[id].radius)throw Error('Feedback geometry changed: '+id);
        if(level==='off'){
          if(f.reported.outline!=='none'||f.reported.shadow!=='none')throw Error('Off manufactured a feedback frame');
          off??=f.reported.background;
        }else previous=contrast(color(edge(f.reported)),color(f.reported.background));
        if(f.reported.background!==off)throw Error('Feedback frame preference changed its fill');
        if(contrast(color(f.reported.color),color(f.reported.background))<4.5)throw Error('Feedback label lost readability');
        for(const id of ['framed','transparent','square'])if(f[id].outline!=='none'||f[id].shadow!=='none')throw Error('Feedback edge leaked into preservation control: '+id);
        if(f.outlined.outline!==source.outlined.outline||f.outlined.outlineWidth!==source.outlined.outlineWidth||f.outlined.shadow!=='none')throw Error('Authored feedback outline lost');
        if(level==='off'){
          await page.evaluate("document.querySelector('[data-audit-id=reported]').focus()");
          await until(()=>page.evaluate("document.querySelector('[data-audit-id=reported]').matches(':focus-visible')"),'feedback focus');
          const focus=await read();if(focus.reported.outline!=='solid'||focus.reported.outlineWidth!=='2px')throw Error('Feedback focus outline lost');
          await page.evaluate('document.activeElement.blur()');
          await until(async()=>{const a=(await read()).reported;return a.outline==='none'&&a.shadow==='none';},'feedback unfocused Off');
        }
        results.push({case:'kotlin-feedback',theme,level,passed:true});
      }
    }
  }
  if(wanted('cards')){
    const url=server.base+'/fixtures/diagnostics/neutral-action-surfaces.html';
    await browser.rule(url,'source');await page.send('Page.navigate',{url});
    await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'neutral action surfaces');
    const read=()=>page.evaluate("(()=>Object.fromEntries([...document.querySelectorAll('[data-audit-id]')].map(e=>{const s=getComputedStyle(e),p=getComputedStyle(e.parentElement),r=e.getBoundingClientRect();return[e.dataset.auditId,{fill:s.backgroundColor,outside:p.backgroundColor,color:s.color,shadow:s.boxShadow,border:s.borderTopWidth,radius:s.borderRadius,image:s.backgroundImage,opacity:s.opacity,outline:s.outlineStyle,box:[r.width,r.height]}]})))()");
    const source=await read(),negative=['transparent','brand','bordered','disabled','selected','picture','dark','good','same'];
    for(const theme of ['chromium','soft','contrast']){let baseline;
      for(const level of ['off','very-low','low','medium','high','maximum']){
        await browser.rule(url,theme,level);
        await until(async()=>{const f=await read();return ['filled','button'].every(id=>Math.max(...color(f[id].outside).slice(0,3))<128&&contrast(color(f[id].fill),color(f[id].outside))>=1.5&&(level!=='off'||f[id].shadow==='none'));},theme+'/'+level+' filled action separation')
          .catch(async e=>{throw Error(e.message+' '+JSON.stringify(await read()));});
        const f=await read();
        for(const id of ['filled','button']){
          if(contrast(color(f[id].color),color(f[id].fill))<4.5)throw Error('Filled action text lost readability');
          if(level==='off'&&f[id].shadow!=='none')throw Error('Surface repair manufactured an Off frame');
          if(baseline&&f[id].fill!==baseline[id].fill)throw Error('Border preference changed action fill');
        }
        for(const id of Object.keys(source))if(JSON.stringify(f[id].box)!==JSON.stringify(source[id].box)||f[id].radius!==source[id].radius||f[id].border!==source[id].border)throw Error('Action surface changed geometry: '+id);
        if(color(f.transparent.fill)[3]!==0||f.brand.fill!==source.brand.fill||f.good.fill!==source.good.fill||f.disabled.opacity!==source.disabled.opacity)throw Error('Surface repair modified protected paint '+theme+'/'+level+' '+JSON.stringify({source,f}));
        for(const id of ['dark','same','disabled','selected','bordered'])if(contrast(color(f[id].fill),color(f[id].outside))>=1.5)throw Error('Surface repair forced a surface on preservation control: '+id);
        if(baseline&&negative.some(id=>f[id].fill!==baseline[id].fill||f[id].image!==baseline[id].image))throw Error('Negative fill changed with emphasis');
        baseline??=f;
        if(level==='off'||level==='maximum'){
          await page.evaluate("document.querySelector('[data-audit-id=filled]').focus()");
          await until(()=>page.evaluate("document.querySelector('[data-audit-id=filled]').matches(':focus-visible')"),'action keyboard focus');
          const focus=await read();if(focus.filled.outline!=='solid')throw Error('Action focus lost authored outline');
          await page.evaluate("document.activeElement.blur();scrollTo(0,100);scrollTo(0,0)");
          await until(async()=>{const again=await read();return ['filled','button'].every(id=>again[id].fill===f[id].fill);},'action surface stable after focus/scroll').catch(async e=>{throw Error(e.message+' '+theme+'/'+level+' '+JSON.stringify({before:f,after:await read()}));});
        }
        results.push({case:'neutral-action-surfaces',theme,level,contrasts:['filled','button'].map(id=>contrast(color(f[id].fill),color(f[id].outside))),passed:true});
      }
    }
  }
  if(wanted('cards')){
    const url=server.base+'/fixtures/diagnostics/kotlin-article.html';await browser.rule(url,'source');await page.send('Page.navigate',{url});
    await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'Kotlin article');
    const read=()=>page.evaluate("(()=>Object.fromEntries([...document.querySelectorAll('[data-audit-id]')].map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return[e.dataset.auditId,{background:s.backgroundColor,shadow:s.boxShadow,filter:s.filter,box:[r.width,r.height],radius:s.borderRadius,outside:getComputedStyle(e.closest('.api-panel')??document.body).backgroundColor,canvas:getComputedStyle(document.body).backgroundColor,src:e.getAttribute('src'),shapes:[...e.querySelectorAll('path,circle')].map(n=>n.outerHTML),path:e.querySelector('path')&&getComputedStyle(e.querySelector('path')).fill}]})))()");
    const source=await read();
    for(const theme of ['chromium','soft','contrast']){let previous=[1,1];for(const level of ['off','very-low','low','medium','high','maximum']){
      await browser.rule(url,theme,level);
      await until(async()=>{const f=await read(),glyph=f['edit-icon'];return f['inline-icon'].filter!=='none'&&contrast(glyph.filter==='brightness(0) invert(1)'?[255,255,255,1]:color(glyph.path),color(f.note.background))>=4.5&&['note','button'].every((id,i)=>level==='off'?f[id].shadow==='none':f[id].shadow.includes('inset')&&contrast(color(f[id].shadow.match(/rgba?\([^)]+\)/)[0]),color(f[id].background))>previous[i]+.05);},theme+'/'+level+' sibling glyphs').catch(async e=>{throw Error(e.message+' '+JSON.stringify(await read()));});
      const f=await read(),canvas=await page.evaluate("getComputedStyle(document.body).backgroundColor");
      if(contrast(color(f.button.background),composite(color(f.button.outside),color(f.button.canvas)))<1.5)throw Error('Kotlin filled action merges with canvas');
      if(contrast(color(f.note.background),color(canvas))<1.1)throw Error('Semantic note merges with canvas');
      for(const [i,id]of ['note','button'].entries()){
        if(JSON.stringify(f[id].box)!==JSON.stringify(source[id].box)||f[id].radius!==source[id].radius)throw Error('Kotlin panel geometry changed');
        if(level==='off'&&f[id].shadow!=='none')throw Error('Off added a Kotlin frame');
        if(level!=='off'){
          if(!f[id].shadow.includes('inset'))throw Error('Missing semantic/action emphasis: '+id);
          const edge=color(f[id].shadow.match(/rgba?\([^)]+\)/)[0]),ratio=contrast(edge,color(f[id].background));
          if(ratio<=previous[i]+.05)throw Error('Kotlin emphasis not monotonic');previous[i]=ratio;
        }
      }
      for(const id of ['edit-icon','inline-icon','button'])if(JSON.stringify(f[id].box)!==JSON.stringify(source[id].box)||f[id].src!==source[id].src||JSON.stringify(f[id].shapes)!==JSON.stringify(source[id].shapes))throw Error('Kotlin glyph resource or geometry changed: '+id);
      if(f.unpaired.filter==='none'||f['isolated-image'].filter==='none'||f.ordinary.shadow!=='none')throw Error('Kotlin contextual repair leaked into negative');
      if(level==='off'||level==='maximum'){
        for(const id of ['edit-icon','inline-icon','unpaired']){
          const clip=await page.evaluate(`(()=>{const r=document.querySelector('[data-audit-id=${id}]').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()`);
          const {data}=await page.send('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:true});
          const pixels=await page.evaluate(`(async()=>{const i=new Image();i.src='data:image/png;base64,${data}';await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);return [...x.getImageData(0,0,c.width,c.height).data]})()`);
          let readable=0;for(let n=0;n<pixels.length;n+=4)if(contrast([...pixels.slice(n,n+3),1],color(canvas))>=4.5)readable++;
          if(readable<16)throw Error('Kotlin rendered glyph lacks readable pixels: '+theme+'/'+id);
        }
        await writeFile(path.join(directory,'kotlin-'+theme+'-'+level+'.png'),Buffer.from((await page.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
      }
      results.push({case:'kotlin-article',theme,level,passed:true});
    }}
  }
  if (wanted('cards')) {
  const bannerUrl=server.base+'/fixtures/diagnostics/clipped-heading-panel.html';
  await page.send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  await browser.rule(bannerUrl,'source');await page.send('Page.navigate',{url:bannerUrl});
  await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'clipped heading banner');
  const readBanner=()=>page.evaluate("(()=>Object.fromEntries(['banner','artwork','transparent','square','framed'].map(id=>{const e=document.querySelector('[data-audit-id='+id+']'),s=getComputedStyle(e),r=e.getBoundingClientRect();return[id,{box:[r.width,r.height],radius:s.borderRadius,image:s.backgroundImage,background:s.backgroundColor,outline:s.outlineStyle,ink:s.outlineColor,width:s.outlineWidth,offset:s.outlineOffset,headings:[...e.querySelectorAll('h1,h2')].map(h=>getComputedStyle(h).backgroundColor)}]})))()");
  const bannerSource=await readBanner();
  if(!bannerSource.banner.image.includes('banner-pattern.svg')||bannerSource.banner.outline!=='none')throw Error('Banner source context mismatch');
  for(const theme of ['chromium','soft','contrast']){let previous=1;for(const level of ['off','very-low','low','medium','high','maximum']){
    await browser.rule(bannerUrl,theme,level);
    await until(async()=>{const f=(await readBanner()).banner;return level==='off'?f.outline==='none':f.outline==='solid'&&contrast(color(f.ink),color(f.background))>previous+.05;},theme+' clipped panel emphasis');
    const facts=await readBanner(),panel=facts.banner;
    if(panel.headings.some(bg=>color(bg)[3]!==0))throw Error('Banner heading acquired a manufactured backing: '+theme);
    if(level==='high'&&contrast(color(panel.ink),color(panel.background))<previous*1.4)throw Error('High banner emphasis is too close to Medium');
    if(level!=='off'){previous=contrast(color(panel.ink),color(panel.background));if(parseFloat(panel.offset)!==-parseFloat(panel.width))throw Error('Banner edge is not inward');}
    for(const id of Object.keys(facts)){
      if(JSON.stringify(facts[id].box)!==JSON.stringify(bannerSource[id].box)||facts[id].radius!==bannerSource[id].radius||facts[id].image!==bannerSource[id].image)throw Error('Banner geometry or background changed: '+id);
      if(id!=='banner'&&facts[id].outline!=='none')throw Error('Panel outline leaked into negative: '+id);
    }
    await page.evaluate("document.querySelector('[data-audit-id=banner]').classList.toggle('resample');scrollTo(0,40);scrollTo(0,0)");
    await until(async()=>{const f=(await readBanner()).banner;return f.outline===panel.outline&&f.ink===panel.ink&&f.width===panel.width;},theme+' stable banner edge');
    results.push({case:'clipped-heading-panel',theme,level,edgeContrast:previous,passed:true});
  }}
  await page.send('Emulation.setDeviceMetricsOverride',{width:1000,height:1000,deviceScaleFactor:1,mobile:false});
  const formUrl=server.base+'/fixtures/diagnostics/spring-auth-panel.html';
  await browser.rule(formUrl,'source');await page.send('Page.navigate',{url:formUrl});
  await until(()=>page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"),'filter shadow form');
  const readForm=()=>page.evaluate("(()=>Object.fromEntries(['canvas','form-panel','illustration','mixed','colored','flat-canvas','ambiguous-canvas'].map(id=>{const e=document.querySelector('[data-audit-id='+id+']'),s=getComputedStyle(e),r=e.getBoundingClientRect();return[id,{background:s.backgroundColor,filter:s.filter,shadow:s.boxShadow,box:[r.width,r.height],radius:s.borderRadius}]})))()");
  const readFields=()=>page.evaluate("(()=>Object.fromEntries(['email','reserved-field','status-field','readable-field'].map(id=>{const e=document.getElementById(id),s=getComputedStyle(e),r=e.getBoundingClientRect();return[id,{background:s.backgroundColor,border:s.borderTopColor,width:s.borderTopWidth,style:s.borderTopStyle,box:[r.width,r.height],outlineStyle:s.outlineStyle}]})))()");
  const formSource=await readForm(),fieldSource=await readFields();
  await page.evaluate("document.documentElement.style.colorScheme='dark'");
  await until(async()=>color((await readFields()).email.background).slice(0,3).every(v=>v<100)&&await page.evaluate("!document.getElementById('email').getAnimations().some(a=>a.playState==='running')"),'native dark input backing');
  const nativeFieldBackground=(await readFields()).email.background;
  await page.evaluate("document.documentElement.style.removeProperty('color-scheme')");
  await until(async()=> (await readFields()).email.background===fieldSource.email.background,'source input backing restored');
  for(const theme of ['chromium','soft','contrast']) { let previousEdge=1; for(const level of ['off','very-low','low','medium','high','maximum']) {
    await browser.rule(formUrl,theme,level);
    await until(async()=>{const f=await readForm();return f['form-panel'].filter===formSource['form-panel'].filter&&contrast(color(f['form-panel'].background),color(f.canvas.background))>=1.16&&contrast(color(f['form-panel'].background),color(f.canvas.background))<=1.24&&(level==='off'?f['form-panel'].shadow==='none':f['form-panel'].shadow.includes('inset')&&contrast(color(f['form-panel'].shadow.match(/rgba?\([^)]+\)/)?.[0]),color(f['form-panel'].background))>previousEdge+.05);},theme+' separated form surface');
    const facts=await readForm(),panel=facts['form-panel'];
    await page.evaluate("document.getElementById('email').focus()");
    await until(async()=> (await readFields()).email.outlineStyle!=='none',theme+' native field handoff');
    await page.evaluate("document.getElementById('email').blur()");
    await until(async()=>{const f=await readFields();const ratio=contrast(color(f.email.border),color(f.email.background));return (theme!=='chromium'||f.email.background===nativeFieldBackground)&&f.email.style==='solid'&&ratio>=(theme==='contrast'?3:2.5)&&(theme!=='chromium'||level!=='off'||ratio<3.2);},theme+' readable inset field').catch(async e=>{throw Error(e.message+' native='+nativeFieldBackground+' actual='+JSON.stringify((await readFields()).email));});
    const fields=await readFields();
    if(fields.email.width!==fieldSource.email.width||!['solid','inset'].includes(fields.email.style)||JSON.stringify(fields.email.box)!==JSON.stringify(fieldSource.email.box))throw Error('Field contrast changed border geometry');
    if(color(fields['reserved-field'].border)[3]!==0)throw Error('Transparent field reservation became painted');
    if(fields['status-field'].style!==fieldSource['status-field'].style)throw Error('Status bevel was flattened');
    if(theme==='chromium'&&fields['status-field'].border!==fieldSource['status-field'].border)throw Error('Status field ink was replaced');
    if(level==='off'){
      await until(async()=>{
      const clip=await page.evaluate("(()=>{const r=document.getElementById('email').getBoundingClientRect();return{x:Math.floor(r.x+scrollX)-4,y:Math.floor(r.y+scrollY)-4,width:Math.ceil(r.width)+8,height:Math.ceil(r.height)+8,scale:1}})()");
      const {data}=await page.send('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:true});
      const samples=await page.evaluate(`(async()=>{const i=new Image();i.src='data:image/png;base64,${data}';await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);const at=(a,b)=>[...x.getImageData(a,b,1,1).data.slice(0,3),1];return{fill:at(12,c.height>>1),edges:[Array.from({length:8},(_,n)=>at(c.width>>1,n)),Array.from({length:8},(_,n)=>at(c.width>>1,c.height-1-n)),Array.from({length:8},(_,n)=>at(n,c.height>>1)),Array.from({length:8},(_,n)=>at(c.width-1-n,c.height>>1))]}})()`);
      const pixelContrasts=samples.edges.map(edge=>Math.max(...edge.map(ink=>contrast(ink,samples.fill))));
      return pixelContrasts.every(r=>r>=(theme==='contrast'?2.95:2.45));
      },theme+' rendered field border pixels');
      await page.evaluate("document.getElementById('email').focus()");
      await until(async()=> (await readFields()).email.outlineStyle!=='none',theme+' field focus feedback');
      await page.evaluate("document.getElementById('email').blur()");
      await until(async()=>{const f=await readFields();return f.email.border===fields.email.border;},theme+' field blur repair').catch(async e=>{throw Error(e.message+' before='+JSON.stringify(fields.email)+' after='+JSON.stringify((await readFields()).email));});
    }

    if(level!=='off'){const edge=color(panel.shadow.match(/rgba?\([^)]+\)/)[0]);previousEdge=contrast(edge,color(panel.background));if(previousEdge<1.5)throw Error('Form emphasis lacks separation');}
    for(const id of Object.keys(facts))if(JSON.stringify(facts[id].box)!==JSON.stringify(formSource[id].box)||facts[id].radius!==formSource[id].radius)throw Error('Form panel geometry changed');
    const geometry=s=>s.replace(/rgba?\([^)]+\)/g,'INK');
    if(geometry(panel.filter)!==geometry(formSource['form-panel'].filter))throw Error('Filter shadow geometry changed');
    if(panel.filter!==formSource['form-panel'].filter)throw Error('Tonal elevation changed the authored filter');
    if(color(facts.canvas.background).slice(0,3).some((v,i)=>v<=color(panel.background)[i]))throw Error('Form canvas must be lighter than the panel');
    if(facts['flat-canvas'].background!==facts['ambiguous-canvas'].background||facts['flat-canvas'].background===facts.canvas.background)throw Error('Canvas inference leaked into a flat or ambiguous layout');
    for(const id of ['illustration','mixed','colored'])if(facts[id].filter!==formSource[id].filter)throw Error('Unsupported/non-form filter changed: '+id);
    await page.evaluate("document.querySelector('[data-audit-id=form-panel]').classList.toggle('resample');scrollTo(0,40);scrollTo(0,0)");
    await page.evaluate('new Promise(r=>setTimeout(r,200))');
    const again=await readForm();if(again['form-panel'].background!==panel.background||again['form-panel'].filter!==panel.filter)throw Error('Form shadow resampling changed paint');
    results.push({case:'headed-form-filter-surface',theme,level,contrast:contrast(color(panel.background),color(facts.canvas.background)),filter:panel.filter,edgeContrast:previousEdge,passed:true});
  }}
  const cardsUrl = server.base + '/fixtures/scroll-banner.html';
  await browser.rule(cardsUrl, 'source'); await page.send('Page.navigate', { url: cardsUrl });
  await until(() => page.evaluate("document.querySelectorAll('article').length===240"), 'static article cards');
  const dimensions = await page.evaluate("(()=>{const r=document.querySelector('article').getBoundingClientRect();return[r.width,r.height]})()");
  for (const theme of ['chromium', 'soft', 'contrast']) {
    await browser.rule(cardsUrl, theme, 'off'); await page.evaluate('new Promise(r=>setTimeout(r,200))');
    const facts = await page.evaluate("(()=>{const e=document.querySelector('article'),r=e.getBoundingClientRect();return{card:getComputedStyle(e).backgroundColor,page:getComputedStyle(document.body).backgroundColor,size:[r.width,r.height]}})()");
    if (contrast(color(facts.card), color(facts.page)) < 1.2 || facts.size.some((v,i)=>Math.abs(v-dimensions[i])>.05)) throw Error('Card/page surfaces are indistinct or geometry changed: ' + theme);
    results.push({ case: 'article-page-surface-separation', theme, passed: true, ...facts });
  }
  }
  await writeFile(path.join(directory, 'shared-rendering-checks'+(args.length?'-'+selected.join('-'):'')+'.json'), JSON.stringify({groups:selected,elapsedMs:Math.round(performance.now()-started),results}, null, 2));
  console.log(`Shared rendering checks passed: ${results.length} theme/case combinations; groups: ${selected.join(", ")}. See the JSON report for exact cases.`);
} finally { await browser.close(); await server.close(); }
