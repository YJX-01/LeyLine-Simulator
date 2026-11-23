import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeCharacterTriggerProse } from '../../tools/lib/character-trigger-prose.mjs';
import { auditAdditionalConstellationHits } from '../../tools/lib/additional-constellation-hits.mjs';
import { auditCharacterClauseGrants } from '../../tools/lib/character-clause-grants-audit.mjs';
import { auditTriggerHitSources } from '../../tools/lib/trigger-hit-source-audit.mjs';
import { rosterEvaluation } from '../../tools/lib/roster-evaluation.mjs';
import { createRuntimeCatalog } from '../../tools/lib/runtime-catalog.mjs';
import { loadContentSchema } from '../../tools/lib/load-content-schema.mjs';
import { readContentSource } from '../../tools/lib/content-source.mjs';

test('additional strike prose requires its authored hit, independent branches and fixed source', async () => {
  const [catalog, engine] = await Promise.all([createRuntimeCatalog(), loadContentSchema('/src/engine/src/index.ts')]);
  const selection = {
    characters: ['aino', 'nicole', 'aether-geo', 'lumine-geo', 'lynette', 'collei', 'charlotte', 'mavuika',
      'arlecchino', 'citlali', 'kachina', 'ororon', 'dori', 'yaoyao', 'lohen'],
    weapons: ['dullblade', 'wastergreatsword', 'beginnersprotector', 'apprenticesnotes', 'huntersbow', 'sacrificialfragments'],
    sets: ['goldentroupe', 'wandererstroupe', 'noblesseoblige'],
  };
  const entities = Object.fromEntries(await Promise.all(Object.entries(selection).map(async ([group, ids]) =>
    [group, await Promise.all(ids.map(id => catalog.get(group, id)))])));
  const results = {
    evaluatedHits: rosterEvaluation(entities, engine).rows,
    additionalConstellationHits: auditAdditionalConstellationHits(entities, engine),
    characterGrants: auditCharacterClauseGrants({ ...entities, characters: await Promise.all(catalog.inventory.characters
      .map(id => catalog.get('characters', id))) }, engine),
    triggerHits: auditTriggerHitSources(entities, engine),
    triggerHitEvidence: readContentSource(new URL('../../tools/data/sources/catalog/trigger-hit-evidence.json', import.meta.url)).rows,
  };
  const lookup = makeCharacterTriggerProse(entities, results);
  const read = (id, field) => field.split('/').filter(Boolean).reduce((value, key) => value[key],
    entities.characters.find(character => character.id === id).metadata);
  const sentences = (id, field) => read(id, field).description.replaceAll('**', '')
    .split(/[。；\n]/).map(text => text.trim().replace(/^·\s*/, '')).filter(Boolean);
  const textThatIncludes = (id, field, part) => sentences(id, field).find(text => text.includes(part));
  const ainoField = '/constellations/1';
  const aino = textThatIncludes('aino', ainoField, '发射一枚额外的水弹');
  const nicoleField = '/constellations/0';
  const nicole = textThatIncludes('nicole', nicoleField, '攻击力的600%');
  const lohen = textThatIncludes('lohen', ainoField, '破邪之刃');
  for (const [id, field, statement, tail] of [
    ['aino', ainoField, aino, '造成水元素范围伤害'],
    ['nicole', nicoleField, nicole, '并视为由该角色造成的伤害'],
    ['lohen', ainoField, lohen, '冰元素范围伤害'],
    ['collei', '/constellations/1', textThatIncludes('collei', '/constellations/1', '持续3秒'), '草元素伤害'],
    ['mavuika', '/constellations/5', textThatIncludes('mavuika', '/constellations/5', '500%'), '火元素范围伤害'],
    ['ororon', '/passives/0', textThatIncludes('ororon', '/passives/0', '160%'), '雷元素伤害'],
  ]) {
    const result = lookup(id, field, statement);
    assert.equal(result.proofs.length, 0, id);
    assert.equal(result.parts.length, 1, id);
    assert.ok(result.parts[0].text.endsWith(tail), id);
    assert.ok(result.parts[0].refs.some(ref => ref.includes('ChineseSimplified') && ref.endsWith('/description')), id);
    assert.ok(result.parts[0].field.includes('/hits/'), id);
  }
  for (const id of ['aether-geo', 'lumine-geo', 'lynette']) {
    const proof = lookup(id, ainoField, sentences(id, ainoField)[0]);
    assert.equal(proof.proofs.length, 1, id);
    assert.equal(proof.parts.length, 0, id);
  }
  assert.deepEqual(lookup('aino', ainoField, aino.replace('25%', '26%')), { proofs: [], parts: [] });

  const missingLohenGate = { ...results, triggerHits: {
    rows: results.triggerHits.rows.filter(row => row.entity !== 'lohen' || row.settings.facts?.masterstroke !== false),
  } };
  assert.deepEqual(makeCharacterTriggerProse(entities, missingLohenGate)('lohen', ainoField, lohen), { proofs: [], parts: [] });

  const missingSource = { ...results, triggerHitEvidence: results.triggerHitEvidence.filter(row => row.entity !== 'lohen') };
  assert.deepEqual(makeCharacterTriggerProse(entities, missingSource)('lohen', ainoField, lohen), { proofs: [], parts: [] });

  const changedEntities = structuredClone(entities);
  changedEntities.characters.find(character => character.id === 'aino').metadata.constellations[1].hits[0].base[0].ratio = .26;
  assert.deepEqual(makeCharacterTriggerProse(changedEntities, results)('aino', ainoField, aino), { proofs: [], parts: [] });

  const missingElement = { ...results, additionalConstellationHits: {
    rows: results.additionalConstellationHits.rows.filter(row => row.entity !== 'lynette' || row.settings.element !== 'cryo'),
  } };
  assert.deepEqual(makeCharacterTriggerProse(entities, missingElement)('lynette', ainoField, sentences('lynette', ainoField)[0]),
    { proofs: [], parts: [] });
});
