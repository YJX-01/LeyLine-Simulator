import { writeGeneratedFile } from '../../lib/generated-files.mjs';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const canonical = resolve(root, 'tools/data/sources/catalog/mona-community/catalog.json');
const aliasesPath = resolve(root, 'src/web/generated/mona-set-aliases.json');
if (process.argv.includes('--capture')) {
  const reference = resolve(root, '.references/mona-current');
  const expected = '589ac6919057709924c0c20d5a9d673fe9b0be1a';
  const actual = execFileSync('git', ['-C', reference, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (actual !== expected) throw new Error('Mona subrepository changed; review its catalog before capture.');
  const read = path => {
    const text = readFileSync(resolve(reference, path), 'utf8').replace(/\r\n/g, '\n');
    return text;
  };
  // Generated modules contain JSON data. Parse the data, never evaluate remote JS.
  const generated = kind => JSON.parse(read(`src/assets/_gen_${kind}.js`).split('export default')[1].trim().replace(/;$/, ''));
  const locale = JSON.parse(read('src/i18n/generated/zh-cn.json'));
  const catalog = JSON.parse(readFileSync(resolve(root, 'src/game-data/generated/catalog.json'), 'utf8'));
  const sets = Object.entries(generated('artifact')).map(([key, value]) => {
    const name = locale[value.nameLocale];
    const entry = catalog.sets.find(entry => entry.name === name);
    if (!entry) throw new Error(`Review missing canonical artifact set: ${name}`);
    return { monaKey: key, exportName: value.name2, name, canonicalId: entry.id };
  });
  const compare = (kind, entries) => Object.entries(generated(kind)).map(([key, value]) => {
    const name = locale[value.nameLocale];
    return { monaKey: key, name, canonicalId: entries.find(entry => entry.name === name)?.id ?? null };
  });
  const characters = compare('character', catalog.characters);
  const weapons = compare('weapon', catalog.weapons);
  const snapshot = { repository: 'TwiceDrop/genshin_artifact', commit: '589ac6919057709924c0c20d5a9d673fe9b0be1a', release: '7.2.02', checkedOn: '2026-11-06',
    purpose: 'Catalog identity and UI import compatibility only; does not validate or port upstream calculation mechanics.', sets, characters, weapons };
  mkdirSync(resolve(canonical, '..'), { recursive: true });
  writeFileSync(canonical, `${JSON.stringify(snapshot, null, 2)}\n`);
}
const snapshot = JSON.parse(readFileSync(canonical, 'utf8'));
const aliases = {};
for (const set of snapshot.sets) {
  for (const key of [set.monaKey, set.exportName]) {
    if (aliases[key] && aliases[key] !== set.canonicalId) throw new Error(`Ambiguous Mona set: ${key}`);
    aliases[key] = set.canonicalId;
  }
}
const result = `${JSON.stringify(aliases, null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (readFileSync(aliasesPath, 'utf8') !== result) throw new Error('Mona set aliases need regeneration.');
} else writeGeneratedFile(aliasesPath, result);
console.log(JSON.stringify({ release: snapshot.release, sets: snapshot.sets.length, characters: snapshot.characters.length, weapons: snapshot.weapons.length, aliases: Object.keys(aliases).length }));
