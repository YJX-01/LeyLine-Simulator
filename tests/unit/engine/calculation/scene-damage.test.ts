import * as engine from '@leyline/engine';
import { getCharacter, getWeapon, loadBattleScenes } from '@leyline/game-data';
import { sceneDefinitionSchema } from '@leyline/schema';
import { expect, it } from 'vitest';
import { auditSceneDamage } from '../../../../tools/lib/scene-damage-audit.mjs';

it('matches each sourced true-damage scene at its own timing and preserves explicit zero and uncertainty', async () => {
  const [character, weapon] = await Promise.all([getCharacter('kaeya'), getWeapon('dullblade')]);
  const result = auditSceneDamage({ characters: [character], weapons: [weapon] }, engine);
  expect(result.gaps).toEqual([]);
  expect(result.summary.sceneDamageEvidenceRows).toBe(71);
  expect(result.verified.size).toBe(52);
  expect(result.rows.filter(row => row.case === 'wrong-difficulty')).toHaveLength(52);
  expect(result.baseVerified.size).toBe(19);
  expect(result.baseRows.filter(row => row.case === 'first' && row.recipient === 'enemy')).toHaveLength(14);
  expect(result.baseRows.filter(row => row.case === 'first' && row.recipient === 'character')).toHaveLength(5);
  expect(result.baseRows.filter(row => row.case === 'first')).toEqual(expect.arrayContaining([
    expect.objectContaining({ entity: 'scene.field.domainofblessingunyieldingiv.0', value: 1232.5, final: null }),
    expect.objectContaining({ entity: 'scene.field.domainofblessingfiresofpurificationii.1', value: 493, final: null }),
  ]));
});

it('loads scene hits from the catalog and rejects a scene hit addressed to a teammate', async () => {
  const scenes = await loadBattleScenes();
  const scene = scenes.find(definition => definition.id === 'scene.field.domainofblessingmachinenesti.0');
  const hit = scene?.hits?.[0];
  expect(hit?.multiplier).toBe(4);
  expect(sceneDefinitionSchema.safeParse({ ...scene, hits: [{ ...hit, recipient: 'team' }] }).success).toBe(false);
  expect(sceneDefinitionSchema.safeParse({ ...scene, hits: [{ ...hit, recipient: 'character' }] }).success).toBe(false);
  const penalty = scenes.find(definition => definition.id === 'scene.field.domainofblessingfiresofpurificationii.1');
  expect(penalty?.hits?.[0]).toMatchObject({ recipient: 'character', settlement: 'unverified', delayMs: 100 });
});
