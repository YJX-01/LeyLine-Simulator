import { defineConfig } from '@playwright/test';
import development from './playwright.config';
export default defineConfig({
  ...development,
  testDir: './tests/production',
  outputDir: 'test-results/production',
  reporter: [['list'], ['json', { outputFile: 'artifacts/playwright/production-results.json' }]],
  use: { ...development.use, baseURL: 'http://127.0.0.1:5175' },
  webServer: [
    { command: 'node scripts/serve-dist.mjs --port=5175', url: 'http://127.0.0.1:5175', reuseExistingServer: false },
    { command: 'node scripts/serve-dist.mjs --port=5176 --base=/leyline/ --dir=apps/web/dist-subpath', url: 'http://127.0.0.1:5176/leyline/', reuseExistingServer: false },
  ],
});
