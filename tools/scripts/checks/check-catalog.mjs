import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRuntimeCatalog } from '../../lib/runtime-catalog.mjs';
import { loadContentSchema } from '../../lib/load-content-schema.mjs';
import { readContentSource } from '../../lib/content-source.mjs';

const root = resolve(import.meta.dirname, '../../..');
const read = file => readContentSource(resolve(root, file));

export async function checkCatalog() {
  const catalog = await createRuntimeCatalog();
  const schemas = await loadContentSchema();
  const engine = await loadContentSchema('/src/engine/src/index.ts');
  const compiled = engine.compileCalculation(catalog.library);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));

  for (const [group, folder] of Object.entries({ characters: 'characters', weapons: 'weapons', sets: 'artifact-sets', actions: 'actions' })) {
    const ids = catalog.inventory[group];
    if (group !== 'actions') {
      const expected = new Set(Object.keys(read(`tools/data/sources/catalog/genshin-db/${group}.json`)));
      if (group === 'characters') {
        const forms = read('tools/data/sources/character-text/base-and-manekin.json').bindings;
        for (const id of Object.keys(forms)) expected.add(id);
        for (const owner of ['aether', 'lumine']) {
          for (const element of ['anemo', 'geo', 'electro', 'dendro', 'hydro', 'pyro', 'cryo']) expected.add(owner + '-' + element);
        }
      }
      assert.deepEqual(new Set(ids), expected, folder + ': missing or unexpected entity');
    }
    for (const id of ids) {
      const file = resolve(root, 'src/game-data/data', folder, id + '.json');
      const raw = readContentSource(file);
      assert.equal(readFileSync(file, 'utf8'), JSON.stringify(raw, null, 2) + '\n', file);
      assert.equal(group === 'actions' ? raw.character.id : raw.id, id, file);
      if (group === 'characters') {
        assert.equal(raw.namespace, 'builtin', file);
        const entries = [...raw.talents, ...raw.passives, ...raw.constellations];
        assert.ok(raw.identity.description.trim() && raw.talents.length && entries.every(entry => entry.name.trim() && entry.description.trim()), file);
      }
      const entity = await catalog.get(group, id);
      const result = group === 'characters' ? engine.compileStructuredCharacter(entity) : engine.compileCalculation(entity.calculation.bundle);
      if (!result.ok) throw new Error(file + ': ' + JSON.stringify(result.diagnostics));
    }
  }
  schemas.artifactMainTableSchema.parse(read('src/game-data/data/tables/artifact-main.json'));
}
