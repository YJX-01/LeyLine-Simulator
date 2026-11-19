import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectFormulaClosure } from '../../tools/lib/calculation-closure.mjs';
import { loadContentSchema } from '../../tools/lib/load-content-schema.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = file => JSON.parse(readFileSync(resolve(root, file), 'utf8'));

test('a real lunar aggregate exports just its exact reachable formula/source snapshot', async () => {
  const library = read('src/game-data/generated/calculation-formulas.json');
  const closure = await collectFormulaClosure([{ namespace: 'builtin', id: 'lunar-charged', revision: '1' }], library);
  assert.deepEqual(closure.formulas.map(formula => formula.identity.id).sort(), ['lunar-charged-individual', 'lunar-em-bonus']);
  assert.equal(closure.aggregates.length, 1);
  assert.equal(closure.tables.length, 0);
  assert.ok(closure.sources.every(source => source.id.startsWith('kqm.web.lunar')));
  const engine = await loadContentSchema('/src/engine/src/index.ts');
  assert.equal(engine.compileCalculation(closure).ok, true);
  const before = JSON.stringify(closure);
  library.formulas.find(formula => formula.identity.id === 'lunar-charged-individual').identity.revision = 'unadopted-directory-change';
  assert.equal(JSON.stringify(closure), before);
});

test('a real Nahida formula closure compiles and evaluates after an offline JSON round trip', async () => {
  const library = read('src/game-data/generated/calculation-formulas.json');
  const reference = { namespace: 'builtin', id: 'nahida.skill.tri-karma.base', revision: '1' };
  const closure = JSON.parse(JSON.stringify(await collectFormulaClosure([reference], library)));
  assert.equal(closure.formulas.length, 1);
  assert.equal(closure.sources.length, 1);
  const engine = await loadContentSchema('/src/engine/src/index.ts');
  const compiled = engine.compileCalculation(closure);
  assert.equal(compiled.ok, true);
  const nahida = read('src/game-data/data/characters/nahida.json');
  const result = engine.evaluateFormula(compiled.program, reference, {
    attack: { kind: 'quantity', unit: 'attack', value: nahida.attributes.base.attack }, em: { kind: 'quantity', unit: 'elementalMastery', value: 0 },
    attackRate: { kind: 'quantity', unit: 'scalar', value: 1.032 }, emRate: { kind: 'quantity', unit: 'scalar', value: 2.064 },
  });
  assert.equal(result.execution, 'complete');
  assert.equal(result.outputs.base.value.value, nahida.attributes.base.attack * 1.032);
});

test('Jade Cutter effect roots retain their exact transitive HP and ATK attribute dependencies offline', async () => {
  const library = read('src/game-data/generated/calculation-formulas.json');
  const roots = ['primordialjadecutter.static-hpPercent', 'primordialjadecutter.hp-to-attack.attack'].map(id => ({ namespace: 'builtin', id, revision: '1' }));
  const closure = await collectFormulaClosure(roots, library);
  assert.equal(closure.effects.length, 2);
  assert.ok(closure.attributes.some(attribute => attribute.identity.id === 'attribute.whiteHp'));
  assert.ok(closure.attributes.some(attribute => attribute.identity.id === 'attribute.attackPercent'));
  assert.ok(closure.formulas.some(formula => formula.identity.id === 'hp-panel-base'));
  assert.ok(closure.requiredFeatures.includes('combat-binding-v1'));
  assert.ok(closure.requiredFeatures.includes('effect-v1'));
  assert.ok(!closure.formulas.some(formula => formula.identity.id.startsWith('lunar')));
  const engine = await loadContentSchema('/src/engine/src/index.ts');
  assert.equal(engine.compileCalculation(JSON.parse(JSON.stringify(closure))).ok, true);
});
