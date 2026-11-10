import { mkdir, mkdtemp, cp, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceFingerprint } from '../../lib/source-fingerprint.mjs';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const fingerprint = sourceFingerprint();
const evidence = [];
function cases(suites, passedOnly=false) {
 const found=new Map();
 for(const suite of suites) {
  for(const spec of suite.specs ?? [])for(const test of spec.tests ?? []) {
   const key=`${spec.file}:${spec.line}:${spec.column}:${spec.title}:${test.projectName}`;
   if(!passedOnly || test.results.at(-1)?.status==='passed')found.set(key,test.projectName);
  }
  for(const [key,value] of cases(suite.suites ?? [],passedOnly))found.set(key,value);
 }
 return found;
}
for(const [name,config] of [['results','playwright.config.ts'],['production-results','playwright.production.config.ts']]) {
 const report=JSON.parse(await readFile(resolve(root,`artifacts/playwright/${name}.json`),'utf8'));
 if(report.config.metadata?.sourceFingerprint!==fingerprint || report.stats.unexpected || report.stats.flaky || report.stats.skipped)throw new Error(`${name}: stale or unsuccessful browser evidence. Run the full suite first.`);
 const listing=JSON.parse(execFileSync(process.execPath,[resolve(root,'node_modules/@playwright/test/cli.js'),'test','--config',config,'--list','--reporter=json'],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024,windowsHide:true}));
 const expected=cases(listing.suites),actual=cases(report.suites,true);
 if(!expected.size || actual.size!==expected.size || [...expected.keys()].some(key=>!actual.has(key)))throw new Error(`${name}: focused or incomplete browser evidence; the current full case list must match.`);
 const browsers={};for(const browser of actual.values())browsers[browser]=(browsers[browser]??0)+1;
 if(['chromium','firefox','webkit'].some(browser=>!browsers[browser]))throw new Error(`${name}: incomplete browser matrix.`);
 evidence.push({suite:name,passed:actual.size,browsers,durationMs:report.stats.duration,sourceFingerprint:fingerprint});
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
const data = JSON.parse(await readFile(resolve(root, 'src/game-data/data/manifest.json'), 'utf8'));
const engine = (await readFile(resolve(root, 'src/engine/src/version.ts'), 'utf8')).match(/['"]([\d.]+)['"]/)[1];
const manifest = { formatVersion: 1, status: 'local-candidate', version: pkg.version, createdAt: new Date().toISOString(), commit, sourceFingerprint: fingerprint,
  versions: { engine, data: data.dataVersion, rules: 'timeline-v1' }, base: '/', evidence, files };
await writeFile(resolve(destination, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await mkdir(resolve(destination, 'tools/scripts/dev'), { recursive: true }); await cp(resolve(root, 'tools/scripts/dev/serve-dist.mjs'), resolve(destination, 'tools/scripts/dev/serve-dist.mjs'));
await mkdir(resolve(destination, 'src/web/server'), { recursive: true });
await cp(resolve(root, 'src/web/server/enka.mjs'), resolve(destination, 'src/web/server/enka.mjs'));
await cp(resolve(root, 'docs/guides/user-guide.md'), resolve(destination, 'USER-GUIDE.md'));
await writeFile(resolve(destination, 'README.md'), '# 本地交付候选\n\n静态站点位于 site/，manifest.json 记录源码、验证证据与每个站点文件的SHA-256。此目录没有发布到外部服务。\n\n本地查看：在本目录执行 `node tools/scripts/dev/serve-dist.mjs --dir=site`，打开 http://127.0.0.1:5175/。不要通过file://打开页面。\n\nHTML使用no-cache，带哈希assets使用immutable；正式托管须配置相同策略。规则范围与浏览器本地方案说明见USER-GUIDE.md。\n');
console.log(destination);
