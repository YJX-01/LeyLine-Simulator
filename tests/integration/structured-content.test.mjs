import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContentSchema } from '../../tools/lib/load-content-schema.mjs';
import { createContentLinker } from '../../tools/lib/content-linking.mjs';
import { calculationCoverage } from '../../tools/lib/calculation-coverage.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = file => JSON.parse(readFileSync(resolve(root, file), 'utf8'));

test('all actual catalog snapshots retain exact growth and parameters with stable hit identities and closed dependencies', async () => {
  const schemas = await loadContentSchema(), engine = await loadContentSchema('/src/engine/src/index.ts');
  const manifest = read('src/game-data/data/manifest.json'), counts = { characters: 0, weapons: 0, sets: 0, hits: 0, outputs: 0 };
  const candidates = { characters: [], weapons: [], sets: [] };
  const prepare = createContentLinker({ schemas, collectCalculationRoots: engine.collectCalculationRoots, describeCalculationTemplate: engine.describeCalculationTemplate, manifest,
    library: read('src/game-data/generated/calculation-formulas.json'), hitReviews: read('tools/data/sources/calculation-hits/ordinary-bindings.json'),
    retainedRules: read('tools/data/sources/calculation-effects/retained-rules.json'), textBindings: read('tools/data/sources/character-text/base-and-manekin.json') });
  for (const id of manifest.characters) {
    const path = resolve(root, 'src/game-data/data/characters', id + '.json'), before = readFileSync(path, 'utf8'), original = JSON.parse(before), candidate = await prepare.character(original);
    candidates.characters.push(candidate);
    assert.deepEqual(candidate.progression, original.progression);
    assert.deepEqual(candidate.attributes.base, original.attributes.base);
    assert.deepEqual(candidate.talents.map(talent => talent.parameters), original.talents.map(talent => talent.parameters));
    assert.equal(Object.hasOwn(candidate, 'combatRules'), false); assert.equal(Object.hasOwn(candidate.attributes, 'modifiers'), false);
    const compiled = engine.compileStructuredCharacter(JSON.parse(JSON.stringify(candidate)));
    assert.equal(compiled.ok, true, id + ': ' + JSON.stringify(compiled.diagnostics));
    for (const talent of candidate.talents) {
      assert.equal(new Set(talent.hits.map(hit => hit.id)).size, talent.hits.length);
      counts.hits += talent.hits.length; counts.outputs += talent.hits.reduce((count, hit) => count + hit.outputs.length, 0);
    }
    assert.equal(readFileSync(path, 'utf8'), before); counts.characters++;
  }
  for (const id of manifest.weapons) {
    const original = read('src/game-data/data/weapons/' + id + '.json'), candidate = await prepare.weapon(original);
    candidates.weapons.push(candidate);
    for (const key of ['baseAttack', 'baseStat', 'attackCurve', 'statCurve', 'promotion']) assert.deepEqual(candidate[key], original[key]);
    assert.equal(engine.compileCalculation(candidate.calculation.bundle).ok, true); counts.weapons++;
  }
  for (const id of manifest.sets) {
    const original = read('src/game-data/data/artifact-sets/' + id + '.json'), candidate = await prepare.set(original);
    candidates.sets.push(candidate);
    assert.deepEqual(candidate.effects.map(effect => effect.pieces), original.effects.map(effect => effect.pieces));
    assert.equal(engine.compileCalculation(candidate.calculation.bundle).ok, true); counts.sets++;
  }
  assert.deepEqual(counts, { characters: 154, weapons: 256, sets: 63, hits: 2029, outputs: 106 });
  const unmodified = await prepare.weapon(read('src/game-data/data/weapons/dullblade.json'));
  assert.equal(unmodified.calculation.bundle.formulas.length, 0);
  assert.equal(unmodified.calculation.bundle.coverage[0].resolution, 'complete');
  const report = calculationCoverage(manifest, candidates.characters, candidates.weapons, candidates.sets, { material: 'canonical',
    validate: (kind, entity) => kind === 'character' ? engine.compileStructuredCharacter(entity) : engine.compileCalculation(entity.calculation.bundle) });
  assert.equal(report.summary.supportedOutputs, counts.outputs);
  assert.equal(report.entries.filter(entry => entry.kind === 'hit').length, counts.hits);
  assert.deepEqual(report.entries.filter(entry => entry.kind === 'character' && entry.resolution === 'complete').map(entry => entry.entityId), ['vesna']);
});
