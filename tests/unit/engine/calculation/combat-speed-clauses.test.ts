import * as engine from '@leyline/engine';
import { getArtifactMain, getBuildSources, getCharacter, getWeapon } from '@leyline/game-data';
import { characterHitRef, putHitFact, subjectFacts, type Build } from '@leyline/schema';
import { expect, it } from 'vitest';
import { applyCalculatorBuffs, calculatorBuffChoices, resolveBuffSelection } from '../../../../src/web/src/domain/calculator-buffs';
import { addActorFromBuild, addSkillAction, addSkillHit } from '../../../../src/web/src/domain/real-project';
import { createEmptyProject } from '../../../../src/web/src/domain/workbench-project';
import { auditCombatSpeedClauses, combatSpeedIds, combatSpeedPeerIds } from '../../../../tools/lib/combat-speed-clauses.mjs';

it('checks combat speed coefficients on the authored hits and trigger windows', async () => {
  const [characters, weapons] = await Promise.all([
    Promise.all([...combatSpeedIds, ...combatSpeedPeerIds].map(getCharacter)),
    Promise.all(['dullblade', 'apprenticesnotes', 'wastergreatsword', 'huntersbow', 'beginnersprotector'].map(getWeapon)),
  ]);
  const result = auditCombatSpeedClauses({ characters, weapons }, engine);
  expect(result.rows.filter(row => row.issue)).toEqual([]);
  expect(result.verified.size).toBe(9);
  expect(result.rows.find(row => row.entity === 'aratakiitto' && row.probe.hitId === 'aratakiitto.normal.param7'
    && row.probe.ascension === 1 && row.probe.count === 4)?.value).toBeCloseTo(0.3);
  const jean = result.rows.filter(row => row.entity === 'jean' && row.probe.recipient === 'kaeya'
    && row.probe.category === 'charged');
  expect(jean.map(row => row.value)).toEqual([0, 0.15]);
  expect(result.gaps.some(row => row.entity === 'mika' && row.field === '/constellations/0')).toBe(true);
}, 30000);

it('uses Cyno burst as the calculator shortcut and preserves Jean’s pickup confirmation', async () => {
  const [cyno, jean, polearm, sword, artifactMain, sources] = await Promise.all([
    getCharacter('cyno'), getCharacter('jean'), getWeapon('beginnersprotector'), getWeapon('dullblade'),
    getArtifactMain(), getBuildSources(),
  ]);
  function build(character: Build['character'], weapon: Build['weapon'], constellation: number): Build {
    return { ...sources, character, weapon, artifactMain, sets: [], artifacts: [], schemaVersion: character.schemaVersion,
      dataVersion: character.dataVersion, kind: 'calculation-build', level: 20, ascension: 1,
      constellation, weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 } };
  }
  const project = createEmptyProject();
  const dealer = addActorFromBuild(project, build(cyno, polearm, 1));
  const supplier = addActorFromBuild(project, build(jean, sword, 2));
  const request = { hit: characterHitRef(cyno, 'cyno.burst.param1'), crit: 'noncritical', reaction: 'none' } as const;
  const options = calculatorBuffChoices(project, dealer, request, 1);
  const burst = options.find(row => row.effect.id === 'cyno.c1.unceasing-vigil-speed');
  const pickup = options.find(row => row.effect.id === 'jean.c2.peoples-aegis-speed');
  expect(burst?.triggerSkill).toBe('cyno.burst');
  expect(pickup).toMatchObject({ ownerId: supplier, confirmTrigger: true, timing: { durationMs: 15000 } });
  expect(pickup?.triggerSkill).toBeUndefined();
  expect(pickup?.modifiers.map(row => row.target)).toEqual(['attribute.normalAttackSpeed', 'attribute.movementSpeed']);

  const { project: updated } = applyCalculatorBuffs(project, request, options, new Map([[burst!.id, true], [pickup!.id, true]]), 1);
  expect(updated.timeline.map(row => [row.actor, row.skillId, row.confirmedBuff?.id])).toEqual([
    [dealer, 'cyno.burst', undefined], [supplier, undefined, 'jean.c2.peoples-aegis-speed'],
  ]);
  const charged = calculatorBuffChoices(project, dealer, { ...request, hit: characterHitRef(cyno, 'cyno.burst.param7') }, 1);
  expect(charged.some(row => row.effect.id === 'cyno.c1.unceasing-vigil-speed')).toBe(false);
  expect(charged.find(row => row.effect.id === 'jean.c2.peoples-aegis-speed')?.modifiers.map(row => row.target))
    .toEqual(['attribute.movementSpeed']);
});

it('keeps Kaveh’s timeline-derived Burst when applying another buff and respects explicit facts', async () => {
  const [kaveh, jean, claymore, sword, artifactMain, sources] = await Promise.all([
    getCharacter('kaveh'), getCharacter('jean'), getWeapon('wastergreatsword'), getWeapon('dullblade'),
    getArtifactMain(), getBuildSources(),
  ]);
  function build(character: Build['character'], weapon: Build['weapon']): Build {
    return { ...sources, character, weapon, artifactMain, sets: [], artifacts: [], schemaVersion: character.schemaVersion,
      dataVersion: character.dataVersion, kind: 'calculation-build', level: 1, ascension: 0, constellation: 2,
      weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 } };
  }
  const project = createEmptyProject();
  const actor = addActorFromBuild(project, build(kaveh, claymore));
  const supplier = addActorFromBuild(project, build(jean, sword));
  addSkillAction(project, actor, 'kaveh.burst', 0);
  const timeMs = 1000;
  const hit = addSkillHit(project, actor, 'kaveh.normal', 0, timeMs, { crit: 'noncritical', reaction: 'none' });
  const request = project.timeline.find(row => row.id === hit)!.damage!;
  const subject = { kind: 'actor', id: actor } as const;
  const key = 'kaveh.painting';

  for (const value of [undefined, false, null]) {
    const draft = structuredClone(request);
    if (value !== undefined) putHitFact(draft.facts ??= [], subject, key, value === null ? null : { kind: 'boolean', value });
    const options = calculatorBuffChoices(project, actor, draft, timeMs, hit);
    const painting = options.find(row => row.effect.id === 'kaveh.c2.painted-dome-speed');
    const pickup = options.find(row => row.effect.id === 'jean.c2.peoples-aegis-speed');
    expect(painting?.checked).toBe(value === undefined);
    expect(pickup?.ownerId).toBe(supplier);
    const initial = structuredClone(draft.facts);
    const selected = resolveBuffSelection(options, draft, {}, actor, new Map([[pickup!.id, true]]));
    const updated = applyCalculatorBuffs(project, draft, options, selected, timeMs, hit).project;
    expect(draft.facts).toEqual(initial);
    expect(subjectFacts(updated.timeline.find(row => row.id === hit)?.damage?.facts, subject)?.[key]).toBeUndefined();
  }
});
