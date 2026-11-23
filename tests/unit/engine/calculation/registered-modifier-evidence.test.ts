import * as engine from '@leyline/engine';
import { getArtifactMain, getBuildSources, getCharacter, getWeapon } from '@leyline/game-data';
import { characterHitRef, type Build } from '@leyline/schema';
import { expect, it } from 'vitest';
import { calculatorBuffChoices } from '../../../../src/web/src/domain/calculator-buffs';
import { addActorFromBuild } from '../../../../src/web/src/domain/real-project';
import { createEmptyProject } from '../../../../src/web/src/domain/workbench-project';
import { registeredModifierEvidence } from '../../../../tools/lib/registered-modifier-evidence.mjs';
import { auditTalentTableBuffs } from '../../../../tools/lib/talent-table-buff-audit.mjs';

it('links each real Hunter’s Precision modifier to its distinct source-backed reading', async () => {
  const [alyosha, kaeya, polearm, sword, artifactMain, sources] = await Promise.all([
    getCharacter('alyosha'), getCharacter('kaeya'), getWeapon('beginnersprotector'), getWeapon('dullblade'),
    getArtifactMain(), getBuildSources(),
  ]);
  const entities = { characters: [alyosha, kaeya], weapons: [polearm, sword], sets: [] };
  const starter = (character: typeof alyosha, weapon: typeof polearm): Build => ({
    ...sources, character, weapon, artifactMain, sets: [], artifacts: [], schemaVersion: character.schemaVersion,
    dataVersion: character.dataVersion, kind: 'calculation-build', level: 1, ascension: 0,
    constellation: 0, weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 },
  });
  const project = createEmptyProject();
  const holder = addActorFromBuild(project, { ...starter(alyosha, polearm), level: 90, ascension: 6, constellation: 6 });
  const recipient = addActorFromBuild(project, starter(kaeya, sword));
  const rule = 'alyosha.t1.hunter-precision-attack';
  const option = calculatorBuffChoices(project, recipient, {
    hit: characterHitRef(kaeya, kaeya.talents[0].hits[0].id), crit: 'noncritical', reaction: 'none',
  }, 1).find(row => row.ownerId === holder && row.effect.id === rule);
  expect(option?.modifiers.map(modifier => modifier.id)).toEqual([rule, rule + '.1']);
  const buffs = option!.modifiers.map(({ target }, index) => ({
    entity: alyosha.id, field: '/talents/1/buffs/0/modifiers/' + index, id: rule,
    target: 'attribute.' + target.replace(/^attribute\./, ''), role: 'team', listed: true,
  }));
  const talentTable = auditTalentTableBuffs(entities, engine);
  const results = { calculator: { buffs }, talentTable };
  const evidence = registeredModifierEvidence(entities, results);
  expect(evidence.map(row => row.key)).toEqual(buffs.map(row => row.entity + row.field));
  const extra = evidence.find(row => row.modifier === 1);
  expect(extra?.actual).toBeCloseTo(extra!.expected, 10);
  expect(extra?.actual).toBeGreaterThan(0);
  expect(extra?.cases[1].actual).toBeCloseTo(0, 10);
  expect(extra?.refs).toContainEqual(expect.stringContaining('#alyosha/combat2/param5'));

  const ambiguous = { ...results, calculator: { buffs: [...buffs, buffs[1]] } };
  expect(registeredModifierEvidence(entities, ambiguous).map(row => row.modifier)).toEqual([0]);
  const wrongGrant = { ...results, calculator: { buffs: [{ ...buffs[1], id: 'alyosha.a1.recharge-damage' }] } };
  expect(registeredModifierEvidence(entities, wrongGrant)).toEqual([]);
  const missing = { ...results, talentTable: { ...talentTable,
    rows: talentTable.rows.filter(row => row.expected !== 0) } };
  expect(registeredModifierEvidence(entities, missing).map(row => row.modifier)).toEqual([1]);
});
