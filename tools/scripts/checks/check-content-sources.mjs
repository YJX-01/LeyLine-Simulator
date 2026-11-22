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

const sets = read('tools/data/sources/catalog/genshin-db/sets.json');
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
for (const [avatarId, item] of Object.entries(read('tools/data/sources/catalog/enka/skill-supplements.json').characters)) {
  const entry = enka.characters[avatarId];
  if (entry?.id !== item.id || JSON.stringify(entry.skills) !== JSON.stringify(item.skills) || entry.skillDepotId !== item.skillDepotId) {
    throw new Error(`Enka catalog entry differs from the adopted skill supplement: ${avatarId}`);
  }
}
displayData('mona-set-aliases'); // The projection rejects conflicting export aliases.

await checkCatalog();
const audit = await numericAudit();
assertNumericAudit(audit);
console.log(`Validated ${sources} content sources, catalog dependencies and display data.`);
console.log(`Compared ${Object.values(audit.comparedValues).reduce((total,count)=>total+count,0)} numeric fields against adopted source values.`);
