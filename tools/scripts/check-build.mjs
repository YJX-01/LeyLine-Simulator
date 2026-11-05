import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
const root = fileURLToPath(new URL('../../', import.meta.url));
const dist = resolve(root, process.argv.find(arg => arg.startsWith('--dist='))?.slice(7) ?? 'src/web/dist');
const manifest = JSON.parse(await readFile(resolve(dist, '.vite/manifest.json'), 'utf8'));
const entry = Object.keys(manifest).find(key => manifest[key].isEntry);
if (!entry || !manifest['src/Workbench.vue']) throw new Error('Missing application entries.');
function closure(key, seen = new Set()) {
  if (seen.has(key)) return seen;
  if (!manifest[key]) throw new Error(`Missing manifest dependency: ${key}`);
  seen.add(key); for (const dependency of manifest[key].imports ?? []) closure(dependency, seen);
  return seen;
}
const files = [];
for (const file of await readdir(resolve(dist, 'assets'))) {
  if (!file.endsWith('.js')) continue;
  const buffer = await readFile(resolve(dist, 'assets', file));
  files.push({ file: `assets/${file}`, bytes: buffer.length, gzipBytes: gzipSync(buffer).length });
}
const sum = keys => [...keys].reduce((total, key) => total + (files.find(file => file.file === manifest[key].file)?.gzipBytes ?? 0), 0);
const boot = closure(entry), workbench = closure('src/Workbench.vue');
if ([...workbench].some(key => /chart-|charts\/runtime|DeveloperTools/.test(key))) throw new Error('Developer tools or charts entered the default static dependency graph.');
const budgets = { largestJavaScriptBytes: 500_000, bootstrapGzipBytes: 50_000, workbenchGzipBytes: 150_000 };
const report = { formatVersion: 1, budgets, bootstrapGzipBytes: sum(boot), workbenchGzipBytes: sum(workbench), files };
if (files.some(file => file.bytes > budgets.largestJavaScriptBytes) || report.bootstrapGzipBytes > budgets.bootstrapGzipBytes || report.workbenchGzipBytes > budgets.workbenchGzipBytes) throw new Error(`Build budget exceeded: ${JSON.stringify(report)}`);
const output = resolve(root, process.argv.find(arg => arg.startsWith('--output='))?.slice(9) ?? 'artifacts/performance/build.json');
await mkdir(dirname(output), { recursive: true }); await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
