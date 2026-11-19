import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogInventory } from './catalog-data.mjs';
import { createAssetIndex } from './asset-index.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const table = name => read('src/game-data/data/tables/' + name + '.json');
const roles = () => catalogInventory().characters.map(id => read('src/game-data/data/characters/' + id + '.json'));
export function currentAssetIndex() {
  const manifest = read('assets/manifest.json');
  const revisions = Object.fromEntries(manifest.assets.map(({ file }) => [file, createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex').slice(0, 12)]));
  return createAssetIndex(manifest, roles(), revisions);
}
export function displayData(name) {
  switch (name) {
    case 'artifact-rolls': return table(name).affixes;
    case 'artifact-set-short-names': return Object.fromEntries(Object.entries(table(name).sets).map(([id, row]) => [id, row.shortName]));
    case 'effective-roll-basis': return { defaults: table(name).defaults };
    case 'character-effective-stats': return { characters: table(name).characters };
    case 'catalog-release-metadata': { const { characters, weapons, artifacts } = table(name); return { characters, weapons, artifacts }; }
    case 'enka-catalog': return read('tools/data/sources/catalog/enka/catalog.json').mapping;
    case 'mona-set-aliases': {
      const aliases = {};
      for (const item of read('tools/data/sources/catalog/mona-community/catalog.json').sets) for (const key of [item.monaKey, item.exportName]) {
        if (Object.hasOwn(aliases, key) && aliases[key] !== item.canonicalId) throw new Error('Ambiguous Mona alias: ' + key);
        aliases[key] = item.canonicalId;
      }
      return aliases;
    }
    case 'character-talent-display': {
      const characters = {};
      const slots = { normal: ['A',1], skill: ['E',2], burst: ['Q',3] };
      for (const role of roles()) {
        const rows = role.talents.map(t => ({ key: t.category, label: slots[t.category][0], icon: role.id + '-combat' + slots[t.category][1], name: t.name,
          constellations: role.constellations.filter(c => c.talentBonuses.some(b => b.category === t.category)).map(c => c.rank) }));
        characters[role.identity.name] = characters[role.id] = rows;
      }
      return { characters };
    }
    case 'game-icon-index': case 'game-detail-icon-index': {
      const detail = ['skills','constellations','buffs'];
      return Object.fromEntries(Object.entries(currentAssetIndex()).filter(([kind]) => detail.includes(kind) === (name === 'game-detail-icon-index')));
    }
    default: throw new Error('Unknown display table: ' + name);
  }
}
