import { catalogInventory, readCalculationData } from './catalog-data.mjs';
import { readContentSource } from './content-source.mjs';
import { readCalculationLibrary } from './calculation-library.mjs';
import { createContentLinker } from '../../src/game-data/src/link-content.mjs';
import { DATA_VERSION } from '../../src/game-data/src/version.mjs';
import { loadContentSchema } from './load-content-schema.mjs';

const data = new URL('../../src/game-data/data/', import.meta.url);
const read = name => readContentSource(new URL(name, data));
const folders = { characters: 'characters', weapons: 'weapons', sets: 'artifact-sets', actions: 'actions' };
function supported(complete) {
  return { supported: complete, reason: complete ? '具有已核验的明确查询范围；以所选输出为准。' : '相关查询机制尚未闭合。' };
}
export function catalogList(inventory = catalogInventory()) {
  return { version: inventory.dataVersion,
    characters: inventory.characters.map(id => {
      const { identity, support } = read('characters/' + id + '.json');
      return { id, name: identity.name, element: identity.element, weaponType: identity.weaponType, ...supported(Object.values(support).some(s => s.resolution === 'complete')) };
    }),
    weapons: inventory.weapons.map(id => {
      const w = read('weapons/' + id + '.json');
      return { id, name: w.name, weaponType: w.weaponType, rarity: w.rarity, ...supported(w.support.resolution === 'complete') };
    }),
    sets: inventory.sets.map(id => {
      const { name, rarity, rarities, slots } = read('artifact-sets/' + id + '.json');
      return { id, name, rarity, rarities, slots };
    }),
  };
}

export async function createRuntimeCatalog(selection) {
  const inventory = selection ? { dataVersion: DATA_VERSION, ...selection } : catalogInventory();
  const schemas = await loadContentSchema(), engine = await loadContentSchema('/src/engine/src/index.ts');
  const definitions = new Map();
  const library = readCalculationLibrary(path => {
    const definition = readCalculationData(path);
    definitions.set(path, definition);
    return definition;
  }, inventory);
  const compiled = engine.compileCalculation(library);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
  const linker = createContentLinker({ schemas, ...engine, library: compiled.program });
  async function get(group, id) {
    if (!inventory[group]?.includes(id)) throw new Error('Undefined catalog entry: ' + group + '/' + id);
    const definition = definitions.get('src/game-data/data/' + folders[group] + '/' + id + '.json');
    if (group === 'characters') {
      schemas.characterMetadataSchema.parse(definition.metadata);
      return linker.character(definition);
    }
    if (group === 'weapons') return linker.weapon(definition);
    if (group === 'sets') return linker.set(definition);
    const actions = schemas.characterActionsDefinitionSchema.parse(definition);
    const closure = engine.collectCalculationRoots(compiled.program, { roots: [actions.calculation.stateMachine],
      sourceIds: [...new Set([...actions.sources, ...actions.actions.flatMap(a => a.sources), ...actions.gaps.flatMap(g => g.sources)])], families: [] });
    if (!closure.ok) throw new Error(JSON.stringify(closure.diagnostics));
    const linked = { ...actions, calculation: { ...actions.calculation, bundle: closure.bundle } };
    const checked = engine.compileCharacterActions(linked, await get('characters', actions.character.id));
    if (!checked.ok) throw new Error(JSON.stringify(checked.diagnostics));
    return linked;
  }
  return { inventory, library, get };
}
