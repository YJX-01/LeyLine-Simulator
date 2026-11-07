import { mkdir, mkdtemp, cp, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceFingerprint } from './source-fingerprint.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const fingerprint = sourceFingerprint();
const evidence = [];
for (const [name, minimum] of [['results', 75], ['production-results', 18]]) {
  const report = JSON.parse(await readFile(resolve(root, `artifacts/playwright/${name}.json`), 'utf8'));
  if (report.config.metadata?.sourceFingerprint !== fingerprint || report.stats.expected < minimum || report.stats.unexpected || report.stats.flaky || report.stats.skipped) throw new Error(`${name}: missing, stale or unsuccessful browser evidence. Run both full browser suites first.`);
  const browsers = {};
  function count(suites) {
    for (const suite of suites) {
      for (const spec of suite.specs ?? []) for (const test of spec.tests) if (test.results.at(-1)?.status === 'passed') browsers[test.projectName] = (browsers[test.projectName] ?? 0) + 1;
      count(suite.suites ?? []);
    }
  }
  count(report.suites);
  if (['chromium', 'firefox', 'webkit'].some(browser => (browsers[browser] ?? 0) < minimum / 3)) throw new Error(`${name}: incomplete browser matrix.`);
  evidence.push({ suite: name, passed: report.stats.expected, browsers, durationMs: report.stats.duration, sourceFingerprint: fingerprint });
}
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
await mkdir(resolve(root, 'artifacts/releases'), { recursive: true });
const destination = await mkdtemp(resolve(root, `artifacts/releases/${commit.slice(0, 7)}-`));
const site = resolve(destination, 'site'); await mkdir(site);
const dist = resolve(root, 'src/web/dist');
for (const entry of await readdir(dist, { withFileTypes: true })) if (entry.name !== '.vite') await cp(resolve(dist, entry.name), resolve(site, entry.name), { recursive: entry.isDirectory() });
const files = [];
for (const entry of (await readdir(site, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile()).sort((a,b) => resolve(a.parentPath, a.name).localeCompare(resolve(b.parentPath, b.name), 'en'))) {
  const path = relative(site, resolve(entry.parentPath, entry.name)).replaceAll('\\', '/');
  const buffer = await readFile(resolve(site, path)); files.push({ path, bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex') });
}
for (const path of ['licenses/THIRD_PARTY_NOTICES.md', 'licenses/npm-LICENSES.txt', 'licenses/bundled-packages.json']) if (!files.some(file => file.path === path)) throw new Error(`Missing release notice: ${path}`);
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const data = JSON.parse(await readFile(resolve(root, 'src/game-data/src/generated/content.json'), 'utf8'));
const engine = (await readFile(resolve(root, 'src/engine/src/version.ts'), 'utf8')).match(/['"]([\d.]+)['"]/)[1];
const manifest = { formatVersion: 1, status: 'local-candidate', version: pkg.version, createdAt: new Date().toISOString(), commit, sourceFingerprint: fingerprint,
  versions: { engine, data: data.version, rules: 'team-repo-v1' }, base: '/', evidence, files };
await writeFile(resolve(destination, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await mkdir(resolve(destination, 'tools/scripts'), { recursive: true }); await cp(resolve(root, 'tools/scripts/serve-dist.mjs'), resolve(destination, 'tools/scripts/serve-dist.mjs'));
await mkdir(resolve(destination, 'tools/desktop'), { recursive: true });
await cp(resolve(root, 'tools/desktop/enka.mjs'), resolve(destination, 'tools/desktop/enka.mjs'));
await cp(resolve(root, 'docs/user-guide.md'), resolve(destination, 'USER-GUIDE.md'));
await writeFile(resolve(destination, 'README.md'), '# 本地交付候选\n\n静态站点位于 site/，manifest.json 记录源码、验证证据与每个站点文件的SHA-256。此目录没有发布到外部服务。\n\n本地查看：在本目录执行 `node tools/scripts/serve-dist.mjs --dir=site`，打开 http://127.0.0.1:5175/。不要通过file://打开页面。\n\nHTML使用no-cache，带哈希assets使用immutable；正式托管须配置相同策略。规则范围与浏览器本地方案说明见USER-GUIDE.md。\n');
console.log(destination);
