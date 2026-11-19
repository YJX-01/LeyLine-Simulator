import { readCalculationLibrary } from '../../lib/calculation-library.mjs';
import { readContentSource } from '../../lib/content-source.mjs';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { catalogInventory, readCalculationData as read } from '../../lib/catalog-data.mjs';
import { loadContentSchema } from '../../lib/load-content-schema.mjs';
import { createContentLinker } from '../../lib/content-linking.mjs';
import { writeGeneratedFile } from '../../lib/generated-files.mjs';

const root = resolve(import.meta.dirname, '../../..');
const destination = resolve(root, 'artifacts/content-candidates/structured-damage');
const schemas = await loadContentSchema(), engine = await loadContentSchema('/src/engine/src/index.ts');
const manifest = catalogInventory();
const prepare = createContentLinker({ schemas, collectCalculationRoots: engine.collectCalculationRoots, describeCalculationTemplate: engine.describeCalculationTemplate, manifest,
  library: readCalculationLibrary(), hitReviews: read('tools/data/sources/calculation-hits/ordinary-bindings.json'),
  retainedRules: read('tools/data/sources/calculation-effects/retained-rules.json'), textBindings: read('tools/data/sources/character-text/base-and-manekin.json') });
const counts = { characters: 0, weapons: 0, sets: 0, hits: 0, outputs: 0 };
for (const [group, folder, prepareEntity] of [['characters', 'characters', prepare.character], ['weapons', 'weapons', prepare.weapon], ['sets', 'artifact-sets', prepare.set]]) {
  mkdirSync(resolve(destination, folder), { recursive: true });
  for (const id of manifest[group]) {
    const candidate = await prepareEntity(read(`src/game-data/data/${folder}/${id}.json`));
    const compiled = group === 'characters' ? engine.compileStructuredCharacter(candidate) : engine.compileCalculation(candidate.calculation.bundle);
    if (!compiled.ok) throw new Error(id + ': ' + JSON.stringify(compiled.diagnostics));
    writeGeneratedFile(resolve(destination, folder, id + '.json'), JSON.stringify(readContentSource(resolve(root, 'src/game-data/data', folder, id + '.json')), null, 2) + '\n'); counts[group]++;
    if (group === 'characters') for (const talent of candidate.talents) for (const hit of talent.hits) { counts.hits++; counts.outputs += hit.outputs.length; }
  }
}
writeGeneratedFile(resolve(destination, 'report.json'), JSON.stringify({ status: 'review-candidates', meaning: 'Actual catalog authoring candidates only. No production parser switch, user-document migration or player export.', ...counts }, null, 2) + '\n');
console.log(JSON.stringify(counts));
