import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import {deflateSync} from 'node:zlib';
import {randomUUID} from 'node:crypto';
import {startServer} from './server.mjs';
import {launchBrowser,closeBrowser,root,until} from './browser.mjs';
import {archiveCapture} from './visual-archive.mjs';

const server=await startServer();let browser;
const id=randomUUID().slice(0,8),caseId='visual-ui-test-'+id,runId='run-'+Date.now()+'-'+id;
try{
 browser=await launchBrowser();const page=await browser.open(server.base);
 await until(()=>page.evaluate("!!document.querySelector('#visual-refresh')?.dataset.help"),'visual modules');
 function chunk(type,data){const buffer=Buffer.alloc(12+data.length);buffer.writeUInt32BE(data.length);buffer.write(type,4);data.copy(buffer,8);let crc=0xffffffff;for(const byte of buffer.subarray(4,-4)){crc^=byte;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}buffer.writeUInt32BE((crc^0xffffffff)>>>0,buffer.length-4);return buffer;}
 const images=[0,1,2].map(kind=>{const width=kind===2?4:3,header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(2,4);header[8]=8;header[9]=6;const data=Buffer.alloc((width*4+1)*2,255);data[0]=0;data[width*4+1]=0;if(kind===1){const at=width*4+1+1+4;data.fill(0,at,at+3);}return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(data)),chunk('IEND',Buffer.alloc(0))]);});

 const metadata={provenance:'local-fixture',fixturePath:'synthetic-tooling-canvas',theme:'source',level:'off',state:'default',action:'synthetic-pixel-test',browser:browser.version.product,platform:process.platform,viewport:[3,2],dpr:1,zoom:['1','1'],scroll:[0,0],crop:'viewport',fonts:'loaded',readiness:{fontsReady:true,visibleImagesReady:true},settled:true,identityStatus:'match',fixtureHash:'0'.repeat(64),rendererHash:'0'.repeat(64)};
 for(const [index,captureId]of ['baseline','changed','geometry'].entries())await archiveCapture({caseId,runId,captureId,png:images[index],metadata});
 assert.equal((await fetch(server.base+'/api/visual?case=../outside&run=x&capture=y')).status,400);
 assert.equal((await fetch(server.base+'/api/visual-cases?unexpected=1')).status,400);
 assert.equal((await fetch(server.base+'/api/visuals?case='+caseId,{method:'POST'})).status,405);
 await page.evaluate("document.querySelector('[data-tab=visual]').click();document.querySelector('#visual-refresh').click()");
 await until(()=>page.evaluate(`Array.from(document.querySelector('#visual-case').options).some(o=>o.value===${JSON.stringify(caseId)})`),'archive listing');
 await page.evaluate(`document.querySelector('#visual-case').value=${JSON.stringify(caseId)};document.querySelector('#visual-case').dispatchEvent(new Event('change'))`);
 await until(()=>page.evaluate("document.querySelector('#visual-before').options.length===3"),'case listing');
 const load=async after=>{
   await page.evaluate(`document.querySelector('#visual-before').value='0';document.querySelector('#visual-after').value='${after}';document.querySelector('#visual-load').click()`);
   await until(()=>page.evaluate("!document.querySelector('#visual-output').hidden"),'image comparison');
 };
 await load(0);assert.match(await page.evaluate("document.querySelector('#visual-result').textContent"),/^0 \/ 6/);
 await load(1);assert.match(await page.evaluate("document.querySelector('#visual-result').textContent"),/^1 \/ 6/);
 await page.evaluate("document.querySelector('#visual-mode').value='difference';document.querySelector('#visual-mode').dispatchEvent(new Event('change'))");
 assert.ok((await page.evaluate("[...document.querySelector('#visual-a').getContext('2d').getImageData(1,1,1,1).data]")).every((v,i)=>Math.abs(v-[255,0,255,255][i])<=1));
 await page.evaluate("document.querySelector('#visual-mode').value='overlay';document.querySelector('#visual-mode').dispatchEvent(new Event('change'));document.querySelector('#visual-opacity').value=100;document.querySelector('#visual-opacity').dispatchEvent(new Event('input'))");
 assert.ok((await page.evaluate("[...document.querySelector('#visual-a').getContext('2d').getImageData(1,1,1,1).data]")).every((v,i)=>Math.abs(v-[0,0,0,255][i])<=1));
 await page.evaluate("document.querySelector('#visual-zoom').value=2;document.querySelector('#visual-zoom').dispatchEvent(new Event('change'));document.querySelector('#visual-opacity').focus()");
 assert.equal(await page.evaluate("document.querySelector('#visual-a').style.width"),'6px');
 assert.equal(await page.evaluate("document.activeElement.id"),'visual-opacity');
 await load(2);assert.match(await page.evaluate("document.querySelector('#visual-result').textContent"),/geometry mismatch/);
 assert.equal(await page.evaluate("document.querySelector('#visual-mode option[value=difference]').disabled"),true);
 assert.match(await page.evaluate("document.querySelector('#visual-status').textContent"),/incompatible/);
 await page.send('Emulation.setDeviceMetricsOverride',{width:600,height:900,deviceScaleFactor:1,mobile:false});
 await page.evaluate("document.documentElement.style.fontSize='150%'");
 assert.equal(await page.evaluate('document.documentElement.scrollWidth>innerWidth'),false);
 await page.send('Emulation.setDeviceMetricsOverride',{width:1400,height:1000,deviceScaleFactor:1,mobile:false});
 await page.evaluate("document.documentElement.style.fontSize='100%';document.querySelector('#visual-zoom').value='1';document.querySelector('#visual-zoom').dispatchEvent(new Event('change'));document.querySelector('#visual-case').value='subtle-frame';document.querySelector('#visual-case').dispatchEvent(new Event('change'))");
 await until(()=>page.evaluate("document.querySelector('#visual-before').options.length>0"),'real archived case');
 await load(0);assert.match(await page.evaluate("document.querySelector('#visual-result').textContent"),/^0 \/ 900000/);
 await page.evaluate("document.querySelectorAll('.visual-scroll')[0].scrollLeft=40");
 await until(()=>page.evaluate("document.querySelectorAll('.visual-scroll')[1].scrollLeft===40"),'synchronized image scroll');
 console.log('Real 1000x900 image: '+await page.evaluate("document.querySelector('#visual-result').textContent"));
 const directory=path.join(root,'research-artifacts/diagnostics');await mkdir(directory,{recursive:true});
 await writeFile(path.join(directory,'visual-viewer.png'),Buffer.from((await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
 console.log('Visual viewer passed: archive guards, identical/changed/geometry cases, actual difference/overlay pixels, zoom, focus and narrow large-text layout. Synthetic case: '+caseId);
}finally{try{await closeBrowser(browser);}finally{await server.close();}}
