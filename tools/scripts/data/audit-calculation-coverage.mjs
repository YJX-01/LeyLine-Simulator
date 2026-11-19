import { readCalculationLibrary } from '../../lib/calculation-library.mjs';
import { resolve } from 'node:path';
import { calculationCoverage } from '../../lib/calculation-coverage.mjs';
import { catalogInventory, readCalculationData as read } from '../../lib/catalog-data.mjs';
import { loadContentSchema } from '../../lib/load-content-schema.mjs';
import { createContentLinker } from '../../lib/content-linking.mjs';

const flags = new Set(process.argv.slice(2));
for (const flag of flags) if (!['--json', '--require-complete', '--candidates'].includes(flag)) throw new Error(`Unknown coverage argument: ${flag}`);
const root = resolve(import.meta.dirname, '../../..');
const manifest = catalogInventory();
const entities = { characters: manifest.characters.map(id => read(`src/game-data/data/characters/${id}.json`)),
  weapons: manifest.weapons.map(id => read(`src/game-data/data/weapons/${id}.json`)),
  sets: manifest.sets.map(id => read(`src/game-data/data/artifact-sets/${id}.json`)) };
const schemas = await loadContentSchema(), engine = await loadContentSchema('/src/engine/src/index.ts');
const validate = (kind, entity) => {
  if (kind === 'character') return engine.compileStructuredCharacter(entity);
  const parsed = (kind === 'weapon' ? schemas.structuredWeaponDefinitionSchema : schemas.structuredArtifactSetDefinitionSchema).safeParse(entity);
  if (!parsed.success) return { ok: false, diagnostics: parsed.error.issues.map(issue => ({ code: 'invalid-range', jsonPointer: schemas.calculationJsonPointer(issue.path), message: issue.message })) };
  return engine.compileCalculation(parsed.data.calculation.bundle);
};
const prepare = createContentLinker({ schemas, collectCalculationRoots: engine.collectCalculationRoots,
  library: readCalculationLibrary() });
for (const [group, transform] of [['characters', prepare.character], ['weapons', prepare.weapon], ['sets', prepare.set]]) {
  const linked = [];
  for (const entity of entities[group]) linked.push(await transform(entity));
  entities[group] = linked;
}
const report = calculationCoverage(manifest, entities.characters, entities.weapons, entities.sets,
  { material: flags.has('--candidates') ? 'review-candidates' : 'canonical', validate });
console.log(JSON.stringify(flags.has('--json') ? report : { material: report.material, ...report.summary }));
if (report.summary.invalidDefinitions || flags.has('--require-complete') && (report.summary.unavailable || report.material !== 'canonical')) {
  console.error(`${report.summary.unavailable} catalog entries still require semantic review and implementation; complete acceptance requires canonical content.`);
  process.exitCode = 1;
}
