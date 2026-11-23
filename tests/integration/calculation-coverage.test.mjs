import { readCalculationData as read } from '../../tools/lib/catalog-data.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculationCoverage } from '../../tools/lib/calculation-coverage.mjs';
import { auditCharacterClauses } from '../../tools/lib/roster-evaluation.mjs';
import { loadContentSchema } from '../../tools/lib/load-content-schema.mjs';
import { createRuntimeCatalog } from '../../tools/lib/runtime-catalog.mjs';

const catalog = await createRuntimeCatalog();
const manifest = catalog.inventory;
const engine = await loadContentSchema('/src/engine/src/index.ts');
const validate = (kind, entity) => kind === 'character' ? engine.compileStructuredCharacter(entity) : engine.compileCalculation(entity.calculation.bundle);

test('map markers with a combat contribution remain open while crafting, fishing and wildlife passives close', async () => {
  const mixed = { kachina: 3, kinich: 3, lynette: 2, mualani: 3 };
  const noncombat = ['qiqi', 'yoimiya', 'thoma', 'yaoyao', 'wanderer', 'aratakiitto'];
  const characters = await Promise.all([...Object.keys(mixed), ...noncombat].map(id => catalog.get('characters', id)));
  const weapons = await Promise.all(['dullblade', 'wastergreatsword', 'apprenticesnotes', 'huntersbow', 'beginnersprotector'].map(id => catalog.get('weapons', id)));
  const rows = auditCharacterClauses({ characters, weapons, sets: [] }, engine).rows;
  for (const { id } of characters) {
    const row = rows.find(entry => entry.entity === id && entry.field === '/passives/' + (mixed[id] ?? 2));
    assert.equal(row?.status, Object.hasOwn(mixed, id) ? '战斗贡献待逐条件验收' : '生活用途', id);
  }
});

test('the Yanfei C1 clause checks the fourth seal at C6 and the other seal grants at C1', async () => {
  const character = await catalog.get('characters', 'yanfei');
  const weapon = await catalog.get('weapons', 'apprenticesnotes');
  const granted = engine.grantedBuildEffects;
  function checkGrant(grantedBuildEffects) {
    return auditCharacterClauses({ characters: [character], weapons: [weapon], sets: [] }, { ...engine, grantedBuildEffects })
      .rows.find(row => row.field === '/constellations/0').grantGate;
  }
  assert.equal(checkGrant(granted), true);
  const fourth = character.metadata.constellations[0].buffs.find(buff => buff.activation?.constellation === 6).id;
  assert.equal(checkGrant(build => granted(build).filter(grant => grant.effect.identity.id !== fourth)), false);
  assert.equal(checkGrant(build => build.constellation === 5 ? granted({ ...build, constellation: 6 }) : granted(build)), false);
});

test('the linked catalog preserves authored values and reports every entity and branch', async () => {
  const [characters, weapons, sets] = await Promise.all([
    Promise.all(manifest.characters.map(id => catalog.get('characters', id))),
    Promise.all(manifest.weapons.map(id => catalog.get('weapons', id))),
    Promise.all(manifest.sets.map(id => catalog.get('sets', id))),
  ]);
  const report = calculationCoverage(manifest, characters, weapons, sets, { validate });
  assert.equal(report.summary.invalidDefinitions, 0);
  for (const [kind, expected] of [['character', manifest.characters], ['weapon', manifest.weapons], ['set', manifest.sets]]) {
    assert.deepEqual(report.entries.filter(entry => entry.kind === kind).map(entry => entry.entityId), expected);
  }
  let outputs = 0;
  for (const character of characters) {
    const original = read(`src/game-data/data/characters/${character.id}.json`);
    assert.deepEqual(character.progression, original.progression, character.id);
    assert.deepEqual(character.attributes.base, original.attributes.base, character.id);
    assert.deepEqual(character.talents, original.talents, character.id);
    const entries = report.entries.filter(entry => entry.entityId === character.id && !['weapon', 'set', 'set-effect'].includes(entry.kind));
    const hits = character.talents.flatMap(talent => talent.hits);
    assert.equal(entries.filter(entry => entry.kind === 'hit').length, hits.length);
    outputs += hits.reduce((total, hit) => total + Object.keys(hit.damage).length, 0);
    for (const branch of [...character.passives.map((passive, index) => `/passives/${index}`), ...character.constellations.map((item, index) => `/constellations/${index}`)]) {
      assert.ok(entries.some(entry => entry.pointer === branch), `${character.id}${branch}`);
    }
  }
  for (const weapon of weapons) {
    const original = read(`src/game-data/data/weapons/${weapon.id}.json`);
    for (const field of ['baseAttack', 'baseStat', 'attackCurve', 'statCurve', 'promotion']) assert.deepEqual(weapon[field], original[field], weapon.id);
  }
  for (const set of sets) {
    const original = read(`src/game-data/data/artifact-sets/${set.id}.json`);
    assert.deepEqual(report.entries.filter(entry => entry.entityId === set.id && entry.kind === 'set-effect').map(entry => entry.selector.pieces), original.effects.map(effect => effect.pieces));
  }
  const dullblade = weapons.find(weapon => weapon.id === 'dullblade');
  assert.equal(dullblade.calculation.bundle.formulas.length, 0);
  assert.equal(dullblade.calculation.bundle.coverage[0].resolution, 'complete');
  assert.equal(report.summary.boundOutputs, outputs);
  assert.ok(report.summary.supportedOutputs < outputs);
  assert.equal(report.entries.find(entry => entry.kind === 'character' && entry.entityId === 'vesna').scopes[0].resolution, 'complete');
  for (const id of ['aether', 'lumine']) {
    const root = report.entries.find(entry => entry.kind === 'character' && entry.entityId === id);
    assert.equal(root.declarations.maxConstellation, 0);
    assert.deepEqual(root.scopes[0].constellations, { min: 0, max: 0 });
    assert.equal(root.resolution, 'complete');
  }
  for (const [kind, id] of [['character', 'vesna'], ['weapon', 'beyondthechrysalis'], ['weapon', 'cinnabarspindle']]) {
    const root = report.entries.find(entry => entry.kind === kind && entry.entityId === id);
    assert.equal(root.resolution, 'unavailable', id);
    assert.ok(root.lifecycleGaps.some(gap => gap.field && gap.missing.length), id);
  }
  for (const id of ['favoniussword','sacrificialsword','scarletproof']) {
    assert.equal(report.entries.find(row => row.entityId === id && ['set','weapon'].includes(row.kind)).resolution,'complete',id);
  }
});

test('structured coverage follows real scoped certificates and loses support when a dependency or proof is removed', async () => {
  const reviews = read('tools/data/sources/calculation-hits/ordinary-bindings.json');
  const kaeya = await catalog.get('characters', 'kaeya');
  const dullblade = await catalog.get('weapons', 'dullblade');
  const noblesse = await catalog.get('sets', 'noblesseoblige');
  const scope = { ...manifest, characters: [kaeya.id], weapons: [dullblade.id], sets: [noblesse.id] };
  const audit = character => calculationCoverage(scope, [character], [dullblade], [noblesse], { validate });
  const report = audit(kaeya), hitId = 'kaeya.skill.param1';
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
  const unvalidated = calculationCoverage(scope, [kaeya], [dullblade], [noblesse]);
  assert.equal(unvalidated.summary.supportedOutputs, 0);
  assert.equal(unvalidated.summary.invalidDefinitions, 3);
  // Dropping an actual catalog entity must not make strict coverage easier to satisfy.
  assert.throws(() => calculationCoverage({ ...scope, characters: [kaeya.id, 'jean'] }, [kaeya], [dullblade], [noblesse]), /complete ordered manifest/);
});
