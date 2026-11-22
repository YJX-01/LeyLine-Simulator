import { auditHealingWindows, auditSetConditions } from '../../lib/set-condition-audit.mjs';
import { auditTalentHealing } from '../../lib/talent-healing-audit.mjs';
import { auditWeaponTriggers } from '../../lib/weapon-trigger-audit.mjs';
import { auditManekin } from '../../lib/manekin-audit.mjs';
import { auditEquipmentContexts } from '../../lib/equipment-context-audit.mjs';
import { auditCharacterBuffs } from '../../lib/character-buff-audit.mjs';
import { auditCastTiming } from '../../lib/cast-timing-audit.mjs';
import { auditAuraDurations } from '../../lib/aura-duration-audit.mjs';
import { auditResonanceParticles } from '../../lib/resonance-particles-audit.mjs';
import { auditGleam } from '../../lib/gleam-audit.mjs';
import { rosterGapReport } from '../../lib/roster-gap-report.mjs';
import { calculationCoverage } from '../../lib/calculation-coverage.mjs';
import { loadContentSchema } from '../../lib/load-content-schema.mjs';
import { createRuntimeCatalog } from '../../lib/runtime-catalog.mjs';

import { writeFileSync } from 'node:fs';
import { readContentSource } from '../../lib/content-source.mjs';
import { rosterEvaluation, rosterEquipmentEvaluation, auditPublicScenes, auditResonances, auditReactionBlessings, auditCharacterClauses } from '../../lib/roster-evaluation.mjs';

const args = process.argv.slice(2);
function option(name) {
  const i = args.indexOf(name);
  if (i < 0) return;
  const [key, path] = args.splice(i, 2);
  if (!path || path.startsWith('--')) throw new Error(key + ' 需要文件名。');
  return path;
}
const file = option('--report'), gapFile = option('--gaps');
const flags = new Set(args);
for (const flag of flags) if (!['--json', '--require-complete', '--check'].includes(flag)) throw new Error('未知验收参数 ' + flag);
const catalog = await createRuntimeCatalog();
const engine = await loadContentSchema('/src/engine/src/index.ts');
const entities = { characters: [], weapons: [], sets: [] };
for (const [group, entries] of Object.entries(entities)) {
  for (const id of catalog.inventory[group]) entries.push(await catalog.get(group, id));
}
const report = calculationCoverage(catalog.inventory, entities.characters, entities.weapons, entities.sets, {
  validate: (kind, entity) => kind === 'character' ? engine.compileStructuredCharacter(entity) : engine.compileCalculation(entity.calculation.bundle),
});
const actual = rosterEvaluation(entities, engine);
const { combatObservationUnits } = await loadContentSchema('/src/schema/src/calculation/event.ts');
const equipment = rosterEquipmentEvaluation(entities, engine, combatObservationUnits);
const equipmentContexts = auditEquipmentContexts(entities, engine);
const weaponTriggers = await auditWeaponTriggers(catalog, engine);
const setConditions = auditSetConditions(entities, engine);
const setHealing = await auditHealingWindows(catalog, engine);
const talentHealing = await auditTalentHealing(catalog, engine);
const scenes = auditPublicScenes(entities, engine);
const resonances = auditResonances(entities, engine);
const reactionBlessings = auditReactionBlessings(entities, engine);
const manekin = await auditManekin(catalog, engine);
const verifiedForms = new Set(manekin.rows.filter(r => !manekin.rows.some(f => f.entity === r.entity && f.issue)).map(r => r.entity));
const characterBuffs = auditCharacterBuffs(entities,engine);
const castTiming = await auditCastTiming(entities,engine);
const auraDurations = await auditAuraDurations(entities,engine);
const partyParticles = await auditResonanceParticles(catalog,engine);
const gleam = auditGleam(entities,engine);
const unresolvedClauses = new Set(report.lifecycleGaps.filter(gap => gap.clause).map(gap => gap.entity + gap.clause));
const verifiedClauses = new Set([...characterBuffs.verified,...castTiming.verified].filter(key => !unresolvedClauses.has(key)));
const characterClauses = auditCharacterClauses(entities, engine, verifiedForms, verifiedClauses);
const { publicGaps, publicChecks, interpretations } = readContentSource(new URL('../../data/sources/catalog/combat-lifecycle.json', import.meta.url));
const auditFailures = [
  ...actual.gaps, ...equipment.rows.filter(r=>r.issue), ...equipment.rows.flatMap(r=>(r.modifiers??[]).filter(m=>m.issue).map(m=>({entity:r.entity,field:r.field,pieces:r.pieces,issue:m.issue}))),
  ...[equipmentContexts,manekin,setConditions,setHealing,talentHealing,characterBuffs,castTiming,auraDurations,partyParticles,gleam].flatMap(check=>check.rows.filter(r=>r.issue)),
  ...weaponTriggers.rows.filter(r=>r.issue).map(r=>({...r,entity:r.weapon,field:'/buffs'})),
  ...characterClauses.rows.filter(r=>r.grantGate===false).map(r=>({...r,issue:'授予门槛与条款不符'})),
  ...reactionBlessings.rows.filter(r=>r.issue),...reactionBlessings.caps.filter(r=>r.issue),
];
const pending = new Map();
function mark(entity,field,reason,pieces) {
  const list=pending.get(entity) ?? [];
  if(!list.some(item=>item.field===field && item.reason===reason && item.pieces===pieces))list.push({field,reason,pieces});
  pending.set(entity,list);
}
for(const r of auditFailures)mark(r.entity,r.field ?? '/buffs',r.issue,r.pieces);
for(const r of interpretations)for(const field of r.fields)mark(r.entity,field,r.reason);
for(const r of actual.otherDetails.filter(r=>r.kind==='属性或机制贡献' && r.missingContributionParameters.length))mark(r.entity,r.field,'本地已有数值，仍有贡献参数待绑定');
const verifiedHealing = new Set(talentHealing.verified);
const recoveryGaps = actual.talentDetails.filter(row => (row.kind === '治疗量' || row.kind === '护盾吸收量') && !verifiedHealing.has(row.entity + row.field));
for (const row of recoveryGaps) mark(row.entity, row.field, '技能的' + row.kind + '尚缺逐项数值验收');
for(const r of characterClauses.rows.filter(r=>r.status==='战斗贡献待逐条件验收'))mark(r.entity,r.field,r.status);
for(const entry of report.entries.filter(e=>e.resolution==='complete')) {
  const failures=(pending.get(entry.entityId) ?? []).filter(f=>['weapon','character','set'].includes(entry.kind) ||
    entry.kind==='set-effect' && (f.pieces===undefined || f.pieces===entry.selector.pieces) || f.field===entry.pointer);
  if(failures.length) { entry.resolution='unavailable'; entry.reason=failures.map(f=>f.field+' '+f.reason).join('；'); }
}
report.summary.complete = report.entries.filter(row=>row.resolution==='complete').length;
report.summary.unavailable = report.entries.length - report.summary.complete;
const summary = { unresolvedHitInterpretations: interpretations.length, publicCombatClauseGaps: publicGaps.length, ...characterClauses.summary, ...report.summary, ...actual.summary, ...equipment.summary, ...weaponTriggers.summary, ...manekin.summary, ...setConditions.summary, ...scenes.summary, ...resonances.summary, ...reactionBlessings.summary,
  completeCharacters: report.entries.filter(row => row.kind === 'character' && row.resolution === 'complete').length,
  completeWeapons: report.entries.filter(row => row.kind === 'weapon' && row.resolution === 'complete').length,
  completeSets: report.entries.filter(row => row.kind === 'set' && row.resolution === 'complete').length,
  completeSetThresholds: report.entries.filter(row => row.kind === 'set-effect' && row.resolution === 'complete').length };
const characters = new Map(entities.characters.map(entry => [entry.id, entry.metadata]));
Object.assign(summary,equipmentContexts.summary,setHealing.summary,talentHealing.summary,characterBuffs.summary,castTiming.summary,auraDurations.summary,partyParticles.summary,gleam.summary);
function missingFields(entry) {
  const character = characters.get(entry.entityId);
  if (!character) return {};
  if (entry.kind === 'character') return { name: character.identity.name };
  const [group, index] = entry.pointer.split('/').slice(1);
  const owner = character[group]?.[Number(index)];
  if (!owner) return {};
  if (entry.kind === 'hit') {
    const hit = owner.hits.find(hit => hit.id === entry.selector.hitId);
    return { name: hit?.name, terms: hit?.base, condition: hit?.when, family: hit?.family ?? 'ordinary' };
  }
  return { name: owner.name, clause: owner.description, registeredBuffs: owner.buffs?.map(buff => buff.id) ?? [],
    ...(owner.talentBonuses?.length ? { talentBonuses: owner.talentBonuses } : {}) };
}
const uncovered = report.entries.filter(entry => entry.resolution !== 'complete').map(entry => ({ kind: entry.kind, entity: entry.entityId,
  ...missingFields(entry), field: entry.pointer || (entry.kind === 'character' ? '/contextSupport' : entry.kind === 'weapon' ? '/support' : '/effects'), selector: entry.selector,
  reasons: [...new Set([entry.reason, ...entry.scopes.flatMap(scope => scope.gaps)])], evidence: '独立核验尚未闭合' }));
summary.recoveryDetailsPending = recoveryGaps.length;
const results = { summary, settings: actual.settings, evaluatedHits: actual.rows, talentDetails: actual.talentDetails, talentHealing, recoveryGaps,
  contextualDetails: actual.otherDetails, gaps: actual.gaps, auditFailures, equipment, equipmentContexts, weaponTriggers, manekin, setConditions, setHealing, scenes, resonances, reactionBlessings, characterBuffs, castTiming, auraDurations, partyParticles, gleam, characterClauses, publicGaps, publicChecks, interpretations, lifecycleGaps: report.lifecycleGaps, uncovered };
if (file) writeFileSync(file, JSON.stringify(results, null, 2) + '\n');
if (gapFile) writeFileSync(gapFile, rosterGapReport(results, entities));
console.log(JSON.stringify(flags.has('--json') ? { ...report, ...results } : { material: report.material, ...summary }));
if (summary.manekinFailures || summary.weaponTriggerFailures || summary.setConditionFailures || summary.blessingMismatches || summary.publicResonanceMismatches || summary.countFailures || summary.clauseGateFailures || summary.conditionFailures || summary.publicSceneChecksFailed || summary.equipmentMismatches || summary.modifierMismatches || summary.invalidDefinitions || summary.mismatches || summary.duplicate || flags.has('--check') && (report.lifecycleGaps.some(gap => gap.area !== 'observation') || summary.positiveHits !== summary.evaluated || summary.equipmentMissingValues || summary.missingBindings || summary.missingValues || summary.detailCandidates || summary.unresolvedHitInterpretations || summary.contextualContributionsPending || summary.numericModifierContributions !== summary.modifierScenarios || summary.publicCombatClauseGaps || summary.publicSceneSourceGaps || summary.characterCombatClausesPending)
  || flags.has('--check') && (summary.weaponClausesPending || summary.setClausesPending || summary.recoveryDetailsPending)
  || summary.equipmentContextFailures || summary.setHealingFailures || summary.talentHealingFailures || summary.characterBuffFailures || summary.castTimingFailures || summary.auraDurationFailures || summary.resonanceParticleFailures || summary.gleamFailures || flags.has('--require-complete') && (summary.unavailable || summary.compared !== summary.evaluated || actual.gaps.length)) {
  console.error('目录验收仍有缺口。');
  process.exitCode = 1;
}
