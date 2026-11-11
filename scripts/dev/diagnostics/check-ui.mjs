// Runs after diagnose in unified --browser verification. Uses its own server/profile.
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startServer } from './server.mjs';
import { launchBrowser, root, until } from './browser.mjs';
import { cases } from '../../../tools/diagnostics/cases.mjs';
import { color, contrast } from '../../../tools/diagnostics/analysis.mjs';
const artifacts = path.join(root, 'research-artifacts', 'diagnostics');
await mkdir(artifacts, { recursive: true });
const server = await startServer(), browser = await launchBrowser();
try {
  const page = await browser.open(server.base);
  await until(() => page.evaluate(`document.querySelectorAll('#cases .card').length===${cases.length}`), 'gallery modules');
  await page.evaluate("document.querySelector('#case-search').value='GIF';document.querySelector('#case-search').dispatchEvent(new Event('input'))");
  if (!await page.evaluate("[...document.querySelectorAll('#cases .card')].some(e=>!e.hidden&&e.textContent.includes('GIF'))")) throw Error('Gallery search');
  const badOrigin = await fetch(server.base + '/api/run', { method: 'POST', headers: { Origin: 'http://evil.example', 'Content-Type': 'application/json' }, body: '{}' });
  if (badOrigin.status !== 403) throw Error('Missing same-origin guard');
  const badSuite = await fetch(server.base + '/api/run', { method: 'POST', headers: { Origin: server.base, 'Content-Type': 'application/json' }, body: '{"gallery":"unexpected"}' });
  if (badSuite.status !== 400) throw Error('Missing fixed-suite guard');
  const traversal = await fetch(server.base + '/fixtures/%2e%2e%2fextension/manifest.json');
  if (traversal.status !== 403) throw Error('Missing file containment guard');
  let report;
  for (const name of (await readdir(artifacts)).filter(n => /^run-/.test(n)).sort().reverse()) {
    try { const data = JSON.parse(await readFile(path.join(artifacts, name, 'capture.json'), 'utf8')); if (data.captures.some(c => c.specimen === 'subtle-frame')) { report = data; break; } } catch { /* Ignore incomplete runs. */ }
  }
  if (!report) throw Error('Run the local smoke suite before UI verification.');
  // Controlled measured defect gives the review UI an independent positive example.
  report = structuredClone(report); report.runId = 'ui-review-fixture';
  report.captures = report.captures.filter(c => c.specimen === 'subtle-frame' && (c.theme === 'source' || c.theme === 'chromium' && c.level === 'off'));
  report.captures[1].rows[0].layers[0].borders[0].width += 3;
  const file = path.join(artifacts, 'ui-review-fixture.json'); await writeFile(file, JSON.stringify(report));
  const document = await page.send('DOM.getDocument'), input = await page.send('DOM.querySelector', { nodeId: document.root.nodeId, selector: '#file' });
  await page.send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [file] });
  await until(() => page.evaluate("document.querySelectorAll('#queue article').length>0"), 'grouped review queue');
  await page.evaluate("document.querySelector('#queue button').click()");
  if (!await page.evaluate("!document.querySelector('#detail').hidden && document.querySelector('#raw').textContent.includes('original')")) throw Error('Raw evidence');
  await page.evaluate("[...document.querySelectorAll('#queue button')].find(b=>b.textContent==='Accept this appearance').click();document.querySelector('#queue-filter').value='accepted';document.querySelector('#queue-filter').dispatchEvent(new Event('change'))");
  if (!await page.evaluate("document.querySelector('#queue').textContent.includes('accepted appearance')")) throw Error('Accepted review');
  await page.evaluate("[...document.querySelectorAll('#queue button')].find(b=>b.textContent==='Reopen review').click()");
  if (await page.evaluate("document.querySelectorAll('#queue article').length")) throw Error('Reopened review retained in accepted list');
  await page.evaluate("document.querySelector('#queue-filter').value='priority';document.querySelector('#queue-filter').dispatchEvent(new Event('change'))");
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
  await page.evaluate('scrollTo(0,0)');
  await writeFile(path.join(artifacts, 'ui-review-queue.png'), Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await page.send('Emulation.setDeviceMetricsOverride', { width: 600, height: 900, deviceScaleFactor: 1, mobile: false });
  await page.evaluate("document.documentElement.style.fontSize='150%'");
  if (await page.evaluate('document.documentElement.scrollWidth>innerWidth')) throw Error('Narrow large-text report overflow');
  await page.evaluate("document.querySelector('[data-tab=gallery]').click()");
  if (await page.evaluate('document.documentElement.scrollWidth>innerWidth')) throw Error('Narrow large-text gallery overflow');
  if (!await page.evaluate("(()=>{const e=document.querySelector('#run');e.focus();return document.activeElement===e&&getComputedStyle(e).outlineStyle!=='none'})()")) throw Error('Keyboard focus');
  await page.send('Page.navigate', { url: server.base + '/fixtures/diagnostics/specimens.html?group=images' });
  await until(() => page.evaluate("document.documentElement.dataset.fixtureReady==='yes'&&[...document.images].every(i=>i.complete&&i.naturalWidth>0)"), 'all local PNG/SVG/GIF images decoded');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 900, deviceScaleFactor: 1, mobile: false });
  const rect = await page.evaluate("(()=>{const r=document.querySelector('[data-audit-id=animated-gif]').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()");
  const frames = new Set();
  for (let i = 0; i < 4; i++) { frames.add((await page.send('Page.captureScreenshot', { format: 'png', clip: rect })).data); await page.evaluate('new Promise(resolve=>setTimeout(resolve,250))'); }
  if (frames.size < 2) throw Error('Animated GIF did not display changing frames');
  const actualUrl = server.base + '/fixtures/diagnostics/site-elements.html?site=indeed';
  await page.send('Page.navigate', { url: actualUrl });
  await until(() => page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"), 'captured Indeed elements');
  const sampleIndeed = () => page.evaluate(`(()=>{
    const e=document.querySelector('.jobsearch-Layout--gradientBg'), heading=document.querySelector('[data-audit-id=indeed-greeting]');
    const image=getComputedStyle(e).backgroundImage, match=/url\\(["']?(data:image\\/svg\\+xml,[^"']+)["']?\\)/.exec(image);
    const xml=match?new DOMParser().parseFromString(decodeURIComponent(match[1].split(',').slice(1).join(',')),'image/svg+xml'):null;
    return {ink:getComputedStyle(heading).webkitTextFillColor,stops:xml?[...xml.querySelectorAll('stop')].map(s=>s.getAttribute('stop-color')):[],
      paths:[...document.querySelectorAll('[data-site=indeed] svg path')].map(p=>p.getAttribute('d')),icons:document.querySelectorAll('[data-site=indeed] [data-svg] svg').length};
  })()`);
  const authored = await sampleIndeed();
  if (authored.stops.join(',').toUpperCase() !== '#F7F9FF,#D7E3FF' || authored.icons !== 6) throw Error('Indeed fixture lost original embedded gradient or reported SVGs');
  const fidelity = [];
  const originalLogo = await page.evaluate("document.querySelector('[data-svg=\"indeed-logo.svg\"] svg').getBoundingClientRect().width");
  for (const theme of ['chromium', 'soft', 'contrast']) {
    await browser.rule(actualUrl, theme, 'off');
    await until(async () => (await sampleIndeed()).ink !== authored.ink, 'heading theme paint');
    // Let shared paint settle before comparing the known fixture backing endpoints.
    await page.evaluate('new Promise(resolve=>setTimeout(resolve,250))');
    const themed = await sampleIndeed();
    if (JSON.stringify(themed.paths) !== JSON.stringify(authored.paths)) throw Error('Original Indeed glyph geometry changed');
    if (!themed.stops.length || themed.stops.some(stop => { const ratio = contrast(color(themed.ink), color(stop)); return ratio === null || ratio < 4.5; })) throw Error('Indeed fixture heading lacks contrast against its modeled gradient endpoints: ' + theme);
    const logo = await page.evaluate("(()=>{const e=document.querySelector('[data-svg=\"indeed-logo.svg\"] svg');let p=e.parentElement,bg;while(p){const s=getComputedStyle(p);if(/^rgb\\(/.test(s.backgroundColor)){bg=s.backgroundColor;break;}p=p.parentElement;}return{background:bg,inks:[...e.querySelectorAll('path')].map(p=>getComputedStyle(p).fill),width:e.getBoundingClientRect().width}})()");
    if (logo.width !== originalLogo || logo.inks.some(ink=>contrast(color(ink),color(logo.background))<7)) throw Error('Linked wide SVG wordmark lacks contrast or changed width: '+theme+' '+JSON.stringify(logo));
    fidelity.push({ theme, logo, ink: themed.ink, stops: themed.stops, modeledContrast: themed.stops.map(stop => contrast(color(themed.ink), color(stop))), originalPathsPreserved: true });
  }
  await writeFile(path.join(artifacts, 'indeed-fidelity-check.json'), JSON.stringify(fidelity, null, 2));
  const unavailable = await page.evaluate(`(async()=>{
    const manifest=await(await fetch('/fixtures/diagnostics/site-assets/sources.json')).json();
    return (await Promise.all(manifest.map(async asset=>{const image=new Image();image.src='/fixtures/diagnostics/site-assets/'+asset.file;let timer;try{await Promise.race([image.decode(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('decode timeout')),3000)})]);return null;}catch{return asset.file;}finally{clearTimeout(timer);}}))).filter(Boolean);
  })()`);
  if (unavailable.length) throw Error('Original site assets did not decode: ' + unavailable.join(', '));
  const juntaUrl = server.base + '/fixtures/diagnostics/site-elements.html?site=junta';
  await browser.rule(juntaUrl, 'source'); await page.send('Page.navigate', { url: juntaUrl });
  await until(() => page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"), 'Junta source context');
  await page.evaluate("document.querySelector('.site-branding__logo img').decode()");
  const junta = () => page.evaluate("(()=>{const a=document.querySelector('.site-branding__logo'),i=a.firstElementChild;return {background:getComputedStyle(a).backgroundColor,anchorHeight:a.getBoundingClientRect().height,imageHeight:i.getBoundingClientRect().height,filter:getComputedStyle(i).filter}})()");
  const originalJunta = await junta();
  if (!await page.evaluate("document.characterSet==='UTF-8'&&document.body.textContent.includes('Andaluc\u00eda')&&document.body.textContent.includes('Formaci\u00f3n')")) throw Error('Served Spanish fixture text has damaged encoding');
  if (originalJunta.background !== 'rgba(0, 0, 0, 0)' || Math.abs(originalJunta.anchorHeight - originalJunta.imageHeight) > .05) throw Error('Junta fixture lost the source logo container geometry');
  for (const theme of ['chromium', 'soft', 'contrast']) {
    await browser.rule(juntaUrl, theme, 'off');
    await until(async () => (await junta()).background === 'rgb(255, 255, 255)', 'preserved Junta logo backing');
    const applied = await junta();
    if (Math.abs(applied.anchorHeight - originalJunta.anchorHeight) > .05 || applied.filter !== originalJunta.filter) throw Error('Junta logo geometry or original artwork filter changed');
  }
  const gifUrl = server.base + '/fixtures/diagnostics/site-elements.html?site=artwork';
  await browser.rule(gifUrl, 'source'); await page.send('Page.navigate', { url: gifUrl });
  await until(() => page.evaluate("document.documentElement.dataset.fixtureReady==='yes'"), 'reported GIF context');
  await page.evaluate("document.querySelector('[data-audit-id=formacion-gif]').decode()");
  const gif = () => page.evaluate("(()=>{const e=document.querySelector('[data-audit-id=formacion-gif]'),s=getComputedStyle(e);return{size:[e.clientWidth,e.clientHeight],filter:s.filter,heading:e.parentElement.tagName,label:e.parentElement.textContent.trim().length,sourceBackground:getComputedStyle(e.parentElement.parentElement).backgroundColor}})()");
  const gifSource = await gif();
  if (gifSource.heading !== 'H1' || !gifSource.label || gifSource.size.join(',') !== '200,150' || gifSource.sourceBackground !== 'rgb(247, 247, 247)') throw Error('Reported GIF reproduction lost original dimensions, label or background');
  for (const theme of ['chromium', 'soft', 'contrast']) {
    await browser.rule(gifUrl, theme, 'off');
    await page.evaluate("document.querySelector('[data-audit-id=formacion-gif]').scrollIntoView({block:'center'})");
    await until(async () => (await gif()).filter !== 'none', 'static reported GIF contrast');
    if ((await gif()).size.join(',') !== gifSource.size.join(',')) throw Error('Reported GIF dimensions changed');
    await page.evaluate("document.querySelector('[data-audit-id=efp-logo]').scrollIntoView({block:'center'})");
    await until(() => page.evaluate("getComputedStyle(document.querySelector('[data-audit-id=efp-logo]')).backgroundColor==='rgb(255, 255, 255)'"), 'original EFP logo backing');
  }
  await writeFile(path.join(artifacts, 'reported-artwork-corrected.png'), Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  console.log('Lab UI passed: gallery search, grouped evidence, accept/reopen, narrow large-text layout, focus, server guards, image decoding, GIF animation, original Indeed gradient/glyph preservation with modeled heading contrast, Junta logo context/light backing, and reported formacion GIF/EFP logo context in all custom themes.');
} finally { await browser.close(); await server.close(); }
