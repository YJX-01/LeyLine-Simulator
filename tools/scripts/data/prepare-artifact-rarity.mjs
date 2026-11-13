import { existsSync, lstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { readContentSource } from '../../lib/content-source.mjs';

// Explicit, offline source investigation. Never invoked by ordinary generation.
const root = realpathSync(resolve(import.meta.dirname, '../../..'));
const commit = 'b0501c5d89767ead5f647869a2412521447f7682';
const reference = `.references/metadata/artifact-rarity/${commit}`;
const sourceRoot = `tools/data/sources/lunagc/${commit}`;
const outputArgument = process.argv.find(argument => argument.startsWith('--out='))?.slice(6);
if (!outputArgument) throw new Error('Specify --out=artifacts/content-candidates/<new-directory>.');
const output = resolve(root, outputArgument);
const candidateRoot = resolve(root, 'artifacts/content-candidates');
const inside = relative(candidateRoot, output);
if (!inside || inside.startsWith(`..${sep}`) || inside === '..' || isAbsolute(inside)) throw new Error('Output must be a new directory beneath artifacts/content-candidates.');
let cursor = root;
for (const part of relative(root, output).split(sep)) {
  cursor = join(cursor, part);
  if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error(`Refusing linked candidate path: ${cursor}`);
}
if (existsSync(output)) throw new Error('Candidate directory already exists; refusing to overwrite.');
const read = path => readContentSource(resolve(root, path));
const readRows = path => {
  const rows = read(path);
  if (!Array.isArray(rows)) throw new Error(`Expected source rows: ${path}`);
  return rows;
};
const items = readRows(`${reference}/ReliquaryExcelConfigData.json`);
const mainPools = readRows(`${reference}/ReliquaryMainPropExcelConfigData.json`);
const sourceSets = readRows(`${reference}/ReliquarySetExcelConfigData.json`);
const affixes = readRows(`${sourceRoot}/ReliquaryAffixExcelConfigData.json`);
const levels = readRows(`${sourceRoot}/ReliquaryLevelExcelConfigData.json`);
const canonicalSets = read('tools/data/sources/catalog/genshin-db/sets.json');
const uniqueNumbers = values => [...new Set(values)].sort((a, b) => a - b);
const setItems = items.filter(item => item.setId > 0 && [101, 201, 301, 401, 501].includes(item.appendPropDepotId));
const rarities = [1, 2, 3, 4, 5].map(rarity => {
  const rows = setItems.filter(item => item.rankLevel === rarity);
  const sourceMaxLevels = uniqueNumbers(rows.map(item => item.maxLevel));
  if (sourceMaxLevels.length !== 1) throw new Error(`Review conflicting max levels for rank ${rarity}.`);
  const mainDepots = uniqueNumbers(rows.map(item => item.mainPropDepotId));
  const appendDepots = uniqueNumbers(rows.map(item => item.appendPropDepotId));
  return {
    rarity,
    sourceMaxLevel: sourceMaxLevels[0],
    candidateMaxEnhancementLevel: sourceMaxLevels[0] - 1,
    observedAppendPropNums: uniqueNumbers(rows.map(item => item.appendPropNum)),
    candidateUpgradeSourceLevels: uniqueNumbers(rows.flatMap(item => item.addPropLevels)).filter(level => level <= sourceMaxLevels[0]),
    mainPropDepots: mainDepots,
    appendPropDepots: appendDepots,
    mainValues: levels.filter(level => level.rank === rarity && level.level >= 1 && level.level <= sourceMaxLevels[0]),
    mainPoolRows: mainPools.filter(pool => mainDepots.includes(pool.propDepotId)),
    affixRows: affixes.filter(affix => appendDepots.includes(affix.depotId)),
  };
});
const sets = Object.entries(canonicalSets).map(([id, set]) => {
  const source = sourceSets.find(entry => entry.setId === set.id);
  const rows = setItems.filter(item => item.setId === set.id);
  return { id, sourceSetId: set.id, rarities: set.rarityList,
    sourceSetPresent: source !== undefined,
    sourceContainsList: source?.containsList ?? [],
    observedTemplateRarities: uniqueNumbers(rows.map(item => item.rankLevel)),
    slots: [...new Set(rows.filter(item => set.rarityList.includes(item.rankLevel)).map(item => item.equipType))].sort(),
  };
});
const report = {
  formatVersion: 1,
  status: 'investigation-only',
  source: { repository: 'Rafs-kk/LunaGC-6.6-res', commit, reference,
    files: ['ReliquaryExcelConfigData.json', 'ReliquaryMainPropExcelConfigData.json', 'ReliquarySetExcelConfigData.json'],
    adoptedParameterDirectory: sourceRoot },
  summary: { sourceItems: items.length, sourceMainPoolRows: mainPools.length, sourceSets: sourceSets.length,
    canonicalSets: sets.length, missingSourceSets: sets.filter(set => !set.sourceSetPresent).map(set => set.id) },
  unresolved: [
    'appendPropNum template variants are not proof of legal player initial substat counts; drop/generation rules require separate evidence.',
    'Current catalog rarityList constrains set rarity; unused upstream templates must not expand it.',
    'The fixed 6.6 source does not establish current-version legality for every catalog set or slot.',
    'Source level to displayed enhancement level and upgrade timing still need per-rarity review before adoption.',
    'No non-five-star player import recording is supplied by this candidate.',
  ],
  rarities, sets,
};
mkdirSync(output, { recursive: true });
writeFileSync(join(output, 'analysis.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ ...report.summary, candidateMaxLevels: rarities.map(entry => entry.candidateMaxEnhancementLevel), output: relative(root, output) }));
