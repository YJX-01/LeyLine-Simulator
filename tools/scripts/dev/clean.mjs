import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertBuildOutput, assertNoActiveBuilds, removeBuildOutput } from '../../lib/build-outputs.mjs';

const root = realpathSync(fileURLToPath(new URL('../../../', import.meta.url)));
const args = new Set(process.argv.slice(2));
for (const arg of args) {
  if (!['--cache', '--dry-run'].includes(arg)) throw new Error(`Unknown cleanup option: ${arg}`);
}
const paths = args.has('--cache') ? ['.cache'] : [
  'artifacts/performance', 'artifacts/playwright', 'test-results', 'playwright-report', 'coverage',
  'src/web/dist', 'src/web/dist-subpath', 'src/web/dist-desktop',
  'src/game-data/generated', 'src/web/generated', '.cache/public', '.cache/build',
  'artifacts/desktop-stage', 'artifacts/desktop-preview',
];

// Validate every target before deleting anything. Never accept caller-supplied paths.
assertNoActiveBuilds(root);
const targets = paths.map(path => ({ path, target: assertBuildOutput(root, path) }));

for (const { path, target } of targets) {
  if (!existsSync(target)) continue;
  if (args.has('--dry-run')) console.log(`Would remove ${path}/`);
  else { removeBuildOutput(root, target); console.log(`Removed ${path}/`); }
}
console.log(args.has('--dry-run') ? 'Cleanup preview complete.' : 'Cleanup complete.');
