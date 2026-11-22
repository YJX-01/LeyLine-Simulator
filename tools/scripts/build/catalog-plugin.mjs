import { displayData } from '../../lib/display-data.mjs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { catalogInventory, readCalculationData } from '../../lib/catalog-data.mjs';
import { catalogList, createRuntimeCatalog } from '../../lib/runtime-catalog.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const folder = { characters: 'characters', weapons: 'weapons', sets: 'artifact-sets', actions: 'actions' };
const prefix = 'virtual:leyline-catalog/';
const collections = ['attributes', 'tables', 'formulas', 'effects', 'stateMachines', 'aggregates', 'coverage', 'sources'];
const key = record => record.identity ? JSON.stringify([record.identity.namespace, record.identity.id, record.identity.revision]) : record.id;
const literal = JSON.stringify;
export function catalogPlugin() {
  let runtime;
  const shared = new Map();
  return {
    name: 'leyline-canonical-catalog',
    resolveId(id) { if (id.startsWith(prefix) || id.startsWith('virtual:leyline-display/')) return '\0' + id; },
    configureServer(server) {
      server.watcher.add(['src/game-data/data', 'tools/data/sources/catalog', 'assets'].map(path => resolve(root, path)));
    },
    handleHotUpdate({ file, server }) {
      const path = file.replaceAll('\\', '/');
      if (!['/game-data/data/', '/tools/data/sources/catalog/', '/assets/'].some(folder => path.includes(folder))) return;
      runtime = undefined;
      for (const [id, module] of server.moduleGraph.idToModuleMap) {
        if (id.startsWith('\0virtual:leyline-')) server.moduleGraph.invalidateModule(module);
      }
      server.ws.send({ type: 'full-reload' });
      return [];
    },
    async load(id) {
      if (id.startsWith('\0virtual:leyline-display/')) return 'export default ' + literal(displayData(id.slice('\0virtual:leyline-display/'.length)));
      if (!id.startsWith('\0' + prefix)) return;
      const path = id.slice(prefix.length + 1);
      if (path === 'list') return 'export default ' + literal(catalogList());
      if (path === 'loaders') {
        const inventory = catalogInventory();
        return 'export default {' + Object.keys(folder).map(group => group + ':{' + inventory[group].map(id =>
          literal(id) + ':()=>import(' + literal(prefix + group + '/' + id) + ')').join(',') + '}').join(',') + '}';
      }
      if (shared.has(path)) return 'export default ' + shared.get(path);
      const [group, entityId] = path.split('/');
      const catalog = await (runtime ??= createRuntimeCatalog());
      const linked = await catalog.get(group, entityId);
      const file = resolve(root, 'src/game-data/data', folder[group], entityId + '.json');
      this.addWatchFile(file);
      if (group === 'actions') return 'export default ' + literal(linked);
      const own = readCalculationData(file).calculation.bundle, bundle = linked.calculation.bundle;
      const addition = Object.fromEntries(collections.map(field => {
        const keys = new Set(own[field].map(key));
        return [field, bundle[field].filter(record => !keys.has(key(record)))];
      }));
      const bytes = literal(addition), name = 'shared/' + createHash('sha256').update(bytes).digest('hex');
      shared.set(name, bytes);
      const runtimePath = p => literal(resolve(root, 'src/game-data', p).replaceAll('\\','/'));
      const lines = ['import source from ' + literal(file.replaceAll('\\','/')), 'import shared from ' + literal(prefix + name)];
      if (group === 'characters') lines.push('import {assembleCharacter} from ' + runtimePath('src/character-metadata.mjs'),
        'import curves from ' + runtimePath('data/tables/character-curves.json'), 'import {DATA_VERSION} from ' + runtimePath('src/version.mjs'),
        'const entity = assembleCharacter(source, curves, DATA_VERSION)');
      else lines.push('import {assembleEquipment} from ' + runtimePath('src/equipment-metadata.mjs'), 'const entity = assembleEquipment(source)');
      lines.push('const bundle = {...entity.calculation.bundle, requiredFeatures:' + literal(bundle.requiredFeatures) + ', damageFamilies:' + literal(bundle.damageFamilies) + '}',
        'for (const field of Object.keys(shared)) bundle[field] = [...shared[field], ...bundle[field]]',
        'entity.calculation.bundle = bundle', 'export default entity');
      return lines.join(';\n');
    },
  };
}
