import { defineConfig } from 'vite';
import { serveEnka } from '../../tools/desktop/enka.mjs';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  plugins: [vue(), { name: 'leyline-enka-import', configureServer(server) { server.middlewares.use((request, response, next) => { const match = /^\/api\/enka\/(\d{9,10})(?:\?.*)?$/.exec(request.url ?? ''); if (match) void serveEnka(request, response, match[1]); else next(); }); } }],
  optimizeDeps: { include: ['echarts/core', 'echarts/charts', 'echarts/components', 'echarts/renderers'] },
  build: { manifest: true, assetsInlineLimit: 1024, rollupOptions: { output: {
    manualChunks(id) {
      const path = id.replaceAll('\\', '/');
      if (path.includes('/node_modules/zrender/')) return 'chart-renderer';
      if (path.includes('/node_modules/echarts/')) return 'chart-library';
    },
    onlyExplicitManualChunks: true,
  } } },
});
