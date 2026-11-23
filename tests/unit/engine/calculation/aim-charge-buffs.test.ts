import * as engine from '@leyline/engine';
import { getArtifactMain, getBuildSources, getCharacter, getWeapon } from '@leyline/game-data';
import { expect, it } from 'vitest';
import { applyCalculatorBuffs, calculatorBuffChoices } from '../../../../src/web/src/domain/calculator-buffs';
import { setCalculatorFact } from '../../../../src/web/src/domain/calculator-conditions';
import { calculatorBuffValues } from '../../../../src/web/src/domain/calculator-factors';
import { addActorFromBuild, addSkillHit, defaultEnemy } from '../../../../src/web/src/domain/real-project';
import { createEmptyProject } from '../../../../src/web/src/domain/workbench-project';
import { aimChargeIds, aimChargePeerIds, auditAimChargeBuffs } from '../../../../tools/lib/aim-charge-buffs.mjs';

it('verifies aiming effects against captured texts and the exact authored hits', async () => {
  const [characters, bow] = await Promise.all([
    Promise.all([...aimChargeIds, ...aimChargePeerIds].map(getCharacter)), getWeapon('huntersbow'),
  ]);
  const audit = auditAimChargeBuffs({ characters, weapons: [bow] }, engine);
  expect(audit.rows.filter(row => row.issue)).toEqual([]);
  expect(audit.verified.size).toBe(9);
  expect(audit.rows.filter(row => row.entity === 'tighnari' && row.probe.label.includes('战技后的第')).map(row => row.value))
    .toEqual([2400, 2400, 2400, 0]);
  expect(audit.gaps.some(row => row.entity === 'linnea' && row.field === '/passives/3')).toBe(true);
}, 30000);

it('uses the selected Frostflake Arrow and the calculator’s cast confirmation', async () => {
  const [character, weapon, artifactMain, sources] = await Promise.all([
    getCharacter('ganyu'), getWeapon('huntersbow'), getArtifactMain(), getBuildSources(),
  ]);
  const project = createEmptyProject();
  project.enemy = defaultEnemy();
  const actor = addActorFromBuild(project, { ...sources, schemaVersion: character.schemaVersion, dataVersion: character.dataVersion,
    kind: 'calculation-build', character, weapon, artifactMain, level: 1, ascension: 0, constellation: 6,
    weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] });
  const talent = character.talents[0];
  const target = { crit: 'noncritical', reaction: 'none' } as const;
  const time = 1000;
  const arrow = talent.hits.findIndex(hit => hit.id === 'ganyu.normal.param9');
  const hitId = addSkillHit(project, actor, talent.id, arrow, time, target);
  const request = project.timeline.find(record => record.id === hitId)!.damage!;
  const choices = calculatorBuffChoices(project, actor, request, time, hitId);
  const choice = choices.find(entry => entry.effect.id === 'ganyu.c6.frostflake-aim')!;
  expect(choice).toMatchObject({ triggerSkill: 'ganyu.skill', timing: { durationMs: 30000 }, checked: false });
  expect(choice.requirements).toContainEqual(expect.objectContaining({ key: 'ganyu.c6FirstFrostflakeArrow', subject: { kind: 'event' } }));
  for (const setting of choice.requirements) setCalculatorFact(request, setting, actor);
  const applied = applyCalculatorBuffs(project, request, choices, new Map([[choice.id, true]]), time, hitId);
  const recorded = applied.project.timeline.find(record => record.id === hitId)!;
  recorded.damage = { ...request, effectApplications: applied.applications };
  const active = calculatorBuffChoices(applied.project, actor, recorded.damage, time, hitId).filter(entry => entry.effect.id === choice.effect.id);
  const output = engine.evaluateTimeline(applied.project).points.find(point => point.id === hitId)!.real!;
  expect(active).toHaveLength(1);
  expect(output.panel.attributes?.aimChargeInstant).toBe(1);
  expect(calculatorBuffValues(output, active)).toEqual([['甘雨 / 履虫 · 蓄力要求', '本次免蓄力']]);
  const bloom = talent.hits.findIndex(hit => hit.id === 'ganyu.normal.param10');
  const bloomId = addSkillHit(applied.project, actor, talent.id, bloom, time + 1, target);
  const bloomRecord = applied.project.timeline.find(record => record.id === bloomId)!;
  expect(calculatorBuffChoices(applied.project, actor, bloomRecord.damage!, time + 1, bloomId)
    .some(entry => entry.effect.id === choice.effect.id)).toBe(false);
});
