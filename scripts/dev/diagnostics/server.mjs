import http from 'node:http';
import { readFile, readdir, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { root } from './browser.mjs';

import {decodeScreenshotPng} from './png-pixels.mjs';
import { visualCases,listVisuals,readVisual,visualImage,visualCompatibility } from './visual-archive.mjs';

const reports = path.join(root, 'research-artifacts', 'diagnostics');
export async function startServer(port = 0) {
  let job = { state: 'idle' };
  let running; const cancellation = new AbortController();
  const server = http.createServer(async (request, response) => {
    const send = (status, body, type = 'application/json') => {
      response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(type === 'application/json' && !Buffer.isBuffer(body) ? JSON.stringify(body) : body);
    };
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const origin = `http://127.0.0.1:${server.address().port}`;
      if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return send(403, { error: 'Loopback host required.' });
      if (url.pathname === '/api/job' && request.method === 'GET') return send(200, job);
      if (url.pathname === '/api/run' && request.method === 'POST') {
        if (request.headers.origin !== origin || request.headers['content-type'] !== 'application/json') return send(403, { error: 'Same-origin JSON request required.' });
        let body = ''; for await (const chunk of request) { body += chunk; if (body.length > 1000) return send(413, { error: 'Request too large.' }); }
        let options; try { options = JSON.parse(body); } catch { return send(400, { error: 'Invalid JSON.' }); }
        if (!options || Array.isArray(options) || Object.keys(options).some(k => k !== 'gallery') || options.gallery !== undefined && typeof options.gallery !== 'boolean') return send(400, { error: 'Only the fixed local suite selector is supported.' });
        if (job.state === 'running') return send(409, { error: 'A capture is already running.' });
        job = { state: 'running' }; send(202, job);
        // Fixed local smoke suite only. The web endpoint accepts no URL, command or output path.
        const { captureSuite } = await import('./runner.mjs');
        running = captureSuite({ base: origin, gallery: Boolean(options.gallery), signal: cancellation.signal }).then(result => { job = { state: 'complete', report: result.name, assertions: result.assertions }; }, error => { job = { state: 'failed', error: error.message }; });
        return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') return send(405, { error: 'Method not allowed.' });
      if(url.pathname.startsWith('/api/visual')){
        try{
          const q=url.searchParams, only=keys=>{if([...q.keys()].some(k=>!keys.includes(k))||keys.some(k=>q.getAll(k).length!==1))throw Error('Invalid visual query');};
          if(url.pathname==='/api/visual-cases'){only([]);return send(200,await visualCases());}
          if(url.pathname==='/api/visuals'){only(['case']);return send(200,await listVisuals(q.get('case')));}
          if(url.pathname==='/api/visual'||url.pathname==='/api/visual-image'||url.pathname==='/api/visual-pixels'){
            only(['case','run','capture']);const args=[q.get('case'),q.get('run'),q.get('capture')];
            if(url.pathname==='/api/visual-pixels')return send(200,decodeScreenshotPng(await visualImage(...args)).pixels,'application/octet-stream');
            return send(200,url.pathname==='/api/visual'?await readVisual(...args):await visualImage(...args),url.pathname==='/api/visual'?'application/json':'image/png');
          }
          if(url.pathname==='/api/visual-compare'){
            only(['case','beforeRun','beforeCapture','afterRun','afterCapture']);
            return send(200,visualCompatibility(await readVisual(q.get('case'),q.get('beforeRun'),q.get('beforeCapture')),await readVisual(q.get('case'),q.get('afterRun'),q.get('afterCapture'))));
          }
          return send(404,{error:'Unknown visual endpoint.'});
        }catch(error){return send(error.code==='ENOENT'?404:400,{error:'Visual evidence unavailable, invalid or corrupted.'});}
      }
      if (url.pathname === '/api/reports') {
        await mkdir(reports, { recursive: true });
        const names = (await readdir(reports)).filter(n => /^run-[\w-]+$/.test(n)).sort().reverse();
        return send(200, names);
      }
      let pathname = decodeURIComponent(url.pathname === '/' ? '/tools/diagnostics/index.html' : url.pathname);
      let directory;
      if (pathname.startsWith('/cors/')) { directory = path.join(root, 'fixtures'); pathname = pathname.slice('/cors/'.length); response.setHeader('Access-Control-Allow-Origin', '*'); }
      else if (/^\/(solid|multicolor|animated)-artwork\.svg$/.test(pathname)) { directory = path.join(root, 'fixtures'); pathname = pathname.slice(1); }
      else if (pathname.startsWith('/reports/')) { directory = reports; pathname = pathname.slice('/reports/'.length); }
      else if (pathname.startsWith('/tools/diagnostics/')) { directory = path.join(root, 'tools', 'diagnostics'); pathname = pathname.slice('/tools/diagnostics/'.length); }
      else if (pathname.startsWith('/fixtures/')) { directory = path.join(root, 'fixtures'); pathname = pathname.slice('/fixtures/'.length); }
      else return send(404, { error: 'Not found.' });
      const file = path.resolve(directory, pathname);
      if (!file.startsWith(path.resolve(directory) + path.sep)) return send(403, { error: 'Outside served directory.' });
      if (!(await stat(file)).isFile()) return send(404, { error: 'Not a file.' });
      const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
      const type = types[path.extname(file)];
      if (!type) return send(403, { error: 'Unsupported resource.' });
      send(200, await readFile(file), type);
    } catch (error) { send(error.code === 'ENOENT' ? 404 : 500, { error: error.code === 'ENOENT' ? 'Not found.' : 'Local server error.' }); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { base: `http://127.0.0.1:${server.address().port}`, close: async () => {
    cancellation.abort(); await running;
    await new Promise(resolve => server.close(resolve));
  } };
}
