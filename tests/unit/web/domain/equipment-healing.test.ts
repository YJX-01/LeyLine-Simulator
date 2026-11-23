import { evaluateTimeline } from '@leyline/engine';
import { getArtifactMain, getArtifactSet, getBuildSources, getCharacter, getWeapon } from '@leyline/game-data';
import type { ArtifactSetDefinition, Build } from '@leyline/schema';
import { expect, it } from 'vitest';
import { applyCalculatorBuffs, calculatorBuffChoices } from '../../../../src/web/src/domain/calculator-buffs';
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

it('shows Prototype Amber healing per recipient and keeps the owner energy value separate', async () => {
  const [maiden, doctor] = await Promise.all([getArtifactSet('maidenbeloved'), getArtifactSet('travelingdoctor')]);
  const project = createEmptyProject();
  project.enemy = defaultEnemy();
  const owner = addActorFromBuild(project, await candidate('lisa', 'prototypeamber', 3, maiden, 2));
  const peer = addActorFromBuild(project, await candidate('barbara', 'apprenticesnotes', 1, doctor, 2));
  const healing = '丽莎 / 试作金珀 · 本次装备治疗量';
  const energy = '丽莎 / 试作金珀 · 本次直接恢复的元素能量';
  const display = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 6 });
  for (const [actor, skill, expected, targets] of [
    // Level-one HP and weapon HP% are from the fixed genshin-db character and weapon captures.
    [owner, 'lisa.normal', display(802.3761 * 1.09 * 0.05 * 1.15), ['attribute.equipmentHealing', 'attribute.directEnergyRestored']],
    [peer, 'barbara.normal', display(820.6119 * 0.05 * 1.35), ['attribute.equipmentHealing']],
  ] as const) {
    const hit = addSkillHit(project, actor, skill, 0, 1000, { crit: 'noncritical', reaction: 'none' });
    const request = project.timeline.find(record => record.id === hit)!.damage!;
    const choices = calculatorBuffChoices(project, actor, request, 1000, hit);
    const choice = choices.find(entry => entry.effect.id === 'prototypeamber.recovery')!;
    expect(choice).toMatchObject({ checked: false, ownerId: owner, explicit: true, toggleFact: 'prototypeamber.recoveryTick' });
    expect(choice.modifiers.map(modifier => modifier.target)).toEqual(targets);
    expect(choice.fields[0].label).toBe('试作金珀本次周期回复已触发');
    const output = (input: typeof project) => evaluateTimeline(input).points.find(point => point.id === hit)!.real!;
    expect(calculatorBuffValues(output(project), [choice])).toContainEqual([healing, '—']);
    for (const setting of choice.requirements) setCalculatorFact(request, setting, choice.ownerId);
    const applied = applyCalculatorBuffs(project, request, choices, new Map([[choice.id, true]]), 1000, hit);
    applied.project.timeline.find(record => record.id === hit)!.damage = { ...request, effectApplications: applied.applications };
    const values = calculatorBuffValues(output(applied.project), [choice]);
    expect(values).toEqual(actor === owner ? [[healing, expected], [energy, '5']] : [[healing, expected]]);
    const excluded = applyCalculatorBuffs(project, request, choices, new Map([[choice.id, false]]), 1000, hit);
    excluded.project.timeline.find(record => record.id === hit)!.damage = { ...request, effectApplications: excluded.applications };
    expect(calculatorBuffValues(output(excluded.project), [choice])).toEqual([]);
    expect(applied.project.timeline.length).toBe(project.timeline.length);
  }
});

it('offers Traveling Doctor healing only with four pieces and keeps the Adventurer bonus at its verified threshold', async () => {
  const [doctor, adventurer] = await Promise.all([getArtifactSet('travelingdoctor'), getArtifactSet('adventurer')]);
  const project = createEmptyProject();
  project.enemy = defaultEnemy();
  for (const [set, pieces] of [[doctor, 3], [doctor, 4], [adventurer, 3], [adventurer, 4]] as const) {
    const actor = addActorFromBuild(project, await candidate('jean', 'dullblade', 1, set, pieces));
    const hit = addSkillHit(project, actor, 'jean.normal', 0, 1000, { crit: 'noncritical', reaction: 'none' });
    const record = project.timeline.find(entry => entry.id === hit)!;
    const choices = calculatorBuffChoices(project, actor, record.damage!, 1000, hit);
    expect(choices.some(choice => choice.effect.id === 'travelingdoctor.burst-healing')).toBe(set === doctor && pieces === 4);
    if (set === adventurer) {
      expect(choices.some(choice => choice.effect.id === 'adventurer.hp')).toBe(true);
      expect(choices.some(choice => choice.effect.id === 'adventurer.full-recovery')).toBe(pieces === 4);
      expect(choices.some(choice => choice.effect.id === 'adventurer.recovery-tick')).toBe(pieces === 4);
    }
  }
});

it('offers the cursed sword self-heal for the two supported weapon variants', async () => {
  for (const [weapon, attackPercent] of [['prizedisshinblade', .09], ['prizedisshinblade-01', null], ['prizedisshinblade-02', .045]] as const) {
    const project = createEmptyProject();
    project.enemy = defaultEnemy();
    const owner = addActorFromBuild(project, await candidate('kaeya', weapon, 1));
    const hit = addSkillHit(project, owner, 'kaeya.normal', 0, 1000, { crit: 'noncritical', reaction: 'none' });
    const request = project.timeline.find(record => record.id === hit)!.damage!;
    const choices = calculatorBuffChoices(project, owner, request, 1000, hit);
    const choice = choices.find(entry => entry.effect.id === weapon + '.curse-healing');
    if (attackPercent === null) {
      expect(choice).toBeUndefined();
      continue;
    }
    expect(choice).toMatchObject({ ownerId: owner, explicit: true, target: 'attribute.equipmentHealing' });
    expect(choice!.fields).toContainEqual(expect.objectContaining({ key: weapon + '.curseTriggered', subject: { kind: 'event' } }));
    setCalculatorFact(request, { key: weapon + '.curseTriggered', subject: { kind: 'event' }, value: { kind: 'boolean', value: true } }, owner);
    const applied = applyCalculatorBuffs(project, request, choices, new Map([[choice!.id, true]]), 1000, hit);
    applied.project.timeline.find(record => record.id === hit)!.damage = { ...request, effectApplications: applied.applications };
    const result = evaluateTimeline(applied.project).points.find(point => point.id === hit)!.real!;
    const healing = ((18.6984 + 42.401) * (1 + attackPercent)).toLocaleString('zh-CN', { maximumFractionDigits: 6 });
    expect(calculatorBuffValues(result, [choice!])).toEqual([['凯亚 / 「一心传」名刀 · 本次装备治疗量', healing]]);
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
