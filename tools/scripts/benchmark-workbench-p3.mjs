import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { sourceFingerprint } from './source-fingerprint.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../src/web/package.json', import.meta.url));
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const server = await createServer({ root, configFile: false, logLevel: 'silent', optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, watch: null } });
try {
  const { evaluateWorkbench } = await server.ssrLoadModule('/src/engine/src/workbench/index.ts');
  const capture = JSON.parse(await readFile(resolve(root, 'fixtures/workbench/p3-snapshot.json'), 'utf8'));
  capture.timeline = [...capture.timeline.slice(0, 2), ...Array.from({ length: 500 }, (_, order) => ({ id: `capture-${order}`, timeMs: 7000, order, actor: 'dealer', definition: 'snapshot-hit', kind: 'damage' }))];
  const history = JSON.parse(await readFile(resolve(root, 'fixtures/workbench/p3-history.json'), 'utf8'));
  history.timeline = [...Array.from({ length: 500 }, (_, order) => ({ id: `history-${order}`, timeMs: 1000 + order, order, actor: 'dealer', definition: 'hit-one', kind: 'damage' })), history.timeline[3]];
  const scenarios = [];
  for (const [name, input, expected] of [['attribute-capture-500', capture, 3450000], ['history-settlement-500', history, 25000]]) {
    evaluateWorkbench(input);
    const samples = [];
    let result;
    for (let run = 0; run < 7; run++) {
      const start = performance.now(); result = evaluateWorkbench(input); samples.push(performance.now() - start);
      if (result.status !== 'complete' || Math.abs(result.objectiveValue - expected) > 1e-6) throw new Error(`${name}: expected ${expected}, got ${result.status}/${result.objectiveValue}`);
    }
    samples.sort((a, b) => a - b);
    const serializedBytes = Buffer.byteLength(JSON.stringify(result));
    if (samples[6] > 2000 || serializedBytes > 8000000) throw new Error(`P3 performance budget exceeded: ${name}`);
    scenarios.push({ name, records: input.timeline.length, points: result.points.length, medianMs: samples[3], p95Ms: samples[6], serializedBytes, objectiveValue: result.objectiveValue });
  }
  const cycle = structuredClone(history);
  const window = cycle.definitions.find(d => d.id === 'settlement').nodes.find(n => n.id === 'window');
  window.endMs = 6001; window.includeCurrent = true;
  const cyclic = evaluateWorkbench(cycle);
  if (!cyclic.diagnostics.some(d => d.code === 'cycle')) throw new Error('P3 self-cycle guard failed');
  const deep = structuredClone(history);
  const d = deep.definitions.find(d => d.id === 'hit-one');
  d.nodes = [{ id: 'zero', op: 'constant', quantity: { value: 0, unit: 'damage' } }, ...Array.from({ length: 150 }, (_, index) => ({ id: `n${index}`, op: 'add', left: index ? `n${index - 1}` : 'zero', right: 'zero' }))]; d.damage = 'n149';
  const terminated = evaluateWorkbench(deep);
  if (!terminated.diagnostics.some(d => d.code === 'budget') || terminated.status === 'complete') throw new Error('P3 graph budget termination failed');
  const wide = structuredClone(capture);
  const effects = wide.definitions.find(d => d.id === 'dealer-character');
  effects.effects = Array.from({ length: 200 }, (_, index) => ({ id: `wide-${index}`, startMs: 0, endMs: 8000, value: 'late-bonus' }));
  wide.timeline.push(...Array.from({ length: 500 }, (_, order) => ({ id: `wide-hit-${order}`, timeMs: 7000, order: order + 500, actor: 'dealer', definition: 'snapshot-hit', kind: 'damage' })));
  const wideResult = evaluateWorkbench(wide);
  if (!wideResult.diagnostics.some(d => d.code === 'budget') || wideResult.status !== 'partial' || wideResult.objectiveValue !== null) throw new Error('P3 visit budget termination failed');
  const report = { measuredAt: new Date().toISOString(), node: process.version, sourceFingerprint: sourceFingerprint(), method: 'Independent expectations; one warmup and seven measured runs per P3 graph; p95 is maximum of seven.', budgets: { p95Ms: 2000, serializedBytes: 8000000, nodeVisits: 100000, depth: 128 }, guards: ['settlement-self-cycle', 'depth-budget', 'visit-budget-wide-1000-hits-200-effects'], scenarios };
  const directory = resolve(root, 'artifacts/performance'); await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'workbench-p3.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await server.close(); }
