import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const outputRoot = resolve(root, '.references/meropide');
const pagesRoot = resolve(outputRoot, 'pages');
const manifestPath = resolve(outputRoot, 'manifest.json');
const origin = 'https://meropide.cn';

class BotBlockError extends Error {}

function parseOptions(argv) {
  let refresh = false;
  let concurrency = 4;
  let only;
  let limit;
  for (const arg of argv) {
    if (arg === '--refresh') refresh = true;
    else if (arg.startsWith('--concurrency=')) {
      concurrency = Number(arg.slice('--concurrency='.length));
      if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) throw new Error('Invalid --concurrency value (expected 1..16).');
    } else if (arg.startsWith('--only=')) {
      only = arg.slice('--only='.length);
      if (!['index', 'reference', 'characters', 'theorycraft'].includes(only)) throw new Error(`Invalid --only value: ${only}`);
    } else if (arg.startsWith('--limit=')) {
      limit = Number(arg.slice('--limit='.length));
      if (!Number.isInteger(limit) || limit < 1) throw new Error('Invalid --limit value.');
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { refresh, concurrency, only, limit };
}

function sanitizeSegment(segment) {
  return segment.replace(/[<>:"/\\|?*]/g, '_');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function relativePortable(filePath) {
  return relative(root, filePath).replaceAll('\\', '/');
}

function isBlockedResponse(status, text) {
  if (status === 403) return true;
  return /cf-browser-verification|Just a moment\.\.\.|challenge-platform|\bcaptcha\b/i.test(text);
}

async function fetchHtml(url) {
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'LeyLine-Simulator/0.2 (offline meropide reference capture)',
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(20000),
      });
      if (response.status === 404) {
        return { status: 404, resolvedUrl: response.url || url, bytes: null };
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      const text = bytes.toString('utf8');
      if (isBlockedResponse(response.status, text)) {
        throw new BotBlockError(`Blocked by anti-bot/CAPTCHA gate at ${url} (HTTP ${response.status}).`);
      }
      if (response.status === 429 || response.status >= 500) {
        if (attempt < attempts) {
          await new Promise(timer => setTimeout(timer, attempt * 1000));
          continue;
        }
        return { status: response.status, resolvedUrl: response.url || url, bytes: null, error: `HTTP ${response.status}` };
      }
      if (!response.ok) {
        return { status: response.status, resolvedUrl: response.url || url, bytes: null, error: `HTTP ${response.status}` };
      }
      return { status: response.status, resolvedUrl: response.url || url, bytes };
    } catch (error) {
      if (error instanceof BotBlockError) throw error;
      if (attempt < attempts) {
        await new Promise(timer => setTimeout(timer, attempt * 1000));
        continue;
      }
      return { status: 0, resolvedUrl: url, bytes: null, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

function extractChsPaths(html) {
  const paths = new Set();
  for (const match of html.matchAll(/href="([^"#?]+)"/gi)) {
    const raw = match[1];
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(raw, origin).pathname);
    } catch {
      continue;
    }
    if (!pathname.startsWith('/chs/')) continue;
    paths.add(pathname.endsWith('/') ? pathname : `${pathname}/`);
  }
  return [...paths];
}

function encodeChsUrl(decodedPath) {
  const parts = decodedPath.split('/').map(part => encodeURIComponent(part));
  return `${origin}${parts.join('/')}`;
}

async function runPool(items, concurrency, worker) {
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => next());
  await Promise.all(workers);
}

function loadCanonicalCharacterNames() {
  const directory = resolve(root, 'src/game-data/data/characters');
  return readdirSync(directory)
    .filter(file => file.endsWith('.json'))
    .sort()
    .map(file => {
      const data = JSON.parse(readFileSync(resolve(directory, file), 'utf8'));
      return { id: data.id, name: data.identity.name };
    });
}

function loadPreviousManifest() {
  if (!existsSync(manifestPath)) return new Map();
  try {
    const data = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (data.formatVersion === 2 && Array.isArray(data.entries)) {
      return new Map(data.entries.map(entry => [entry.url, entry]));
    }
  } catch {
    return new Map();
  }
  return new Map();
}

async function processTask(task, previousByUrl, refresh) {
  const filePath = task.file ? resolve(pagesRoot, task.file) : null;
  if (!refresh && filePath && existsSync(filePath)) {
    const bytes = readFileSync(filePath);
    const prior = previousByUrl.get(task.url);
    return {
      kind: task.kind,
      name: task.name,
      url: task.url,
      resolvedUrl: prior?.resolvedUrl ?? task.url,
      status: 200,
      path: relativePortable(filePath),
      bytes: bytes.length,
      sha256: sha256(bytes),
      fetchedAt: prior?.fetchedAt ?? new Date().toISOString(),
      cached: true,
    };
  }
  const result = await fetchHtml(task.url);
  if (result.status === 404) {
    return {
      kind: task.kind,
      name: task.name,
      url: task.url,
      resolvedUrl: result.resolvedUrl,
      status: 404,
      path: null,
      bytes: 0,
      sha256: null,
      fetchedAt: new Date().toISOString(),
    };
  }
  if (!result.bytes) {
    return {
      kind: task.kind,
      name: task.name,
      url: task.url,
      resolvedUrl: result.resolvedUrl,
      status: result.status,
      path: null,
      bytes: 0,
      sha256: null,
      fetchedAt: new Date().toISOString(),
      error: result.error ?? `HTTP ${result.status}`,
    };
  }
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, result.bytes);
  return {
    kind: task.kind,
    name: task.name,
    url: task.url,
    resolvedUrl: result.resolvedUrl,
    status: result.status,
    path: relativePortable(filePath),
    bytes: result.bytes.length,
    sha256: sha256(result.bytes),
    fetchedAt: new Date().toISOString(),
    html: result.bytes.toString('utf8'),
  };
}

const options = parseOptions(process.argv.slice(2));
const previousByUrl = loadPreviousManifest();
const indexTasks = [
  { kind: 'index', name: 'home', url: `${origin}/chs/`, file: 'home.html' },
  { kind: 'index', name: 'reference-index', url: `${origin}/chs/reference/`, file: 'reference-index.html' },
  { kind: 'index', name: 'characters-index', url: `${origin}/chs/characters/`, file: 'characters-index.html' },
  { kind: 'index', name: 'theorycraft-index', url: `${origin}/chs/theorycraft/`, file: 'theorycraft-index.html' },
];

const entries = [];
const indexHtmlByName = new Map();
for (const task of indexTasks) {
  const entry = await processTask(task, previousByUrl, options.refresh);
  if (entry.error || entry.status !== 200) {
    throw new Error(`Failed to fetch index ${task.url}: ${entry.error ?? `HTTP ${entry.status}`}`);
  }
  const html = entry.html ?? readFileSync(resolve(root, entry.path), 'utf8');
  indexHtmlByName.set(task.name, html);
  delete entry.html;
  delete entry.cached;
  entries.push(entry);
}

const discoveredPaths = new Set([
  ...extractChsPaths(indexHtmlByName.get('home')),
  ...extractChsPaths(indexHtmlByName.get('reference-index')),
  ...extractChsPaths(indexHtmlByName.get('characters-index')),
  ...extractChsPaths(indexHtmlByName.get('theorycraft-index')),
]);

const referenceSlugs = new Set();
const characterNames = new Set();
const theorycraftSlugs = new Set();

for (const path of discoveredPaths) {
  const refMatch = /^\/chs\/reference\/([^/]+)\/$/.exec(path);
  if (refMatch) referenceSlugs.add(refMatch[1]);
  const charMatch = /^\/chs\/characters\/([^/]+)\/(?:theorycraft\/)?$/.exec(path);
  if (charMatch) characterNames.add(charMatch[1]);
  const tcMatch = /^\/chs\/theorycraft\/([^/]+)\/$/.exec(path);
  if (tcMatch) theorycraftSlugs.add(tcMatch[1]);
}

const applyLimit = list => (options.limit ? list.slice(0, options.limit) : list);
const sortedRefs = applyLimit([...referenceSlugs].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')));
const sortedChars = applyLimit([...characterNames].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')));
const sortedTheorycraft = applyLimit([...theorycraftSlugs].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')));

const workTasks = [];
if (!options.only || options.only === 'reference') {
  for (const slug of sortedRefs) {
    workTasks.push({
      kind: 'reference',
      name: slug,
      url: encodeChsUrl(`/chs/reference/${slug}/`),
      file: `reference/${sanitizeSegment(slug)}.html`,
    });
  }
}
if (!options.only || options.only === 'characters') {
  for (const name of sortedChars) {
    workTasks.push({
      kind: 'character',
      name,
      url: encodeChsUrl(`/chs/characters/${name}/`),
      file: `characters/${sanitizeSegment(name)}.html`,
    });
  }
}
if (!options.only || options.only === 'characters' || options.only === 'theorycraft') {
  for (const name of sortedChars) {
    workTasks.push({
      kind: 'character-theorycraft',
      name,
      url: encodeChsUrl(`/chs/characters/${name}/theorycraft/`),
      file: `characters/${sanitizeSegment(name)}.theorycraft.html`,
    });
  }
}
if (!options.only || options.only === 'theorycraft') {
  for (const slug of sortedTheorycraft) {
    workTasks.push({
      kind: 'theorycraft',
      name: slug,
      url: encodeChsUrl(`/chs/theorycraft/${slug}/`),
      file: `theorycraft/${sanitizeSegment(slug)}.html`,
    });
  }
}

await runPool(workTasks, options.concurrency, async task => {
  const entry = await processTask(task, previousByUrl, options.refresh);
  delete entry.html;
  delete entry.cached;
  entries.push(entry);
});

const canonical = loadCanonicalCharacterNames();
const unmatchedCanonicalCharacters = canonical.filter(({ name }) => {
  const normalized = name.replace('（', '（').replace('）', '）');
  if (characterNames.has(name) || characterNames.has(normalized)) return false;
  const traveler = /^(?:空|荧)（(.+)）$/.exec(name);
  if (traveler && characterNames.has(`旅行者（${traveler[1]}）`)) return false;
  return true;
});

entries.sort((a, b) => `${a.kind}:${a.name}:${a.url}`.localeCompare(`${b.kind}:${b.name}:${b.url}`, 'en'));

const errors = entries.filter(entry => entry.error);
const summary = {
  totalEntries: entries.length,
  indexPages: entries.filter(entry => entry.kind === 'index' && entry.status === 200).length,
  referencePages: entries.filter(entry => entry.kind === 'reference' && entry.status === 200).length,
  characterPages: entries.filter(entry => entry.kind === 'character' && entry.status === 200).length,
  theorycraftFound: entries.filter(entry => entry.kind === 'character-theorycraft' && entry.status === 200).length,
  theorycraftMissing: entries.filter(entry => entry.kind === 'character-theorycraft' && entry.status === 404).length,
  theorycraftArticles: entries.filter(entry => entry.kind === 'theorycraft' && entry.status === 200).length,
  errors: errors.length,
  unmatchedCanonicalCharacters,
};

mkdirSync(outputRoot, { recursive: true });
writeFileSync(manifestPath, `${JSON.stringify({
  formatVersion: 2,
  origin: `${origin}/chs/`,
  capturedAt: new Date().toISOString(),
  summary,
  entries,
}, null, 2)}\n`);

console.log(JSON.stringify(summary, null, 2));
if (errors.length) {
  console.error('Meropide capture encountered HTTP/network errors:', errors.slice(0, 10));
  process.exitCode = 1;
}
