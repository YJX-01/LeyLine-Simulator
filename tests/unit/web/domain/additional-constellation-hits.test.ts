import { expect, it } from 'vitest';
import { evaluateTimeline } from '@leyline/engine';
import { getArtifactMain, getBuildSources, getCharacter, getWeapon } from '@leyline/game-data';
import { putHitFact, type Build } from '@leyline/schema';
import { calculatorHitChoices } from '../../../../src/web/src/domain/calculator-hits';
import { packDocument } from '../../../../src/web/src/domain/content-document';
import { calculatorWorkerRequest, createDamageCalculation, parseDamageCalculator } from '../../../../src/web/src/domain/damage-calculator';
import { addAttributeCapture, defaultEnemy } from '../../../../src/web/src/domain/real-project';

it.each([
  ['aether-geo', 'aether-geo.c2.rockcore-meltdown', 'aether-geo.rockcoreDestroyed', 'geo'],
  ['lumine-geo', 'lumine-geo.c2.rockcore-meltdown', 'lumine-geo.rockcoreDestroyed', 'geo'],
  ['lynette', 'lynette.c2.second-vivid-shot', 'lynette.vividShotFired', 'pyro'],
  ['collei', 'collei.a0.sprout', 'collei.sproutWindow', 'dendro'],
] as const)('keeps the selected %s strike and its damage query after reopening', async (id, hitId, trigger, element) => {
  const sprout = id === 'collei';
  const [character, weapon, artifactMain, sources] = await Promise.all([
    getCharacter(id), getWeapon(sprout ? 'huntersbow' : 'dullblade'), getArtifactMain(), getBuildSources(),
  ]);
  const build: Build = {
    ...sources, character, weapon, artifactMain, schemaVersion: character.schemaVersion, dataVersion: character.dataVersion,
    kind: 'calculation-build', sets: [], artifacts: [], constellation: 2, ascension: sprout ? 1 : 0, level: sprout ? 20 : 1,
    weaponLevel: 1, weaponAscension: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 },
  };
  const choice = calculatorHitChoices(character, build).find(hit => hit.hitId === hitId)!;
  const captures = sprout || element === 'geo';
  expect(choice.available).toBe(true);
  expect(calculatorHitChoices(character, { ...build, constellation: sprout ? 2 : 1, ascension: 0 }).find(hit => hit.hitId === hitId)?.available).toBe(false);
  const enemy = { ...defaultEnemy(), level: build.level };
  enemy.resistances[element] = 0.3;
  const selected = createDamageCalculation(build, { hit: choice.ref, crit: 'noncritical', reaction: 'none', facts: [] }, enemy);
  if (captures) addAttributeCapture(selected.project, selected.actorId, choice.skillId, 500);
  const record = selected.project.timeline.find(record => record.id === selected.recordId)!;
  const damage = record.damage!;
  record.timeMs = 1000;
  putHitFact(damage.facts!, { kind: 'event' }, trigger, { kind: 'boolean', value: true });
  if (id.startsWith('aether-') || id.startsWith('lumine-')) {
    const captureRecord = selected.project.timeline.find(entry => entry.kind === 'capture');
    if (captureRecord) captureRecord.captureFacts = [];
    for (const key of [
      'traveler.enhancedResonance.anemo', 'traveler.enhancedResonance.geo', 'traveler.enhancedResonance.electro',
      'traveler.enhancedResonance.dendro', 'traveler.enhancedResonance.hydro', 'traveler.enhancedResonance.pyro',
      'traveler.enhancedResonance.cryo', 'traveler.enhancedAttribute.first', 'traveler.enhancedAttribute.second',
    ]) {
      putHitFact(damage.facts!, { kind: 'actor', id: selected.actorId }, key, { kind: 'boolean', value: false });
      if (captureRecord) putHitFact(captureRecord.captureFacts!, { kind: 'actor', id: selected.actorId }, key, { kind: 'boolean', value: false });
    }
  }
  if (element === 'pyro') putHitFact(damage.facts!, { kind: 'event' }, 'absorbedElement', { kind: 'enum', value: element });
  if (captures) damage.capture = { recordId: selected.project.timeline.find(record => record.kind === 'capture')!.id, phase: 'after' };

  const reopened = parseDamageCalculator(JSON.stringify(packDocument('damage-calculator', selected)));
  const saved = reopened.project.timeline.find(record => record.id === reopened.recordId)!.damage;
  expect(saved).toEqual(damage);
  const reopenedBuild = reopened.project.candidate.actors.find(actor => actor.id === reopened.actorId)!.build!;
  expect(calculatorHitChoices(reopenedBuild.character, reopenedBuild).find(hit => hit.hitId === hitId)).toMatchObject({ available: true, ref: choice.ref });
  const point = evaluateTimeline(calculatorWorkerRequest(reopened, 1).project).points.find(point => point.id === reopened.recordId);
  expect(point?.value, point?.real?.diagnostics.join(' / ')).toBeGreaterThan(0);
});
