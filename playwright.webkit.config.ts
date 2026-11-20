import { defineConfig } from '@playwright/test';
import development from './playwright.config';

export default defineConfig({
  ...development,
  projects: [{ name: 'webkit', use: { browserName: 'webkit' } }],
  outputDir: 'test-results/webkit',
  reporter: 'list',
});
