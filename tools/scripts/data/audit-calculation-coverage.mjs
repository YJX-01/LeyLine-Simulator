import { writeFileSync } from 'node:fs';
import { readContentSource } from '../../lib/content-source.mjs';
import { loadContentSchema } from '../../lib/load-content-schema.mjs';
import { createRuntimeCatalog } from '../../lib/runtime-catalog.mjs';
import { calculationCoverage } from '../../lib/calculation-coverage.mjs';
import { auditSingleHitModifiers } from '../../lib/single-hit-modifier-matrix.mjs';
import {
  auditCharacterClauses,
  auditPublicScenes,
  auditReactionBlessings,
  auditResonances,
  rosterEquipmentEvaluation,
  rosterEvaluation,
} from '../../lib/roster-evaluation.mjs';
import { auditHealingWindows, auditSetConditions } from '../../lib/set-condition-audit.mjs';
import { auditTalentHealing } from '../../lib/talent-healing-audit.mjs';
import { auditCalculatorEntries } from '../../lib/calculator-entry-audit.mjs';
import { rosterGapReport } from '../../lib/roster-gap-report.mjs';

const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  if (index < 0) return;
  const [key, value] = args.splice(index, 2);
  if (!value || value.startsWith('--')) throw new Error(key + ' 需要文件名。');
  return value;
}

const file = option('--report');
const gapFile = option('--gaps');
const flags = new Set(args);
for (const flag of flags) {
  if (!['--json', '--require-complete', '--require-current', '--check'].includes(flag)) {
    throw new Error('未知验收参数 ' + flag);
  }
}

const catalog = await createRuntimeCatalog();
const engine = await loadContentSchema('/src/engine/src/index.ts');
const entities = { characters: [], weapons: [], sets: [] };
for (const [group, entries] of Object.entries(entities)) {
  for (const id of catalog.inventory[group]) entries.push(await catalog.get(group, id));
}

const report = calculationCoverage(catalog.inventory, entities.characters, entities.weapons, entities.sets, {
  validate: (kind, entity) => kind === 'character'
    ? engine.compileStructuredCharacter(entity)
    : engine.compileCalculation(entity.calculation.bundle),
});

const { combatObservationUnits } = await loadContentSchema('/src/schema/src/calculation/event.ts');
const actual = rosterEvaluation(entities, engine);
const singleHitModifiers = auditSingleHitModifiers(entities, engine);
const equipment = rosterEquipmentEvaluation(entities, engine, combatObservationUnits);
const setConditions = auditSetConditions(entities, engine);
const setHealing = await auditHealingWindows(catalog, engine);
const talentHealing = await auditTalentHealing(catalog, engine);
const scenes = auditPublicScenes(entities, engine);
const resonances = auditResonances(entities, engine);
const reactionBlessings = auditReactionBlessings(entities, engine);
const characterClauses = auditCharacterClauses(entities, engine);
const { publicGaps, publicChecks, interpretations } = readContentSource(
  new URL('../../data/sources/catalog/combat-lifecycle.json', import.meta.url),
);

const auditFailures = [
  ...singleHitModifiers.failures.map(row => ({
    entity: row.recipient,
    field: row.hit ?? row.category,
    issue: row.reason ?? row.status,
    rule: row.rule,
  })),
  ...actual.gaps,
  ...equipment.rows.filter(row => row.issue),
  ...equipment.rows.flatMap(row => (row.modifiers ?? [])
    .filter(modifier => modifier.issue)
    .map(modifier => ({ entity: row.entity, field: row.field, pieces: row.pieces, issue: modifier.issue }))),
  ...[setConditions, setHealing, talentHealing].flatMap(check => check.rows.filter(row => row.issue)),
  ...characterClauses.rows.filter(row => row.grantGate === false).map(row => ({ ...row, issue: '授予门槛与条款不符' })),
  ...reactionBlessings.rows.filter(row => row.issue),
  ...reactionBlessings.caps.filter(row => row.issue),
  ...resonances.rows.filter(row => row.issue),
  ...scenes.gaps.filter(row => !row.text && row.issue),
];

const pending = new Map();
function mark(entity, field, reason, pieces) {
  const list = pending.get(entity) ?? [];
  if (!list.some(item => item.field === field && item.reason === reason && item.pieces === pieces)) {
    list.push({ field, reason, pieces });
  }
  pending.set(entity, list);
}

for (const row of auditFailures) mark(row.entity, row.field ?? '/buffs', row.issue, row.pieces);
for (const row of equipment.gaps) mark(row.entity, row.field, row.reason, row.pieces);
for (const row of interpretations) for (const field of row.fields) mark(row.entity, field, row.reason);
for (const row of actual.otherDetails.filter(item => item.kind === '属性或机制贡献' && item.missingContributionParameters.length)) {
  mark(row.entity, row.field, '本地已有数值，仍有贡献参数待绑定');
}

const recoveryValues = new Set(talentHealing.verified);
const recoveryGaps = actual.talentDetails.filter(row => (row.kind === '治疗量' || row.kind === '护盾吸收量') && !recoveryValues.has(row.entity + row.field));
for (const row of recoveryGaps) mark(row.entity, row.field, '技能的' + row.kind + '尚缺逐项数值验收');
for (const row of characterClauses.rows.filter(item => item.status === '战斗贡献待逐条件验收')) {
  mark(row.entity, row.field, row.status);
}

for (const entry of report.entries.filter(item => item.resolution === 'complete')) {
  const failures = (pending.get(entry.entityId) ?? []).filter(failure => ['weapon', 'character', 'set'].includes(entry.kind)
    || entry.kind === 'set-effect' && (failure.pieces === undefined || failure.pieces === entry.selector.pieces)
    || failure.field === entry.pointer);
  if (failures.length) {
    entry.resolution = 'unavailable';
    entry.reason = failures.map(failure => failure.field + ' ' + failure.reason).join('；');
  }
}

report.summary.complete = report.entries.filter(row => row.resolution === 'complete').length;
report.summary.unavailable = report.entries.length - report.summary.complete;

const characters = new Map(entities.characters.map(entry => [entry.id, entry.metadata]));
function missingFields(entry) {
  const character = characters.get(entry.entityId);
  if (!character) return {};
  if (entry.kind === 'character') return { name: character.identity.name };
  const [group, index] = entry.pointer.split('/').slice(1);
  const owner = character[group]?.[Number(index)];
  if (!owner) return {};
  if (entry.kind === 'hit') {
    const hit = owner.hits.find(item => item.id === entry.selector.hitId);
    return { name: hit?.name, terms: hit?.base, condition: hit?.when, family: hit?.family ?? 'ordinary' };
  }
  return {
    name: owner.name,
    clause: owner.description,
    registeredBuffs: owner.buffs?.map(buff => buff.id) ?? [],
    ...(owner.talentBonuses?.length ? { talentBonuses: owner.talentBonuses } : {}),
  };
}

const uncovered = report.entries.filter(entry => entry.resolution !== 'complete').map(entry => ({
  kind: entry.kind,
  entity: entry.entityId,
  ...missingFields(entry),
  field: entry.pointer || (entry.kind === 'character' ? '/contextSupport' : entry.kind === 'weapon' ? '/support' : '/effects'),
  selector: entry.selector,
  reasons: [...new Set([entry.reason, ...entry.scopes.flatMap(scope => scope.gaps)])],
  evidence: '独立核验尚未闭合',
}));

const summary = {
  unresolvedHitInterpretations: interpretations.length,
  publicCombatClauseGaps: publicGaps.length,
  ...characterClauses.summary,
  ...report.summary,
  ...actual.summary,
  ...equipment.summary,
  ...setConditions.summary,
  ...setHealing.summary,
  ...talentHealing.summary,
  ...scenes.summary,
  ...resonances.summary,
  ...reactionBlessings.summary,
  completeCharacters: report.entries.filter(row => row.kind === 'character' && row.resolution === 'complete').length,
  completeWeapons: report.entries.filter(row => row.kind === 'weapon' && row.resolution === 'complete').length,
  completeSets: report.entries.filter(row => row.kind === 'set' && row.resolution === 'complete').length,
  completeSetThresholds: report.entries.filter(row => row.kind === 'set-effect' && row.resolution === 'complete').length,
  recoveryDetailsPending: recoveryGaps.length,
  singleHitModifierCases: singleHitModifiers.rows.length,
  singleHitModifierFailures: singleHitModifiers.failures.length,
};

const results = {
  summary,
  settings: actual.settings,
  evaluatedHits: actual.rows,
  talentDetails: actual.talentDetails,
  talentHealing,
  recoveryGaps,
  contextualDetails: actual.otherDetails,
  gaps: actual.gaps,
  auditFailures,
  equipment,
  setConditions,
  setHealing,
  scenes,
  resonances,
  reactionBlessings,
  characterClauses,
  publicGaps,
  publicChecks,
  interpretations,
  lifecycleGaps: report.lifecycleGaps,
  uncovered,
  singleHitModifiers,
};

const calculator = await auditCalculatorEntries(entities, results);
results.calculator = calculator;
Object.assign(summary, calculator.summary, {
  calculatorHitComparisons: calculator.hits.filter(row => row.selected && Number.isFinite(row.comparison?.expected) && !row.comparison.issue).length,
});
auditFailures.push(...calculator.failures);
summary.currentCalculationComplete = !calculator.failures.length
  && !auditFailures.filter(row => row.classification !== '缺少本地依据').length
  && !summary.unresolvedHitInterpretations;

if (file) writeFileSync(file, JSON.stringify(results, null, 2) + '\n');
if (gapFile) writeFileSync(gapFile, rosterGapReport(results, entities));
console.log(JSON.stringify(flags.has('--json') ? { ...report, ...results } : { material: report.material, ...summary }));

const hasRegressionFailures = Boolean(
  summary.invalidDefinitions
  || summary.mismatches
  || summary.duplicate
  || summary.missingBindings
  || summary.missingValues
  || summary.conditionFailures
  || summary.countFailures
  || summary.positiveHits !== summary.evaluated
  || summary.singleHitModifierFailures
  || summary.equipmentMissingValues
  || summary.equipmentMismatches
  || summary.modifierMismatches
  || summary.setConditionFailures
  || summary.setHealingFailures
  || summary.talentHealingFailures
  || summary.blessingMismatches
  || summary.publicResonanceMismatches
  || summary.publicSceneChecksFailed
  || summary.clauseGateFailures
  || summary.calculatorEntryFailures,
);

const failsCurrent = flags.has('--require-current') && !summary.currentCalculationComplete;
const failsComplete = flags.has('--require-complete') && Boolean(
  summary.unavailable
  || summary.compared !== summary.evaluated
  || actual.gaps.length
  || report.lifecycleGaps.some(gap => gap.area !== 'observation')
  || summary.detailCandidates
  || summary.unresolvedHitInterpretations
  || summary.contextualContributionsPending
  || summary.numericModifierContributions !== summary.modifierScenarios
  || summary.publicCombatClauseGaps
  || summary.publicSceneSourceGaps
  || summary.characterCombatClausesPending
  || summary.weaponClausesPending
  || summary.setClausesPending
  || summary.recoveryDetailsPending,
);

if (hasRegressionFailures || failsCurrent || failsComplete) {
  console.error('目录验收仍有缺口。');
  process.exitCode = 1;
}
