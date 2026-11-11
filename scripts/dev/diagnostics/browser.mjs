import { spawn } from 'node:child_process';
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
export async function launchBrowser(executable) {
  if (typeof WebSocket === 'undefined') throw Error('Use Node with --experimental-websocket or a current Node version.');
  const candidates = [executable, process.env.CHROMIUM_PATH, 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  let selected;
  for (const file of candidates) { try { await access(file); selected = file; break; } catch {} }
  if (!selected) throw Error('No browser found. Set CHROMIUM_PATH to a Brave/Chromium executable supporting unpacked extensions.');
  const profile = await mkdtemp(path.join(tmpdir(), 'ndm-lab-'));
  const sockets = [];
  const child = spawn(selected, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-background-networking',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--load-extension=${path.join(root, 'extension')}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let launchError; child.on('error', error => { launchError = error; });
  let closing;
  const close = () => closing ??= (async () => {
    for (const socket of sockets) socket.close();
    if (child.exitCode === null && !launchError) {
      child.kill();
      await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(3000)]);
    }
    const absolute = path.resolve(profile);
    if (path.dirname(absolute) !== path.resolve(tmpdir()) || !path.basename(absolute).startsWith('ndm-lab-')) throw Error('Refusing unexpected cleanup path.');
    await rm(absolute, { recursive: true, force: true, maxRetries: 6, retryDelay: 300 }).catch(() => console.warn('Profile cleanup pending:', absolute));
  })();
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
        const key = ++id, timer = setTimeout(() => { pending.delete(key); reject(Error('CDP timeout: ' + method)); }, 15000);
        pending.set(key, { resolve, reject, timer }); socket.send(JSON.stringify({ id: key, method, params }));
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
      return { ...await connect(target.webSocketDebuggerUrl), close: () => connection.send('Target.closeTarget', { targetId }) };
    };
    const worker = await until(async () => (await targets()).find(t => t.type === 'service_worker' && t.url.endsWith('/background.js')), 'extension worker');
    const manager = await open(worker.url.replace('/background.js', '/options.html'));
    await until(() => manager.evaluate("document.readyState==='complete'"), 'extension manager');
    const rule = async (url, theme, level = 'off') => {
      const response = await manager.evaluate(`chrome.runtime.sendMessage(${JSON.stringify({ type: 'save', rule: { url, scope: 'section', enabled: theme !== 'source',
        preset: theme === 'source' ? 'chromium' : theme, emphasizeSeparators: level === 'off' ? false : level === 'medium' ? true : level } })})`);
      if (response?.error) throw Error(response.error);
    };
    return { open, rule, close, version: await connection.send('Browser.getVersion') };
  } catch (error) { await close(); throw error; }
}
