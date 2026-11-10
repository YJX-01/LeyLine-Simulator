import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve, sep } from 'node:path';
import { assertBuildOutput, assertNoActiveBuilds, pruneReleases, publishRelease, withBuildWorkspace } from '../../tools/lib/build-outputs.mjs';
import { copyGeneratedFile, pruneGeneratedFiles, writeGeneratedFile } from '../../tools/lib/generated-files.mjs';

const roots = [];
const packageBytes = readFileSync(new URL('../../package.json', import.meta.url));
const htmlBytes = readFileSync(new URL('../../src/web/index.html', import.meta.url));
const fingerprint = createHash('sha256').update(packageBytes).digest('hex');
function repository() {
  const root = mkdtempSync(join(tmpdir(), 'leyline-output-check-'));
  roots.push(root);
  execFileSync('git', ['-c', 'init.defaultBranch=main', 'init', '--quiet', root], { windowsHide: true });
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    assert.ok(root.startsWith(resolve(tmpdir()) + sep) && basename(root).startsWith('leyline-output-check-'));
    rmSync(root, { recursive: true, force: true });
  }
});

// These are filesystem-only package envelopes using actual repository bytes.
// They do not stand in for player data or prove that a packaged application runs.
async function publish(root, kind, attempt) {
  return withBuildWorkspace(root, kind, async workspace => {
    const candidate = join(workspace, 'candidate');
    mkdirSync(candidate);
    if (kind === 'desktop') {
      mkdirSync(join(candidate, 'LeyLine-test'));
      writeFileSync(join(candidate, 'LeyLine-test/package.json'), packageBytes);
    } else {
      mkdirSync(join(candidate, 'site'));
      writeFileSync(join(candidate, 'site/index.html'), htmlBytes);
      writeFileSync(join(candidate, 'manifest.json'), JSON.stringify({ formatVersion: 1, status: 'local-candidate', sourceFingerprint: fingerprint }));
    }
    return publishRelease(root, kind, candidate, directory => ({ formatVersion: 1, sourceFingerprint: fingerprint, attempt,
      directory: relative(root, join(directory, kind === 'desktop' ? 'LeyLine-test' : 'site')) }), kind === 'desktop' ? 'build-' : 'abcdef0-');
  });
}

for (const kind of ['desktop', 'web']) {
  test(`${kind} keeps exactly the latest two successful packages and removes staging`, async () => {
    const root = repository();
    const first = await publish(root, kind, 1), second = await publish(root, kind, 2), third = await publish(root, kind, 3);
    assert.equal(first.retained, 1);
    assert.equal(second.retained, 2);
    assert.equal(third.retained, 2);
    assert.equal(existsSync(first.directory), false);
    assert.equal(existsSync(second.directory), true);
    assert.equal(existsSync(third.directory), true);
    const pointer = JSON.parse(readFileSync(join(root, kind === 'desktop' ? 'artifacts/desktop/latest.json' : 'artifacts/releases/latest.json'), 'utf8'));
    assert.equal(pointer.attempt, 3);
    assert.equal(resolve(root, pointer.previous.releaseDirectory), second.directory);
    const pruned = await pruneReleases(root, kind, { dryRun: true });
    assert.equal(pruned.kept.length, 2);
    assert.equal(pruned.removed.length, 0);
    assert.deepEqual(readdirSync(join(root, '.cache/build')), []);
  });
}

test('a failed build removes its partial files and preserves both successful packages and pointer', async () => {
  const root = repository();
  const first = await publish(root, 'desktop', 1), second = await publish(root, 'desktop', 2);
  const pointer = readFileSync(join(root, 'artifacts/desktop/latest.json'));
  await assert.rejects(withBuildWorkspace(root, 'desktop', async workspace => {
    writeFileSync(join(workspace, 'unfinished-package'), packageBytes);
    throw new Error('Packaging failed');
  }), /Packaging failed/);
  assert.ok(existsSync(first.directory) && existsSync(second.directory));
  assert.deepEqual(readFileSync(join(root, 'artifacts/desktop/latest.json')), pointer);
  assert.deepEqual(readdirSync(join(root, '.cache/build')), []);
});

test('dry-run pruning preserves files and unknown directories are never removed', async () => {
  const root = repository();
  const current = await publish(root, 'desktop', 1);
  const parent = join(root, 'artifacts/desktop/releases');
  const older = ['build-old-1', 'build-old-2'].map(name => join(parent, name));
  for (const directory of older) {
    mkdirSync(join(directory, 'LeyLine-test'), { recursive: true });
    writeFileSync(join(directory, 'build-info.json'), JSON.stringify({ sourceFingerprint: fingerprint, completedAt: '2020-01-01T00:00:00Z' }));
  }
  const unrelated = join(parent, 'personal-files');
  mkdirSync(unrelated); writeFileSync(join(unrelated, 'keep.txt'), packageBytes);
  const plan = await pruneReleases(root, 'desktop', { dryRun: true });
  assert.equal(plan.removed.length, 1);
  assert.ok(older.every(existsSync));
  await pruneReleases(root, 'desktop');
  assert.ok(existsSync(current.directory) && existsSync(unrelated));
  assert.equal(older.filter(existsSync).length, 1);
});

test('output deletion rejects sources, path traversal, links and tracked files', () => {
  const root = repository(), outside = repository();
  assert.throws(() => assertBuildOutput(root, 'src/game-data/data'), /Not a managed/);
  assert.throws(() => assertBuildOutput(root, '../outside'), /Not a managed/);
  const cache = join(root, '.cache');
  symlinkSync(outside, cache, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => assertBuildOutput(root, '.cache/public'), /linked output/);
  rmSync(cache);
  mkdirSync(cache); writeFileSync(join(cache, 'tracked'), packageBytes);
  execFileSync('git', ['-C', root, 'add', '-f', '.cache/tracked'], { windowsHide: true });
  assert.throws(() => assertBuildOutput(root, '.cache'), /tracked build output/);
});

test('cleaning refuses an active build workspace', async () => {
  const root = repository();
  await withBuildWorkspace(root, 'desktop', async () => { assert.throws(() => assertNoActiveBuilds(root), /Build still running/); });
  assert.doesNotThrow(() => assertNoActiveBuilds(root));
});

test('identical generated bytes preserve timestamps and obsolete files are removed only in write mode', () => {
  const root = repository(), directory = join(root, 'src/web/generated');
  const file = join(directory, 'current.json');
  assert.equal(writeGeneratedFile(file, packageBytes), true);
  utimesSync(file, new Date('2000-01-01T00:00:00Z'), new Date('2000-01-01T00:00:00Z'));
  const before = statSync(file).mtimeMs;
  assert.equal(writeGeneratedFile(file, packageBytes), false);
  assert.equal(copyGeneratedFile(new URL('../../package.json', import.meta.url), file), false);
  assert.equal(statSync(file).mtimeMs, before);
  const obsolete = join(directory, 'retired.json'); writeFileSync(obsolete, packageBytes);
  assert.throws(() => pruneGeneratedFiles(root, directory, ['current.json'], true), /Obsolete generated/);
  assert.ok(existsSync(obsolete));
  pruneGeneratedFiles(root, directory, ['current.json']);
  assert.equal(existsSync(obsolete), false);
  assert.deepEqual(readFileSync(file), packageBytes);
});

test('malformed publication pointers leave previous packages untouched', async () => {
  const root = repository();
  const first = await publish(root, 'desktop', 1);
  const pointer = join(root, 'artifacts/desktop/latest.json');
  writeFileSync(pointer, JSON.stringify({ releaseDirectory: 'src/game-data/data' }));
  await assert.rejects(publish(root, 'desktop', 2), /Not a managed/);
  assert.ok(existsSync(first.directory));
  assert.deepEqual(readdirSync(join(root, '.cache/build')), []);
});
