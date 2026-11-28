import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { readContentSource } from '../../lib/content-source.mjs';
import { numericAudit, assertNumericAudit } from '../../lib/numeric-audit.mjs';
import { displayData } from '../../lib/display-data.mjs';
import { checkCatalog } from './check-catalog.mjs';
import { metadataAcquisitionPath } from '../../../src/schema/src/content/metadata-fields.mjs';

const root = resolve(import.meta.dirname, '../../..');
const read = path => readContentSource(resolve(root, path));
function walk(directory) {
  return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]);
}
function checkRuntimeMetadata(value, path) {
  const field = metadataAcquisitionPath(value);
  if (field) throw new Error([path,...field].join('/') + ': acquisition data in runtime metadata');
}
let sources = 0;
for (const directory of ['src/game-data/data', 'assets', 'tools/data']) {
  const files = walk(directory);
  if (files.some(path => /\.(yaml|yml|jsonc|json5)$/.test(path))) throw new Error(`${directory}: maintained content uses strict JSON`);
  for (const path of files.filter(path => path.endsWith('.json'))) {
    const value = read(path);
    if (path.startsWith('src/game-data/data/')) checkRuntimeMetadata(value, path);
    sources++;
  }
}

const sets = read('tools/data/sources/anime-game-data/sets.json');
for (const [id, entry] of Object.entries(read('src/game-data/data/tables/artifact-set-short-names.json').sets)) {
  if (sets[id]?.name !== entry.name || !entry.shortName) throw new Error(`Invalid set abbreviation: ${id}`);
}
const effectiveGroups = new Set(['hp', 'attack', 'defense', 'critRate', 'critDamage', 'elementalMastery', 'energyRecharge']);
for (const [name, groups] of Object.entries(displayData('character-effective-stats').characters)) {
  if (!name || !Array.isArray(groups) || !groups.length || groups.some(group => !effectiveGroups.has(group))) {
    throw new Error(`Invalid character effective attributes: ${name}`);
  }
}
for (const value of Object.values(displayData('effective-roll-basis').defaults)) {
  if (!Number.isFinite(value) || value <= 0) throw new Error('Invalid effective roll fallback.');
}
const enka = displayData('enka-catalog');
const characters = read('tools/data/sources/anime-game-data/characters.json');
const formSource = read('tools/data/sources/anime-game-data/base-and-manekin.json');
const enkaIds = read('tools/data/sources/anime-game-data/enka-ids.json').characters;
for (const [id, binding] of Object.entries(formSource.bindings)) {
  const avatarId = characters[binding.baseId].metadata.id;
  const depot = formSource.skillDepots[binding.skillDepotId];
  const skills = [...depot.skills, depot.energySkill].filter(skill => skill !== 0);
  const entry = enka.characters[`${avatarId}-${binding.skillDepotId}`];
  if (entry?.id !== id || entry.skillDepotId !== binding.skillDepotId || JSON.stringify(entry.skills) !== JSON.stringify(skills)) {
    throw new Error(`Enka form differs from the adopted skill depot: ${id}/${binding.skillDepotId}`);
  }
}
for (const [key, expected] of Object.entries(enkaIds)) {
  if (!key.includes('-') && ['aether', 'lumine', 'manekin', 'manekina'].includes(expected.id)) continue;
  const entry = enka.characters[key];
  if (entry?.id !== expected.id || JSON.stringify(entry.skills) !== JSON.stringify(expected.skills) || entry.skillDepotId !== expected.skillDepotId) {
    throw new Error(`Enka catalog entry differs from the adopted AnimeGameData skills: ${key}`);
  }
}
for (const [alias, setId] of Object.entries(displayData('mona-set-aliases'))) {
  if (!alias || !Object.hasOwn(sets, setId)) throw new Error(`Invalid Mona set alias: ${alias} -> ${setId}`);
}

await checkCatalog();
const audit = await numericAudit();
assertNumericAudit(audit);
console.log(`Validated ${sources} content sources, catalog dependencies and display data.`);
console.log(`Compared ${Object.values(audit.comparedValues).reduce((total,count)=>total+count,0)} numeric fields against adopted source values.`);
