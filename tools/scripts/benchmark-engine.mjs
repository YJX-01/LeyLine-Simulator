import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { cpus, platform, totalmem } from 'node:os';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../src/web/package.json', import.meta.url));
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const server = await createServer({ root, configFile: false, logLevel: 'silent',
  optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, watch: null } });
try {
  const { simulateTeam } = await server.ssrLoadModule('/src/engine/src/index.ts');
  const { performanceScenarios } = await server.ssrLoadModule('/fixtures/performance/scenarios.ts');
  const cases = performanceScenarios();
  const scenarios = [];
  for (const [name, input] of Object.entries(cases)) {
    for (let n = 0; n < 2; n++) simulateTeam(input);
    const samples = [];
    let result;
    for (let n = 0; n < 7; n++) { const start = performance.now(); result = simulateTeam(input); samples.push(performance.now() - start); }
    const sorted = [...samples].sort((a, b) => a - b);
    const detail = { name, commands: input.commands.length, durationMs: input.durationMs, mode: input.logMode,
      medianMs: +sorted[3].toFixed(2), p95Ms: +sorted[6].toFixed(2), samplesMs: samples.map(value => +value.toFixed(2)),
      events: result.events.length, hits: result.hits, rejected: result.eventCounts.rejected ?? 0,
      serializedBytes: Buffer.byteLength(JSON.stringify(result)), totalDamage: result.totalDamage };
    if (detail.p95Ms > 2000 || detail.serializedBytes > 8_000_000) throw new Error(`Performance budget exceeded: ${name}`);
    scenarios.push(detail);
  }
  if (!global.gc) throw new Error('Run with node --expose-gc for a comparable retained-heap measurement.');
  global.gc(); const before = process.memoryUsage().heapUsed;
  for (let n = 0; n < 10; n++) simulateTeam(cases['2000-commands']);
  global.gc(); const retainedHeapDeltaBytes = process.memoryUsage().heapUsed - before;
  if (retainedHeapDeltaBytes > 32_000_000) throw new Error('Retained heap exceeds 32 MB budget.');
  const report = { formatVersion: 1, measuredAt: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    environment: { node: process.version, platform: platform(), cpu: cpus()[0]?.model, memoryBytes: totalmem() },
    method: 'Vite SSR-loaded TypeScript engine; 2 warmups + 7 measured runs, p95 is max of 7; full GC before/after 10 discarded runs. Heap is process heap, not browser memory.',
    budgets: { p95Ms: 2000, resultBytes: 8_000_000, retainedHeapDeltaBytes: 32_000_000 }, retainedHeapDeltaBytes, scenarios };
  const output = resolve(root, process.argv.find(arg => arg.startsWith('--output='))?.slice(9) ?? 'artifacts/performance/engine.json');
  await mkdir(dirname(output), { recursive: true }); await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ output, retainedHeapDeltaBytes, scenarios }, null, 2));
} finally { await server.close(); }
