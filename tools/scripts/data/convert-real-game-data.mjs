import { readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { readContentSource } from '../../lib/content-source.mjs';
import { loadContentSchema } from '../../lib/load-content-schema.mjs';
import { writeGeneratedFile, pruneGeneratedFiles } from '../../lib/generated-files.mjs';
import { damagePathAudit, combatRuleAudit } from '../../lib/damage-path-audit.mjs';
import { calculationCoverage } from '../../lib/calculation-coverage.mjs';
import { assembleCalculationLibrary } from '../../lib/calculation-library.mjs';
import { createContentLinker } from '../../lib/content-linking.mjs';

const root = resolve(import.meta.dirname, '../../..');
if (process.argv.includes('--capture')) throw new Error('Use node tools/scripts/data/capture-catalog.mjs to capture source evidence; review metadata explicitly before generation.');
const schemas = await loadContentSchema();
const hashes = {};
const read = path => {
  const text = readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n');
  hashes[path.replace('src/game-data/data/', '')] = createHash('sha256').update(text).digest('hex');
  return readContentSource(resolve(root, path));
};
const manifest = schemas.contentManifestSchema.parse(read('src/game-data/data/manifest.json'));
const readEntities = (folder, ids, schema) => {
  const directory = `src/game-data/data/${folder}`;
  const files = readdirSync(resolve(root, directory));
  const expected = ids.map(id => `${id}.json`);
  if (JSON.stringify([...files].sort()) !== JSON.stringify([...expected].sort())) throw new Error(`${directory}: files and manifest IDs differ`);
  return ids.map(id => {
    const path = `${directory}/${id}.json`, raw = read(path);
    // Preserve reviewed field order/numbers; parsing validates without normalizing content.
    try { schema.parse(raw); } catch (cause) { throw new Error(`${path}: ${cause.message}`); }
    if (folder==='characters' && (raw.dataVersion!==manifest.dataVersion || raw.origin!=='builtin'))throw new Error(`${path}: canonical character version/origin differs from manifest`);
    if (folder==='characters' && (!raw.identity.description.trim() || !raw.talents.length || [...raw.talents,...raw.passives,...raw.constellations].some(item=>!item.name.trim() || !item.description.trim())))throw new Error(`${path}: canonical character text is incomplete`);
    if ((folder === 'actions' ? raw.character.id : raw.id) !== id) throw new Error(`${path}: filename must match metadata id`);
    if (readFileSync(resolve(root, path), 'utf8') !== `${JSON.stringify(raw, null, 2)}\n`) throw new Error(`${path}: metadata must use two-space JSON, UTF-8 without BOM, LF and a final newline`);
    return raw;
  });
};
const characters = readEntities('characters', manifest.characters, schemas.characterMetadataSchema);
const weapons = readEntities('weapons', manifest.weapons, schemas.weaponMetadataSchema);
const setMetadata = readEntities('artifact-sets', manifest.sets, schemas.artifactSetMetadataSchema);
const actions = readEntities('actions', manifest.actions, schemas.characterActionsDefinitionSchema);
const sets = setMetadata;
const main = read('src/game-data/data/tables/artifact-main.json');
schemas.artifactMainMetadataSchema.parse(main);
const support = entity => { const records = entity.calculation.bundle.coverage.filter(record => record.entity.id === entity.id && record.entity.revision === entity.revision);
  const supported = records.some(record => record.resolution === 'complete');
  return { supported, reason: supported ? '具有已核验的明确查询范围；以所选输出为准。' : '相关查询机制尚未闭合。' }; };
const catalog = { version: manifest.dataVersion,
  characters: characters.map(entity => ({ id: entity.id, name:entity.identity.name, element:entity.identity.element, weaponType:entity.identity.weaponType, ...support(entity) })),
  weapons: weapons.map(entity => ({ id: entity.id, name: entity.name, weaponType: entity.weaponType, rarity: entity.rarity, ...support(entity) })),
  sets: setMetadata.map(({ id, name, rarity, rarities, slots }) => ({ id, name, rarity, rarities, slots })) };
const outputs = { 'version.json': manifest.dataVersion, 'catalog.json': catalog, 'artifact-main.json': main };
outputs['damage-paths.json'] = damagePathAudit(manifest, characters);
outputs['combat-rules.json'] = combatRuleAudit(manifest, characters, weapons, setMetadata);
const common = schemas.calculationBundleSchema.parse(read('src/game-data/data/calculation/common.json'));
const reactions = schemas.reactionLibrarySchema.parse(read('src/game-data/data/calculation/reactions.json'));
outputs['reactions.json'] = reactions.rules;
outputs['calculation-formulas.json'] = schemas.calculationBundleSchema.parse(assembleCalculationLibrary(common, reactions, [...characters, ...weapons, ...setMetadata, ...actions]));
const engine = await loadContentSchema('/src/engine/src/index.ts');
const { compileCalculation } = engine;
const compilation = compileCalculation(outputs['calculation-formulas.json']);
if (!compilation.ok) throw new Error(`Invalid calculation library: ${JSON.stringify(compilation.diagnostics)}`);
const prepare = createContentLinker({ schemas, ...engine, manifest, library: outputs['calculation-formulas.json'],
  hitReviews: read('tools/data/sources/calculation-hits/ordinary-bindings.json'), retainedRules: read('tools/data/sources/calculation-effects/retained-rules.json'),
  textBindings: read('tools/data/sources/character-text/base-and-manekin.json') });
const preparedCharacters = new Map(), preparedWeapons = [], preparedSets = [];
for (const character of characters) {
  const prepared = await prepare.character(character), checked = engine.compileStructuredCharacter(prepared);
  if (!checked.ok) throw new Error(`Invalid authored character bindings ${character.id}: ${JSON.stringify(checked.diagnostics)}`);
  preparedCharacters.set(character.id, prepared);
}
for (const weapon of weapons) preparedWeapons.push(await prepare.weapon(weapon));
for (const set of sets) preparedSets.push(await prepare.set(set));
outputs['calculation-coverage.json'] = calculationCoverage(manifest, [...preparedCharacters.values()], preparedWeapons, preparedSets, {
  validate: (kind, entity) => kind === 'character' ? { ok: true, diagnostics: [] } : engine.compileCalculation(entity.calculation.bundle),
});
outputs['build-sources.json'] = { sources: common.sources.filter(source => source.id === 'content.artifact-main'), artifactMainSourceRefs: ['content.artifact-main'] };
outputs['actions.json'] = actions.map(definition => {
  const checked = engine.compileCharacterActions(definition, preparedCharacters.get(definition.character.id), outputs['calculation-formulas.json']);
  if (!checked.ok) throw new Error(`Invalid authored character actions ${definition.character.id}: ${JSON.stringify(checked.diagnostics)}`);
  const closure = engine.collectCalculationRoots(checked.bundle, { roots: [definition.calculation.stateMachine], sourceIds: [...new Set([...definition.sources, ...definition.actions.flatMap(action => action.sources), ...definition.gaps.flatMap(gap => gap.sources)])], families: [] });
  if (!closure.ok) throw new Error(`Invalid action closure: ${JSON.stringify(closure.diagnostics)}`);
  const snapshot = { ...definition, calculation: { ...definition.calculation, bundle: closure.bundle } };
  const reopened = engine.compileCharacterActions(snapshot, preparedCharacters.get(definition.character.id));
  if (!reopened.ok) throw new Error(`Action snapshot is not closed: ${JSON.stringify(reopened.diagnostics)}`);
  return snapshot;
});
const chunkIndex = {}, chunkNames = [];
for (const [group, entries] of [['characters', [...preparedCharacters.values()]], ['weapons', preparedWeapons], ['sets', preparedSets]]) {
  chunkIndex[group] = {}; let chunk = [], ordinal = 0;
  const flush = () => { if (!chunk.length) return; const name = `${group}-${ordinal++}.json`; outputs[name] = chunk; chunkNames.push(name); for (const entity of chunk) chunkIndex[group][entity.id] = name; chunk = []; };
  for (const entity of entries) {
    if (chunk.length && Buffer.byteLength(JSON.stringify([...chunk, entity])) > 380000) flush();
    if (Buffer.byteLength(JSON.stringify(entity)) > 450000) throw new Error(`Entity chunk exceeds budget: ${entity.id}`);
    chunk.push(entity);
  }
  flush();
}
outputs['chunk-index.json'] = chunkIndex;
outputs['chunk-loaders.ts'] = 'export const chunkLoaders: Record<string, () => Promise<{ default: unknown }>> = {\n' + chunkNames.map(name => `  '${name}': () => import('./${name}'),`).join('\n') + '\n};\n';
const serialize = (name, data) => name.endsWith('.ts') ? data : `${JSON.stringify(data)}\n`;
outputs['manifest.json'] = { version: manifest.dataVersion, repository: manifest.repository, commit: manifest.commit, hashFormat: 'sha256-lf-normalized', canonicalHashes: hashes,
  files: Object.fromEntries(Object.entries(outputs).map(([name, data]) => [name, createHash('sha256').update(serialize(name, data)).digest('hex')])) };
const directory = resolve(root, 'src/game-data/generated');
mkdirSync(directory, { recursive: true });
for (const [name, data] of Object.entries(outputs)) {
  const text = serialize(name, data), path = resolve(directory, name);
  if (process.argv.includes('--check')) { if (readFileSync(path, 'utf8').replace(/\r\n/g, '\n') !== text) throw new Error(`Real game snapshot stale: ${name}`); }
  else writeGeneratedFile(path, text);
}
pruneGeneratedFiles(root, directory, Object.keys(outputs), process.argv.includes('--check'));
console.log(`Validated per-entity JSON: ${characters.length} characters, ${weapons.length} weapons, ${sets.length} sets, ${actions.length} action companions; ${Object.keys(outputs).length} generated chunks.`);
