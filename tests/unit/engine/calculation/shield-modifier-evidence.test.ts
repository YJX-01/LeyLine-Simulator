import * as engine from '@leyline/engine';
import { getArtifactMain, getBuildSources, getCharacter, getWeapon } from '@leyline/game-data';
import { characterHitRef, type Build } from '@leyline/schema';
import { expect, it } from 'vitest';
import { calculatorBuffChoices } from '../../../../src/web/src/domain/calculator-buffs';
import { addActorFromBuild } from '../../../../src/web/src/domain/real-project';
import { createEmptyProject } from '../../../../src/web/src/domain/workbench-project';
import { auditRemainingShieldGrants } from '../../../../tools/lib/remaining-shield-grants-audit.mjs';
import { auditShieldAbsorption } from '../../../../tools/lib/shield-absorption-audit.mjs';
import { shieldModifierEvidence } from '../../../../tools/lib/shield-modifier-evidence.mjs';

it('links shield values, caps, and exclusive incoming-element branches to exact calculator entries', async () => {
  const [characters, weapons, artifactMain, sources] = await Promise.all([
    Promise.all(['beidou', 'diona', 'kaeya', 'thoma'].map(getCharacter)),
    Promise.all(['wastergreatsword', 'huntersbow', 'dullblade', 'beginnersprotector'].map(getWeapon)),
    getArtifactMain(), getBuildSources(),
  ]);
  const entities = { characters, weapons };
  const buffs = characters.flatMap((character, index) => {
    const build: Build = {
      ...sources, character, weapon: weapons[index], artifactMain, sets: [], artifacts: [],
      schemaVersion: character.schemaVersion, dataVersion: character.dataVersion, kind: 'calculation-build',
      level: 90, ascension: 6, constellation: 6, weaponLevel: 1, weaponAscension: 0, refinement: 1,
      talents: { normal: 1, skill: 10, burst: 1 },
    };
    const project = createEmptyProject();
    const owner = addActorFromBuild(project, build);
    const options = calculatorBuffChoices(project, owner, {
      hit: characterHitRef(character, character.talents[0].hits[0].id), crit: 'noncritical', reaction: 'none',
    }, 1);
    const group = character.id === 'kaeya' ? 'constellations' : 'talents';
    return character.metadata[group].flatMap((clause, position) => (clause.buffs ?? []).flatMap((buff, slot) => {
      const option = options.find(row => row.ownerId === owner && row.effect.id === buff.id);
      return buff.modifiers.flatMap(({ target, recipient }, modifier) => {
        if (!/^attribute\.(?:effectiveShieldAbsorption|shieldAbsorption(?:Cap)?)$/.test(target)) return [];
        const id = modifier ? buff.id + '.' + modifier : buff.id;
        return [{ entity: character.id, field: '/' + group + '/' + position + '/buffs/' + slot + '/modifiers/' + modifier,
          id: buff.id, target, role: recipient ?? buff.recipient ?? 'owner', listed: option?.modifiers.some(row => row.id === id) ?? false }];
      });
    }));
  });
  const shields = auditShieldAbsorption(entities, engine);
  const remainingShieldGrants = auditRemainingShieldGrants(entities, engine);
  const results = { calculator: { buffs }, shields, remainingShieldGrants };
  const evidence = shieldModifierEvidence(entities, results, engine);
  expect(evidence.map(row => row.key).sort()).toEqual([
    'beidou/talents/1/buffs/0/modifiers/0',
    'diona/talents/1/buffs/0/modifiers/0', 'diona/talents/1/buffs/1/modifiers/0',
    'kaeya/constellations/3/buffs/0/modifiers/1', 'kaeya/constellations/3/buffs/0/modifiers/2',
    'thoma/talents/1/buffs/0/modifiers/0', 'thoma/talents/1/buffs/0/modifiers/1',
    'thoma/talents/2/buffs/0/modifiers/0', 'thoma/talents/2/buffs/0/modifiers/1',
  ]);
  const guard = evidence.find(row => row.entity === 'beidou');
  expect(guard?.cases).toContainEqual(expect.objectContaining({
    actual: 0, expected: 0, settings: expect.objectContaining({ recipient: 'peer', gates: { 'beidou.tidecallerGuard': true } }),
  }));
  const [cryo, other] = evidence.filter(row => row.entity === 'kaeya');
  expect(cryo.actual).toBeCloseTo(other.actual * 2.5, 10);
  for (const [branch, excluded] of [[cryo, 'physical'], [other, 'cryo']] as const) {
    expect(branch.cases).toContainEqual(expect.objectContaining({
      actual: 0, expected: 0, settings: expect.objectContaining({
        constellation: 4, recipient: 'actor',
        query: { incomingShieldElement: expect.objectContaining({ value: { kind: 'enum', value: excluded } }) },
      }),
    }));
  }
  expect(cryo.refs).toContainEqual(expect.stringMatching(/constellations\/kaeya\.json#c4$/));

  const burstCap = evidence.find(row => row.key === 'thoma/talents/2/buffs/0/modifiers/1');
  expect(burstCap?.cases.filter(row => row.expected > 0)).toContainEqual(expect.objectContaining({
    actual: expect.any(Number),
    settings: expect.objectContaining({ skill: 10, burst: 1 }),
  }));
  expect(burstCap?.refs).toContainEqual(expect.stringMatching(/stats\/talents\.json#thoma\/combat2\/param5$/));

  const cryoChoice = buffs.find(row => row.entity + row.field === cryo.key)!;
  const duplicate = { ...results, calculator: { buffs: [...buffs, cryoChoice] }, registeredModifierEvidence: [other] };
  expect(shieldModifierEvidence(entities, duplicate, engine).some(row => row.entity === 'kaeya')).toBe(false);
});
