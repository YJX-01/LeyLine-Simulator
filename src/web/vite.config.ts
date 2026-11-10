import { defineConfig } from 'vite';
import { serveEnka } from './server/enka.mjs';
import vue from '@vitejs/plugin-vue';
import { thirdPartyBundle } from '../../tools/scripts/build/third-party-bundle.mjs';
export default defineConfig({
  publicDir: '../../.cache/public',
  plugins: [thirdPartyBundle(), vue(), { name: 'leyline-enka-import', configureServer(server) { server.middlewares.use((request, response, next) => { const match = /^\/api\/enka\/(\d{9,10})(?:\?.*)?$/.exec(request.url ?? ''); if (match) void serveEnka(request, response, match[1]); else next(); }); } }],
  build: { manifest: true, assetsInlineLimit: 1024 },
});
