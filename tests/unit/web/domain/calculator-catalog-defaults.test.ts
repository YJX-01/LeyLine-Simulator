import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getArtifactMain, getArtifactSet, getBuildSources, getCharacter, getWeapon, loadBattleScenes } from '@leyline/game-data';
import { evaluateTimeline } from '@leyline/engine';
import { authoredHit } from '@leyline/schema/hit-bindings';
import { grantBuffs } from '@leyline/schema/buffs';
import { characterHitRef, findBuildHit, isCalculatorDamageModifier, subjectFacts, talentInputIssues, valueMatchesType, type Build,
  type CalculationBinding, type DamageRequest, type FactSubject, type WeaponDefinition } from '@leyline/schema';
import { catalogInventory, readCalculationData } from '../../../../tools/lib/catalog-data.mjs';
import { readCalculationLibrary } from '../../../helpers/read-calculation-library';
import { calculatorBuffChecked, calculatorBuffChoices, calculatorEffectControls, calculatorLayerSeconds, enableCalculatorBuff, resolveBuffSelection } from '../../../../src/web/src/domain/calculator-buffs';
import { calculatorFactPreset, calculatorHitFactFields, calculatorIntervals, missingCalculatorPresets, presetCalculatorHitInputs,
  setCalculatorFact, type CalculatorFactField } from '../../../../src/web/src/domain/calculator-conditions';
import { calculatorSupportText } from '../../../../src/web/src/domain/calculator-factors';
import { calculatorHitChoices } from '../../../../src/web/src/domain/calculator-hits';
import { calculatorCritProject, createDamageCalculation, prepareCalculatorEvaluationProject } from '../../../../src/web/src/domain/damage-calculator';
import { addActorFromBuild, addSkillHit, defaultEnemy } from '../../../../src/web/src/domain/real-project';
import { createEmptyProject } from '../../../../src/web/src/domain/workbench-project';

let library: ReturnType<typeof readCalculationLibrary>;
beforeAll(() => { library = readCalculationLibrary(); });

// Inspect the bindings independently of the picker's field collector. A dropped field must fail the audit.
function editableFacts(binding?: CalculationBinding, owner = 'owner'): CalculatorFactField[] {
  if (binding?.kind === 'formula') return Object.values(binding.inputs).flatMap(input => editableFacts(input, owner));
  if (binding?.kind !== 'fact' || binding.at === 'source-event' || binding.scope === 'source-event') return [];
  const subjects: Record<typeof binding.scope, FactSubject> = {
    owner: { kind: 'actor', id: owner }, recipient: { kind: 'actor', id: 'recipient' },
    'event-actor': { kind: 'actor', id: 'recipient' }, contributor: { kind: 'actor', id: 'contributor' },
    query: { kind: 'event' }, team: { kind: 'team' }, target: { kind: 'target', id: 'target' },
  };
  return [{ key: binding.key, type: binding.type, subject: subjects[binding.scope] }];
}

function checkField(field: CalculatorFactField, source: string) {
  const value = calculatorFactPreset(field, 'owner');
  expect(valueMatchesType(value, field.type), source + '/' + field.key).toBe(true);
  if (value.kind === 'quantity') {
    const initial = ['hpRatio', 'targetHpRatio', 'nearbyEnemies', 'targetsHit', 'targetsDamaged', 'reactionCoefficient'].includes(field.key) ? 1 : 0;
    expect(value.value, source + '/' + field.key).toBe(initial);
  }
  if (field.type.kind === 'enum' && field.type.values.includes('none')) expect(value.value, source).toBe('none');
  if (field.type.kind === 'boolean') {
    expect(value.value, source).toBe(field.key === 'onField' && field.subject?.kind === 'actor' && field.subject.id === 'owner');
  }
}

it('provides initial and enabled card values for every modifier in the calculation library and every battle scene', async () => {
  const effects = [...library.effects];
  for (const scene of await loadBattleScenes()) grantBuffs(scene, effects, [scene.id], scene.facts ?? {});
  const character = await getCharacter('kaeya');
  const hit = characterHitRef(character, character.talents[0].hits[0].id);

  for (const effect of effects) {
    const id = effect.identity.id;
    const damage: DamageRequest = { hit, crit: 'critical', reaction: 'none' };
    const controls = calculatorEffectControls(effect, library, 'owner', 'recipient', 'contributor');
    const card = { ...controls, id, ownerId: 'owner', disabled: false, checked: false,
      explicit: effect.application === 'explicit', confirmTrigger: effect.trigger.kind === 'event' };
    expect(calculatorBuffChecked(card, damage), id).toBe(!card.explicit && !card.confirmTrigger
      && !controls.requirements.length && !controls.hp && !controls.stacks);
    for (const binding of [effect.predicate, effect.value]) {
      for (const expected of editableFacts(binding)) expect(controls.fields, id).toContainEqual(expected);
    }
    for (const field of controls.fields) checkField(field, id);
    const initial = resolveBuffSelection([card], damage, {}, 'owner', new Map());
    if (card.explicit && !card.confirmTrigger) {
      expect(initial.get(id), id).toBe(false);
      const reopened = { ...damage, effectApplications: [{ instanceId: id, active: null }] };
      expect(resolveBuffSelection([card], reopened, {}, 'owner', new Map()).get(id), id).toBe(false);
    }
    if (card.confirmTrigger) expect(initial.has(id), id).toBe(false);
    enableCalculatorBuff(card, damage, {}, 'owner');
    for (const field of controls.fields) {
      if (field.fromTrigger) continue;
      const saved = subjectFacts(damage.facts, field.subject!)?.[field.key]?.value;
      expect(saved && valueMatchesType(saved, field.type), id + '/' + field.key).toBe(true);
    }
    expect(calculatorBuffChecked(card, damage, true), id).toBe(true);
    if (card.stacks) expect(subjectFacts(damage.facts, card.stacks.subject ?? { kind: 'actor', id: 'owner' })?.[card.stacks.key]?.value?.value, id).toBe(card.stacks.max);
    if (effect.lifetime.kind === 'interval') {
      const seconds = calculatorLayerSeconds({ durationMs: effect.lifetime.durationMs, maxLayers: effect.stacking.maxStacks });
      expect(seconds * 1000, id).toBeCloseTo(effect.lifetime.durationMs);
      expect(seconds, id).toBeGreaterThan(0);
    }
  }
  expect(effects.length).toBeGreaterThan(library.effects.length);
}, 60000);

it('checks every catalog hit and validates talent input defaults against its limits at every constellation', () => {
  const inventory = catalogInventory();
  const modifierIds = new Set(library.effects.map(effect => effect.identity.id));
  for (const group of ['characters', 'weapons', 'sets'] as const) {
    for (const id of inventory[group]) {
      const folder = group === 'sets' ? 'artifact-sets' : group;
      const entity: Build['character'] | NonNullable<Build['weapon']> | Build['sets'][number] = readCalculationData('src/game-data/data/' + folder + '/' + id + '.json');
      const owners = entity.kind === 'character-definition' ? [...entity.metadata.talents, ...entity.metadata.passives, ...entity.metadata.constellations]
        : entity.kind === 'artifact-set-definition' ? entity.metadata.effects : [];
      for (const owner of [entity.metadata, ...owners]) for (const buff of owner.buffs ?? []) {
        for (const index of buff.modifiers.keys()) expect(modifierIds.has(index ? buff.id + '.' + index : buff.id), id + '/' + buff.id).toBe(true);
      }
      const rows = entity.kind === 'character-definition' ? entity.talents.flatMap(talent => talent.hits.map(hit => ({ entity, talent, hit })))
        : (entity.kind === 'weapon-definition' ? entity.hits ?? [] : entity.effects.flatMap(piece => piece.hits ?? [])).map(hit => ({ entity, hit, talent: undefined }));
      for (const row of rows) {
        const hitId = row.hit.id;
        const fields = calculatorHitFactFields(row, 'contributor', 'recipient');
        const bindings = [...Object.values(row.hit.base.bindings), ...Object.values(row.hit.damage)
          .flatMap(branch => [...Object.values(branch.bindings), branch.predicate])];
        for (const binding of bindings) for (const field of editableFacts(binding, 'recipient')) {
          expect(fields, hitId).toContainEqual(expect.objectContaining(field));
        }
        for (const field of fields) checkField(field, hitId);
        if (!row.talent?.inputs?.length) continue;
        const damage: DamageRequest = { hit: characterHitRef(entity, hitId), crit: 'critical', reaction: 'none' };
        const inputs = row.talent.inputs.filter(input => input.usage !== 'healing');
        presetCalculatorHitInputs(damage, inputs);
        const facts = subjectFacts(damage.facts, { kind: 'event' });
        const values = Object.fromEntries(inputs.map(input => {
          const value = facts?.[input.id]?.value;
          expect(value?.kind === 'quantity' && value.value, hitId + '/' + input.id).toBe(input.min);
          return [input.id, value?.kind === 'quantity' ? value.value : NaN];
        }));
        for (let rank = 0; rank <= 6; rank++) expect(talentInputIssues(row.talent, values, rank), hitId).toEqual([]);
      }
    }
  }
}, 60000);

it('fills only a requested missing fact, once, and preserves explicit zero and false', async () => {
  const character = await getCharacter('kaeya');
  const damage: DamageRequest = { hit: characterHitRef(character, character.talents[0].hits[0].id), crit: 'critical', reaction: 'none' };
  const subject = { kind: 'actor', id: 'owner' } as const;
  const fields: CalculatorFactField[] = [{ key: 'hpRatio', type: { kind: 'quantity', unit: 'scalar' }, subject },
    { key: 'onField', type: { kind: 'boolean' }, subject }];
  const inputs = fields.map(({ key, type }) => ({ key, type, scope: 'owner', requiredBy: ['hit'], sourceRefs: [] }));
  const resolve = () => missingCalculatorPresets(damage.facts, fields, inputs, 'owner');
  expect(resolve().map(setting => setting.value.value)).toEqual([1, true]);
  expect(missingCalculatorPresets(undefined, fields, inputs.map(input => ({ ...input, scope: 'peer' })), 'owner')).toEqual([]);
  for (const preset of resolve()) setCalculatorFact(damage, preset, 'owner');
  expect(resolve()).toEqual([]);
  setCalculatorFact(damage, { ...fields[0], value: { kind: 'quantity', unit: 'scalar', value: 0 } }, 'owner');
  setCalculatorFact(damage, { ...fields[1], value: { kind: 'boolean', value: false } }, 'owner');
  expect(resolve()).toEqual([]);
});

it('guards calculator copy in the page and its imported Vue components, including conditional dialogs', () => {
  const visited = new Set<string>();
  function check(component: URL) {
    if (visited.has(component.href)) return;
    visited.add(component.href);
    const source = readFileSync(component, 'utf8');
    expect(source.match(/待核实|待核验|待确认|需补充条件/), component.pathname).toBeNull();
    for (const match of source.matchAll(/from ['"](\.[^'"]+\.vue)['"]/g)) check(new URL(match[1], component));
  }
  check(new URL('../../../../src/web/src/pages/DamageCalculator.vue', import.meta.url));
  expect([...visited].some(url => url.endsWith('/CalculatorBuffPicker.vue'))).toBe(true);
});

it('presents current catalog evidence and older calculator notes without pending-status placeholders', () => {
  const forbidden = /待核实|待核验|待确认|需补充条件/;
  const notes = library.coverage.flatMap(record => [record.reason, ...record.mechanisms.map(mechanism => mechanism.reason)]);
  for (const note of new Set(notes)) expect(calculatorSupportText(note)).not.toMatch(forbidden);
  for (const wording of ['待核实', '待核验', '待确认']) {
    expect(calculatorSupportText('伤害元素' + wording)).toBe('伤害元素尚无验证结论');
  }
  expect(calculatorSupportText('需补充条件')).not.toMatch(forbidden);
});

it('excludes non-damage modifiers while keeping damage-relevant modifiers in isCalculatorDamageModifier', () => {
  const excludedTargets = [
    'attribute.equipmentHealing',
    'attribute.equipmentBaseHealingTotal',
    'attribute.equipmentBaseHealingTick',
    'attribute.incomingHealingBonus',
    'attribute.saurianBaseHealing',
    'attribute.talentHealingChance',
    'attribute.bondOfLifeFromHealing',
    'attribute.directEnergyRestored',
    'attribute.directEnergyChange',
    'attribute.particleEnergyRecharge',
    'attribute.shieldStrength',
    'attribute.shieldAbsorption',
    'attribute.shieldAbsorptionCap',
    'attribute.shieldAbsorptionAdded',
    'attribute.effectiveShieldAbsorption',
    'attribute.elementalSkillCooldownReduction',
    'attribute.elementalSkillCooldownReductionMs',
    'attribute.elementalBurstCooldownReductionMs',
    'attribute.currentCastSkillCooldownReduction',
    'attribute.currentCastBurstCooldownReduction',
    'attribute.currentCastSkillCooldownReductionMs',
    'attribute.confirmedSkillCooldownResetMs',
    'attribute.confirmedSkillChargesRestored',
    'attribute.northernSpearArrayBaseCooldownOverrideMs',
    'attribute.passionOverloadCooldownAfterPassivesMs',
    'attribute.forwardGrappleCooldownReduction',
    'attribute.spiritEnvoyFormCooldownReduction',
    'attribute.xenochromaticFontemerAbilityCooldownReduction',
    'attribute.nightsoulTransmissionCooldownReduction',
    'attribute.aimChargeInstant',
    'attribute.aimChargeTimeReductionRatio',
    'attribute.aimChargeTimeReductionMs',
    'attribute.aimChargeTimeReductionPerEnergy',
    'attribute.normalAttackSpeed',
    'attribute.chargedAttackSpeed',
    'attribute.movementSpeed',
    'attribute.glideSpeed',
    'attribute.staminaRestored',
    'attribute.staminaCostReduction',
    'attribute.staminaCostReduction.charged',
    'attribute.staminaCostReduction.climb',
    'attribute.staminaCostReduction.glide',
    'attribute.staminaCostReduction.swim',
    'attribute.chargedAttackStaminaCost',
    'attribute.sprintStartStaminaCostAdded',
    'attribute.sprintSustainStaminaCostAdded',
    'attribute.actorEndureDelta',
    'attribute.incomingPoiseDamageMultiplier',
    'attribute.attackRangeBonus',
    'attribute.impactRangeBonus',
    'attribute.flameReachBonus',
    'attribute.reaction.electro-charged.rangeBonus',
    'target.attackReduction',
    'attribute.incomingDamageReduction',
    'attribute.fallDamageReduction',
    'attribute.summonInitialHp',
    'attribute.auraDurationReduction.pyro',
    'attribute.foodPhlogistonRestored',
  ];
  for (const target of excludedTargets) {
    expect(isCalculatorDamageModifier(target), target).toBe(false);
  }
  expect(isCalculatorDamageModifier('attribute.attackPercent', { scope: 'exploration' })).toBe(false);
  expect(isCalculatorDamageModifier('attribute.damageBonus', { scope: 'exploration' })).toBe(false);

  const keptTargets = [
    'attribute.energyRecharge',
    'attribute.healingBonus',
    'target.ordinaryDamageReduction',
    'target.defenseReduction',
    'target.resistance.pyro',
    'target.resistance.cryo',
    'target.resistance.physical',
    'attribute.hp',
    'attribute.flatHp',
    'attribute.hpPercent',
    'attribute.whiteHp',
    'attribute.attack',
    'attribute.flatAttack',
    'attribute.attackPercent',
    'attribute.whiteAttack',
    'attribute.defense',
    'attribute.flatDefense',
    'attribute.defensePercent',
    'attribute.whiteDefense',
    'attribute.critRate',
    'attribute.critDamage',
    'attribute.elementalMastery',
    'attribute.damageBonus',
    'attribute.physicalBonus',
    'attribute.pyroBonus',
    'attribute.baseDamageBonus',
    'base-flat',
    'attribute.baseMultiplier',
    'attribute.elevationFactor',
    'attribute.defenseIgnore',
    'attribute.amplifyingReactionBonus',
    'attribute.additiveReactionBonus',
    'attribute.reaction.vaporize.damageBonus',
    'attribute.reaction.swirl.damageBonus',
    'attribute.reaction.lunar.damageBonus',
    'attribute.reaction.lunar.flatBaseBonus',
    'attribute.reaction.lunar-charged.elevationFactor',
    'attribute.reaction.stellar-swirl.baseMultiplier',
    'attribute.reaction.stellar-swirl.baseBonus',
    'attribute.reaction.stellar-swirl.damageBonus',
    'attribute.reaction.stellar-swirl.elevation',
    'attribute.reaction.transformative.critRate',
    'attribute.reaction.transformative.critDamage',
  ];
  for (const target of keptTargets) {
    expect(isCalculatorDamageModifier(target), target).toBe(true);
  }
});

it('applies default-on and default-off buff policies consistently in resolveBuffSelection and prepareCalculatorEvaluationProject', async () => {
  const [artifactMain, sources, gladiators] = await Promise.all([
    getArtifactMain(), getBuildSources(), getArtifactSet('gladiatorsfinale'),
  ]);
  const makeBuild = async (characterId: string, weaponId: string, constellation = 0, sets: Build['sets'] = [], pieces = 0): Promise<Build> => {
    const [character, weapon] = await Promise.all([getCharacter(characterId), getWeapon(weaponId)]);
    return {
      ...sources, schemaVersion: character.schemaVersion, dataVersion: character.dataVersion,
      kind: 'calculation-build', character, weapon, artifactMain,
      level: 90, ascension: 6, weaponLevel: weapon.rarity >= 3 ? 90 : 70, weaponAscension: weapon.rarity >= 3 ? 6 : 4, constellation, refinement: 1,
      talents: { normal: 10, skill: 10, burst: 10 }, artifacts: [], sets,
      ...(sets.length && pieces ? { theoreticalSetSlots: sets[0].slots.slice(0, pieces).map(slot => ({ slot, setId: sets[0].id })) } : {}),
    };
  };

  // 1. Permanent unconditional damage buffs (character A4 & 2pc set) -> default ON.
  {
    const build = await makeBuild('xingqiu', 'dullblade', 0, [gladiators], 2);
    const doc = createDamageCalculation(build, { hit: characterHitRef(build.character, 'xingqiu.skill.param1'), crit: 'critical', reaction: 'none' }, defaultEnemy());
    const prepared = prepareCalculatorEvaluationProject(doc.project, doc.actorId, doc.recordId!);
    const choices = calculatorBuffChoices(prepared, doc.actorId, prepared.timeline[0].damage!, 0, doc.recordId);
    expect(choices.find(c => c.effect.id === 'xingqiu.static-hydroBonus')?.checked).toBe(true);
    expect(choices.find(c => c.effect.id === 'gladiatorsfinale.static-attackPercent')?.checked).toBe(true);
  }

  // 2. Hit-premise buff -> default ON when hit satisfies premise, OFF when premise is false.
  {
    const build = await makeBuild('aloy', 'huntersbow', 0);
    const iceDoc = createDamageCalculation(build, { hit: characterHitRef(build.character, 'aloy.normal.ice-1'), crit: 'critical', reaction: 'none' }, defaultEnemy());
    const preparedIce = prepareCalculatorEvaluationProject(iceDoc.project, iceDoc.actorId, iceDoc.recordId!);
    const iceChoices = calculatorBuffChoices(preparedIce, iceDoc.actorId, preparedIce.timeline[0].damage!, 0, iceDoc.recordId);
    expect(iceChoices.find(c => c.effect.id === 'aloy.rushing-ice-bonus')).toMatchObject({ hitSatisfied: true, checked: true });

    const cryoSkillDoc = createDamageCalculation(build, { hit: characterHitRef(build.character, 'aloy.skill.param1'), crit: 'critical', reaction: 'none' }, defaultEnemy());
    const preparedSkill = prepareCalculatorEvaluationProject(cryoSkillDoc.project, cryoSkillDoc.actorId, cryoSkillDoc.recordId!);
    const skillChoices = calculatorBuffChoices(preparedSkill, cryoSkillDoc.actorId, preparedSkill.timeline[0].damage!, 0, cryoSkillDoc.recordId);
    expect(skillChoices.find(c => c.effect.id === 'aloy.rushing-ice-bonus')).toMatchObject({ hitSatisfied: false, checked: false });
  }

  // 3. Guaranteed-on-cast self buff -> ON for matching skill hit; OFF for other-skill hit.
  {
    const build = await makeBuild('arlecchino', 'beginnersprotector', 6);
    const burstDoc = createDamageCalculation(build, { hit: characterHitRef(build.character, 'arlecchino.burst.param1'), crit: 'critical', reaction: 'none' }, defaultEnemy());
    const preparedBurst = prepareCalculatorEvaluationProject(burstDoc.project, burstDoc.actorId, burstDoc.recordId!);
    const burstChoices = calculatorBuffChoices(preparedBurst, burstDoc.actorId, preparedBurst.timeline[0].damage!, 0, burstDoc.recordId);
    expect(burstChoices.find(c => c.effect.id === 'arlecchino.c6.burst-crit')?.checked).toBe(true);
    expect(preparedBurst.timeline.some(record => record.kind === 'action' && record.skillId === 'arlecchino.burst')).toBe(true);

    const normalDoc = createDamageCalculation(build, { hit: characterHitRef(build.character, 'arlecchino.normal.param1'), crit: 'critical', reaction: 'none' }, defaultEnemy());
    const preparedNormal = prepareCalculatorEvaluationProject(normalDoc.project, normalDoc.actorId, normalDoc.recordId!);
    const normalChoices = calculatorBuffChoices(preparedNormal, normalDoc.actorId, preparedNormal.timeline[0].damage!, 0, normalDoc.recordId);
    expect(normalChoices.find(c => c.effect.id === 'arlecchino.c6.burst-crit')?.checked).toBe(false);
    expect(preparedNormal.timeline.some(record => record.kind === 'action' && record.skillId === 'arlecchino.burst')).toBe(false);
  }

  // 4. Conditional, HP threshold, stack, explicit, and teammate buffs -> default OFF.
  {
    const [kaeyaCool, kaeyaHarbinger, kaeyaBlackcliff, yunjinBuild, bennettBuild] = await Promise.all([
      makeBuild('kaeya', 'coolsteel', 0),
      makeBuild('kaeya', 'harbingerofdawn', 0),
      makeBuild('kaeya', 'blackclifflongsword', 0),
      makeBuild('yunjin', 'beginnersprotector', 2),
      makeBuild('bennett', 'dullblade', 1, [await getArtifactSet('noblesseoblige')], 4),
    ]);

    for (const [build, hitId, effectId] of [
      [kaeyaCool, 'kaeya.normal.param1', 'coolsteel.targetBonus'],
      [kaeyaHarbinger, 'kaeya.normal.param1', 'harbingerofdawn.static-critRate'],
      [kaeyaBlackcliff, 'kaeya.normal.param1', 'blackclifflongsword.defeat'],
      [yunjinBuild, 'yunjin.normal.param1', 'yunjin.flying-cloud-base.base'],
      [yunjinBuild, 'yunjin.normal.param1', 'yunjin.c2-cast'],
    ] as const) {
      const doc = createDamageCalculation(build, { hit: characterHitRef(build.character, hitId), crit: 'critical', reaction: 'none' }, defaultEnemy());
      const initialDamage = doc.project.timeline[0].damage!;
      const initialChoices = calculatorBuffChoices(doc.project, doc.actorId, initialDamage, 0, doc.recordId);
      const initialTarget = initialChoices.find(c => c.effect.id === effectId);
      expect(initialTarget?.checked, effectId).toBe(false);
      const resolved = resolveBuffSelection(initialChoices, initialDamage, calculatorIntervals(doc.project, doc.actorId, 0, doc.recordId), doc.actorId, new Map());
      if (initialTarget?.explicit && !initialTarget.triggerSkill && !initialTarget.confirmTrigger) {
        expect(resolved.get(initialTarget.id), effectId).toBe(false);
      }

      const prepared = prepareCalculatorEvaluationProject(doc.project, doc.actorId, doc.recordId!);
      const hitRecord = prepared.timeline.find(record => record.id === doc.recordId)!;
      const choices = calculatorBuffChoices(prepared, doc.actorId, hitRecord.damage!, 0, doc.recordId);
      const targetChoice = choices.find(c => c.effect.id === effectId);
      expect(targetChoice?.checked, effectId).toBe(false);
      if (targetChoice?.explicit && !targetChoice.triggerSkill && !targetChoice.confirmTrigger) {
        expect(hitRecord.damage!.effectApplications?.find(entry => entry.instanceId === targetChoice.id)?.active, effectId).toBe(false);
      }
    }

    // Teammate buffs must default OFF when another party member is the active hit owner.
    const teamProject = createEmptyProject();
    teamProject.enemy = defaultEnemy();
    const dealerId = addActorFromBuild(teamProject, kaeyaCool);
    const supporterId = addActorFromBuild(teamProject, bennettBuild);
    const yunjinId = addActorFromBuild(teamProject, yunjinBuild);
    const hitId = addSkillHit(teamProject, dealerId, 'kaeya.normal', 0, 0, { crit: 'critical', reaction: 'none' });
    const preparedTeam = prepareCalculatorEvaluationProject(teamProject, dealerId, hitId);
    const teamChoices = calculatorBuffChoices(preparedTeam, dealerId, preparedTeam.timeline.find(r => r.id === hitId)!.damage!, 0, hitId);
    const teammateBuffs = teamChoices.filter(c => c.ownerId === supporterId || c.ownerId === yunjinId);
    expect(teammateBuffs.length).toBeGreaterThan(0);
    for (const buff of teammateBuffs) {
      expect(buff.teammate, buff.effect.id).toBe(true);
      expect(buff.checked, buff.effect.id).toBe(false);
    }
  }
});

it('evaluates representative and special-mechanism hits across all 154 characters without nulls, critical errors, or non-damage modifiers', async () => {
  const inventory = catalogInventory();
  expect(inventory.characters).toHaveLength(154);

  const [artifactMain, sources] = await Promise.all([getArtifactMain(), getBuildSources()]);
  const noviceByType = new Map<WeaponDefinition['weaponType'], WeaponDefinition>();
  for (const weaponId of ['dullblade', 'wastergreatsword', 'huntersbow', 'apprenticesnotes', 'beginnersprotector']) {
    const weapon = await getWeapon(weaponId);
    noviceByType.set(weapon.weaponType, weapon);
  }
  const enemy = defaultEnemy();
  const forbiddenCodes = new Set(['unknown', 'stale-revision', 'invalid-input']);
  const c0RepresentativeIds = new Set([
    'amber', 'kaeya', 'lisa', 'barbara', 'noelle', 'xiangling', 'xingqiu', 'bennett', 'beidou',
    'aether-anemo', 'lumine-anemo', 'nicole', 'vesna',
  ]);
  const failures: string[] = [];

  for (const characterId of inventory.characters) {
    const character = await getCharacter(characterId);
    const weapon = noviceByType.get(character.identity.weaponType)!;
    const isSpecialHit = (build: Build, choice: ReturnType<typeof calculatorHitChoices>[number]) => {
      const found = findBuildHit(build, choice.ref);
      const hit = found?.hit;
      const talent = found?.talent;
      const authored = authoredHit(character.metadata, talent?.id, hit?.id);
      const special = Boolean(
        hit?.snapshot || hit?.coordinated || hit?.elementBy || hit?.infusion
        || typeof authored?.family === 'object' || authored?.when?.length
        || talent?.inputs?.some(input => input.usage !== 'healing'),
      );
      const differsByConstellation = Boolean(
        hit?.infusion?.minConstellation
        || authored?.when?.some(term => JSON.stringify(term).includes('constellation'))
        || talent?.inputs?.some(input => input.usage !== 'healing' && JSON.stringify(input).includes('constellation')),
      );
      return { special, differsByConstellation };
    };

    const c0AvailableIds = new Set<string>();
    for (const constellation of [0, 6] as const) {
      const build: Build = {
        ...sources, schemaVersion: character.schemaVersion, dataVersion: character.dataVersion,
        kind: 'calculation-build', character, weapon, artifactMain,
        level: 90, ascension: 6, weaponLevel: 70, weaponAscension: 4,
        constellation, refinement: 1, talents: { normal: 10, skill: 10, burst: 10 },
        artifacts: [], sets: [],
      };
      const availableHits = calculatorHitChoices(character, build).filter(choice => choice.available);
      if (!availableHits.length) {
        failures.push(`${characterId}@C${constellation}: no available selectable hits`);
        continue;
      }
      if (constellation === 0) {
        for (const choice of availableHits) c0AvailableIds.add(choice.hitId);
      }
      const classified = availableHits.map(choice => ({ choice, ...isSpecialHit(build, choice) }));
      const selectedHits = constellation === 6
        ? (() => {
            const picked = classified
              .filter(row => row.special || !c0AvailableIds.has(row.choice.hitId))
              .map(row => row.choice);
            const nonSpecial = classified.find(row => !row.special && c0AvailableIds.has(row.choice.hitId))?.choice
              ?? classified.find(row => !row.special)?.choice;
            if (nonSpecial && !picked.includes(nonSpecial)) picked.push(nonSpecial);
            return picked;
          })()
        : (() => {
            const specialDiffs = classified.filter(row => row.special && row.differsByConstellation).map(row => row.choice);
            const hasAnySpecial = classified.some(row => row.special);
            if (!hasAnySpecial || c0RepresentativeIds.has(characterId)) {
              const rep = classified.find(row => !row.special)?.choice ?? availableHits[0];
              if (!specialDiffs.includes(rep)) specialDiffs.push(rep);
            }
            return specialDiffs;
          })();
      if (!selectedHits.length) continue;

      const baseProject = createEmptyProject();
      baseProject.enemy = enemy;
      const actorId = addActorFromBuild(baseProject, build);
      const recordId = 'calc-hit-0';
      for (const hitChoice of selectedHits) {
        baseProject.timeline = [{
          id: recordId, actor: actorId, timeMs: 0, order: 0, kind: 'damage',
          definition: `${actorId}-real-damage`,
          damage: { hit: hitChoice.ref, crit: 'critical', reaction: 'none' },
        }];
        const prepared = prepareCalculatorEvaluationProject(baseProject, actorId, recordId);
        const choices = calculatorBuffChoices(prepared, actorId, prepared.timeline.find(r => r.id === recordId)!.damage!, 0, recordId);
        for (const buff of choices) {
          for (const mod of buff.modifiers) {
            if (!isCalculatorDamageModifier(mod.target)) {
              failures.push(`${characterId}@C${constellation}/${hitChoice.hitId}: non-damage modifier ${buff.effect.id} -> ${mod.target}`);
            }
          }
        }
        for (const critMode of ['critical', 'expected'] as const) {
          const variant = calculatorCritProject(prepared, recordId, critMode);
          const evaluated = evaluateTimeline(variant);
          const badDiagnostics = evaluated.diagnostics.filter(d =>
            forbiddenCodes.has(d.code)
            && (!d.path.startsWith('timeline.') || d.path === 'timeline.' + recordId || d.path.startsWith('timeline.' + recordId + '.')),
          );
          if (badDiagnostics.length) {
            failures.push(`${characterId}@C${constellation}/${hitChoice.hitId}[${critMode}]: diagnostics=${JSON.stringify(badDiagnostics)}`);
          }
          const point = evaluated.points.find(p => p.id === recordId);
          if (point?.value == null || !Number.isFinite(point.value)) {
            failures.push(`${characterId}@C${constellation}/${hitChoice.hitId}[${critMode}]: value=${String(point?.value)} issues=${JSON.stringify(point?.real?.issues ?? [])}`);
          }
          const badIssues = (point?.real?.issues ?? []).filter(issue => issue.code === 'unknown' || issue.code === 'invalid-input');
          if (badIssues.length) {
            failures.push(`${characterId}@C${constellation}/${hitChoice.hitId}[${critMode}]: issues=${JSON.stringify(badIssues)}`);
          }
        }
      }
    }
  }
  expect(failures).toEqual([]);
}, 180000);
