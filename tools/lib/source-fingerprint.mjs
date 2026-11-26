import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
function* filesIn(directory) {
  const entries = readdirSync(resolve(root, directory), { withFileTypes: true });
  entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  for (const entry of entries) {
    const path = directory + '/' + entry.name;
    if (entry.isDirectory()) yield* filesIn(path);
    else if (entry.isFile()) yield path;
  }
}

function hashFiles(paths) {
  const hash = createHash('sha256');
  for (const path of paths) {
    hash.update(path).update('\0').update(readFileSync(resolve(root, path))).update('\0');
  }
  return hash.digest('hex');
}

export function sourceFingerprint() {
  const directories = ['src/web/src', 'src/web/server', 'src/web/desktop', 'assets', 'src/engine/src', 'src/schema/src', 'src/game-data/src', 'src/game-data/data', 'tests', 'tools/scripts', 'tools/lib', 'tools/data', 'tools/patches', 'licenses'];
  const files = ['THIRD_PARTY_NOTICES.md', 'CREDITS.md', 'package.json', 'src/web/package.json', 'src/web/README.md', 'src/web/vite.config.ts', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'playwright.config.ts', 'playwright.production.config.ts', 'tsconfig.json', 'vitest.config.ts'];
  return hashFiles([...directories.flatMap(path => [...filesIn(path)]), ...files]);
}

export function amplificationFingerprint(entity, weapon) {
  const paths = [...['src/engine/src','src/schema/src','src/game-data/src','.references/mona-community/mona_wasm/pkg',
    '.references/mona-community/beta-data'].flatMap(path => [...filesIn(path)]),
    `src/game-data/data/characters/${entity}.json`,`src/game-data/data/weapons/${weapon}.json`,
    'src/game-data/data/calculation/common.json','src/game-data/data/calculation/reactions.json',
    'artifacts/amplification-current-pair.mjs','tools/lib/source-fingerprint.mjs',
    '.references/mona-community/src/assets/_gen_character.js','.references/mona-community/src/assets/_gen_weapon.js',
    '.references/mona-community/beta-tools/runtime-7106.mjs',
    '.references/mona-community/mona_core/src/damage/reaction.rs'].sort();
  const revision = directory => execFileSync('git', ['-C', directory, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  return {
    mona: revision(resolve(root, '.references/mona-community')),
    leylineHead: revision(root),
    sha256: hashFiles(paths),
  };
}
