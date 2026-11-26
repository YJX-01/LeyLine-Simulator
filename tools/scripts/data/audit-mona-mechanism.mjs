import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createRuntimeCatalog } from '../../lib/runtime-catalog.mjs';
import { loadContentSchema } from '../../lib/load-content-schema.mjs';
import { leylineSingleHitInventory, monaCalculationInventory, probeMonaBuffs, probeMonaSkills } from '../../lib/mona-inventory-probes.mjs';
import { auditWorktree, readReviews, reviewLinks, singleHitCandidates } from '../../lib/mona-single-hit-comparison.mjs';
import { readContentSource } from '../../lib/content-source.mjs';
import {
  auditMonaCommonInputBranches,
  auditMonaDuplicateMenuArms,
  auditMonaOrdinaryBatch,
  auditMonaOrdinaryC6,
  auditMonaWrongOrdinaryArms,
  auditTravelerNormalScenarios,
  compareMonaOrdinaryScaling,
  ordinaryHitName,
} from '../../lib/mona-ordinary-audit.mjs';
import { novice } from '../../lib/roster-audit-settings.mjs';
import { auditMonaBuffScenarios, batchMonaBuffs, buffScenarioCharacters } from '../../lib/mona-buff-audit.mjs';
import { auditMonaTransformative, validateMonaTransformativeReviews } from '../../lib/mona-transformative-audit.mjs';
import { classifyMonaDifferences } from '../../lib/mona-behavior-ledger.mjs';

const { values } = parseArgs({ options: {
  group: { type: 'string' }, character: { type: 'string', multiple: true }, 'buff-key': { type: 'string', multiple: true },
  'skill-index': { type: 'string' }, constellation: { type: 'string' }, 'talent-levels': { type: 'string' }, out: { type: 'string' },
} });
if (!['buff', 'damage', 'differences'].includes(values.group) || !values.out) throw new Error('Use --group buff|damage|differences --out <partial.json>; damage requires --character <Mona name> (repeatable).');
if (values.group === 'damage' && !values.character?.length) throw new Error('Damage requires at least one --character; this prevents an accidental all-roster run.');
const output = resolve(values.out);
function assertPartialDestination() {
  if (!existsSync(output)) return;
  let previous;
  try { previous = JSON.parse(readFileSync(output, 'utf8')); } catch { throw new Error('Existing output is not a partial report: ' + output); }
  if (previous.kind !== 'mona-mechanism-partial') throw new Error('Cannot replace a full report or another file: ' + output);
}
assertPartialDestination();
const expectedMona = readContentSource('tools/data/references.json').repositories.find(row => row.id === 'mona-community').commit;
const mona = auditWorktree('.references/mona-community');
if (mona.revision !== expectedMona) throw new Error('Fixed Mona checkout required: ' + expectedMona + '; found ' + mona.revision);
const runtime = '.references/mona-community/beta-tools/runtime-7106.mjs';
const runtimeSha256 = createHash('sha256').update(readFileSync(runtime)).digest('hex');
const local = auditWorktree('.');
const selected = values.character ?? ['Kaeya', 'Rosaria'];
const buffKeys = values['buff-key'] ?? ['DurinC2', 'DurinTalent2', 'LinneaC1'];
if (values.constellation !== undefined && (values.group !== 'damage' || !['0', '6'].includes(values.constellation))) {
  throw new Error('--constellation requires 0 or 6 and --group damage');
}
const constellation = Number(values.constellation ?? 0);
const index = values['skill-index'] === undefined ? null : Number(values['skill-index']);
if (index !== null && (values.group !== 'damage' || !/^\d+$/.test(values['skill-index']) || !Number.isSafeInteger(index))) {
  throw new Error('--skill-index requires a nonnegative integer and --group damage');
}
let talentLevels;
if (values['talent-levels'] !== undefined) {
  const levels = values['talent-levels'].split(',');
  if (values.group !== 'damage' || selected.length !== 1 || index === null || levels.some(level => !/^(?:[1-9]|10)$/.test(level))) {
    throw new Error('--talent-levels needs one --character, a --skill-index and comma-separated base levels from 1 to 10');
  }
  talentLevels = [...new Set(levels.map(Number))];
}
let probes, inventory;
let characterIds;
if (values.group === 'buff') {
  characterIds = buffScenarioCharacters(buffKeys);
} else {
  probes = await probeMonaSkills({ characters: selected, constellations: constellation === 6 ? [0, 6] : [0], indices: index === null ? undefined : [index] });
  if (index !== null && selected.some(name => !probes.rows.some(row => row.character === name))) throw new Error('No selected skill at index ' + index);
  inventory = await monaCalculationInventory({ probes });
  const menus = inventory.rows.filter(row => row.kind === 'skill' && selected.includes(row.character));
  const { owners } = singleHitCandidates(menus, []);
  characterIds = [...new Set([...owners.values()].map(owner => owner.entity).filter(Boolean))];
  if (values.group === 'differences' && !characterIds.includes('kaeya')) characterIds.push('kaeya');
}
const scope = { characters: characterIds, weapons: Object.values(novice), sets: values.group === 'buff' ? [] : ['gladiatorsfinale'], actions: [] };
if (index === 0 && talentLevels?.includes(10) && characterIds.some(id => ['kaeya', 'amber'].includes(id)) && !scope.characters.includes('tartaglia')) scope.characters.push('tartaglia');
const catalog = await createRuntimeCatalog(scope), engine = await loadContentSchema('/src/engine/src/index.ts');
const entities = { characters: [], weapons: [], sets: [] };
for (const [group, entries] of Object.entries(entities)) for (const id of scope[group]) entries.push(await catalog.get(group, id));
const report = { kind: 'mona-mechanism-partial', group: values.group, generatedAt: new Date().toISOString(),
  versions: { monaCheckout: mona.revision, monaWorktree: mona.worktree, monaRuntimeSha256: runtimeSha256,
    leylineHead: local.revision, leylineDirty: local.dirty, leylineWorktree: local.worktree },
  discovery: { leyline: 'selected live formal entities and shared rules', entities: scope, mona: 'fixed checkout metadata', reusedInventory: false },
  limitations: ['Partial mechanism run; not a full coverage report. Live catalog binding IDs and revisions are regenerated, not taken from an older report.'] };
if (values.group === 'buff') {
  report.discovery.buffKeys = buffKeys;
  report.buffContexts = await probeMonaBuffs({ keys: buffKeys });
  report.buff = await auditMonaBuffScenarios(entities, engine, buffKeys);
  const sources = (await monaCalculationInventory()).rows.filter(row => buffKeys.includes(row.key));
  const formal = (await leylineSingleHitInventory(entities)).rows;
  const batch = batchMonaBuffs(sources, formal, singleHitCandidates(sources, formal).candidates,
    { resonanceAudit: report.buff.resonance, characterAudit: report.buff.characters });
  report.reviewIssues = [];
  report.buff.mappings = reviewLinks(batch.mappings, new Map(sources.map(row => [row.id, row])),
    new Map(formal.map(row => [row.id, row])), report.reviewIssues);
} else {
  const leyline = await leylineSingleHitInventory(entities);
  const selectedIds = new Set(probes.rows.map(row => row.skillId));
  const menus = inventory.rows.filter(row => row.kind === 'skill' && selected.includes(row.character));
  const discovered = singleHitCandidates(menus, leyline.rows).candidates;
  const candidates = new Map([...discovered].filter(([id]) => selectedIds.has(id)));
  const scaling = await compareMonaOrdinaryScaling(inventory.rows, leyline.rows, candidates, probes.rows);
  report.discovery.characters = selected;
  if (index !== null) report.discovery.skillIndex = index;
  report.discovery.candidateSkills = candidates.size;
  report.scaling = scaling;
  if (values.group === 'damage') {
    report.discovery.constellation = constellation;
    // An unprobed sibling menu with the same name can still claim the same hit.
    const otherNames = new Set(menus.filter(row => !selectedIds.has(row.id)).flatMap(row =>
      row.occurrences.map(entry => row.character + ':' + ordinaryHitName(entry.label))));
    const uniqueCandidates = new Map([...candidates].filter(([id]) => {
      const menu = menus.find(row => row.id === id);
      return !menu.occurrences.some(entry => otherNames.has(menu.character + ':' + ordinaryHitName(entry.label)));
    }));
    report.damage = await auditMonaOrdinaryBatch(inventory.rows, leyline.rows, uniqueCandidates, scaling, entities, engine);
    if (constellation === 6) report.damageC6 = await auditMonaOrdinaryC6(inventory.rows, leyline.rows, report.damage, entities, engine);
    const branchIds = new Set(inventory.rows.filter(row => row.kind === 'output-branch' && selectedIds.has(row.parentId)).map(row => row.id));
    const initial = [...readReviews().filter(review => review.mona?.some(id => selectedIds.has(id) || branchIds.has(id))),
      ...report.damage.mappings, ...(report.damageC6?.mappings ?? [])];
    const issues = [];
    const accepted = reviewLinks(initial, new Map(inventory.rows.map(row => [row.id, row])),
      new Map(leyline.rows.map(row => [row.id, row])), issues);
    report.reviewIssues = issues;
    const sourceMap = new Map(inventory.rows.map(row => [row.id, row])), targetMap = new Map(leyline.rows.map(row => [row.id, row]));
    const options = { constellation };
    if (talentLevels) {
      report.discovery.baseTalentLevels = talentLevels;
      options.targetIds = [...new Set(report.damage.mappings.flatMap(review => review.leyline.map(ref => ref.id)))];
      options.samples = talentLevels.flatMap(talentLevel => ['501051', '501054'].map(rollId => ({ level: 90, ascension: 6, talentLevel, rollId })));
      if (index === 0 && talentLevels.includes(10) && characterIds.some(id => ['kaeya', 'amber'].includes(id))) options.samples.push(...['501051', '501054']
        .map(rollId => ({ level: 90, ascension: 6, talentLevel: 10, rollId, teamSupport: 'tartaglia' })));
    }
    report.commonInputs = talentLevels && !options.targetIds.length ? { rows: [], mappings: [], summary: { eligible: 0, reviewed: 0, unresolved: 0 },
      limitations: ['No reviewed ordinary hit for the selected skill.'] }
      : await auditMonaCommonInputBranches(inventory.rows, leyline.rows, accepted, entities, engine, options);
    report.commonInputs.mappings = reviewLinks(report.commonInputs.mappings, sourceMap, targetMap, issues);
    if (constellation === 0) {
      report.travelerNormal = await auditTravelerNormalScenarios(inventory.rows, leyline.rows, entities, engine, {selectedSkillIds:selectedIds});
      report.travelerNormal.mappings = reviewLinks(report.travelerNormal.mappings, sourceMap, targetMap, issues);
      report.duplicateMenus = await auditMonaDuplicateMenuArms(inventory.rows, leyline.rows, entities, engine, {selectedSkillIds:selectedIds});
      report.duplicateMenus.mappings = reviewLinks(report.duplicateMenus.mappings, sourceMap, targetMap, issues);
      if (report.duplicateMenus.rows.length) report.duplicateMenus.attribution =
        classifyMonaDifferences(report.duplicateMenus.mappings, [], { rows: [] }, leyline.rows);
    }
  } else {
    const wrongArms = await auditMonaWrongOrdinaryArms(inventory.rows, leyline.rows, candidates, scaling, entities, engine);
    const duplicates = await auditMonaDuplicateMenuArms(inventory.rows, leyline.rows, entities, engine, {selectedSkillIds:selectedIds});
    const transformative = await auditMonaTransformative(entities, engine);
    const reviewFile = 'tools/data/sources/mona-community/' + expectedMona + '/transformative-comparison.json';
    const reviews = JSON.parse(readFileSync(reviewFile, 'utf8')).mappings;
    const validated = validateMonaTransformativeReviews(reviews, transformative, leyline.rows);
    report.transformative = transformative;
    report.transformativeReviews = validated;
    report.wrongArms = wrongArms;
    report.reviewIssues = [];
    duplicates.mappings = reviewLinks(duplicates.mappings,new Map(inventory.rows.map(row => [row.id,row])),
      new Map(leyline.rows.map(row => [row.id,row])),report.reviewIssues);
    report.duplicateMenus = duplicates;
    report.differences = classifyMonaDifferences([...validated.reviews, ...wrongArms.mappings, ...duplicates.mappings], wrongArms.rows, transformative, leyline.rows);
    report.limitations.push('Other known mapping families are not re-run or counted in this focused differences report.');
  }
}
const temporary = output + '.' + randomUUID() + '.tmp';
try {
  writeFileSync(temporary, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  assertPartialDestination();
  renameSync(temporary, output);
} finally { if (existsSync(temporary)) unlinkSync(temporary); }
console.log(JSON.stringify({ output, group: report.group, discovery: report.discovery }));
