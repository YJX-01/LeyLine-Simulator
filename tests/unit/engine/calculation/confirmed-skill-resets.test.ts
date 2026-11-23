import * as engine from '@leyline/engine';
import { getArtifactMain, getArtifactSet, getBuildSources, getCharacter, getWeapon } from '@leyline/game-data';
import { putHitFact } from '@leyline/schema';
import { expect, it } from 'vitest';
import { applyCalculatorBuffs, calculatorBuffChoices } from '../../../../src/web/src/domain/calculator-buffs';
import { calculatorBuffValues } from '../../../../src/web/src/domain/calculator-factors';
import { addActorFromBuild, addSkillHit, defaultEnemy } from '../../../../src/web/src/domain/real-project';
import { createEmptyProject } from '../../../../src/web/src/domain/workbench-project';
import { auditConfirmedSkillResets, confirmedSkillResetCharacterIds, confirmedSkillResetWeaponHolders } from '../../../../tools/lib/confirmed-skill-resets.mjs';

it('calculates confirmed resets against pinned character and equipment descriptions', async () => {
  const [characters, weapons, gambler] = await Promise.all([
    Promise.all(confirmedSkillResetCharacterIds.map(getCharacter)),
    Promise.all(['dullblade', 'wastergreatsword', 'apprenticesnotes', 'huntersbow', 'beginnersprotector',
      ...Object.keys(confirmedSkillResetWeaponHolders)].map(getWeapon)),
    getArtifactSet('gambler'),
  ]);
  const audit = auditConfirmedSkillResets({ characters, weapons, sets: [gambler] }, engine);
  expect(audit.rows.filter(row => row.issue).map(({ entity, probe, expected, value, status, diagnostics }) => ({
    entity, probe, expected, value, status, diagnostics: diagnostics?.map(({ code, jsonPointer }) => [code, jsonPointer]),
  }))).toEqual([]);
  expect(audit.summary).toEqual({ confirmedSkillResetCases: 180, confirmedSkillResetMismatches: 0,
    confirmedSkillResetClausesVerified: 13, confirmedSkillResetGaps: 1 });
  expect(audit.gaps.map(({ entity, field }) => [entity, field])).toEqual([['gambler', '/effects/1/support/mechanisms/1']]);
  expect(audit.rows.find(row => row.entity === 'freminet' && row.probe === '已确认本次触发')).toMatchObject({ value: 3500, cooldownAfterMs: 0 });
  expect(audit.rows.find(row => row.entity === 'freminet' && row.probe === '未应用')?.cooldownAfterMs).toBeUndefined();
}, 30000);

it('shows the cleared cooldown and its known zero remainder only for a confirmed Project query', async () => {
  const [character, weapon, artifactMain, sources] = await Promise.all([
    getCharacter('freminet'), getWeapon('wastergreatsword'), getArtifactMain(), getBuildSources(),
  ]);
  const project = createEmptyProject();
  project.enemy = defaultEnemy();
  const actor = addActorFromBuild(project, {
    ...sources, schemaVersion: character.schemaVersion, dataVersion: character.dataVersion, kind: 'calculation-build',
    character, weapon, artifactMain, level: 1, ascension: 0, constellation: 0, weaponLevel: 1, weaponAscension: 0, refinement: 1,
    talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [],
  });
  const time = 1000;
  const id = addSkillHit(project, actor, 'freminet.burst', 0, time, { crit: 'noncritical', reaction: 'none' });
  const request = project.timeline.find(record => record.id === id)!.damage!;
  const choices = calculatorBuffChoices(project, actor, request, time, id);
  const choice = choices.find(entry => entry.effect.id === 'freminet.skillReset')!;
  expect(choice.checked).toBe(false);
  expect([...new Set(choice.fields.map(({ key }) => key))]).toEqual(['freminet.skillReset.confirmed', 'skillCooldownBeforeResetMs']);
  const event = { kind: 'event' } as const;
  putHitFact(request.facts ??= [], event, 'skillCooldownBeforeResetMs', { kind: 'quantity', unit: 'milliseconds', value: 3500 });
  const solve = (confirmed: boolean | null, enabled = true) => {
    putHitFact(request.facts!, event, 'freminet.skillReset.confirmed', confirmed === null ? null : { kind: 'boolean', value: confirmed });
    const applied = applyCalculatorBuffs(project, request, choices, new Map([[choice.id, enabled]]), time, id);
    applied.project.timeline.find(record => record.id === id)!.damage = { ...request, effectApplications: applied.applications };
    const evaluated = engine.evaluateTimeline(applied.project);
    expect(evaluated.combatChanges?.filter(change => change.kind === 'reset-skill') ?? []).toEqual([]);
    return calculatorBuffValues(evaluated.points.find(point => point.id === id)!.real!, [choice]).map(([, value]) => value);
  };
  expect(solve(true)).toEqual(['3.5 秒（重置后 0 秒）']);
  expect(solve(false)).toEqual([]);
  expect(solve(null)).toEqual(['待确认']);
  expect(solve(true, false)).toEqual([]);
});
