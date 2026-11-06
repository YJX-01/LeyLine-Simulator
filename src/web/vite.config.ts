import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  plugins: [vue()],
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
