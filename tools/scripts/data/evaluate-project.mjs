import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../../src/web/package.json', import.meta.url));
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const server = await createServer({ root, configFile: false, logLevel: 'silent',
  optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, watch: null } });
try {
  const { evaluateTimeline } = await server.ssrLoadModule('/src/engine/src/timeline/index.ts');
  if(!process.argv[2])throw new Error('Provide a current project JSON file.');
  const input=JSON.parse(await readFile(process.argv[2],'utf8'));
  const result=evaluateTimeline(input);
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'complete') process.exitCode = 1;
} finally { await server.close(); }
