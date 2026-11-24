import { readCalculationLibrary } from '../../tools/lib/calculation-library.mjs';
import { readCalculationData } from '../../tools/lib/catalog-data.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContentSchema } from '../../tools/lib/load-content-schema.mjs';

const engine = await loadContentSchema('/src/engine/src/index.ts');
const sourceLibrary = readCalculationLibrary();

function closureFor(library, roots) {
  const result = engine.collectCalculationRoots(library, { roots, sourceIds: [], families: [] });
  assert.ok(result.ok, JSON.stringify(result.diagnostics));
  return result.bundle;
}

test('a real lunar aggregate exports just its exact reachable formula/source snapshot', () => {
  const library = structuredClone(sourceLibrary);
  const closure = closureFor(library, [{ namespace: 'builtin', id: 'lunar-charged', revision: '1' }]);
  assert.deepEqual(closure.formulas.map(formula => formula.identity.id).sort(), ['lunar-charged-individual', 'lunar-em-bonus']);
  assert.equal(closure.aggregates.length, 1);
  assert.equal(closure.tables.length, 0);
  assert.ok(closure.sources.every(source => source.id.startsWith('kqm.web.lunar')));
  assert.equal(engine.compileCalculation(closure).ok, true);
  const before = JSON.stringify(closure);
  library.formulas.find(formula => formula.identity.id === 'lunar-charged-individual').identity.revision = 'unadopted-directory-change';
  assert.equal(JSON.stringify(closure), before);
});

test('a real Nahida formula closure compiles and evaluates after an offline JSON round trip', () => {
  const reference = { namespace: 'builtin', id: 'nahida.skill.tri-karma.base', revision: '1' };
  const closure = JSON.parse(JSON.stringify(closureFor(sourceLibrary, [reference])));
  assert.equal(closure.formulas.length, 1);
  assert.equal(closure.sources.length, 1);
  const compiled = engine.compileCalculation(closure);
  assert.equal(compiled.ok, true);
  const nahida = readCalculationData('src/game-data/data/characters/nahida.json');
  const result = engine.evaluateFormula(compiled.program, reference, {
    attack: { kind: 'quantity', unit: 'attack', value: nahida.attributes.base.attack }, em: { kind: 'quantity', unit: 'elementalMastery', value: 0 },
    attackRate: { kind: 'quantity', unit: 'scalar', value: 1.032 }, emRate: { kind: 'quantity', unit: 'scalar', value: 2.064 },
  });
  assert.equal(result.execution, 'complete');
  assert.equal(result.outputs.base.value.value, nahida.attributes.base.attack * 1.032);
});

test('Jade Cutter effect roots retain their exact transitive HP and ATK attribute dependencies offline', () => {
  const roots = ['primordialjadecutter.static-hpPercent', 'primordialjadecutter.hp-to-attack.attack'].map(id => ({ namespace: 'builtin', id, revision: '1' }));
  const closure = closureFor(sourceLibrary, roots);
  assert.equal(closure.effects.length, 2);
  assert.ok(closure.attributes.some(attribute => attribute.identity.id === 'attribute.whiteHp'));
  assert.ok(closure.attributes.some(attribute => attribute.identity.id === 'attribute.attackPercent'));
  assert.ok(closure.formulas.some(formula => formula.identity.id === 'hp-panel-base'));
  assert.ok(closure.requiredFeatures.includes('combat-binding-v1'));
  assert.ok(closure.requiredFeatures.includes('effect-v1'));
  assert.ok(!closure.formulas.some(formula => formula.identity.id.startsWith('lunar')));
  assert.equal(engine.compileCalculation(JSON.parse(JSON.stringify(closure))).ok, true);
});
