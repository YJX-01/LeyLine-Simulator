import * as engine from '@leyline/engine';
import { getArtifactMain, getBuildSources, getCharacter, getWeapon } from '@leyline/game-data';
import { expect, it } from 'vitest';
import { applyCalculatorBuffs, calculatorBuffChoices } from '../../../../src/web/src/domain/calculator-buffs';
import { setCalculatorFact } from '../../../../src/web/src/domain/calculator-conditions';
import { calculatorBuffValues } from '../../../../src/web/src/domain/calculator-factors';
import { addActorFromBuild, addSkillHit, defaultEnemy } from '../../../../src/web/src/domain/real-project';
import { createEmptyProject } from '../../../../src/web/src/domain/workbench-project';
import {
  auditDirectCooldownAmounts, directCooldownCharacterIds, directCooldownPeerIds,
} from '../../../../tools/lib/direct-cooldown-amounts.mjs';

it('verifies direct cooldown amounts from captured descriptions, including ownership and per-trigger limits', async () => {
  const [characters, weapons] = await Promise.all([
    Promise.all([...directCooldownCharacterIds, ...directCooldownPeerIds].map(getCharacter)),
    Promise.all(['dullblade', 'apprenticesnotes', 'wastergreatsword', 'huntersbow', 'beginnersprotector'].map(getWeapon)),
  ]);
  const audit = auditDirectCooldownAmounts({ characters, weapons }, engine);
  expect(audit.rows.filter(row => row.issue).map(({ entity, effect, value, expected, actualOutput, otherOutput, status, probe, diagnostics }) =>
    ({ entity, effect, value, expected, actualOutput, otherOutput, status, probe: probe?.label,
      diagnostics: diagnostics?.map(({ code, jsonPointer }) => [code, jsonPointer]) }))).toEqual([]);
  expect(audit.summary.verifiedDirectCooldownModifiers).toBe(24);
  expect(audit.rows.filter(row => row.entity === 'aratakiitto' && row.probe?.label.startsWith('队伍')).map(row => row.value))
    .toEqual([3000, 4500, 4500]);
  expect(audit.rows.find(row => row.entity === 'raidenshogun' && row.probe?.label === '计数边界 5')?.value).toBe(0);
  expect(audit.gaps.some(row => row.entity === 'lauma' && row.field === '/passives/1')).toBe(true);
}, 30000);

it('reads a confirmed Projection Attack reduction in the Project damage calculator', async () => {
  const [character, weapon, artifactMain, sources] = await Promise.all([
    getCharacter('alhaitham'), getWeapon('dullblade'), getArtifactMain(), getBuildSources(),
  ]);
  const project = createEmptyProject();
  project.enemy = defaultEnemy();
  const actor = addActorFromBuild(project, { ...sources, schemaVersion: character.schemaVersion, dataVersion: character.dataVersion,
    kind: 'calculation-build', character, weapon, artifactMain, level: 1, ascension: 0, constellation: 1,
    weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] });
  const skill = character.talents.find(entry => entry.category === 'skill')!;
  const time = 1000;
  const projection = skill.hits.findIndex(hit => hit.id === 'alhaitham.skill.param4');
  const hitId = addSkillHit(project, actor, skill.id, projection, time, { crit: 'noncritical', reaction: 'none' });
  const request = project.timeline.find(record => record.id === hitId)!.damage!;
  const choices = calculatorBuffChoices(project, actor, request, time, hitId);
  const choice = choices.find(entry => entry.effect.id === 'alhaitham.c1.intuition-cooldown')!;
  expect(choice.description).toBe('元素战技冷却减少量 1.2 秒');
  expect(choice.checked).toBe(false);
  expect(choice.fields.map(field => field.key)).toEqual(['alhaitham.c1.projectionHit', 'alhaitham.c1.cooldownIntervalReady']);
  const solve = () => {
    const applied = applyCalculatorBuffs(project, request, choices, new Map([[choice.id, true]]), time, hitId);
    const recorded = applied.project.timeline.find(record => record.id === hitId)!;
    recorded.damage = { ...request, effectApplications: applied.applications };
    return engine.evaluateTimeline(applied.project).points.find(point => point.id === hitId)!.real!;
  };
  for (const setting of choice.requirements) setCalculatorFact(request, setting, actor);
  const output = solve();
  expect(output.panel.attributes?.elementalSkillCooldownReductionMs).toBe(1200);
  expect(output.panel.attributes?.elementalBurstCooldownReductionMs ?? 0).toBe(0);
  expect(calculatorBuffValues(output, [choice])).toEqual([['艾尔海森 / 直观 · 元素战技冷却减少量', '1.2 秒']]);
});
