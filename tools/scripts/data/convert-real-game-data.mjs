import { readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { readContentSource } from '../../lib/content-source.mjs';
import { loadContentSchema } from '../../lib/load-content-schema.mjs';
import { writeGeneratedFile, pruneGeneratedFiles } from '../../lib/generated-files.mjs';

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
    if (folder==='characters' && (raw.capabilities.text!=='complete' || !raw.identity.description.trim() || !raw.talents.length || [...raw.talents,...raw.passives,...raw.constellations].some(item=>!item.name.trim() || !item.description.trim())))throw new Error(`${path}: canonical character text is incomplete`);
    if (raw.id !== id) throw new Error(`${path}: filename must match metadata id`);
    if (readFileSync(resolve(root, path), 'utf8') !== `${JSON.stringify(raw, null, 2)}\n`) throw new Error(`${path}: metadata must use two-space JSON, UTF-8 without BOM, LF and a final newline`);
    return raw;
  });
};
const characters = readEntities('characters', manifest.characters, schemas.characterMetadataSchema);
const weapons = readEntities('weapons', manifest.weapons, schemas.weaponMetadataSchema);
const setMetadata = readEntities('artifact-sets', manifest.sets, schemas.artifactSetMetadataSchema);
const sets = setMetadata.map(({ rarity, ...set }) => set);
const main = read('src/game-data/data/tables/artifact-main.json');
schemas.artifactMainMetadataSchema.parse(main);
const catalog = { version: manifest.dataVersion,
  characters: characters.map(({ id, identity, capabilities }) => ({ id, name:identity.name, element:identity.element, weaponType:identity.weaponType, ...capabilities.calculation })),
  weapons: weapons.map(({ id, name, weaponType, rarity, support }) => ({ id, name, weaponType, rarity, ...support })),
  sets: setMetadata.map(({ id, name, rarity }) => ({ id, name, rarity })) };
const outputs = { 'version.json': manifest.dataVersion, 'catalog.json': catalog, 'artifact-main.json': main };
for (const [group, entries, size] of [['characters', characters, 10], ['weapons', weapons, 40], ['sets', sets, 30]]) {
  for (let start = 0; start < entries.length; start += size) outputs[`${group}-${start / size}.json`] = entries.slice(start, start + size);
}
outputs['manifest.json'] = { version: manifest.dataVersion, repository: manifest.repository, commit: manifest.commit, hashFormat: 'sha256-lf-normalized', canonicalHashes: hashes,
  files: Object.fromEntries(Object.entries(outputs).map(([name, data]) => [name, createHash('sha256').update(`${JSON.stringify(data)}\n`).digest('hex')])) };
const directory = resolve(root, 'src/game-data/generated');
mkdirSync(directory, { recursive: true });
for (const [name, data] of Object.entries(outputs)) {
  const text = `${JSON.stringify(data)}\n`, path = resolve(directory, name);
  if (process.argv.includes('--check')) { if (readFileSync(path, 'utf8').replace(/\r\n/g, '\n') !== text) throw new Error(`Real game snapshot stale: ${name}`); }
  else writeGeneratedFile(path, text);
}
pruneGeneratedFiles(root, directory, Object.keys(outputs), process.argv.includes('--check'));
console.log(`Validated per-entity JSON: ${characters.length} characters, ${weapons.length} weapons, ${sets.length} sets; ${Object.keys(outputs).length} generated chunks.`);
