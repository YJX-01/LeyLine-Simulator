import { calculationCoverage } from '../../lib/calculation-coverage.mjs';
import { loadContentSchema } from '../../lib/load-content-schema.mjs';
import { createRuntimeCatalog } from '../../lib/runtime-catalog.mjs';

const flags = new Set(process.argv.slice(2));
for (const flag of flags) if (!['--json', '--require-complete'].includes(flag)) throw new Error(`Unknown coverage argument: ${flag}`);
const catalog = await createRuntimeCatalog();
const engine = await loadContentSchema('/src/engine/src/index.ts');
const entities = { characters: [], weapons: [], sets: [] };
for (const [group, entries] of Object.entries(entities)) {
  for (const id of catalog.inventory[group]) entries.push(await catalog.get(group, id));
}
const report = calculationCoverage(catalog.inventory, entities.characters, entities.weapons, entities.sets, {
  validate: (kind, entity) => kind === 'character' ? engine.compileStructuredCharacter(entity) : engine.compileCalculation(entity.calculation.bundle),
});
console.log(JSON.stringify(flags.has('--json') ? report : { material: report.material, ...report.summary }));
if (report.summary.invalidDefinitions || flags.has('--require-complete') && report.summary.unavailable) {
  console.error(`${report.summary.invalidDefinitions} invalid definitions, ${report.summary.unavailable} catalog entries with incomplete coverage.`);
  process.exitCode = 1;
}
