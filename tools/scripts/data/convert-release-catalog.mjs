import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('../../../', import.meta.url);
const canonical = new URL('src/game-data/data/tables/catalog-release-metadata.json', root);
const target = new URL('src/web/generated/catalog-release-metadata.json', root);
const commit = '8e5badd60b5d894284ccc927a56c9683529d2592';
if (process.argv.includes('--capture')) {
  const reference = new URL('.references/genshin-db/', root);
  if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: reference, encoding: 'utf8' }).trim() !== commit) throw new Error('Use the pinned genshin-db reference.');
  const data = new URL('src/data/', reference);
  const output = { source: { repository: 'theBowja/genshin-db', commit, path: 'src/data/version' }, characters: {}, weapons: {}, artifacts: {} };
  for (const group of ['characters', 'weapons', 'artifacts']) {
    const raw = readFileSync(new URL(`version/${group}.json`, data));
    for (const [id, version] of Object.entries(JSON.parse(raw))) {
      if (!/^\d+\.\d+$/.test(version)) throw new Error(`Unexpected version: ${id} ${version}`);
      const path = new URL(`ChineseSimplified/${group}/${id}.json`, data);
      if (!existsSync(path)) throw new Error(`Missing ${group}/${id}`);
      const item = JSON.parse(readFileSync(path, 'utf8'));
      output[group][id] = { name: item.name, version, gameId: item.id, ...(group === 'artifacts' ? {} : { rarity: item.rarity }) };
    }
  }
  writeFileSync(canonical, `${JSON.stringify(output, null, 2)}\n`);
}
const content = readFileSync(canonical, 'utf8');
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== content) throw new Error('Release metadata needs regeneration.');
} else writeFileSync(target, content);
const data = JSON.parse(content);
console.log(Object.fromEntries(['characters', 'weapons', 'artifacts'].map(group => [group, Object.keys(data[group]).length])));
