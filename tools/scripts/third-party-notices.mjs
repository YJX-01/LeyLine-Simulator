import { readFile, writeFile, readdir, mkdir, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const canonical = resolve(root, 'licenses');
const publicDirectory = resolve(root, 'src/web/public/licenses');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const hash = content => createHash('sha256').update(content).digest('hex');
const normalized = path => path.replaceAll('\\', '/');
const importers = ['package.json', 'src/web/package.json', 'src/schema/package.json', 'src/engine/package.json', 'src/game-data/package.json'];
const groups = ['dependencies', 'devDependencies', 'optionalDependencies'];
const fingerprint = async () => ({
  lockfile: hash(await readFile(resolve(root, 'pnpm-lock.yaml'))),
  manifests: await Promise.all(importers.map(async path => {
    const manifest = await json(resolve(root, path));
    return { path, sha256: hash(JSON.stringify(Object.fromEntries(groups.map(group => [group, manifest[group] ?? {}])))) };
  })),
  workspace: hash(await readFile(resolve(root, 'pnpm-workspace.yaml'))),
});
const textFiles = async directory => (await readdir(directory, { withFileTypes:true })).filter(file => file.isFile() && /licen[cs]e|notice|copying|copyright/i.test(file.name)).map(file => file.name).sort();

if (process.argv.includes('--capture')) {
  const treeArgument = process.argv.find(arg => arg.startsWith('--tree='))?.slice(7);
  const tree = treeArgument ? await json(resolve(root, treeArgument)) : JSON.parse(execFileSync(
    process.platform === 'win32' ? 'cmd.exe' : 'pnpm',
    process.platform === 'win32' ? ['/d', '/s', '/c', 'pnpm list -r --depth Infinity --json'] : ['list', '-r', '--depth', 'Infinity', '--json'],
    { cwd:root, encoding:'utf8', maxBuffer:32 * 1024 * 1024, windowsHide:true },
  ));
  const packages = new Map();
  function collect(node, fallbackName) {
    const name = node.name ?? fallbackName;
    if (node.path?.includes('node_modules') && name) {
      const id = `${name}@${node.version}`;
      const prior = packages.get(id) ?? { id, name, version:node.version, directory:node.path, children:new Set(), direct:[], production:false };
      for (const group of ['dependencies', 'optionalDependencies']) for (const [childName, child] of Object.entries(node[group] ?? {})) prior.children.add(`${childName}@${child.version}`);
      packages.set(id, prior);
    }
    for (const group of groups) for (const [childName, child] of Object.entries(node[group] ?? {})) collect(child, childName);
  }
  for (const project of tree) collect(project);
  const productionRoots = new Set();
  for (const project of tree) {
    const path = normalized(relative(root, resolve(project.path, 'package.json')));
    const manifest = await json(resolve(root, path));
    for (const group of groups) for (const name of Object.keys(manifest[group] ?? {})) {
      if (name.startsWith('@leyline/')) continue;
      const dependency = project[group]?.[name];
      if (!dependency) throw new Error(`Missing installed dependency: ${path}: ${name}`);
      const item = packages.get(`${name}@${dependency.version}`);
      if (!item) throw new Error(`Missing dependency record: ${name}`);
      item.direct.push({ importer:path, group });
      if (group !== 'devDependencies') productionRoots.add(item.id);
    }
  }
  function production(id) {
    const item = packages.get(id);
    if (!item || item.production) return;
    item.production = true;
    for (const child of item.children) production(child);
  }
  for (const id of productionRoots) production(id);
  const records = [];
  const blocks = ['Third-party npm licenses and notices. Original texts are preserved below.\nScope: installed dependency graph, including development and optional platform packages.\nActual browser modules are listed separately in bundled-packages.json.\n'];
  for (const item of [...packages.values()].sort((a,b) => a.id.localeCompare(b.id, 'en'))) {
    const manifest = await json(resolve(item.directory, 'package.json'));
    const repo = typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url;
    const record = {
      id:item.id, name:item.name, version:item.version, license:manifest.license ?? manifest.licenses ?? 'UNDECLARED',
      repository:repo?.replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/\.git$/, '') ?? null,
      author:typeof manifest.author === 'string' ? manifest.author : manifest.author?.name ?? null,
      direct:item.direct, productionDependencyClosure:item.production, desktopRuntime:item.name === 'electron',
      os:manifest.os ?? null, cpu:manifest.cpu ?? null, licenseFiles:[], modified:item.name === '@vue/devtools-kit' ? ['tools/patches/@vue__devtools-kit@8.2.1.patch'] : [],
    };
    let directory = item.directory;
    let files = await textFiles(directory);
    if (!files.length && (item.name.startsWith('@esbuild/') || item.name.startsWith('@rollup/rollup-'))) {
      const family = item.name.startsWith('@esbuild/') ? 'esbuild' : 'rollup';
      const parent = [...packages.values()].find(candidate => candidate.name === family && candidate.version === item.version);
      if (parent) { directory = parent.directory; files = await textFiles(directory); record.noticeSource = `${family}@${item.version} (same upstream repository/version; platform package omits a separate license file)`; }
    }
    for (const name of files) {
      const bytes = await readFile(resolve(directory, name));
      record.licenseFiles.push({ name, sha256:hash(bytes) });
      blocks.push(`\n\n========== ${item.id} / ${name} ==========\n${bytes.toString('utf8')}`);
    }
    if (!files.length) {
      record.noticeStatus = 'declaration-only';
      const readme = await readFile(resolve(item.directory, 'README.md'), 'utf8').catch(() => '');
      const excerpt = readme.match(/## License[\s\S]*$/i)?.[0];
      blocks.push(`\n\n========== ${item.id} / package declaration ==========\nDeclared license: ${record.license}\nPublished author: ${record.author ?? 'not stated'}\nPackage records contain the license declaration and any published README license section. A separate LICENSE/NOTICE file is absent.\n${excerpt ?? ''}`);
    } else record.noticeStatus = record.noticeSource ? 'upstream-family-text' : 'packaged-text';
    records.push(record);
  }
  const counts = {};
  for (const item of records) counts[item.license] = (counts[item.license] ?? 0) + 1;
  const inventory = {
    formatVersion:1, inputs:await fingerprint(), scope:'pnpm installed dependency graph including development/optional platform packages; SPDX declarations from package.json; complete upstream notices are archived in npm-LICENSES.txt',
    archives:{ 'npm-LICENSES.txt':hash(blocks.join('')) },
    summary:{ packages:records.length, directPackages:records.filter(item => item.direct.length).length, productionClosure:records.filter(item => item.productionDependencyClosure).length, licenseDeclarations:counts, declarationOnly:records.filter(item => item.noticeStatus === 'declaration-only').map(item => item.id) },
    packages:records,
  };
  await mkdir(canonical, { recursive:true });
  await writeFile(resolve(canonical, 'dependencies.json'), JSON.stringify(inventory, null, 2) + '\n');
  await writeFile(resolve(canonical, 'npm-LICENSES.txt'), blocks.join(''));
  const table = ['# 依赖与许可证清单', '', '由 `pnpm licenses:capture` 从实际依赖树、package.json 和原始许可文本生成。生产依赖闭包与实际入包模块分别记录，构建产物提供 `bundled-packages.json`。', '', `共 ${records.length} 个名称/版本组合，${inventory.summary.directPackages} 个直接依赖。`, '', '| 包 / 版本 | 声明协议 | 使用情况 | 原始许可文本 |', '| --- | --- | --- | --- |'];
  for (const item of records) table.push(`| ${item.id} | ${item.license} | ${item.desktopRuntime ? '桌面运行时' : item.direct.length && item.direct.every(usage => usage.group === 'devDependencies') ? '构建 / 测试工具' : item.productionDependencyClosure ? '生产依赖闭包' : '构建 / 测试 / 可选平台工具'}${item.direct.length ? '；直接声明' : '；间接依赖'}${item.modified.length ? '；有本地补丁' : ''} | ${item.noticeStatus === 'declaration-only' ? '仅包声明 / README，原文缺口' : `[许可与声明](npm-LICENSES.txt)${item.noticeSource ? '（同版本上游家族）' : ''}`} |`);
  await writeFile(resolve(canonical, 'DEPENDENCIES.md'), table.join('\n') + '\n');
  for (const [file, key] of [['sources.json', 'sources'], ['tooling.json', 'pythonTools']]) {
    const data = await json(resolve(canonical, file));
    for (const item of data[key]) if (item.licenseFile) item.licenseSha256 = hash(await readFile(resolve(root, item.licenseFile)));
    await writeFile(resolve(canonical, file), JSON.stringify(data, null, 2) + '\n');
  }
}

const inventory = await json(resolve(canonical, 'dependencies.json'));
if (JSON.stringify(inventory.inputs) !== JSON.stringify(await fingerprint())) throw new Error('Third-party inventory is stale; run pnpm licenses:capture.');
for (const [file, expected] of Object.entries(inventory.archives)) if (hash(await readFile(resolve(canonical, file))) !== expected) throw new Error(`License archive checksum mismatch: ${file}`);
const legalFiles = ['THIRD_PARTY_NOTICES.md', 'CREDITS.md'];
const sources = await json(resolve(canonical, 'sources.json'));
const tooling = await json(resolve(canonical, 'tooling.json'));
const assetRequirements = await readFile(resolve(root, 'tools/requirements-assets.txt'), 'utf8');
for (const [, name, version] of assetRequirements.matchAll(/^([A-Za-z0-9_-]+)==([^\s]+)$/gm)) if (!tooling.pythonTools.some(tool => tool.name.toLowerCase() === name.toLowerCase() && tool.version === version)) throw new Error(`Asset tool notice is stale: ${name}@${version}`);
for (const item of [...sources.sources, ...tooling.pythonTools]) if (item.licenseFile && hash(await readFile(resolve(root, item.licenseFile))) !== item.licenseSha256) throw new Error(`Source license checksum mismatch: ${item.name}`);
const canonicalFiles = (await readdir(canonical, { recursive:true, withFileTypes:true })).filter(entry => entry.isFile()).map(entry => normalized(relative(canonical, resolve(entry.parentPath, entry.name)))).sort();
if (process.argv.includes('--check')) {
  for (const path of canonicalFiles) if (!Buffer.from(await readFile(resolve(canonical, path))).equals(await readFile(resolve(publicDirectory, path)))) throw new Error(`Stale distributed notice: ${path}`);
  for (const path of legalFiles) if (!Buffer.from(await readFile(resolve(root, path))).equals(await readFile(resolve(publicDirectory, path)))) throw new Error(`Stale distributed notice: ${path}`);
  if ((await readdir(resolve(root, 'src/web/public/stats'))).some(path => /license/i.test(path))) throw new Error('License files belong in the central licenses directory, not stats/');
} else {
  await mkdir(publicDirectory, { recursive:true });
  await cp(canonical, publicDirectory, { recursive:true, force:true });
  for (const path of legalFiles) await cp(resolve(root, path), resolve(publicDirectory, path));
}
console.log(JSON.stringify(inventory.summary));
