import { startServer } from './diagnostics/server.mjs';
const port = Number(process.env.LAB_PORT || 8787);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid LAB_PORT.');
const server = await startServer(port);
console.log(`Rendering lab: ${server.base}\nOpen this URL in your browser. Run the local smoke capture from the page. Ctrl+C stops the server.`);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0); });
