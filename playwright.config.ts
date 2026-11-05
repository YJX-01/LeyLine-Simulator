import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://127.0.0.1:5174', headless: true, channel: process.env.PLAYWRIGHT_CHANNEL },
  webServer: { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174 --strictPort', cwd: './apps/web', url: 'http://127.0.0.1:5174', reuseExistingServer: false },
});
