import { readCalculationLibrary } from '../../tools/lib/calculation-library.mjs';
import { catalogInventory, readCalculationData } from '../../tools/lib/catalog-data.mjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculationCoverage } from '../../tools/lib/calculation-coverage.mjs';
import { loadContentSchema } from '../../tools/lib/load-content-schema.mjs';
import { createContentLinker } from '../../tools/lib/content-linking.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = file => readCalculationData(resolve(root, file));
const manifest = catalogInventory();
const characters = manifest.characters.map(id => read(`src/game-data/data/characters/${id}.json`));
const weapons = manifest.weapons.map(id => read(`src/game-data/data/weapons/${id}.json`));
const sets = manifest.sets.map(id => read(`src/game-data/data/artifact-sets/${id}.json`));

test('calculation review inventory retains every real entity, unlock branch and hit', () => {
  const report = calculationCoverage(manifest, characters, weapons, sets);
  for (const [kind, expected] of [['character', manifest.characters], ['weapon', manifest.weapons], ['set', manifest.sets]]) {
    assert.deepEqual(report.entries.filter(entry => entry.kind === kind).map(entry => entry.entityId), expected);
  }
  for (const character of characters) {
    const entries = report.entries.filter(entry => entry.entityId === character.id && !['weapon', 'set', 'set-effect'].includes(entry.kind));
    assert.equal(entries.filter(entry => entry.kind === 'hit').length, character.talents.reduce((total, talent) => total + talent.hits.length, 0));
    for (const branch of [...character.passives.map((passive, index) => `/passives/${index}`), ...character.constellations.map((item, index) => `/constellations/${index}`)]) {
      assert.ok(entries.some(entry => entry.pointer === branch), `${character.id}${branch}`);
    }
  }
  for (const set of sets) assert.deepEqual(report.entries.filter(entry => entry.entityId === set.id && entry.kind === 'set-effect').map(entry => entry.selector.pieces), set.effects.map(effect => effect.pieces));
  // An uncompiled authored catalog cannot claim executable outputs.
  assert.equal(report.summary.supportedOutputs, 0);
  assert.equal(report.summary.invalidDefinitions, characters.length + weapons.length + sets.length);
});

test('structured coverage follows real scoped certificates and loses support when a dependency or proof is removed', async () => {
  const schemas = await loadContentSchema(), engine = await loadContentSchema('/src/engine/src/index.ts');
  const reviews = read('tools/data/sources/calculation-hits/ordinary-bindings.json');
  const prepare = createContentLinker({ schemas, collectCalculationRoots: engine.collectCalculationRoots, describeCalculationTemplate: engine.describeCalculationTemplate, manifest,
    library: readCalculationLibrary(), hitReviews: reviews,
    retainedRules: read('tools/data/sources/calculation-effects/retained-rules.json'), textBindings: read('tools/data/sources/character-text/base-and-manekin.json') });
  const kaeya = await prepare.character(characters.find(character => character.id === 'kaeya'));
  const dullblade = await prepare.weapon(weapons.find(weapon => weapon.id === 'dullblade'));
  const noblesse = await prepare.set(sets.find(set => set.id === 'noblesseoblige'));
  const scope = { ...manifest, characters: [kaeya.id], weapons: [dullblade.id], sets: [noblesse.id] };
  const validate = (kind, entity) => kind === 'character' ? engine.compileStructuredCharacter(entity) : engine.compileCalculation(entity.calculation.bundle);
  const audit = character => calculationCoverage(scope, [character], [dullblade], [noblesse], { material: 'review-candidates', validate });
  const report = audit(kaeya), hitId = 'kaeya.skill.param1';
  assert.equal(report.material, 'review-candidates');
  assert.equal(report.summary.supportedOutputs, reviews.hits.filter(hit => hit.characterId === kaeya.id).length);
  const hit = report.entries.find(entry => entry.kind === 'hit' && entry.selector.hitId === hitId);
  assert.equal(hit.scopes[0].resolution, 'complete');
  assert.deepEqual(hit.scopes[0].constellations, { min: 0, max: 3 });
  assert.equal(hit.resolution, 'unavailable'); // A bounded certificate cannot close the entire C0–C6 hit or character.
  assert.equal(report.entries.find(entry => entry.kind === 'character').resolution, 'unavailable');
  assert.equal(report.entries.find(entry => entry.kind === 'weapon').resolution, 'complete');
  assert.ok(report.entries.filter(entry => entry.kind === 'set-effect').every(entry => entry.resolution === 'complete'));

  for (const change of ['formula', 'source', 'coverage', 'declared']) {
    const broken = structuredClone(kaeya), bundle = broken.calculation.bundle;
    if (change === 'formula') bundle.formulas = bundle.formulas.filter(formula => formula.identity.id !== 'ordinary-hit');
    else if (change === 'source') bundle.sources = bundle.sources.filter(source => source.id !== 'kqm.ordinary');
    else if (change === 'coverage') bundle.coverage = bundle.coverage.filter(record => record.scope.kind !== 'hit' || record.scope.hitId !== hitId);
    else bundle.coverage.forEach(record => { record.evidence = 'declared'; });
    const invalid = audit(broken);
    assert.equal(invalid.entries.find(entry => entry.kind === 'hit' && entry.selector.hitId === hitId).scopes[0].resolution, 'unavailable', change);
    assert.ok(invalid.summary.supportedOutputs < report.summary.supportedOutputs, change);
  }
  const unvalidated = calculationCoverage(scope, [kaeya], [dullblade], [noblesse], { material: 'review-candidates' });
  assert.equal(unvalidated.summary.supportedOutputs, 0);
  // Dropping an actual catalog entity must not make strict coverage easier to satisfy.
  assert.throws(() => calculationCoverage({ ...scope, characters: [kaeya.id, 'jean'] }, [kaeya], [dullblade], [noblesse]), /complete ordered manifest/);
});
