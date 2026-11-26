import * as engine from '@leyline/engine';
import { getArtifactMain, getArtifactSet, getBuildSources, getCharacter, getWeapon } from '@leyline/game-data';
import { characterHitRef, type Build } from '@leyline/schema';
import { expect, it } from 'vitest';
import { calculatorBuffChoices } from '../../../../src/web/src/domain/calculator-buffs';
import { addActorFromBuild } from '../../../../src/web/src/domain/real-project';
import { createEmptyProject } from '../../../../src/web/src/domain/workbench-project';
import { mixedEquipmentModifierNumbers } from '../../../../tools/lib/mixed-equipment-modifier-numbers.mjs';

it('links independent equipment readings to the listed modifier, element and recipient', async () => {
  const [characters, weapons, sets, artifactMain, sources] = await Promise.all([
    Promise.all(['jean', 'kaeya', 'amber', 'lisa', 'sucrose', 'barbara'].map(getCharacter)),
    Promise.all(['mistsplitterreforged', 'athousandfloatingdreams', 'jadefallssplendor', 'dullblade', 'apprenticesnotes', 'huntersbow'].map(getWeapon)),
    Promise.all(['celestialgift', 'marechausseehunter'].map(getArtifactSet)),
    getArtifactMain(), getBuildSources(),
  ]);
  const [jean, kaeya, , lisa, sucrose] = characters;
  const [mistsplitter, floatingDreams, jadefall, sword, catalyst] = weapons;
  const [celestialgift, marechausseeHunter] = sets;
  const entities = { characters, weapons, sets };
  const builds = [
    { character: jean, weapon: mistsplitter, set: null, group: mistsplitter.metadata.buffs },
    { character: kaeya, weapon: mistsplitter, set: null, group: mistsplitter.metadata.buffs },
    { character: lisa, weapon: floatingDreams, set: null, group: floatingDreams.metadata.buffs },
    { character: lisa, weapon: jadefall, set: null, group: jadefall.metadata.buffs },
    { character: sucrose, weapon: catalyst, set: celestialgift, group: celestialgift.metadata.effects[1].buffs },
    { character: kaeya, weapon: sword, set: marechausseeHunter, group: marechausseeHunter.metadata.effects[1].buffs },
  ];
  const choices = new Map();
  for (const { character, weapon, set, group } of builds) {
    const project = createEmptyProject();
    const build: Build = {
      ...sources, character, weapon, artifactMain, sets: set ? [set] : [], artifacts: [],
      schemaVersion: character.schemaVersion, dataVersion: character.dataVersion, kind: 'calculation-build',
      level: 1, ascension: 0, constellation: 0, weaponLevel: 1, weaponAscension: 0, refinement: 1,
      talents: { normal: 1, skill: 1, burst: 1 },
      ...(set ? { theoreticalSetSlots: set.slots.slice(0, 4).map(slot => ({ slot, setId: set.id })) } : {}),
    };
    const owner = addActorFromBuild(project, build);
    const options = calculatorBuffChoices(project, owner, {
      hit: characterHitRef(character, character.talents[0].hits[0].id), crit: 'noncritical', reaction: 'none',
    }, 1);
    for (const [index, buff] of (group ?? []).entries()) for (const [modifier, definition] of buff.modifiers.entries()) {
      const entity = set?.id ?? weapon.id;
      const field = (set ? '/effects/1' : '') + '/buffs/' + index + '/modifiers/' + modifier;
      const option = options.find(row => row.ownerId === owner && row.effect.id === buff.id);
      const id = modifier ? buff.id + '.' + modifier : buff.id;
      if (option?.modifiers.some(row => row.id === id)) choices.set(entity + field, {
        entity, field, id: buff.id, target: definition.target, listed: true, role: definition.recipient ?? buff.recipient ?? 'owner',
      });
    }
  }
  const results = { calculator: { buffs: [...choices.values()] } };
  const evidence = mixedEquipmentModifierNumbers(entities, results, engine);
  const emblem = evidence.find(row => row.id === 'mistsplitterreforged.emblem-3' && row.target === 'attribute.anemoBonus');
  expect(emblem?.cases).toEqual(expect.arrayContaining([
    expect.objectContaining({ actual: 0.28, expected: 0.28, settings: expect.objectContaining({ rank: 1, holder: 'jean' }) }),
    expect.objectContaining({ actual: 0.56, expected: 0.56, settings: expect.objectContaining({ rank: 5, holder: 'jean' }) }),
    expect.objectContaining({ actual: 0, expected: 0, settings: expect.objectContaining({
      rank: 5, holder: 'kaeya', facts: { 'mistsplitterreforged.emblemLayers': 3 },
    }) }),
  ]));
  expect(emblem?.refs).toHaveLength(5);
  const jade = evidence.find(row => row.id === 'jadefallssplendor.regalia' && row.target === 'attribute.electroBonus');
  expect(jade?.cases).toContainEqual(expect.objectContaining({ actual: 0.44, expected: 0.44,
    settings: expect.objectContaining({ rank: 5, holder: 'lisa' }),
  }));
  const hymn = evidence.find(row => row.id === 'celestialgift.hymn-owner-anemo');
  expect(hymn?.cases).toEqual(expect.arrayContaining([
    expect.objectContaining({ actual: 0.4, expected: 0.4, settings: expect.objectContaining({ pieces: 4, recipient: 'peer0' }) }),
    expect.objectContaining({ actual: 0, expected: 0, settings: expect.objectContaining({ pieces: 3 }) }),
  ]));
  const hunter = evidence.find(row => row.id === 'marechausseehunter.hp-change');
  expect(hunter?.cases).toEqual(expect.arrayContaining([
    expect.objectContaining({ actual: 0.36, expected: 0.36, settings: expect.objectContaining({ time: 3001 }) }),
    expect.objectContaining({ actual: 0, expected: 0, settings: expect.objectContaining({ time: 5000 }) }),
  ]));

  const emblemChoice = choices.get(emblem!.key), jadeChoice = choices.get(jade!.key);
  const filtered = { calculator: { buffs: [emblemChoice, emblemChoice, jadeChoice] }, registeredModifierEvidence: [jade!] };
  expect(mixedEquipmentModifierNumbers(entities, filtered, engine)).toEqual([]);
}, 30_000);
