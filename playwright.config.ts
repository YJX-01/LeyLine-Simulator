import { defineConfig } from '@playwright/test';
import { sourceFingerprint } from './tools/scripts/source-fingerprint.mjs';
export default defineConfig({
  testDir: './tests/e2e',
  metadata: { sourceFingerprint: sourceFingerprint() },
  outputDir: 'test-results/development',
  workers: process.env.CI ? 2 : 4,
  expect: { timeout: 10000 },
  reporter: [['list'], ['json', { outputFile: 'artifacts/playwright/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:5174', headless: true, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', channel: process.env.PLAYWRIGHT_CHANNEL } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174 --strictPort', cwd: './src/web', url: 'http://127.0.0.1:5174', reuseExistingServer: false },
});
