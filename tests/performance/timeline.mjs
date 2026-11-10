import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { sourceFingerprint } from '../../tools/lib/source-fingerprint.mjs';
const root = resolve(import.meta.dirname, '../..');
const input='.references/enka/official-example.json';
if (!existsSync(resolve(root,input))) {
  const report={status:'skipped',sourceFingerprint:sourceFingerprint(),input,gap:'Original public showcase is unavailable; no replacement data was generated.'};
  await mkdir(resolve(root,'artifacts/performance'),{recursive:true});
  await writeFile(resolve(root,'artifacts/performance/timeline.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));process.exit(0);
}
const require=createRequire(new URL('../../src/web/package.json',import.meta.url));
const {createServer}=await import(pathToFileURL(require.resolve('vite')).href);
const server=await createServer({root,configFile:false,logLevel:'silent',optimizeDeps:{noDiscovery:true},server:{middlewareMode:true,watch:null}});
try {
// The input is an actual public showcase, without an observed combat timeline.
const { previewEnkaImport } = await server.ssrLoadModule('/src/web/src/domain/enka-import.ts');
const { createAccount } = await server.ssrLoadModule('/src/web/src/domain/account.ts');
const { evaluateTimeline, resolveBuild } = await server.ssrLoadModule('/src/engine/src/index.ts');
const bytes=await readFile(resolve(root,input));
const raw=JSON.parse(bytes.toString('utf8'));
const preview=await previewEnkaImport(raw,String(raw.uid),createAccount());
const builds = preview.rows.map(row => row.character.showcase?.build).filter(Boolean);
if (!builds.length) throw new Error('The actual showcase contains no parsed builds.');
const samples = [];
let statuses;
for (let run = -1; run < 7; run++) {
  const begin = performance.now(); statuses = builds.map(build => resolveBuild(build).status);
  if (run >= 0) samples.push(performance.now() - begin);
}
samples.sort((a,b) => a-b);
// Empty axes sum to zero independently of engine mechanics; no game events are invented.
const empty = evaluateTimeline({schemaVersion:2,rulesVersion:'timeline-v1',calculationProfile:'direct',id:'empty-axis',revision:'1',definitions:[],candidate:{id:'empty',actors:[]},conditions:{},timeline:[],objective:{}});
if (empty.status !== 'complete' || empty.totalValue !== 0) throw new Error('Empty aggregation failed.');
if (samples[6] > 2000) throw new Error('Recorded build resolution exceeded 2 seconds.');
const report = { measuredAt:new Date().toISOString(),sourceFingerprint:sourceFingerprint(),input,sha256:createHash('sha256').update(bytes).digest('hex'),
  method:'One warmup and seven runs resolving every build in the original public showcase; p95 is the maximum of seven.',
  builds:builds.length,statuses,medianMs:samples[3],p95Ms:samples[6],budgetMs:2000,
  gap:'No recorded combat timeline exists. This measures build resolution and empty aggregation, not full-axis throughput or game damage acceptance.' };
await mkdir(resolve(root,'artifacts/performance'),{recursive:true});
await writeFile(resolve(root,'artifacts/performance/timeline.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));

} finally { await server.close(); }
