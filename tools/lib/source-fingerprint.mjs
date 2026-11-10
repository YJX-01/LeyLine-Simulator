import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
export function sourceFingerprint() {
  const hash = createHash('sha256');
  function file(path) { hash.update(path); hash.update('\0'); hash.update(readFileSync(resolve(root, path))); hash.update('\0'); }
  function walk(path) {
    for (const entry of readdirSync(resolve(root, path), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const target = `${path}/${entry.name}`; if (entry.isDirectory()) walk(target); else if (entry.isFile()) file(target);
    }
  }
  for (const path of ['src/web/src', 'src/web/server', 'src/web/desktop', 'assets', 'src/engine/src', 'src/schema/src', 'src/game-data/src', 'src/game-data/data', 'tests', 'tools/scripts', 'tools/lib', 'tools/data', 'tools/patches', 'licenses']) walk(path);
  for (const path of ['THIRD_PARTY_NOTICES.md', 'CREDITS.md', 'package.json', 'src/web/package.json', 'src/web/vite.config.ts', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'playwright.config.ts', 'playwright.production.config.ts', 'tsconfig.json', 'vitest.config.ts']) file(path);
  return hash.digest('hex');
}
