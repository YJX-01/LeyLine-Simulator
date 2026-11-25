import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  base: '/audit/mona/',
  appType: 'mpa',
  publicDir: false,
  plugins: [vue()],
  build: { outDir: '../../artifacts/mona-audit-site', emptyOutDir: false },
  preview: { host: '127.0.0.1', port: 5186, strictPort: true },
});
