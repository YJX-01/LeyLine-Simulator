import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAuditJson } from '../../tools/lib/numeric-audit.mjs';
import { assembleCalculationLibrary, readCalculationLibrary } from '../../tools/lib/calculation-library.mjs';

test('entity-owned calculation definitions assemble once, directly from maintained JSON', () => {
  const library = readCalculationLibrary(readAuditJson);
  const nahida = readAuditJson('src/game-data/data/characters/nahida.json');
  const owned = nahida.calculation.bundle.formulas.find(formula => formula.identity.id === 'nahida.skill.tri-karma.base');
  assert.deepEqual(library.formulas.find(formula => formula.identity.id === owned.identity.id), owned);
  const reactions = readAuditJson('src/game-data/data/calculation/reactions.json').calculation;
  for (const formula of reactions.formulas) assert.equal(library.formulas.filter(entry => entry.identity.id === formula.identity.id).length, 1);
  const effects = new Set(library.effects.map(effect => JSON.stringify(effect.identity)));
  assert.equal(effects.size, library.effects.length);
  for (const id of ['furina.fanfare', 'resonance.pyro', 'adventurer.hp', 'bennett.inspiration']) assert.ok(library.effects.some(effect => effect.identity.id === id));
  assert.equal(library.aggregates.length, 3);
  const changed = readCalculationLibrary(path => {
    const value = readAuditJson(path);
    if (path === 'src/game-data/data/characters/nahida.json') value.calculation.bundle.formulas.find(formula => formula.identity.id === owned.identity.id).template.terms.pop();
    return value;
  });
  assert.equal(changed.formulas.find(formula => formula.identity.id === owned.identity.id).template.terms.length, 1);
  assert.equal(library.formulas.find(formula => formula.identity.id === owned.identity.id).template.terms.length, 2);
});

test('duplicate authored ownership and a second maintained reaction level table are rejected', () => {
  const common = readAuditJson('src/game-data/data/calculation/common.json');
  const reactions = readAuditJson('src/game-data/data/calculation/reactions.json');
  const nahida = readAuditJson('src/game-data/data/characters/nahida.json');
  assert.throws(() => assembleCalculationLibrary(common, reactions, [nahida, structuredClone(nahida)]), /Duplicate authored/);
  const duplicate = readCalculationLibrary(readAuditJson).tables.find(table => table.identity.id === 'reaction-level');
  common.tables.push(duplicate);
  assert.throws(() => assembleCalculationLibrary(common, reactions, [nahida]), /reaction-level must derive/);
});
