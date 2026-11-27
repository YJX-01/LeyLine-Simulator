import { calculationEffectInstanceId, evaluateTimeline } from '@leyline/engine';
import { getArtifactMain, getArtifactSet, getBuildSources, getCharacter, getWeapon } from '@leyline/game-data';
import type { ArtifactSetDefinition, Build } from '@leyline/schema';
import { expect, it } from 'vitest';
import { calculatorBuffChoices, type CalculatorBuff } from '../../../../src/web/src/domain/calculator-buffs';
import { healingBonusFactFields, setCalculatorFact } from '../../../../src/web/src/domain/calculator-conditions';
import { calculatorBuffValues } from '../../../../src/web/src/domain/calculator-factors';
import { addActorFromBuild, addSkillHit, defaultEnemy } from '../../../../src/web/src/domain/real-project';
import { createEmptyProject } from '../../../../src/web/src/domain/workbench-project';

async function candidate(characterId: string, weaponId: string, refinement: number, set?: ArtifactSetDefinition, pieces = 0): Promise<Build> {
  const [character, weapon, artifactMain, sources] = await Promise.all([
    getCharacter(characterId), getWeapon(weaponId), getArtifactMain(), getBuildSources(),
  ]);
  return { ...sources, schemaVersion: character.schemaVersion, dataVersion: character.dataVersion, kind: 'calculation-build', character, weapon, artifactMain,
    level: 1, ascension: 0, weaponLevel: 1, weaponAscension: 0, constellation: 0, refinement, talents: { normal: 1, skill: 1, burst: 1 },
    artifacts: [], sets: set ? [set] : [], theoreticalSetSlots: set?.slots.slice(0, pieces).map(slot => ({ slot, setId: set.id })) };
}

function explicitReadout(instanceId: string, source: string, name: string, effectId: string, targets: readonly string[]): CalculatorBuff {
  return {
    id: instanceId,
    ownerId: 'owner',
    effect: { namespace: 'builtin', id: effectId, revision: '1' },
    source,
    name,
    description: '',
    target: targets[0],
    modifiers: targets.map((target, index) => ({ id: index ? `${effectId}.${index}` : effectId, target })),
    icon: { kind: 'weapons', id: effectId.split('.')[0] },
    checked: true,
    explicit: true,
    requirements: [],
    fields: [],
    disabled: false,
  };
}

it('excludes Prototype Amber recovery from calculatorBuffChoices while computing recipient healing and owner energy in the engine', async () => {
  const [maiden, doctor] = await Promise.all([getArtifactSet('maidenbeloved'), getArtifactSet('travelingdoctor')]);
  const project = createEmptyProject();
  project.enemy = defaultEnemy();
  const owner = addActorFromBuild(project, await candidate('lisa', 'prototypeamber', 3, maiden, 2));
  const peer = addActorFromBuild(project, await candidate('barbara', 'apprenticesnotes', 1, doctor, 2));
  const healing = '丽莎 / 试作金珀 · 本次装备治疗量';
  const energy = '丽莎 / 试作金珀 · 本次直接恢复的元素能量';
  const display = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 6 });
  const instanceId = calculationEffectInstanceId(owner, { namespace: 'builtin', id: 'prototypeamber.recovery', revision: '1' }, null);

  for (const [actor, skill, rawHealing, targets] of [
    // Level-one HP and weapon HP% are from the fixed genshin-db character and weapon captures.
    [owner, 'lisa.normal', 802.3761 * 1.09 * 0.05 * 1.15, ['attribute.equipmentHealing', 'attribute.directEnergyRestored']],
    [peer, 'barbara.normal', 820.6119 * 0.05 * 1.35, ['attribute.equipmentHealing']],
  ] as const) {
    const expected = display(rawHealing);
    const hit = addSkillHit(project, actor, skill, 0, 1000, { crit: 'noncritical', reaction: 'none' });
    const record = project.timeline.find(entry => entry.id === hit)!;
    const request = record.damage!;
    const choices = calculatorBuffChoices(project, actor, request, 1000, hit);
    expect(choices.some(entry => entry.effect.id === 'prototypeamber.recovery')).toBe(false);

    const readout = explicitReadout(instanceId, '丽莎', '试作金珀', 'prototypeamber.recovery', targets);
    const output = (input: typeof project) => evaluateTimeline(input).points.find(point => point.id === hit)!.real!;
    expect(calculatorBuffValues(output(project), [readout])).toContainEqual([healing, '—']);

    setCalculatorFact(request, { key: 'prototypeamber.recoveryTick', subject: { kind: 'actor', id: owner }, value: { kind: 'boolean', value: true } }, owner);
    request.effectApplications = [{ instanceId, active: true }];
    const applied = output(project);
    expect(applied.panel.effectValues?.find(entry => entry.instanceId === instanceId && entry.modifierId === 'prototypeamber.recovery')?.value)
      .toBeCloseTo(rawHealing, 8);
    if (actor === owner) {
      expect(applied.panel.effectValues?.find(entry => entry.instanceId === instanceId && entry.modifierId === 'prototypeamber.recovery.1')?.value)
        .toBe(5);
    }
    expect(calculatorBuffValues(applied, [readout])).toEqual(actor === owner ? [[healing, expected], [energy, '5']] : [[healing, expected]]);

    request.effectApplications = [{ instanceId, active: false }];
    expect(calculatorBuffValues(output(project), [readout])).toEqual([]);
  }
});

it('excludes Traveling Doctor and Adventurer healing effects from calculatorBuffChoices while retaining Adventurer HP and 4pc engine healing', async () => {
  const [doctor, adventurer] = await Promise.all([getArtifactSet('travelingdoctor'), getArtifactSet('adventurer')]);
  const project = createEmptyProject();
  project.enemy = defaultEnemy();
  for (const [set, pieces] of [[doctor, 3], [doctor, 4], [adventurer, 3], [adventurer, 4]] as const) {
    const actor = addActorFromBuild(project, await candidate('jean', 'dullblade', 1, set, pieces));
    const hit = addSkillHit(project, actor, 'jean.normal', 0, 1000, { crit: 'noncritical', reaction: 'none' });
    const record = project.timeline.find(entry => entry.id === hit)!;
    const choices = calculatorBuffChoices(project, actor, record.damage!, 1000, hit);
    expect(choices.some(choice => choice.effect.id === 'travelingdoctor.burst-healing')).toBe(false);
    expect(choices.some(choice => choice.effect.id === 'adventurer.full-recovery')).toBe(false);
    expect(choices.some(choice => choice.effect.id === 'adventurer.recovery-tick')).toBe(false);
    if (set === adventurer) {
      expect(choices.some(choice => choice.effect.id === 'adventurer.hp')).toBe(true);
      const fullId = calculationEffectInstanceId(actor, { namespace: 'builtin', id: 'adventurer.full-recovery', revision: '1' }, null);
      const tickId = calculationEffectInstanceId(actor, { namespace: 'builtin', id: 'adventurer.recovery-tick', revision: '1' }, null);
      setCalculatorFact(record.damage!, { key: 'adventurer.fullRecovery', subject: { kind: 'actor', id: actor }, value: { kind: 'boolean', value: true } }, actor);
      setCalculatorFact(record.damage!, { key: 'adventurer.recoveryTick', subject: { kind: 'actor', id: actor }, value: { kind: 'boolean', value: true } }, actor);
      if (pieces === 4) {
        record.damage!.effectApplications = [{ instanceId: fullId, active: true }, { instanceId: tickId, active: true }];
      }
      const effectValues = evaluateTimeline(project).points.find(point => point.id === hit)!.real!.panel.effectValues ?? [];
      if (pieces === 4) {
        expect(effectValues.find(entry => entry.instanceId === fullId)?.value).toBeCloseTo((1143.984 + 1000) * 0.3, 6);
        expect(effectValues.find(entry => entry.instanceId === tickId)?.value).toBeCloseTo((1143.984 + 1000) * 0.06, 6);
      } else {
        expect(effectValues.some(entry => entry.instanceId === fullId || entry.instanceId === tickId)).toBe(false);
      }
    } else {
      const burstId = calculationEffectInstanceId(actor, { namespace: 'builtin', id: 'travelingdoctor.burst-healing', revision: '1' }, null);
      setCalculatorFact(record.damage!, { key: 'travelingdoctor.burstHealing', subject: { kind: 'actor', id: actor }, value: { kind: 'boolean', value: true } }, actor);
      if (pieces === 4) {
        record.damage!.effectApplications = [{ instanceId: burstId, active: true }];
      }
      const effectValues = evaluateTimeline(project).points.find(point => point.id === hit)!.real!.panel.effectValues ?? [];
      if (pieces === 4) {
        expect(effectValues.find(entry => entry.instanceId === burstId)?.value).toBeCloseTo(1143.984 * 0.2 * 1.2, 6);
      } else {
        expect(effectValues.some(entry => entry.instanceId === burstId)).toBe(false);
      }
    }
  }
});

it('excludes the cursed sword self-heal from calculatorBuffChoices while computing its engine healing for supported variants', async () => {
  for (const [weapon, attackPercent] of [['prizedisshinblade', .09], ['prizedisshinblade-01', null], ['prizedisshinblade-02', .045]] as const) {
    const project = createEmptyProject();
    project.enemy = defaultEnemy();
    const owner = addActorFromBuild(project, await candidate('kaeya', weapon, 1));
    const hit = addSkillHit(project, owner, 'kaeya.normal', 0, 1000, { crit: 'noncritical', reaction: 'none' });
    const request = project.timeline.find(record => record.id === hit)!.damage!;
    const choices = calculatorBuffChoices(project, owner, request, 1000, hit);
    expect(choices.some(entry => entry.effect.id === weapon + '.curse-healing')).toBe(false);
    expect(choices.some(entry => entry.effect.id === weapon + '.damage-penalty')).toBe(true);

    const instanceId = calculationEffectInstanceId(owner, { namespace: 'builtin', id: weapon + '.curse-healing', revision: '1' }, null);
    if (attackPercent === null) {
      const effectValues = evaluateTimeline(project).points.find(point => point.id === hit)!.real!.panel.effectValues ?? [];
      expect(effectValues.some(entry => entry.instanceId === instanceId)).toBe(false);
      continue;
    }
    setCalculatorFact(request, { key: weapon + '.curseTriggered', subject: { kind: 'event' }, value: { kind: 'boolean', value: true } }, owner);
    request.effectApplications = [{ instanceId, active: true }];
    const result = evaluateTimeline(project).points.find(point => point.id === hit)!.real!;
    const rawHealing = (18.6984 + 42.401) * (1 + attackPercent);
    const healing = rawHealing.toLocaleString('zh-CN', { maximumFractionDigits: 6 });
    expect(result.panel.effectValues?.find(entry => entry.instanceId === instanceId)?.value).toBeCloseTo(rawHealing, 8);
    const readout = explicitReadout(instanceId, '凯亚', '「一心传」名刀', weapon + '.curse-healing', ['attribute.equipmentHealing']);
    expect(calculatorBuffValues(result, [readout])).toEqual([['凯亚 / 「一心传」名刀 · 本次装备治疗量', healing]]);
  }
});

it('scopes healing panel inputs to the relevant build and its unlocked modifiers', async () => {
  const shinobu = await candidate('kukishinobu', 'ironsting', 1);
  const vodyanitsa = await candidate('vodyanitsa', 'apprenticesnotes', 1);
  const project = createEmptyProject();
  const kuki = addActorFromBuild(project, { ...shinobu, level: 20, ascension: 1 });
  const vody = addActorFromBuild(project, { ...vodyanitsa, constellation: 4 });
  expect(healingBonusFactFields(project.candidate.actors, kuki, vody)).toContainEqual(expect.objectContaining({
    key: 'hpRatio', subject: { kind: 'actor', id: kuki },
  }));
  expect(healingBonusFactFields(project.candidate.actors, vody, kuki, 'hp')).toContainEqual(expect.objectContaining({
    key: 'vodyanitsa.c4HealthStacks', max: 3, subject: { kind: 'actor', id: vody },
  }));
  expect(healingBonusFactFields(project.candidate.actors, vody, kuki)).toEqual([]);
});
