import { fileURLToPath } from 'node:url';
import { relative } from 'node:path';
import { pruneReleases } from '../../lib/build-outputs.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const args = new Set(process.argv.slice(2));
for (const arg of args) if (arg !== '--dry-run') throw new Error(`Unknown prune option: ${arg}`);
for (const kind of ['desktop', 'web']) {
  const result = await pruneReleases(root, kind, { dryRun: args.has('--dry-run') });
  for (const path of result.removed) console.log(`${args.has('--dry-run') ? 'Would remove' : 'Removed'} ${relative(root, path)}`);
  console.log(`${kind}: ${result.kept.length} completed releases retained (limit 2).`);
}
