const cache = new Map();
const pending = new Map();
export function validEnkaUid(uid) { return typeof uid === 'string' && /^\d{9,10}$/.test(uid); }
export async function lookupEnka(uid) {
  if (!validEnkaUid(uid)) throw new Error('请输入 9～10 位数字 UID。');
  const saved = cache.get(uid);
  if (saved && saved.expires > Date.now()) return saved.content;
  if (pending.has(uid)) return pending.get(uid);
  const operation = (async () => {
    const response = await fetch(`https://enka.network/api/uid/${uid}/`, { headers: { 'User-Agent': 'LeyLine-Simulator/0.2 (local showcase importer)', Accept: 'application/json' }, signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!response.ok) throw new Error(`ENKA_HTTP_${response.status}`);
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    try {
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new Error('展柜响应过大，未读取。'); } chunks.push(value); }
    } finally { reader.releaseLock(); }
    const content = Buffer.concat(chunks).toString('utf8'); const data = JSON.parse(content);
    if (!data || typeof data !== 'object' || !data.playerInfo) throw new Error('展柜服务返回格式异常。');
    for (const [key, value] of cache) if (value.expires <= Date.now()) cache.delete(key);
    if (cache.size >= 16) cache.delete(cache.keys().next().value);
    cache.set(uid, { content, expires: Date.now() + Math.min(3600, Math.max(1, Number(data.ttl) || 60)) * 1000 });
    return content;
  })();
  pending.set(uid, operation);
  try { return await operation; } finally { pending.delete(uid); }
}
export async function serveEnka(request, response, uid) {
  if (request.method !== 'GET') { response.writeHead(405); response.end(); return; }
  try {
    const content = await lookupEnka(uid);
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(content);
  } catch (error) {
    const match = /ENKA_HTTP_(\d+)/.exec(String(error));
    response.writeHead(match ? Number(match[1]) : validEnkaUid(uid) ? 502 : 400, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ error: error.message }));
  }
}
