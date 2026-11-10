import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Reuse the repository's existing Vite TS loader, including Node 22.12 support. */
export async function loadContentSchema(module = '/src/schema/src/index.ts') {
  const require = createRequire(new URL('../../src/web/package.json', import.meta.url));
  const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
  const server = await createServer({ root: fileURLToPath(new URL('../../', import.meta.url)), configFile: false, logLevel: 'silent',
    optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, watch: null } });
  try { return await server.ssrLoadModule(module); }
  finally { await server.close(); }
}
