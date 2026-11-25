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
import { auditCalculatorEntries } from '../../lib/calculator-entry-audit.mjs';
import { auditCharacterClauseGrants } from '../../lib/character-clause-grants-audit.mjs';
import { auditTalentConditionGrants } from '../../lib/talent-condition-grants-audit.mjs';
import { auditEquipmentCurrentFacts } from '../../lib/equipment-current-facts-audit.mjs';
import { auditRemainingCurrentHits } from '../../lib/remaining-current-hits-audit.mjs';
import { auditIncomingCurrentFacts } from '../../lib/incoming-current-facts-audit.mjs';
import { auditTriggerHitSources } from '../../lib/trigger-hit-source-audit.mjs';
import { auditPartyInfusion } from '../../lib/party-infusion-audit.mjs';
import { auditTalentTableBuffs } from '../../lib/talent-table-buff-audit.mjs';
import { auditShieldAbsorption } from '../../lib/shield-absorption-audit.mjs';
import { auditAdditionalEquipment } from '../../lib/additional-equipment-values.mjs';
import { auditAdditionalScenes } from '../../lib/scene-additional-clauses.mjs';
import { auditSceneDamage } from '../../lib/scene-damage-audit.mjs';
import { auditSceneRangePoise } from '../../lib/scene-range-poise.mjs';
import { auditCurrentRosterBuffs } from '../../lib/current-roster-buff-proof.mjs';
import { auditTalentDetailCurrent } from '../../lib/talent-detail-current-audit.mjs';
import { auditRemainingEquipmentCases } from '../../lib/remaining-equipment-cases.mjs';
import { auditUnregisteredCurrentClauses } from '../../lib/unregistered-current-clauses.mjs';
import { currentClauseInventory } from '../../lib/current-clause-inventory.mjs';
import { auditCurrentEnergyGrants } from '../../lib/current-energy-grants-audit.mjs';
import { auditConfirmedMixedBuffs } from '../../lib/confirmed-mixed-buffs-audit.mjs';
import { auditConfirmedPassiveHealing } from '../../lib/confirmed-passive-healing-audit.mjs';
import { auditRemainingShieldGrants } from '../../lib/remaining-shield-grants-audit.mjs';
import { auditEquipmentHealing } from '../../lib/equipment-healing-audit.mjs';
import { auditEquipmentAuraCases } from '../../lib/equipment-aura-prose.mjs';
import { auditConfirmedReactionElevation } from '../../lib/confirmed-reaction-elevation.mjs';
import { auditRemainingPartyDefense } from '../../lib/remaining-party-defense.mjs';
import { auditBennettInspiration } from '../../lib/bennett-inspiration-audit.mjs';
import { auditRemainingEventGrants } from '../../lib/remaining-event-grants.mjs';
import { auditFallImmunity } from '../../lib/fall-immunity.mjs';
import { auditColumbinaRevival } from '../../lib/columbina-revival.mjs';
import { auditIfaRescueReactions } from '../../lib/ifa-rescue-reactions.mjs';
import { auditRemainingAttributeDetails } from '../../lib/remaining-attribute-details.mjs';
import { auditNicoleCap } from '../../lib/nicole-cap.mjs';
import { auditAdditionalConstellationHits } from '../../lib/additional-constellation-hits.mjs';
import { auditMityaSteadyCore } from '../../lib/mitya-steady-core.mjs';
import { auditConditionalHealingSources } from '../../lib/conditional-healing-sources.mjs';
import { auditConfirmedEnergyCases } from '../../lib/confirmed-energy-cases.mjs';
import { auditVariableWeaponConditions } from '../../lib/variable-weapon-conditions.mjs';
import { auditCombatSpeedClauses } from '../../lib/combat-speed-clauses.mjs';
import { auditNatlanCurrentResources } from '../../lib/natlan-current-resources.mjs';
import { auditMovementSpeedClauses } from '../../lib/movement-speed-clauses.mjs';
import { auditRemainingEnergyFacts } from '../../lib/remaining-energy-facts.mjs';
import { auditCharacterResourceBuffs } from '../../lib/character-resource-buffs.mjs';
import { auditSceneEnvironmentAmounts } from '../../lib/scene-environment-amounts.mjs';
import { auditEquipmentEnergyGrants } from '../../lib/equipment-energy-grants.mjs';
import { auditEquipmentRecoveryRemainders } from '../../lib/equipment-recovery-remainders.mjs';
import { auditAimChargeBuffs } from '../../lib/aim-charge-buffs.mjs';
import { auditCharacterEffectRanges } from '../../lib/character-effect-ranges.mjs';
import { auditDirectCooldownAmounts } from '../../lib/direct-cooldown-amounts.mjs';
import { auditConditionalCastCooldowns } from '../../lib/conditional-cast-cooldowns.mjs';
import { auditConfirmedSkillResets } from '../../lib/confirmed-skill-resets.mjs';
import { auditYanfeiSealStamina } from '../../lib/yanfei-seal-stamina.mjs';
import { auditCharacterInterruptionResistance } from '../../lib/character-interruption-resistance.mjs';
import { auditTalentHitVariants } from '../../lib/talent-hit-variants.mjs';
import { auditVarkaChargedHands } from '../../lib/varka-charged-hands-audit.mjs';
import { registeredModifierEvidence } from '../../lib/registered-modifier-evidence.mjs';
import { shieldModifierEvidence } from '../../lib/shield-modifier-evidence.mjs';
import { mixedEquipmentModifierNumbers } from '../../lib/mixed-equipment-modifier-numbers.mjs';
import { characterResistanceBonusProofs } from '../../lib/character-resistance-bonus-proofs.mjs';
import { characterDamageModifierNumbers } from '../../lib/character-damage-modifier-numbers.mjs';
import { characterStatModifierNumbers } from '../../lib/character-stat-modifier-numbers.mjs';
import { characterReactionUtilityNumbers } from '../../lib/character-reaction-utility-numbers.mjs';
import { physicalDamageModifierNumbers } from '../../lib/physical-damage-modifier-numbers.mjs';
import { auditLastCharacterModifierCases } from '../../lib/last-character-modifier-cases.mjs';
import { auditRemainingTriggeredStrikes } from '../../lib/remaining-triggered-strikes.mjs';
import { loadContentSchema } from '../../lib/load-content-schema.mjs';
import { createRuntimeCatalog } from '../../lib/runtime-catalog.mjs';
import { auditSingleHitModifiers } from '../../lib/single-hit-modifier-matrix.mjs';

import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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
const file = option('--report'), gapFile = option('--gaps'), monaFile = option('--mona-report');
const flags = new Set(args);
for (const flag of flags) if (!['--json', '--require-complete', '--require-current', '--check'].includes(flag)) throw new Error('未知验收参数 ' + flag);
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
const singleHitModifiers = auditSingleHitModifiers(entities, engine);
const { combatObservationUnits } = await loadContentSchema('/src/schema/src/calculation/event.ts');
const currentEquipment = auditEquipmentCurrentFacts(entities, engine);
const additionalEquipment = auditAdditionalEquipment(entities, engine);
const remainingEquipment = auditRemainingEquipmentCases(entities, engine);
const equipmentHealing = auditEquipmentHealing(entities, engine);
const equipmentAuraCases = auditEquipmentAuraCases(entities, engine);
const incoming = auditIncomingCurrentFacts(entities, engine);
const confirmedSkillResets = auditConfirmedSkillResets(entities, engine);
const equipmentFields = new Set([...currentEquipment.verified, ...additionalEquipment.verified, ...remainingEquipment.verified, ...incoming.verified]);
const equipmentOutputs = new Set([...equipmentHealing.verified, ...confirmedSkillResets.verified]);
for (const entity of [...entities.weapons, ...entities.sets]) {
  const groups = entity.metadata.effects?.map((effect, i) => [effect, '/effects/' + i]) ?? [[entity.metadata, '']];
  for (const [group, field] of groups) {
    const modifiers = (group.buffs ?? []).flatMap((buff, i) => buff.modifiers.map((_, j) => entity.id + field + '/buffs/' + i + '/modifiers/' + j));
    if (modifiers.length && modifiers.every(key => equipmentOutputs.has(key))) equipmentFields.add(entity.id + (field || '/buffs'));
  }
}
const equipment = rosterEquipmentEvaluation(entities, engine, combatObservationUnits, undefined, equipmentFields);
const equipmentContexts = auditEquipmentContexts(entities, engine);
const weaponTriggers = await auditWeaponTriggers(catalog, engine);
const setConditions = auditSetConditions(entities, engine);
const setHealing = await auditHealingWindows(catalog, engine);
const talentHealing = await auditTalentHealing(catalog, engine);
const additionalScenes = auditAdditionalScenes(entities, engine);
const sceneDamage = auditSceneDamage(entities, engine);
const scenes = auditPublicScenes(entities, engine, additionalScenes.verified);
const resonances = auditResonances(entities, engine);
const reactionBlessings = auditReactionBlessings(entities, engine);
const manekin = await auditManekin(catalog, engine);
const verifiedForms = new Set(manekin.rows.filter(r => !manekin.rows.some(f => f.entity === r.entity && f.issue)).map(r => r.entity));
const characterBuffs = auditCharacterBuffs(entities,engine);
const characterGrants = auditCharacterClauseGrants(entities, engine);
const talentGrants = auditTalentConditionGrants(entities, engine);
const remainingHits = auditRemainingCurrentHits(entities, engine);
const triggerHits = auditTriggerHitSources(entities, engine);
const partyInfusion = auditPartyInfusion(entities, engine);
const talentTable = auditTalentTableBuffs(entities, engine);
const shields = auditShieldAbsorption(entities, engine);
const currentRosterBuffs = auditCurrentRosterBuffs(entities, engine);
const talentDetailsCurrent = auditTalentDetailCurrent(entities, engine);
const unregisteredClauses = auditUnregisteredCurrentClauses(entities, engine);
const directEnergy = auditCurrentEnergyGrants(entities, engine);
const mixedBuffs = auditConfirmedMixedBuffs(entities, engine);
const grantedHealing = await auditConfirmedPassiveHealing(entities, engine);
const remainingShieldGrants = auditRemainingShieldGrants(entities, engine);
const reactionElevation = await auditConfirmedReactionElevation(entities, engine);
const partyDefense = await auditRemainingPartyDefense(entities, engine);
const triggeredStrikes = auditRemainingTriggeredStrikes(entities, engine);
const bennettInspiration = auditBennettInspiration(entities, engine);
const remainingEventGrants = await auditRemainingEventGrants(entities, engine);
const fallImmunity = auditFallImmunity(entities, engine);
const columbinaRevival = await auditColumbinaRevival(entities, engine);
const sceneRangePoise = auditSceneRangePoise(entities, engine);
const ifaRescueReactions = await auditIfaRescueReactions(entities, engine);
const remainingAttributeDetails = auditRemainingAttributeDetails(entities, engine);
const nicoleCap = auditNicoleCap(entities, engine);
const additionalConstellationHits = auditAdditionalConstellationHits(entities, engine);
const mityaSteadyCore = auditMityaSteadyCore(entities, engine);
const conditionalHealingSources = await auditConditionalHealingSources(entities, engine);
const confirmedEnergyCases = await auditConfirmedEnergyCases(entities, engine);
const variableWeaponConditions = auditVariableWeaponConditions(entities, engine);
const combatSpeedClauses = auditCombatSpeedClauses(entities, engine);
const natlanCurrentResources = auditNatlanCurrentResources(entities, engine);
const movementSpeedClauses = auditMovementSpeedClauses(entities, engine);
const remainingEnergyFacts = auditRemainingEnergyFacts(entities, engine);
directEnergy.gaps = directEnergy.gaps.map(row => remainingEnergyFacts.gaps.find(candidate => candidate.entity === row.entity
  && candidate.field === row.field && candidate.status === 'unavailable') ?? row);
const characterResourceBuffs = auditCharacterResourceBuffs(entities, engine);
const sceneEnvironmentAmounts = auditSceneEnvironmentAmounts(entities, engine);
const equipmentEnergyGrants = auditEquipmentEnergyGrants(entities, engine);
const equipmentRecoveryRemainders = auditEquipmentRecoveryRemainders(entities, engine);
const aimChargeBuffs = auditAimChargeBuffs(entities, engine);
const characterEffectRanges = auditCharacterEffectRanges(entities, engine);
const directCooldownAmounts = auditDirectCooldownAmounts(entities, engine);
const conditionalCastCooldowns = auditConditionalCastCooldowns(entities, engine);
const yanfeiSealStamina = auditYanfeiSealStamina(entities, engine);
const resetVerified = row => row.entity === 'freminet' && row.field.split('/buffs/')[0] === '/talents/2'
  && confirmedSkillResets.verified.has('freminet/talents/2') && !confirmedSkillResets.rows.some(probe => probe.entity === 'freminet' && probe.issue);
conditionalCastCooldowns.gaps = conditionalCastCooldowns.gaps.filter(row => !resetVerified(row));
conditionalCastCooldowns.resolved = conditionalCastCooldowns.resolved.map(row => {
  if (!resetVerified(row)) return row;
  const { remaining, ...verified } = row;
  return verified;
});
conditionalCastCooldowns.summary.conditionalCastCooldownGaps = conditionalCastCooldowns.gaps.length;
const castCooldownClauses = new Set(conditionalCastCooldowns.resolved.map(row => row.entity + row.field.split('/buffs/')[0]));
directCooldownAmounts.gaps = directCooldownAmounts.gaps.filter(row => !castCooldownClauses.has(row.entity + row.field));
directCooldownAmounts.summary.directCooldownGaps = directCooldownAmounts.gaps.length;
const characterInterruptionResistance = auditCharacterInterruptionResistance(entities, engine);
const talentHitVariants = auditTalentHitVariants(entities, engine);
const varkaChargedHands = auditVarkaChargedHands(entities, engine);
const branchAudits = { additionalConstellationHits, mityaSteadyCore, conditionalHealingSources, confirmedEnergyCases, variableWeaponConditions,
  combatSpeedClauses, natlanCurrentResources, movementSpeedClauses, remainingEnergyFacts, characterResourceBuffs, equipmentEnergyGrants,
  equipmentRecoveryRemainders, aimChargeBuffs, characterEffectRanges, directCooldownAmounts, conditionalCastCooldowns, characterInterruptionResistance,
  talentHitVariants, varkaChargedHands, confirmedSkillResets, yanfeiSealStamina, equipmentAuraCases };
const revisedFields = new Map([grantedHealing, mixedBuffs, remainingShieldGrants, reactionElevation, partyDefense, triggeredStrikes,
  bennettInspiration, remainingEventGrants, ifaRescueReactions, fallImmunity, columbinaRevival, ...Object.values(branchAudits)]
  .flatMap(audit => audit.resolved).map(row => [row.entity + row.field, row]));
unregisteredClauses.gaps = unregisteredClauses.gaps.flatMap(row => {
  const revised = revisedFields.get(row.entity + row.field);
  if (!revised) return [row];
  return revised.remaining ? [{ ...row, resolved: revised.resolved, reason: revised.remaining, needed: revised.remaining }] : [];
});
const singleHitAudits = { characterGrants, talentGrants, currentEquipment, additionalEquipment, remainingEquipment, remainingHits, incoming, triggerHits,
  partyInfusion, talentTable, shields, additionalScenes, currentRosterBuffs, sceneDamage, sceneRangePoise, talentDetailsCurrent, unregisteredClauses,
  directEnergy, mixedBuffs, grantedHealing, remainingShieldGrants, equipmentHealing, reactionElevation, partyDefense, triggeredStrikes, bennettInspiration,
  remainingEventGrants, ifaRescueReactions, remainingAttributeDetails, fallImmunity, columbinaRevival, nicoleCap, ...branchAudits };
const castTiming = await auditCastTiming(entities,engine);
const auraDurations = await auditAuraDurations(entities,engine);
const partyParticles = await auditResonanceParticles(catalog,engine);
const gleam = auditGleam(entities,engine);
const unresolvedClauses = new Set(report.lifecycleGaps.filter(gap => gap.clause).map(gap => gap.entity + gap.clause));
const currentVerified = new Set(Object.values(singleHitAudits).flatMap(audit => [...audit.verified]));
const clauseAudits = Object.values(singleHitAudits).filter(audit => audit !== directEnergy && audit !== grantedHealing);
function verifiesWholeClause(audit, key) {
  return clauseAudits.includes(audit) && !audit.resolved?.some(row => row.entity + row.field === key && row.remaining);
}
const verifiedClauses = new Set([...characterBuffs.verified, ...castTiming.verified,
  ...clauseAudits.flatMap(audit => [...audit.verified].filter(key => verifiesWholeClause(audit, key)))].filter(key => !unresolvedClauses.has(key)));
const characterClauses = auditCharacterClauses(entities, engine, verifiedForms, verifiedClauses);
const { publicGaps, publicChecks, interpretations } = readContentSource(new URL('../../data/sources/catalog/combat-lifecycle.json', import.meta.url));
const auditFailures = [
  ...singleHitModifiers.failures.map(row => ({ entity: row.recipient, field: row.hit ?? row.category, issue: row.reason ?? row.status, rule: row.rule })),
  ...sceneEnvironmentAmounts.gaps,
  ...actual.gaps, ...equipment.rows.filter(r=>r.issue), ...equipment.rows.flatMap(r=>(r.modifiers??[]).filter(m=>m.issue).map(m=>({entity:r.entity,field:r.field,pieces:r.pieces,issue:m.issue}))),
  ...[equipmentContexts,manekin,setConditions,setHealing,talentHealing,characterBuffs,castTiming,auraDurations,partyParticles,gleam,
    ...Object.values(singleHitAudits)].flatMap(check=>check.rows.filter(r=>r.issue)),
  ...Object.values(singleHitAudits).flatMap(check => (check.baseRows ?? []).filter(row => row.issue)),
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
for(const r of equipment.gaps)mark(r.entity,r.field,r.reason,r.pieces);
for(const r of interpretations)for(const field of r.fields)mark(r.entity,field,r.reason);
for(const r of actual.otherDetails.filter(r=>r.kind==='属性或机制贡献' && r.missingContributionParameters.length))mark(r.entity,r.field,'本地已有数值，仍有贡献参数待绑定');
const recoveryValues = new Set([...talentHealing.verified, ...shields.verified]);
const recoveryGaps = actual.talentDetails.filter(row => (row.kind === '治疗量' || row.kind === '护盾吸收量') && !recoveryValues.has(row.entity + row.field));
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
results.sceneEnvironmentAmounts = { ...sceneEnvironmentAmounts, verified: [...sceneEnvironmentAmounts.verified], baseVerified: [...sceneEnvironmentAmounts.baseVerified] };
results.singleHitModifiers = singleHitModifiers;
summary.singleHitModifierCases = singleHitModifiers.rows.length;
summary.singleHitModifierFailures = singleHitModifiers.failures.length;
Object.assign(summary, sceneEnvironmentAmounts.summary);
for (const [name, audit] of Object.entries(singleHitAudits)) {
  results[name] = { ...audit, verified: [...audit.verified], ...(audit.baseVerified ? { baseVerified: [...audit.baseVerified] } : {}) };
}
const calculator = await auditCalculatorEntries(entities, results);
results.calculator = calculator;
results.registeredModifierEvidence = await registeredModifierEvidence(entities, results, engine);
results.registeredModifierEvidence.push(...await auditLastCharacterModifierCases(entities, engine, results));
results.registeredModifierEvidence.push(...shieldModifierEvidence(entities, results, engine));
results.registeredModifierEvidence.push(...mixedEquipmentModifierNumbers(entities, results, engine));
results.registeredModifierEvidence.push(...characterResistanceBonusProofs(entities, results, engine));
results.registeredModifierEvidence.push(...characterDamageModifierNumbers(entities, results, engine));
results.registeredModifierEvidence.push(...characterStatModifierNumbers(entities, results, engine));
results.registeredModifierEvidence.push(...characterReactionUtilityNumbers(entities, results, engine));
results.registeredModifierEvidence.push(...physicalDamageModifierNumbers(entities, results, engine));
results.triggerHitEvidence = readContentSource(new URL('../../data/sources/catalog/trigger-hit-evidence.json', import.meta.url)).rows;
results.healingEvidence = readContentSource(new URL('../../data/sources/catalog/talent-healing-evidence.json', import.meta.url)).rows;
const clauseEvidence = new Map();
for (const [name, audit] of Object.entries(singleHitAudits)) {
  for (const key of audit.verified) {
    const match = /^([^/]+\/(?:passives|constellations)\/\d+)(?:\/|$)/.exec(key);
    if (!match) continue;
    const list = clauseEvidence.get(match[1]) ?? [];
    list.push({ audit: name, field: key.slice(key.indexOf('/')), wholeField: key === match[1] && verifiesWholeClause(audit, key) });
    clauseEvidence.set(match[1], list);
  }
}
results.currentClauseEvidence = characterClauses.rows.map(clause => {
  const character = characters.get(clause.entity);
  const [group, index] = clause.field.slice(1).split('/');
  const declaration = character[group][Number(index)];
  const fields = { entity: clause.entity, revision: character.revision, field: clause.field, name: clause.name, text: clause.text,
    hits: declaration.hits?.map(hit => hit.id) ?? [], grants: clause.grantIds,
    evidence: clauseEvidence.get(clause.entity + clause.field) ?? [] };
  return { ...fields, status: fields.evidence.some(proof => proof.wholeField) ? '当次条件已有专项'
    : fields.evidence.length ? '部分数值已有专项' : clause.status };
});
results.entityFieldGaps = entities.characters.flatMap(character => {
  const metadata = character.metadata;
  return (metadata.support[metadata.contextSupport]?.mechanisms ?? []).filter(row => row.id === 'remaining-talent-context' && row.reason)
    .map(row => ({ entity: metadata.id, field: '/support/' + metadata.contextSupport + '/mechanisms/' + row.id, reason: row.reason }));
}).concat(remainingEquipment.gaps, unregisteredClauses.gaps, directEnergy.gaps, grantedHealing.gaps, mixedBuffs.gaps, remainingShieldGrants.gaps,
  equipmentHealing.gaps, reactionElevation.gaps, partyDefense.gaps, triggeredStrikes.gaps, remainingEventGrants.gaps, ifaRescueReactions.gaps,
  remainingAttributeDetails.gaps, fallImmunity.gaps, columbinaRevival.gaps, nicoleCap.gaps, Object.values(branchAudits).flatMap(audit => audit.gaps),
  results.healingEvidence.filter(row => row.pending).map(row => ({ entity: row.entity, field: row.field, reason: row.pending, sources: row.sources })));
const gapByReason = new Map();
for (const row of results.entityFieldGaps) {
  const key = JSON.stringify([row.entity, row.field, row.reason]);
  const previous = gapByReason.get(key);
  gapByReason.set(key, previous ? { ...previous, ...row, sources: [...new Set([...(previous.sources ?? []), ...(row.sources ?? [])])] } : row);
}
results.entityFieldGaps = [...gapByReason.values()];
Object.assign(summary, calculator.summary, ...Object.values(singleHitAudits).filter(audit => audit !== talentGrants && audit !== partyInfusion).map(audit => audit.summary), {
  partyInfusionCases: partyInfusion.rows.length, partyInfusionFailures: partyInfusion.summary.failures, partyInfusionProvenFields: partyInfusion.verified.size,
  currentTalentCases: talentGrants.rows.length, currentTalentFailures: talentGrants.rows.filter(row => row.issue).length,
  currentTalentClausesVerified: talentGrants.verified.size,
  singleHitAuditCases: Object.values(singleHitAudits).reduce((count, audit) => count + audit.rows.length + (audit.baseRows?.length ?? 0), 0),
  singleHitAuditFailures: Object.values(singleHitAudits).flatMap(audit => [...audit.rows, ...(audit.baseRows ?? [])]).filter(row => row.issue).length,
  singleHitProvenFields: currentVerified.size,
  calculatorHitComparisons: calculator.hits.filter(row => row.selected && Number.isFinite(row.comparison?.expected) && !row.comparison.issue).length,
});
auditFailures.push(...calculator.failures);
results.currentClauseInventory = currentClauseInventory(entities, results);
const ledger = results.currentClauseInventory.summary;
summary.calculatorProvenBuffModifiers = ledger.bySubject.modifier?.available ?? 0;
summary.calculatorPendingBuffModifiers = summary.calculatorBuffModifiers - summary.calculatorProvenBuffModifiers;
const sceneDamageProof = new Set(sceneDamage.verified);
const fieldEvidence = new Map(sceneEnvironmentAmounts.resolved.map(row => [row.entity + row.field, row]));
const settlementFile = 'anime-game-data-2/bd35e243fa436f141f015cf221a6e19d0c34b7ca/scene-hit-settlement-evidence.json';
const settlement = readContentSource(new URL('../../data/sources/' + settlementFile, import.meta.url));
const settlementDungeons = new Set(Object.values(settlement.scope.dungeonIds).flat());
results.currentSceneGaps = scenes.gaps.filter(row => {
  if (sceneEnvironmentAmounts.verified.has(row.entity + row.field)) return false;
  if (row.evidence?.status === 'damage-formula' && sceneDamageProof.has(row.entity + row.field)) return false;
  if (['control', 'geometry'].includes(row.evidence?.status) && sceneRangePoise.verified.has(row.entity + row.field)) return false;
  const changesOnly = row.evidence?.status === 'timing' && row.missingFields?.length
    && row.missingFields.every(field => field.endsWith('初始平台状态') || field.endsWith('平台切换时刻'));
  return !changesOnly;
}).map(row => {
  if (sceneDamage.baseVerified?.has(row.entity + row.field)) {
    const verifiedSubtotal = { output: 'baseDamage', audit: 'sceneDamage.baseRows', refs: row.evidence.sourceRefs,
      scope: '根据关卡配置的倍率与给定的 ElementLevelCo 核验基础伤害。' };
    if (!settlementDungeons.has(row.evidence.dungeonId)) return { ...row, verifiedSubtotal };
    const hit = row.evidence.hit;
    const question = hit.recipient === 'character' ? 'incomingReaction' : hit.trigger.includes('护盾') ? 'shieldBacklash' : 'outgoingReaction';
    return { ...row, verifiedSubtotal, evidence: { ...row.evidence, settlementSource: 'tools/data/sources/' + settlementFile },
      issue: settlement.fixedConfiguration.interpretationGap, missingFields: [row.field + ' · ' + settlement.pendingEvidence[question]] };
  }
  const checked = fieldEvidence.get(row.entity + row.field);
  return checked ? { ...row, issue: checked.remaining, missingFields: checked.missingFields,
    evidence: { ...row.evidence, ...checked.evidence, established: checked.resolved } } : row;
});
summary.currentSceneClausesPending = results.currentSceneGaps.length;
const requireCurrent = flags.has('--require-complete') || flags.has('--require-current');
if (monaFile || requireCurrent) {
  const { auditMonaSingleHit } = await import('../../lib/mona-single-hit-comparison.mjs');
  const comparison = await auditMonaSingleHit(entities, results.currentClauseInventory, engine);
  summary.monaSingleHit = comparison.summary;
  if (monaFile) {
    const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
    comparison.provenance = {
      generatedAt: new Date().toISOString(),
      leyline: git('rev-parse', 'HEAD'),
      dirty: Boolean(git('status', '--porcelain')),
      mona: comparison.mona.length ? comparison.baselines.mona : null,
    };
    writeFileSync(monaFile, JSON.stringify(comparison) + '\n');
  }
  results.monaSingleHit = { summary: comparison.summary, gaps: comparison.gaps };
}
summary.currentCalculationComplete = !calculator.failures.length && !auditFailures.length && !results.currentClauseInventory.gaps.length
  && !summary.currentSceneClausesPending && !summary.unresolvedHitInterpretations && (summary.monaSingleHit?.complete ?? true);
if (file) writeFileSync(file, JSON.stringify(results, null, 2) + '\n');
if (gapFile) writeFileSync(gapFile, rosterGapReport(results, entities));
console.log(JSON.stringify(flags.has('--json') ? { ...report, ...results } : { material: report.material, ...summary }));
const checkFullMechanisms = flags.has('--check') && (!flags.has('--require-current') || flags.has('--require-complete'));
if (requireCurrent && !summary.currentCalculationComplete
  || summary.singleHitModifierFailures || summary.sceneEnvironmentAmountCheckFailures || summary.calculatorEntryFailures || summary.singleHitAuditFailures || summary.characterClauseGrantFailures || summary.currentEquipmentMismatches || summary.currentTalentFailures ||
  summary.manekinFailures || summary.weaponTriggerFailures || summary.setConditionFailures || summary.blessingMismatches || summary.publicResonanceMismatches || summary.countFailures || summary.clauseGateFailures || summary.conditionFailures || summary.publicSceneChecksFailed || summary.equipmentMismatches || summary.modifierMismatches || summary.invalidDefinitions || summary.mismatches || summary.duplicate || checkFullMechanisms && (report.lifecycleGaps.some(gap => gap.area !== 'observation') || summary.positiveHits !== summary.evaluated || summary.equipmentMissingValues || summary.missingBindings || summary.missingValues || summary.detailCandidates || summary.unresolvedHitInterpretations || summary.contextualContributionsPending || summary.numericModifierContributions !== summary.modifierScenarios || summary.publicCombatClauseGaps || summary.publicSceneSourceGaps || summary.characterCombatClausesPending)
  || checkFullMechanisms && (summary.weaponClausesPending || summary.setClausesPending || summary.recoveryDetailsPending)
  || summary.equipmentContextFailures || summary.setHealingFailures || summary.talentHealingFailures || summary.characterBuffFailures || summary.castTimingFailures || summary.auraDurationFailures || summary.resonanceParticleFailures || summary.gleamFailures || flags.has('--require-complete') && (summary.unavailable || summary.compared !== summary.evaluated || actual.gaps.length)) {
  console.error('目录验收仍有缺口。');
  process.exitCode = 1;
}
