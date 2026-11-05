import { existsSync, lstatSync, realpathSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = realpathSync(fileURLToPath(new URL('../../', import.meta.url)));
const args = new Set(process.argv.slice(2));
for (const arg of args) {
  if (!['--cache', '--dry-run'].includes(arg)) throw new Error(`Unknown cleanup option: ${arg}`);
}
const paths = args.has('--cache') ? ['.cache'] : [
  'artifacts', 'test-results', 'playwright-report', 'coverage',
  'src/web/dist', 'src/web/dist-subpath',
];

// Validate every target before deleting anything. Never accept caller-supplied paths.
const targets = paths.map(path => {
  const target = resolve(root, path);
  const inside = relative(root, target);
  if (!inside || inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    throw new Error(`Cleanup target must stay inside the repository: ${path}`);
  }
  let current = root;
  for (const part of inside.split(sep)) {
    current = join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
      throw new Error(`Refusing cleanup through a directory link: ${path}`);
    }
  }
  const tracked = execFileSync('git', ['ls-files', '--', path], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (tracked.trim()) throw new Error(`Refusing to remove tracked files under ${path}`);
  return { path, target };
});

for (const { path, target } of targets) {
  if (!existsSync(target)) continue;
  if (args.has('--dry-run')) console.log(`Would remove ${path}/`);
  else { rmSync(target, { recursive: true }); console.log(`Removed ${path}/`); }
}
console.log(args.has('--dry-run') ? 'Cleanup preview complete.' : 'Cleanup complete.');
