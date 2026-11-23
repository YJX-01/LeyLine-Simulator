import * as engine from '@leyline/engine';
import { getArtifactMain, getBuildSources, getCharacter, getWeapon } from '@leyline/game-data';
import { putHitFact } from '@leyline/schema';
import { expect, it } from 'vitest';
import {
  auditConditionalCastCooldowns, conditionalCastCooldownCharacterIds, conditionalCastCooldownPeerIds,
} from '../../../../tools/lib/conditional-cast-cooldowns.mjs';
import { applyCalculatorBuffs, calculatorBuffChoices } from '../../../../src/web/src/domain/calculator-buffs';
import { calculatorBuffValues } from '../../../../src/web/src/domain/calculator-factors';
import { addActorFromBuild, addSkillHit, defaultEnemy } from '../../../../src/web/src/domain/real-project';
import { createEmptyProject } from '../../../../src/web/src/domain/workbench-project';

it('reads conditional cooldowns from fixed descriptions and excludes unrelated recipients and abilities', async () => {
  const [characters, weapons] = await Promise.all([
    Promise.all([...conditionalCastCooldownCharacterIds, ...conditionalCastCooldownPeerIds].map(getCharacter)),
    Promise.all(['dullblade', 'apprenticesnotes', 'wastergreatsword', 'huntersbow', 'beginnersprotector'].map(getWeapon)),
  ]);
  const audit = auditConditionalCastCooldowns({ characters, weapons }, engine);
  expect(audit.rows.filter(row => row.issue).map(({ entity, effect, value, expected, actualOutput, status, probe, unexpectedOutputs, diagnostics }) => ({
    entity, effect, value, expected, actualOutput, status, probe: probe?.label, unexpectedOutputs,
    diagnostics: diagnostics?.map(({ code, jsonPointer }) => [code, jsonPointer]),
  }))).toEqual([]);
  expect(audit.summary.verifiedConditionalCastCooldownModifiers).toBe(14);
  expect(audit.gaps.map(row => row.entity)).toEqual(['freminet']);
  expect(audit.rows.filter(row => row.entity === 'bennett' && row.output === 'attribute.passionOverloadCooldownAfterPassivesMs'
    && row.probe?.label === '当次条件满足').map(row => row.value)).toEqual([2000, 3000, 4000]);
  expect(audit.rows.find(row => row.entity === 'candace' && row.probe?.label === '长按提前释放')?.value).toBe(3000);
  expect(audit.rows.find(row => row.entity === 'freminet' && row.probe?.label === '退场后潜猎失效')?.value).toBe(0);
}, 30000);

it('caps the cooldown conversion of Ling Envoy Form at 20%', async () => {
  const lauma = await getCharacter('lauma');
  const compiled = engine.compileCalculation(lauma.calculation.bundle);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
  const formula = { namespace: 'builtin', id: 'lauma.spirit-envoy-em-cooldown', revision: '1' };
  for (const [mastery, expected] of [[0, 0], [500, 0.1], [1000, 0.2], [1200, 0.2]]) {
    const result = engine.evaluateFormula(compiled.program, formula, {
      basis: { kind: 'quantity', unit: 'elementalMastery', value: mastery },
    });
    expect(result.outputs.value).toMatchObject({ state: 'known', value: { kind: 'quantity', unit: 'scalar', value: expected } });
  }
});

it('binds the frost field contribution to the chosen cast in the Project damage calculator', async () => {
  const [chongyun, lisa, sword, catalyst, artifactMain, sources] = await Promise.all([
    getCharacter('chongyun'), getCharacter('lisa'), getWeapon('wastergreatsword'), getWeapon('apprenticesnotes'),
    getArtifactMain(), getBuildSources(),
  ]);
  const project = createEmptyProject();
  project.enemy = defaultEnemy();
  const member = (character: typeof chongyun, weapon: typeof sword, constellation: number) => addActorFromBuild(project, {
    ...sources, schemaVersion: character.schemaVersion, dataVersion: character.dataVersion, kind: 'calculation-build',
    character, weapon, artifactMain, level: 1, ascension: 0, constellation, weaponLevel: 1, weaponAscension: 0, refinement: 1,
    talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [],
  });
  member(chongyun, sword, 2);
  const recipient = member(lisa, catalyst, 0);
  const effect = 'chongyun.c2.frost-field-cast-cooldown';
  const time = 1000;
  const skill = lisa.talents.find(talent => talent.category === 'skill')!;
  const tap = skill.hits.findIndex(hit => hit.id === 'lisa.skill.param1');
  const hitId = addSkillHit(project, recipient, skill.id, tap, time, { crit: 'noncritical', reaction: 'none' });
  const request = project.timeline.find(record => record.id === hitId)!.damage!;
  const choices = calculatorBuffChoices(project, recipient, request, time, hitId);
  const choice = choices.find(entry => entry.effect.id === effect)!;
  const field = choice.fields[0];
  expect(choice.checked).toBe(false);
  expect(field).toMatchObject({ key: 'chongyun.c2.recipientCastInFrostField', subject: { kind: 'event' } });
  const solve = (eligible: boolean | null) => {
    putHitFact(request.facts ??= [], field.subject!, field.key, eligible === null ? null : { kind: 'boolean', value: eligible });
    const applied = applyCalculatorBuffs(project, request, choices, new Map([[choice.id, true]]), time, hitId);
    applied.project.timeline.find(record => record.id === hitId)!.damage = { ...request, effectApplications: applied.applications };
    return engine.evaluateTimeline(applied.project).points.find(point => point.id === hitId)!.real!;
  };
  const output = solve(true);
  expect(output.panel.attributes?.currentCastSkillCooldownReduction).toBe(0.15);
  expect(output.panel.attributes?.currentCastBurstCooldownReduction).toBe(0);
  expect(calculatorBuffValues(output, [choice])).toEqual([['重云 / 周天运转 · 本次元素战技冷却缩减', '15%']]);
  expect(solve(false).panel.attributes?.currentCastSkillCooldownReduction).toBe(0);
  expect(solve(null).panel.attributes?.currentCastSkillCooldownReduction).toBeNull();
  const normal = lisa.talents[0];
  const nextId = addSkillHit(project, recipient, normal.id, 0, time + 1000, { crit: 'noncritical', reaction: 'none' });
  const next = project.timeline.find(record => record.id === nextId)!.damage!;
  expect(calculatorBuffChoices(project, recipient, next, time + 1000, nextId).some(entry => entry.effect.id === effect)).toBe(false);
});
