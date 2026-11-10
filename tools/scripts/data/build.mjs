import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../../..');
for (const script of ['tools/scripts/data/convert-real-game-data.mjs','tools/scripts/data/build-display.mjs','tools/scripts/data/convert-enka-catalog.mjs','tools/scripts/data/convert-artifact-rolls.mjs','tools/scripts/data/convert-mona-catalog.mjs','tools/scripts/data/convert-release-catalog.mjs','tools/scripts/assets/build.mjs']) {
  execFileSync(process.execPath,[resolve(root,script), ...process.argv.slice(2)],{cwd:root,stdio:'inherit'});
}
