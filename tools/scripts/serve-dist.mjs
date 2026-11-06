import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const workspace = fileURLToPath(new URL('../../', import.meta.url));
const option = (key, fallback) => process.argv.find(arg => arg.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
const root = resolve(workspace, option('dir', 'src/web/dist'));
const base = option('base', '/');
if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base)) throw new Error('Base must be / or a slash-delimited path ending in /.');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end(); return; }
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (base !== '/' && path === base.slice(0, -1)) { response.writeHead(308, { Location: base }); response.end(); return; }
    if (!path.startsWith(base)) { response.writeHead(404); response.end(); return; }
    const relative = path.slice(base.length) || 'index.html';
    if (relative.split(/[\\/]/).some(part => part.startsWith('.'))) { response.writeHead(404); response.end(); return; }
    const target = resolve(root, relative);
    if (!target.startsWith(root + sep)) { response.writeHead(404); response.end(); return; }
    let bytes;
    try { bytes = await readFile(target); } catch { response.writeHead(404); response.end(); return; }
    const type = mime[extname(target)];
    if (!type) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Type': type, 'Content-Length': bytes.length,
      'Cache-Control': relative.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch { response.writeHead(400); response.end(); }
});
server.listen(Number(option('port', '5175')), '127.0.0.1', () => console.log(`Static validation server: http://127.0.0.1:${server.address().port}${base}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); server.closeAllConnections(); });
