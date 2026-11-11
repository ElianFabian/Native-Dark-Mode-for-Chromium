// Independent fixture expectations: sample displayed ink, retain negative controls,
// and assert computed geometry instead of trusting renderer classification tokens.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startServer } from './server.mjs';
import { launchBrowser, root, until } from './browser.mjs';
import { color, contrast } from '../../../tools/diagnostics/analysis.mjs';
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
  async function open(group) {
    const url = `${server.base}/fixtures/diagnostics/specimens.html?group=${group}`;
    await browser.rule(url, 'source'); await page.send('Page.navigate', { url });
    await until(() => page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"), 'fixture ' + group);
    await page.evaluate('Promise.all([...document.images].map(i=>i.decode()))'); return url;
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
    for(const id of ['paragraph','nested','direct','readable','multicolor','large','pattern','media','unlabeled','threecolor']) {
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
    for (const id of ['readable', 'large', 'unlabeled', 'threecolor']) if (facts[id].image !== contactSource[id].image) throw Error('Contact negative modified: ' + id);
    for (const id of ['multicolor','pattern']) {
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
  if (wanted('cards')) {
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
