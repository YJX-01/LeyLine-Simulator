import { defineConfig } from '@playwright/test';
import development from './playwright.config';

export default defineConfig({
  ...development,
  testDir: './tests/performance',
  outputDir: 'test-results/performance',
  reporter: 'list',
});
