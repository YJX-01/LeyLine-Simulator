import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:5186/audit/mona/';
export default defineConfig({
  testDir: '../../tests/browser/mona-audit',
  outputDir: '../../test-results/mona-audit',
  workers: 1,
  use: { baseURL, trace: 'retain-on-failure' },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js preview',
    url: baseURL,
    reuseExistingServer: true,
  },
});
