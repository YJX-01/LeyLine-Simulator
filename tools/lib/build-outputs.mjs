import { existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, closeSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

const managed = ['.cache', 'artifacts/desktop', 'artifacts/desktop-stage', 'artifacts/desktop-preview', 'artifacts/releases', 'artifacts/performance', 'artifacts/playwright', 'src/game-data/generated', 'src/web/generated', 'src/web/dist', 'src/web/dist-subpath', 'src/web/dist-desktop', 'test-results', 'playwright-report', 'coverage'];
const families = { desktop: 'artifacts/desktop/releases', web: 'artifacts/releases' };
const within = (parent, target) => target === parent || target.startsWith(parent + sep);

export function assertBuildOutput(root, path) {
  root = realpathSync(root);
  const target = resolve(root, path), inside = relative(root, target);
  if (!inside || isAbsolute(inside) || !managed.some(path => within(resolve(root, path), target))) throw new Error(`Not a managed build output: ${target}`);
  let cursor = root;
  for (const part of inside.split(sep)) {
    cursor = join(cursor, part);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error(`Refusing a linked output path: ${cursor}`);
  }
  const tracked = execFileSync('git', ['--literal-pathspecs', 'ls-files', '-z', '--', inside], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  if (tracked.length) throw new Error(`Refusing tracked build output: ${target}`);
  return target;
}

export function removeBuildOutput(root, path) {
  const target = assertBuildOutput(root, path);
  rmSync(target, { recursive: true, force: true, maxRetries: 1, retryDelay: 100 });
}

export function writeOutputAtomic(root, path, content) {
  const target = assertBuildOutput(root, path);
  const temporary = `${target}.${randomUUID()}.tmp`;
  try { writeFileSync(temporary, content, { flag: 'wx' }); renameSync(temporary, target); }
  finally { rmSync(temporary, { force: true }); }
}

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error('Invalid build owner PID.');
  try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; if (error.code === 'EPERM') return true; throw error; }
}

export async function withBuildWorkspace(root, kind, build) {
  if (!['desktop', 'web'].includes(kind)) throw new Error(`Unknown build kind: ${kind}`);
  const parent = assertBuildOutput(root, '.cache/build');
  mkdirSync(parent, { recursive: true });
  const workspace = mkdtempSync(join(parent, `${kind}-`));
  writeFileSync(join(workspace, '.owner.json'), JSON.stringify({ pid: process.pid }));
  try { return await build(workspace); }
  finally { removeBuildOutput(root, workspace); }
}

export function assertNoActiveBuilds(root) {
  const parent = assertBuildOutput(root, '.cache/build');
  if (!existsSync(parent)) return;
  for (const entry of readdirSync(parent, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const owner = join(parent, entry.name, '.owner.json');
    if (existsSync(owner) && processExists(JSON.parse(readFileSync(owner, 'utf8')).pid)) throw new Error(`Build still running: ${entry.name}`);
  }
}

function familyDirectory(root, kind) {
  if (!Object.hasOwn(families, kind)) throw new Error(`Unknown release family: ${kind}`);
  return assertBuildOutput(root, families[kind]);
}

function assertReleaseNotRunning(directory) {
  if (process.platform !== 'win32') return;
  const script = '$prefix=$env:LEYLINE_RELEASE_DIRECTORY; $busy=Get-Process | ForEach-Object { try { $_.Path } catch {} } | Where-Object { $_ -and $_.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) } | Select-Object -First 1; if($busy){Write-Output "busy"}';
  const result = execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, LEYLINE_RELEASE_DIRECTORY: directory + sep }, encoding: 'utf8', windowsHide: true,
  });
  if (result.trim()) throw new Error(`Close the application in the older release before removing it: ${directory}`);
}

function readLatest(root, kind) {
  const path = resolve(root, kind === 'desktop' ? 'artifacts/desktop/latest.json' : 'artifacts/releases/latest.json');
  if (!existsSync(path)) return null;
  const record = JSON.parse(readFileSync(assertBuildOutput(root, path), 'utf8'));
  // Existing desktop manifests already identify the app directory inside its release.
  const directory = record.releaseDirectory ?? (kind === 'desktop' && record.directory ? relative(root, resolve(root, record.directory, '..')) : undefined);
  if (typeof directory !== 'string') throw new Error(`Invalid release pointer: ${path}`);
  const target = assertBuildOutput(root, directory), parent = familyDirectory(root, kind);
  if (resolve(target, '..') !== parent) throw new Error(`Release pointer is outside its family: ${directory}`);
  return { ...record, releaseDirectory: relative(root, target) };
}

function completedReleases(root, kind) {
  const parent = familyDirectory(root, kind);
  if (!existsSync(parent)) return [];
  const result = [];
  for (const entry of readdirSync(parent, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Linked release: ${entry.name}`);
    if (!entry.isDirectory() || !(kind === 'desktop' ? /^build-[\w-]+$/ : /^[a-f0-9]{7,40}-[\w-]+$/).test(entry.name)) continue;
    const directory = assertBuildOutput(root, join(parent, entry.name));
    const marker = join(directory, kind === 'desktop' ? 'build-info.json' : 'manifest.json');
    if (!existsSync(marker)) continue;
    const info = JSON.parse(readFileSync(marker, 'utf8'));
    if (typeof info.sourceFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(info.sourceFingerprint)) continue;
    if (kind === 'web' && (info.formatVersion !== 1 || info.status !== 'local-candidate' || !existsSync(join(directory, 'site', 'index.html')))) continue;
    if (kind === 'desktop' && !readdirSync(directory, { withFileTypes: true }).some(entry => entry.isDirectory() && /^LeyLine-/.test(entry.name))) continue;
    result.push({ directory, time: Date.parse(info.completedAt) || statSync(marker).mtimeMs });
  }
  return result.sort((a, b) => b.time - a.time || b.directory.localeCompare(a.directory));
}

async function withReleaseLock(root, kind, action) {
  const parent = familyDirectory(root, kind);
  mkdirSync(parent, { recursive: true });
  const path = join(parent, '.publish.lock');
  assertBuildOutput(root, path);
  let lock;
  try { lock = openSync(path, 'wx'); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const owner = JSON.parse(readFileSync(path, 'utf8'));
    if (processExists(owner.pid)) throw new Error(`Another ${kind} release operation is running.`);
    rmSync(path);
    lock = openSync(path, 'wx');
  }
  try { writeFileSync(lock, JSON.stringify({ pid: process.pid })); return await action(); }
  finally { closeSync(lock); rmSync(path, { force: true }); }
}

function pruneUnlocked(root, kind, dryRun) {
  const releases = completedReleases(root, kind), latest = readLatest(root, kind);
  const current = latest && releases.find(item => item.directory === resolve(root, latest.releaseDirectory));
  const previous = latest?.previous && releases.find(item => item.directory === resolve(root, latest.previous.releaseDirectory));
  const ordered = [...new Set([current, previous, ...releases].filter(Boolean))];
  const kept = ordered.slice(0, 2).map(item => item.directory), removed = [];
  for (const item of ordered.slice(2)) {
    if (!dryRun) { assertReleaseNotRunning(item.directory); removeBuildOutput(root, item.directory); }
    removed.push(item.directory);
  }
  return { kept, removed };
}

export async function pruneReleases(root, kind, { dryRun = false } = {}) {
  if (!existsSync(familyDirectory(root, kind))) return { kept: [], removed: [] };
  if (dryRun) return pruneUnlocked(root, kind, true);
  return withReleaseLock(root, kind, () => pruneUnlocked(root, kind, false));
}

export async function publishRelease(root, kind, candidate, metadata, prefix = 'build-') {
  const parent = familyDirectory(root, kind), source = assertBuildOutput(root, candidate);
  if (!within(resolve(root, '.cache/build'), source) || !existsSync(source)) throw new Error('Release must come from a completed build workspace.');
  if (!(kind === 'desktop' ? prefix === 'build-' : /^[a-f0-9]{7,40}-$/.test(prefix))) throw new Error('Invalid release name prefix.');
  return withReleaseLock(root, kind, async () => {
    const old = readLatest(root, kind), completed = completedReleases(root, kind);
    const previous = completed.find(item => old && item.directory === resolve(root, old.releaseDirectory)) ?? completed[0];
    // Never publish a third package if retiring an older one would disturb a running app.
    for (const item of completed) if (item !== previous) assertReleaseNotRunning(item.directory);
    const destination = resolve(parent, prefix + randomUUID());
    assertBuildOutput(root, destination);
    const completedAt = new Date().toISOString();
    const record = { ...metadata(destination), releaseDirectory: relative(root, destination), completedAt,
      previous: previous ? { releaseDirectory: relative(root, previous.directory) } : null };
    const marker = kind === 'desktop' ? 'build-info.json' : 'manifest.json';
    const content = kind === 'desktop' ? { sourceFingerprint: record.sourceFingerprint, completedAt } : { ...JSON.parse(readFileSync(join(source, marker), 'utf8')), completedAt };
    writeFileSync(join(source, marker), JSON.stringify(content, null, 2) + '\n');
    renameSync(source, destination);
    try {
      const latest = resolve(root, kind === 'desktop' ? 'artifacts/desktop/latest.json' : 'artifacts/releases/latest.json');
      writeOutputAtomic(root, latest, JSON.stringify(record, null, 2) + '\n');
    } catch (error) { removeBuildOutput(root, destination); throw error; }
    // Publishing is complete before old packages are considered for removal.
    try { const result = pruneUnlocked(root, kind, false); for (const path of result.removed) console.log(`Removed older ${kind} release: ${relative(root, path)}`); }
    catch (error) { console.warn(`Release is ready; older package cleanup needs retry (no application was stopped): ${error.message}`); }
    return { directory: destination, record, retained: completedReleases(root, kind).length };
  });
}
