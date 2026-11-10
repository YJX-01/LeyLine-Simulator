import { pruneGeneratedFiles } from '../../lib/generated-files.mjs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../../..');
for (const script of ['tools/scripts/data/convert-real-game-data.mjs','tools/scripts/data/build-display.mjs','tools/scripts/data/convert-enka-catalog.mjs','tools/scripts/data/convert-artifact-rolls.mjs','tools/scripts/data/convert-mona-catalog.mjs','tools/scripts/data/convert-release-catalog.mjs','tools/scripts/assets/build.mjs']) {
  execFileSync(process.execPath,[resolve(root,script), ...process.argv.slice(2)],{cwd:root,stdio:'inherit'});
}

pruneGeneratedFiles(root, 'src/web/generated', ['artifact-rolls.json', 'artifact-set-short-names.json', 'character-effective-stats.json', 'effective-roll-basis.json', 'character-talent-display.json', 'enka-catalog.json', 'mona-set-aliases.json', 'catalog-release-metadata.json', 'game-icon-index.json', 'game-detail-icon-index.json'], process.argv.includes('--check'));
