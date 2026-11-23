import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auditBennettInspiration } from '../../tools/lib/bennett-inspiration-audit.mjs';
import { assembleCalculationLibrary } from '../../tools/lib/calculation-library.mjs';
import { readCalculationData } from '../../tools/lib/catalog-data.mjs';
import { loadContentSchema } from '../../tools/lib/load-content-schema.mjs';
import { createContentLinker } from '../../src/game-data/src/link-content.mjs';

test('Bennett C1 independently verifies both the HP exception and the extra white attack', async () => {
  const [schemas, engine] = await Promise.all([loadContentSchema(), loadContentSchema('/src/engine/src/index.ts')]);
  const read = name => readCalculationData('src/game-data/data/' + name + '.json');
  const characters = ['characters/bennett', 'characters/kaeya'].map(read);
  const weapons = ['weapons/dullblade', 'weapons/favoniussword'].map(read);
  const sets = [read('artifact-sets/gladiatorsfinale')];
  const compiled = engine.compileCalculation(assembleCalculationLibrary(read('calculation/common'), read('calculation/reactions'),
    [...characters, ...weapons, ...sets]));
  assert.ok(compiled.ok, JSON.stringify(compiled.diagnostics));
  const linker = createContentLinker({ schemas, ...engine, library: compiled.program });
  const audit = auditBennettInspiration({ characters: characters.map(linker.character), weapons: weapons.map(linker.weapon),
    sets: sets.map(linker.set) }, engine);
  const failures = audit.rows.filter(row => row.issue);
  assert.equal(failures.length, 0, JSON.stringify(failures[0]));
  assert.ok(audit.verified.has('bennett/constellations/0'));

  const base = audit.rows.filter(row => row.field.endsWith('/modifiers/0') && row.probe.cast && row.probe.onField && row.probe.inside);
  const find = (constellation, hpRatio) => base.find(row => row.probe.constellation === constellation && row.probe.hpRatio === hpRatio);
  assert.equal(find(0, .7)?.value, 0);
  assert.ok(find(0, .71)?.value > 0);
  assert.equal(find(0, null)?.status, 'unknown');
  assert.ok(find(1, .7)?.value > 0);
  assert.ok(find(1, null)?.value > 0);

  const extra = audit.rows.filter(row => row.field.endsWith('/modifiers/1') && row.probe.cast && row.probe.onField && row.probe.inside);
  const peer = extra.find(row => row.probe.set && row.probe.recipient === 'peer' && row.probe.hpRatio < .7);
  const owner = extra.find(row => row.probe.set && row.probe.recipient === 'actor' && row.probe.hpRatio < .7);
  assert.ok(peer?.value > 0);
  assert.ok(Math.abs(peer.value - owner.value) < 1e-8);
  assert.ok(extra.some(row => row.probe.rank === 13 && row.value > 0));
});
