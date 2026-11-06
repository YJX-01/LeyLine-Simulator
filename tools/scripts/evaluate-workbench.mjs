import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../src/web/package.json', import.meta.url));
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const server = await createServer({ root, configFile: false, logLevel: 'silent',
  optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, watch: null } });
try {
  const { evaluateWorkbench } = await server.ssrLoadModule('/src/engine/src/workbench/index.ts');
  const input = JSON.parse(await readFile(process.argv[2] ?? 'fixtures/workbench/ordinary.json', 'utf8'));
  const start = performance.now();
  const result = evaluateWorkbench(input);
  const firstMs = performance.now() - start;
  if (process.argv.includes('--benchmark')) {
    const samples = [];
    for (let n = 0; n < 100; n++) {
      const begin = performance.now();
      evaluateWorkbench(input);
      samples.push(performance.now() - begin);
    }
    samples.sort((a, b) => a - b);
    console.error(JSON.stringify({ node: process.version, firstMs, runs: 100, medianMs: samples[50], p95Ms: samples[95] }));
    if (result.plan && result.plan.timeline.length) {
      const large = structuredClone(result.plan);
      large.timeline = Array.from({ length: 1000 }, (_, i) => ({ ...large.timeline[i % large.timeline.length], id: `benchmark-${i}`, order: i }));
      const begin = performance.now();
      const evaluated = evaluateWorkbench(large);
      console.error(JSON.stringify({ records: 1000, elapsedMs: performance.now() - begin, status: evaluated.status, points: evaluated.points.length }));
    }
  }
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'complete') process.exitCode = 1;
} finally { await server.close(); }
