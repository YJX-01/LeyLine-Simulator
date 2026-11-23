import * as engine from '@leyline/engine';
import { getArtifactMain, getBuildSources, getCharacter, getWeapon } from '@leyline/game-data';
import { characterHitRef, type Build } from '@leyline/schema';
import { expect, it } from 'vitest';
import { calculatorBuffChoices } from '../../../../src/web/src/domain/calculator-buffs';
import { addActorFromBuild } from '../../../../src/web/src/domain/real-project';
import { createEmptyProject } from '../../../../src/web/src/domain/workbench-project';
import { auditLastCharacterModifierCases } from '../../../../tools/lib/last-character-modifier-cases.mjs';

it('certifies each selectable Gravity Interference family against its own coefficient and exclusions', async () => {
  const [character, weapon, artifactMain, sources] = await Promise.all([
    getCharacter('columbina'), getWeapon('apprenticesnotes'), getArtifactMain(), getBuildSources(),
  ]);
  const build: Build = {
    ...sources, character, weapon, artifactMain, sets: [], artifacts: [], schemaVersion: character.schemaVersion,
    dataVersion: character.dataVersion, kind: 'calculation-build', level: 1, ascension: 0,
    constellation: 4, weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 },
  };
  const project = createEmptyProject();
  const supplier = addActorFromBuild(project, build);
  const id = 'columbina.c4-interference';
  const scope = '/constellations/3/buffs/0/modifiers/';
  const readings = [
    { hit: 'columbina.skill.param3', family: 'lunar-charged', amount: 142.998 },
    { hit: 'columbina.skill.param4', family: 'lunar-bloom', amount: 28.5996 },
    { hit: 'columbina.skill.param5', family: 'lunar-crystallize', amount: 142.998 },
  ];
  const buffs = readings.map(({ hit }, index) => {
    const choice = calculatorBuffChoices(project, supplier, {
      hit: characterHitRef(character, hit), crit: 'noncritical', reaction: 'none',
    }, 1).find(row => row.ownerId === supplier && row.effect.id === id);
    const modifier = choice?.modifiers.find(row => row.id === (index ? id + '.' + index : id));
    expect(choice?.modifiers).toHaveLength(1);
    expect(modifier?.target).toBe('attribute.reaction.lunar.flatBaseBonus');
    return { entity: character.id, field: scope + index, id, listed: !!modifier, target: modifier!.target, role: 'owner' };
  });
  const entities = { characters: [character], weapons: [weapon] };
  const calculator = { buffs };
  const result = auditLastCharacterModifierCases(entities, engine, { calculator });
  expect(result.map(row => row.key)).toEqual(buffs.map(row => row.entity + row.field));
  for (const [index, row] of result.entries()) {
    expect(row.actual).toBeCloseTo(readings[index].amount, 8);
    expect(row.cases[0].settings).toMatchObject({ recipient: character.id, family: readings[index].family, hit: readings[index].hit });
    expect(row.cases.slice(1).map(probe => probe.actual)).toEqual([0, 0]);
    expect(row.refs.some(ref => ref.endsWith('/columbina.json#c4'))).toBe(true);
  }

  expect(auditLastCharacterModifierCases(entities, engine, {
    calculator: { buffs: [...buffs, buffs[1]] }, registeredModifierEvidence: [result[0]],
  }).map(row => row.modifier)).toEqual([2]);
});
