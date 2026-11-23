import * as engine from '@leyline/engine';
import { getCharacter, getWeapon } from '@leyline/game-data';
import { expect, it } from 'vitest';
import { auditAdditionalScenes } from '../../../../tools/lib/scene-additional-clauses.mjs';

it('applies the sourced potion durations and counts the two Seven Senses descriptions as one buff', async () => {
  const [characters, weapons] = await Promise.all([
    Promise.all(['kaeya', 'lisa'].map(getCharacter)),
    Promise.all(['dullblade', 'apprenticesnotes'].map(getWeapon)),
  ]);
  const result = auditAdditionalScenes({ characters, weapons }, engine);
  expect(result.rows.filter(row => row.issue)).toEqual([]);
  expect(result.verified).toEqual(new Set([
    'scene.potion.flamingessentialoil/durationMs',
    'scene.potion.gushingessentialoil/durationMs',
    'scene.potion.frostingessentialoil/durationMs',
    'scene.potion.unmovingessentialoil/durationMs',
    'scene.potion.streamingessentialoil/durationMs',
    'scene.potion.shockingessentialoil/durationMs',
    'scene.potion.forestessentialoil/durationMs',
    'scene.field.domainofblessingsevensensesi.1/disorder/1',
    'scene.field.domainofblessingsevensensesii.1/disorder/1',
    'scene.field.domainofblessingsevensensesiii.1/disorder/1',
    'scene.field.domainofblessingsevensensesiv.1/disorder/1',
  ]));
});
