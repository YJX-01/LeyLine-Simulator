import { evaluateTimeline } from '@leyline/engine';
import { DATA_VERSION, getArtifactMain, getBuildSources, getCharacter, getReactionCalculationBundle, getWeapon, loadBattleScenes } from '@leyline/game-data';
import { sceneDefinitionSchema, type Build, type CalculationBundle } from '@leyline/schema';
import { expect, it } from 'vitest';
import { packDocument } from '../../../../src/web/src/domain/content-document';
import { calculatorRequest, createDamageCalculation, parseDamageCalculator } from '../../../../src/web/src/domain/damage-calculator';
import { addTransformativeReaction, defaultEnemy } from '../../../../src/web/src/domain/real-project';
import { selectCatalogHit } from '../../../helpers/catalog-calculation';

const range = 'attribute.reaction.electro-charged.rangeBonus';
const endurance = 'attribute.actorEndureDelta';
const fromBeforeSceneAttributes = (bundle: CalculationBundle): CalculationBundle => ({
  ...bundle,
  attributes: bundle.attributes.filter(attribute => ![range, endurance].includes(attribute.identity.id)),
  sources: bundle.sources.filter(source => source.id !== 'content.battle-scenes'),
});

async function earlierCalculator() {
  const [character, weapon, artifactMain, sources] = await Promise.all([
    getCharacter('kaeya'), getWeapon('dullblade'), getArtifactMain(), getBuildSources(),
  ]);
  // This catalog loadout only removes the two newly added public attributes and their source.
  const build: Build = { ...sources, schemaVersion: character.schemaVersion, dataVersion: DATA_VERSION, kind: 'calculation-build',
    character: { ...character, calculation: { ...character.calculation, bundle: fromBeforeSceneAttributes(character.calculation.bundle) } }, weapon,
    artifactMain, level: 1, ascension: 0, weaponLevel: 1, weaponAscension: 0, constellation: 0, refinement: 1,
    talents: { normal: 1, skill: 1, burst: 1 }, artifacts: [], sets: [] };
  return createDamageCalculation(build, { ...selectCatalogHit(build, 'kaeya.skill', 0), crit: 'noncritical', reaction: 'none' }, defaultEnemy());
}

it('selects, evaluates and saves each current range or endurance scene with an earlier loadout', async () => {
  const [original, scenes, currentReactionRules] = await Promise.all([earlierCalculator(), loadBattleScenes(), getReactionCalculationBundle()]);
  const selections = scenes.filter(scene => scene.dependencies);
  expect(selections).toHaveLength(14);
  const rules = fromBeforeSceneAttributes(currentReactionRules);
  for (const definition of selections) {
    const document = structuredClone(original);
    const { project, actorId, recordId } = document;
    const bundle = project.candidate.actors[0].build!.character.calculation.bundle;
    const before = structuredClone(bundle);
    const attribute = definition.dependencies!.attributes[0].identity.id;
    expect(definition.dependencies).toEqual({
      attributes: currentReactionRules.attributes.filter(entry => entry.identity.id === attribute),
      sources: [{ id: 'content.battle-scenes', kind: 'definition' }],
    });
    project.sceneEffects = [{ definition, startMs: 0, endMs: 1000 }];
    const record = project.timeline[0];
    if (attribute === range) {
      addTransformativeReaction(project, actorId, 'electro-charged', 'electro', 100, rules, recordId);
    } else {
      expect(attribute).toBe(endurance);
      record.damage!.facts = [{ subject: { kind: 'team' }, values: { [definition.id + '.activeLayers']:
        { value: { kind: 'quantity', unit: 'count', value: 5 }, provenance: 'explicit', sourceRefs: [] } } }];
    }
    const panelKey = attribute.slice('attribute.'.length);
    const result = evaluateTimeline(calculatorRequest(document, 1).project);
    expect(result.points[0]?.value, definition.id).toBeGreaterThan(0);
    expect(result.points[0].real?.panel.attributes?.[panelKey], definition.id).toBe(attribute === range ? 1 : 0.3);
    expect(bundle).toEqual(before);

    const reopened = parseDamageCalculator(JSON.stringify(packDocument('damage-calculator', document)));
    expect(reopened.project.sceneEffects).toEqual(project.sceneEffects);
    const recomputed = evaluateTimeline(calculatorRequest(reopened, 2).project);
    expect(recomputed.points[0]?.value, definition.id).toBe(result.points[0].value);
    expect(recomputed.points[0].real?.panel.attributes?.[panelKey], definition.id).toBe(attribute === range ? 1 : 0.3);
  }
}, 20000);

it('checks exact revisions and conflicts while accepting earlier scenes with their archived rules', async () => {
  const [document, scenes, rules] = await Promise.all([earlierCalculator(), loadBattleScenes(), getReactionCalculationBundle()]);
  const { dependencies, ...earlierScene } = scenes.find(scene => scene.dependencies?.attributes[0].identity.id === range)!;
  const interval = { startMs: 0, endMs: 1000 };
  document.project.sceneEffects = [{ definition: earlierScene, ...interval }];
  expect(() => calculatorRequest(document, 1)).toThrow('效果缺少属性的精确版本');
  document.project.reactionRules = rules;
  expect(calculatorRequest(document, 2).project.sceneEffects).toEqual(document.project.sceneEffects);

  const [attribute] = dependencies!.attributes;
  const withAttribute = (entry: typeof attribute) => ({ ...earlierScene, dependencies: { ...dependencies!, attributes: [entry] } });
  expect(sceneDefinitionSchema.safeParse(withAttribute({ ...attribute, identity: { ...attribute.identity, revision: '2' } })).success).toBe(false);
  const conflicting = withAttribute({ ...attribute, base: { kind: 'constant', value: { kind: 'quantity', unit: 'scalar', value: 1 } } });
  document.project.sceneEffects = [{ definition: conflicting, ...interval }];
  expect(() => calculatorRequest(document, 3)).toThrow('相同完整身份对应不同定义');
});
