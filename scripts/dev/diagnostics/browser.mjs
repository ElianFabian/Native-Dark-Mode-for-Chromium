import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
export const root = fileURLToPath(new URL('../../../', import.meta.url));
export async function until(fn, label, timeout = 15000) {
  const end = performance.now() + timeout;
  do { const result = await fn(); if (result) return result; await delay(50); } while (performance.now() < end);
  throw Error('Timed out: ' + label);
}
const cleanupError = error => ({ code: error.code ?? error.name ?? 'Error', message: error.message });

// Own ChildProcess handle only; never discover or terminate a browser by a reused PID.
export function createBrowserCloser({ child, profile, sockets = [], getLaunchError = () => undefined, removeProfile = rm, exitTimeoutMs = 3000 }) {
  let closing;
  return () => closing ??= (async () => {
    const absolute = path.resolve(profile), errors = [];
    const result = { status: 'incomplete', profilePath: absolute,
      browser: { status: 'incomplete', processId: child.pid }, profile: { status: 'incomplete' }, errors };
    for (const socket of sockets) {
      try { socket.close(); } catch (error) { errors.push({ phase: 'connection', ...cleanupError(error) }); }
    }
    const exited = () => child.exitCode !== null || child.signalCode != null || (!Number.isInteger(child.pid) && Boolean(getLaunchError()));
    if (!exited()) {
      await new Promise(resolve => {
        const done = () => { clearTimeout(timer); child.removeListener('exit', done); resolve(); };
        const timer = setTimeout(done, exitTimeoutMs);
        child.once('exit', done);
        try { child.kill(); } catch (error) { errors.push({ phase: 'browser', ...cleanupError(error) }); done(); }
      });
    }
    result.browser.status = exited() ? 'complete' : 'incomplete';
    if (!exited()) errors.push({ phase: 'browser', code: 'EXIT_UNCONFIRMED', message: 'Browser exit was not observed before the cleanup deadline.' });
    if (path.dirname(absolute) !== path.resolve(tmpdir()) || !path.basename(absolute).startsWith('ndm-lab-')) {
      errors.push({ phase: 'profile', code: 'UNEXPECTED_PATH', message: 'Refusing unexpected cleanup path.' });
    } else if (!exited()) {
      errors.push({ phase: 'profile', code: 'BROWSER_RUNNING', message: 'Profile retained because browser exit is unconfirmed.' });
    } else {
      try { await removeProfile(absolute, { recursive: true, force: true, maxRetries: 6, retryDelay: 300 }); result.profile.status = 'complete'; }
      catch (error) { errors.push({ phase: 'profile', ...cleanupError(error) }); }
    }
    if (result.browser.status === 'complete' && result.profile.status === 'complete' && !errors.length) result.status = 'complete';
    return result;
  })();
}

export async function closeBrowser(browser) {
  if (!browser) return;
  const result = await browser.close();
  if (result?.status !== 'complete') {
    const error = Error('Browser cleanup incomplete: ' + JSON.stringify(result));
    error.cleanup = result; throw error;
  }
  return result;
}

export async function launchBrowser(executable, { extensionDirectory = path.join(root, 'extension'), insecureLocalOrigin = false } = {}) {
  if (typeof WebSocket === 'undefined') throw Error('Use Node with --experimental-websocket or a current Node version.');
  const candidates = [executable, process.env.CHROMIUM_PATH, 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  let selected;
  for (const file of candidates) { try { await access(file); selected = file; break; } catch {} }
  if (!selected) throw Error('No browser found. Set CHROMIUM_PATH to a Brave/Chromium executable supporting unpacked extensions.');
  const profile = await mkdtemp(path.join(tmpdir(), 'ndm-lab-'));
  const sockets = [];
  const child = spawn(selected, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-background-networking',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--load-extension=${extensionDirectory}`,
    ...(insecureLocalOrigin ? ['--host-resolver-rules=MAP ndm-identity.test 127.0.0.1', '--no-proxy-server'] : []), 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let launchError; child.on('error', error => { launchError = error; });
  const close = createBrowserCloser({ child, profile, sockets, getLaunchError: () => launchError });
  try {
    const port = await until(async () => {
      if (launchError) throw launchError;
      if (child.exitCode !== null) throw Error('Browser exited during startup.');
      try { return (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n'); } catch { return null; }
    }, 'browser startup');
    const endpoint = `http://127.0.0.1:${port[0]}`;
    const connect = async url => {
      const socket = new WebSocket(url); sockets.push(socket);
      await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
      let id = 0; const pending = new Map();
      socket.addEventListener('message', event => {
        const value = JSON.parse(event.data), request = pending.get(value.id);
        if (!request) return;
        pending.delete(value.id); clearTimeout(request.timer);
        if (value.error) request.reject(Error(JSON.stringify(value.error))); else request.resolve(value.result);
      });
      socket.addEventListener('close', () => { for (const r of pending.values()) { clearTimeout(r.timer); r.reject(Error('Browser connection closed.')); } pending.clear(); });
      const send = (method, params = {}) => new Promise((resolve, reject) => {
        if (socket.readyState !== WebSocket.OPEN) { reject(Error('Browser connection closed.')); return; }
        const key = ++id, timer = setTimeout(() => { pending.delete(key); reject(Error('CDP timeout: ' + method)); }, 15000);
        pending.set(key, { resolve, reject, timer });
        try { socket.send(JSON.stringify({ id: key, method, params })); }
        catch (error) { pending.delete(key); clearTimeout(timer); reject(error); }
      });
      return { send, evaluate: async expression => {
        const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
        return result.result.value;
      } };
    };
    const connection = await connect(`ws://127.0.0.1:${port[0]}${port[1]}`);
    const targets = async () => (await fetch(endpoint + '/json/list')).json();
    const open = async url => {
      const { targetId } = await connection.send('Target.createTarget', { url });
      const target = await until(async () => (await targets()).find(t => t.id === targetId), 'new tab');
      return { ...await connect(target.webSocketDebuggerUrl), targetId, close: () => connection.send('Target.closeTarget', { targetId }) };
    };
    const worker = await until(async () => (await targets()).find(t => t.type === 'service_worker' && t.url.endsWith('/background.js')), 'extension worker');
    let manager = await open(worker.url.replace('/background.js', '/options.html'));
    await until(() => manager.evaluate("document.readyState==='complete'"), 'extension manager');
    const rule = async (url, theme, level = 'off') => {
      const response = await manager.evaluate(`chrome.runtime.sendMessage(${JSON.stringify({ type: 'save', rule: { url, scope: 'section', enabled: theme !== 'source',
        preset: theme === 'source' ? 'chromium' : theme, emphasizeSeparators: level === 'off' ? false : level === 'medium' ? true : level } })})`);
      if (response?.error) throw Error(response.error);
    };
    // Resolve only a target owned by this browser; no URL matching or script injection for identity queries.
    const rendererIdentity = async (page, frameId = 0) => manager.evaluate(`(async()=>{
      const target=(await chrome.debugger.getTargets()).find(t=>t.id===${JSON.stringify(page.targetId)});
      if(!Number.isInteger(target?.tabId))return {status:'unavailable',reason:'target-unavailable'};
      try {const observed=await chrome.tabs.sendMessage(target.tabId,{type:'diagnose-renderer-identity-v1'},{frameId:${JSON.stringify(frameId)}});
        return observed?{status:'observed',observed}:{status:'unavailable',reason:'no-response'};
      }catch{return {status:'unavailable',reason:'no-receiver'};}
    })()`).catch(() => ({status:'unavailable',reason:'extension-context-unavailable'}));
    const inRendererWorld = async (page, func, args = [], frameId = 0) => manager.evaluate(`(async()=>{
      const target=(await chrome.debugger.getTargets()).find(t=>t.id===${JSON.stringify(page.targetId)});
      if(!Number.isInteger(target?.tabId))throw Error('Owned target unavailable');
      return await chrome.scripting.executeScript({target:{tabId:target.tabId,...(${JSON.stringify(frameId)}===null?{allFrames:true}:{frameIds:[${JSON.stringify(frameId)}]})},world:'ISOLATED',func:(${func.toString()}),args:${JSON.stringify(args)}});
    })()`);
    const reinjectRenderer = async page => manager.evaluate(`(async()=>{
      const target=(await chrome.debugger.getTargets()).find(t=>t.id===${JSON.stringify(page.targetId)});
      if(!Number.isInteger(target?.tabId))throw Error('Owned target unavailable');
      await chrome.scripting.executeScript({target:{tabId:target.tabId},files:['chromium-colors.js','image-contrast.js','website-theme.js']});
    })()`);
    const reloadExtension = async () => {
      const previous = (await targets()).find(t => t.type === 'service_worker' && t.url === worker.url)?.id;
      await manager.evaluate('setTimeout(()=>chrome.runtime.reload(),0);true');
      await until(async () => !(await targets()).some(t => t.id === previous), 'old extension worker stopped');
      manager = await open(worker.url.replace('/background.js', '/options.html'));
      await until(() => manager.evaluate("document.readyState==='complete'"), 'reloaded extension manager');
      // Some load-extension browser sessions invalidate the extension without making it available again.
      // Report that observed boundary; identity queries must not repair it or invent a new instance.
      return { workerRestarted: (await targets()).some(t => t.type === 'service_worker' && t.url === worker.url && t.id !== previous),
        extensionContextAvailable: await manager.evaluate('Boolean(globalThis.chrome?.runtime?.id)').catch(() => false) };
    };
    const {rules} = await manager.evaluate("chrome.storage.local.get('rules')");
    const isolation = {browserInstanceId:randomUUID(),profileId:path.basename(profile),processId:child.pid,initialRuleCount:Array.isArray(rules)?rules.length:0};
    return { open, rule, close, rendererIdentity, inRendererWorld, reinjectRenderer, reloadExtension, isolation, version: await connection.send('Browser.getVersion') };
  } catch (error) { error.cleanup = await close(); throw error; }
}
