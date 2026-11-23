import * as engine from '@leyline/engine';
import { getArtifactSet, getCharacter, getWeapon, loadBattleScenes } from '@leyline/game-data';
import { combatObservationUnits } from '@leyline/schema';
import { beforeAll, describe, expect, it } from 'vitest';
import { readCalculationData } from '../../../../tools/lib/catalog-data.mjs';
import { auditEquipmentCurrentFacts } from '../../../../tools/lib/equipment-current-facts-audit.mjs';
import { auditCurrentScene } from '../../../../tools/lib/scene-current-facts-audit.mjs';
import { rosterEquipmentEvaluation } from '../../../../tools/lib/roster-equipment-evaluation.mjs';

async function loadEntities() {
  const [characters, weapons, sets] = await Promise.all([
    Promise.all(['kaeya', 'lisa', 'xiangling', 'amber', 'noelle'].map(getCharacter)),
    Promise.all(['dullblade', 'apprenticesnotes', 'ashgravendrinkinghorn', 'sequenceofsolitude', 'crescentpike', 'debateclub', 'filletblade', 'halberd',
      'prototypearchaic', 'messenger', 'theflute', 'theviridescenthunt', 'amosbow', 'prospectorsshovel', 'dragonspinespear', 'frostbearer', 'snowtombedstarsilver',
      'starcallerswatch', 'angelosheptades', 'slingshot', 'polarstar', 'fadingtwilight', 'royalgrimoire', 'hakushinring'].map(getWeapon)),
    Promise.all(['goldentroupe', 'shimenawasreminiscence', 'nymphsdream', 'celestialgift'].map(getArtifactSet)),
  ]);
  return { characters, weapons, sets };
}

describe('source-derived current equipment and scene conditions', () => {
  let entities: Awaited<ReturnType<typeof loadEntities>>;
  beforeAll(async () => { entities = await loadEntities(); });
  it('evaluates each legal refinement, proc exclusion, damage family and the four-piece threshold', () => {
    const result = auditEquipmentCurrentFacts(entities, engine);
    expect(result.rows.filter(row => row.issue)).toEqual([]);
    expect(result.verified).toEqual(new Set([
      'ashgravendrinkinghorn/buffs', 'sequenceofsolitude/buffs', 'crescentpike/buffs', 'debateclub/buffs', 'filletblade/buffs', 'halberd/buffs',
      'prototypearchaic/buffs', 'messenger/buffs', 'theflute/buffs', 'theviridescenthunt/buffs', 'amosbow/buffs', 'prospectorsshovel/buffs', 'goldentroupe/effects/1',
      'dragonspinespear/buffs', 'frostbearer/buffs', 'snowtombedstarsilver/buffs', 'shimenawasreminiscence/effects/1', 'starcallerswatch/buffs',
      'slingshot/buffs', 'polarstar/buffs', 'nymphsdream/effects/1', 'fadingtwilight/buffs',
    ]));
  });

  it('keeps older equipment probes numeric while tracking what still requires independent evidence', () => {
    const ids = ['dullblade', 'apprenticesnotes', 'fadingtwilight', 'royalgrimoire', 'hakushinring', 'polarstar', 'slingshot'];
    const sample = { ...entities, weapons: entities.weapons.filter(weapon => ids.includes(weapon.id)), sets: entities.sets.filter(set => set.id !== 'shimenawasreminiscence') };
    const proofs = auditEquipmentCurrentFacts(sample, engine);
    const result = rosterEquipmentEvaluation(sample, engine, combatObservationUnits, undefined, proofs.verified);
    expect(result.summary.equipmentMismatches).toBe(0);
    expect(result.summary.equipmentMissingValues).toBe(0);
    expect(result.summary.modifierMismatches).toBe(0);
    expect(result.rows.find(row => row.entity === 'hakushinring' && row.refinement === 1)?.modifiers).toContainEqual(
      expect.objectContaining({ id: 'hakushinring.cryo-reaction', recipient: 'kaeya', amount: .1, conditionExcluded: true }));
    expect(result.gaps.some(row => row.entity === 'polarstar' || row.entity === 'fadingtwilight' || row.entity === 'slingshot')).toBe(false);
    expect(result.gaps.find(row => row.entity === 'royalgrimoire')?.reasons).toContain('数值贡献缺少来源的独立对照');
    expect(result.gaps.find(row => row.entity === 'celestialgift' && row.field === '/effects/1')?.reasons).toContain('另有持有者条件，需相应配装样例');
  });

  it('applies the selected field phase, recipient scope, elemental resistance and category limits', async () => {
    const source: { entity: string; field: string; text: string }[] = readCalculationData('tools/data/sources/catalog/battle-scenes.json');
    const definitions = await loadBattleScenes();
    for (const id of ['domainofblessingflowerfeasti', 'domainofblessingsevensensesi', 'domainofblessingcrumblingassemblyi',
      'domainofforgeryleadingkarmai', 'domainofforgeryartisanshipi', 'domainofmasteryadmonishingengravingi', 'domainofmasterybasketofdisciplinei']) {
      const key = 'scene.field.' + id + '.0';
      const result = auditCurrentScene(definitions.find((scene: { id: string }) => scene.id === key),
        source.find((clause: { entity: string }) => clause.entity === key), entities, engine);
      expect(result?.gaps, id).toEqual([]);
      expect(result?.rows.length, id).toBeGreaterThan(0);
    }
  });
});
