import { auditMonaCommonInputBranches, auditMonaOrdinaryBatch, compareMonaOrdinaryScaling } from '../../tools/lib/mona-ordinary-audit.mjs';
import { reviewLinks, singleHitCandidates } from '../../tools/lib/mona-single-hit-comparison.mjs';
import { classifyMonaBuffDiagnostic, leylineSingleHitInventory, monaCalculationInventory, probeMonaSkills } from '../../tools/lib/mona-inventory-probes.mjs';
import { auditMonaEquipmentHits, equipmentEventInputSignature, reviewMonaEquipmentBatch, scopedEquipmentEventEvidence } from '../../tools/lib/mona-equipment-audit.mjs';
import { loadContentSchema } from '../../tools/lib/load-content-schema.mjs';
import { createRuntimeCatalog } from '../../tools/lib/runtime-catalog.mjs';
import { buildEvidence } from '../../tools/lib/audit-page-data.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyMonaDifferences } from '../../tools/lib/mona-behavior-ledger.mjs';
import { validateMonaTransformativeReviews } from '../../tools/lib/mona-transformative-audit.mjs';

test('a focused audit preserves a full report at its output path', t => {
  const directory = mkdtempSync(join(tmpdir(), 'leyline-audit-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'full.json');
  const original = JSON.stringify({ mona: [], leyline: [], links: [] });
  writeFileSync(path, original);
  const result = spawnSync(process.execPath, ['tools/scripts/data/audit-mona-mechanism.mjs', '--group', 'buff', '--out', path],
    { encoding: 'utf8', timeout: 5000 });
  assert.match(result.stderr, /Cannot replace a full report/);
  assert.equal(readFileSync(path, 'utf8'), original);
});

test('a runtime failure cannot be reclassified as an invalid scenario', () => {
  const comparison = { damage: { error: 'runtime failure' } };
  assert.deepEqual(classifyMonaBuffDiagnostic('DurinC2', 'Bennett', { reaction_element: 1 }, comparison),
    { kind: 'execution-failure', reason: 'runtime failure' });
});

test('a difference remains open without independent evidence', () => {
  const link = { id: 'ordinary-wrong-arm:Kaeya:6', disposition: 'different',
    mona: ['mona:skill:Kaeya:6'], leyline: [{ id: 'hit' }], sources: ['kaeya.rs:170'] };
  const row = { mona: link.mona[0], leyline: 'hit', status: 'different', arm: { path: 'kaeya.rs', line: 170 },
    ratios: Array.from({ length: 15 }, (_, index) => ({ level: index + 1, mona: 2, rust: 2, official: 3 })),
    cases: [1, 6, 10].map(level => ({ level, expected: 10, actual: 10 })) };
  assert.equal(classifyMonaDifferences([link], [row])[0].status, 'attributed');
  assert.equal(classifyMonaDifferences([{ ...link, sources: [] }], [row])[0].status, 'open');
  row.ratios[4].official = 2;
  assert.equal(classifyMonaDifferences([link], [row])[0].status, 'open');
});

test('live amplification batch differences require complete 3-level formula proofs on both sides', () => {
  const link = { id: 'amplification-batch:Citlali:0:melt', disposition: 'different',
    mona: ['mona:branch:Citlali:0:c0:default:melt'], leyline: [{ id: 'character:citlali:hit:/talents/0/hits/0', revision: '3' }] };
  const target = { id: 'character:citlali:hit:/talents/0/hits/0', binding: { element: 'cryo' } };
  const makeCase = level => {
    const mNormal = 100 * level, mEm = 115, mExpected = mNormal * 1.5 * (1 + (25 / 9) * mEm / (1400 + mEm));
    const yNormal = 101 * level, yEm = 115.2, yExpected = yNormal * 1.5 * (1 + 2.78 * yEm / (1400 + yEm));
    return { level, mona: { normal: mNormal, em: mEm, otherBonus: 0, expected: mExpected, actual: mExpected },
      leyline: { normal: yNormal, em: yEm, expected: yExpected, actual: yExpected } };
  };
  const row = { id: link.mona[0], leyline: target.id, reaction: 'melt', element: 'cryo', aura: 'pyro', status: 'different',
    cases: [1, 6, 10].map(makeCase) };
  const classified = classifyMonaDifferences([link], [], undefined, [target], [row])[0];
  assert.equal(classified.status, 'attributed-scoped');
  assert.equal(classified.cause, 'amplification-coefficient-and-talent-precision');
  assert.equal(classified.proof, 'live:amplification');
  const missingLevel = structuredClone(row);
  missingLevel.cases.pop();
  assert.equal(classifyMonaDifferences([link], [], undefined, [target], [missingLevel])[0].status, 'open');
  const extraBonus = structuredClone(row);
  extraBonus.cases[0].mona.otherBonus = 0.15;
  assert.equal(classifyMonaDifferences([link], [], undefined, [target], [extraBonus])[0].status, 'open');
  const tampered = structuredClone(row);
  tampered.cases[1].leyline.actual += 1;
  assert.equal(classifyMonaDifferences([link], [], undefined, [target], [tampered])[0].status, 'open');
});

test('reaction attribution requires the complete, consistent two-sided observations', () => {
  const file = new URL('../../tools/data/sources/mona-community/589ac6919057709924c0c20d5a9d673fe9b0be1a/transformative-comparison.json', import.meta.url);
  const link = JSON.parse(readFileSync(file, 'utf8')).mappings.find(row => row.id === 'transformative-overload');
  const target = { ...link.leyline[0], binding: { identity: { id: 'attribute.reaction.overloaded.coefficient' } } };
  const inputs = [1, 50, 90].flatMap(level => [0, 20].flatMap(em => [-.2, .1, .8].map(resistance => ({ level, em, resistance }))));
  inputs.push({ level: 90, em: 0, resistance: -.2 });
  const multipliers = JSON.parse(readFileSync(new URL('../../src/game-data/data/calculation/reactions.json', import.meta.url), 'utf8')).rules.levelMultipliers;
  const rows = inputs.map(input => {
    const factor = input.resistance < 0 ? 1 - input.resistance / 2 : input.resistance < .75 ? 1 - input.resistance : 1 / (4 * input.resistance + 1);
    const independent = multipliers[input.level] * 2.75 * (1 + 16 * input.em / (2000 + input.em)) * factor;
    return { ...input, key: 'overload', element: 'pyro', coefficient: 2.75,
      independent, leyline: independent, mona: independent * 2 / 2.75, status: 'mismatch',
      attribution: { cause: '5.2-reaction-coefficient' } };
  });
  const classify = observed => classifyMonaDifferences([link], [], { rows: observed }, [target])[0].status;
  assert.equal(classify([]), 'open');
  assert.equal(classify(rows), 'attributed');
  assert.equal(classify(rows.slice(1)), 'open');
  const changed = structuredClone(rows);
  changed[0].mona *= 1.1;
  assert.equal(classify(changed), 'open');
  changed[0] = { ...rows[0], independent: rows[0].independent * 2, leyline: rows[0].leyline * 2, mona: rows[0].mona * 2 };
  assert.equal(classify(changed), 'open');
});

test('a scoped electro-charged review requires all nineteen selected observations and rejects foreign rows', () => {
  const file = new URL('../../tools/data/sources/mona-community/589ac6919057709924c0c20d5a9d673fe9b0be1a/transformative-comparison.json', import.meta.url);
  const link = JSON.parse(readFileSync(file, 'utf8')).mappings.find(row => row.id === 'transformative-electro_charged');
  const target = { ...link.leyline[0], binding: { identity: { id: 'attribute.reaction.electro-charged.coefficient' } } };
  const multipliers = JSON.parse(readFileSync(new URL('../../src/game-data/data/calculation/reactions.json', import.meta.url), 'utf8')).rules.levelMultipliers;
  const cases = [1,50,90].flatMap(level => [0,20].flatMap(em => [-.2,.1,.8].map(resistance => ({level,em,resistance}))));
  cases.push({level:90,em:0,resistance:.1});
  const rows = cases.map(({level,em,resistance}) => {
    const factor = resistance < 0 ? 1-resistance/2 : resistance < .75 ? 1-resistance : 1/(4*resistance+1);
    const independent = multipliers[level]*2*(1+16*em/(2000+em))*factor;
    return {key:'electro_charged',element:'electro',level,em,resistance,coefficient:2,independent,leyline:independent,
      mona:independent*1.2/2,status:'mismatch',attribution:{cause:'5.2-reaction-coefficient'}};
  });
  const validate = audit => validateMonaTransformativeReviews([link], audit, [target]);
  const audit = { selection:{keys:['electro_charged']}, rows };
  assert.deepEqual(validate(audit).summary,{scenarios:19,cases:19,accepted:1,rejected:0});
  assert.deepEqual(validate(audit).issues,[]);
  assert.equal(classifyMonaDifferences([link],[],audit,[target])[0].status,'attributed');
  assert.equal(validate({...audit,rows:rows.slice(1)}).reviews.length,0);
  assert.equal(validate({...audit,rows:[...rows,{...rows[0],key:'overload'}]}).reviews.length,0);
  const tampered=structuredClone(audit);tampered.rows[0].mona*=1.1;
  assert.equal(validate(tampered).reviews.length,0);
  assert.equal(validate({...audit,selection:{keys:['electro_charged','electro_charged']}}).reviews.length,0);
});

test('equipment event evidence is exact-scope, versioned and rejects altered observations', () => {
  const revision = '589ac6919057709924c0c20d5a9d673fe9b0be1a';
  const record = { mona: 'mona:equipment-event:AshGravenDrinkingHorn', leyline: 'weapon:ashgravendrinkinghorn:equipment-hit:/hits/0',
    monaRevision: revision, leylineRevision: 'head', inputSignature: equipmentEventInputSignature('mona:equipment-event:AshGravenDrinkingHorn'),
    source: '.references/mona-community/beta-data/equipment-damage-events.mjs', owner: 'Barbara', category: 'normal',
    onField: true, confirmation: 'explicit', actorLevel: 90, enemyLevel: 90, targetResistance: .1,
    cases: [1, 5].map((refinement, i) => ({ refinement, beta: { stat: 'hp', ratio: [.4, .8][i], forceCritical: false,
      sourceTimes: [0, 14.999, 15], procSourceTimes: [0, 15] }, leyline: { panel: 10000, first: [1800, 3600][i], blocked: 0, ready: [1800, 3600][i] } })) };
  const report = { provenance: { mona: revision, leyline: 'head' }, mona: [{ id: record.mona }], leyline: [{ id: record.leyline }],
    batches: { scopedEquipmentEvents: [record] } };
  assert.equal(scopedEquipmentEventEvidence(record, report), true);
  assert.equal(buildEvidence(report)({ side: 'mona', sourceIds: [record.mona] }).details.scopedEquipmentEvents.length, 1);
  const stale = { ...report, provenance: { ...report.provenance, leyline: 'different-head' } };
  const staleDetails = buildEvidence(stale)({ side: 'mona', sourceIds: [record.mona] }).details;
  assert.equal(staleDetails.scopedEquipmentEvents.length, 0);
  assert.equal(staleDetails.pendingScopedEquipmentEvents.length, 1);
  for (const mutate of [r => { r.monaRevision = '0'.repeat(40); }, r => { r.leylineRevision = 'other'; },
    r => { r.inputSignature = '0'.repeat(64); }, r => { r.category = 'skill'; }, r => { r.onField = false; },
    r => { r.cases[1].beta.procSourceTimes[1] = 14.999; }, r => { r.cases[0].leyline.first += 1; },
    r => { r.cases[1].refinement = 2; }]) {
    const changed = structuredClone(record); mutate(changed);
    assert.equal(scopedEquipmentEventEvidence(changed, report), false);
  }
  const fakeReader = path => Buffer.from(path);
  const original = equipmentEventInputSignature(record.mona, fakeReader);
  const changed = equipmentEventInputSignature(record.mona, path => Buffer.from(path === 'src/engine/src/calculation/project.ts' ? path + 'changed' : path));
  assert.notEqual(original, changed);
});

test('Prized Isshin maps the 11420 item and leaves event semantics open', async () => {
  const catalog = await createRuntimeCatalog({ characters: ['bennett'], weapons: ['prizedisshinblade', 'prizedisshinblade-01'], sets: [], actions: [] });
  const entities = { characters: [await catalog.get('characters', 'bennett')],
    weapons: [await catalog.get('weapons', 'prizedisshinblade'), await catalog.get('weapons', 'prizedisshinblade-01')], sets: [] };
  const engine = await loadContentSchema('/src/engine/src/index.ts');
  const inventory = (await leylineSingleHitInventory(entities)).rows;
  const audit = await auditMonaEquipmentHits(inventory);
  const rows = audit.rows.filter(row => row.monaWeapon === 'PrizedIsshinBlade');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].entity, 'prizedisshinblade-01');
  assert.equal(rows[0].status, 'scaling-match');
  const staleInventory = inventory.filter(row => row.entity !== 'prizedisshinblade-01');
  const staleAudit = await auditMonaEquipmentHits(staleInventory);
  const stale = staleAudit.rows.find(row => row.monaWeapon === 'PrizedIsshinBlade');
  assert.equal(stale.status, 'missing-leyline-hit');
  assert.equal(stale.leyline, null);
  assert.match(rows[0].leyline.id, /^weapon:prizedisshinblade-01:/);
  const scoped = { ...audit, rows };
  const reviewed = await reviewMonaEquipmentBatch(inventory, entities, engine, scoped);
  assert.equal(reviewed.damage.rows[0].monaDamageBonus, -0.5);
  assert.equal(reviewed.damage.rows[0].status, 'match');
  assert.equal(reviewed.mappings.length, 1);
  const link = reviewed.mappings[0];
  assert.equal(link.id, 'equipment-coefficients-prizedisshinblade-01');
  assert.ok(link.leyline.every(row => row.id.startsWith('weapon:prizedisshinblade-01:')));
  assert.equal(classifyMonaDifferences([link])[0].status, 'open');
});

test('elemental ascension bonus enters common-input damage independently of attack', async () => {
  const scope={characters:['ningguang','klee'],weapons:['apprenticesnotes'],sets:['gladiatorsfinale'],actions:[]};
  const engine=await loadContentSchema('/src/engine/src/index.ts'),catalog=await createRuntimeCatalog(scope),entities={};
  for(const group of ['characters','weapons','sets']) entities[group]=await Promise.all(scope[group].map(id=>catalog.get(group,id)));
  const probes=await probeMonaSkills({characters:['Ningguang','Klee'],indices:[0,1],constellations:[0]});
  const inventory=(await monaCalculationInventory({probes})).rows, formal=(await leylineSingleHitInventory(entities)).rows;
  const candidates=singleHitCandidates(inventory.filter(r=>r.kind==='skill'),formal).candidates;
  const scaling=await compareMonaOrdinaryScaling(inventory,formal,candidates,probes.rows);
  const ordinary=await auditMonaOrdinaryBatch(inventory,formal,candidates,scaling,entities,engine), issues=[];
  const sourceMap=new Map(inventory.map(x=>[x.id,x])), targetMap=new Map(formal.map(x=>[x.id,x]));
  const reviews=reviewLinks(ordinary.mappings,sourceMap,targetMap,issues);
  const samples=[[1,0],[60,3],[90,6]].flatMap(([level,ascension])=>['501051','501054'].map(rollId=>({level,ascension,talentLevel:1,rollId})));
  const targetIds=['character:ningguang:hit:/talents/0/hits/1','character:klee:hit:/talents/0/hits/0'];
  const result=await auditMonaCommonInputBranches(inventory,formal,reviews,entities,engine,{targetIds,samples});
  assert.equal(result.summary.reviewed,2); assert.equal(reviewLinks(result.mappings,sourceMap,targetMap,issues).length,2); assert.deepEqual(issues,[]);
  for(const [id,bonuses] of [['ningguang',[0,.12,.24]],['klee',[0,.144,.288]]]) {
    const row=result.rows.find(entry=>entry.leyline.includes(id)); assert.equal(row.cases.length,6);
    for(let i=0;i<6;i++) {
      const sample=row.cases[i],e=sample.coefficientEvidence;
      assert.equal(e.expectedBonus,bonuses[Math.floor(i/2)]); assert.equal(e.monaBonus,e.expectedBonus);
      assert.ok(Math.abs(sample.mona-sample.leyline)<sample.tolerance);
      assert.ok(Math.abs(e.independentDamage-sample.leyline)<sample.tolerance);
      assert.ok(e.bonusSource.includes('/'+id+'/stats/promotion/'));
    }
  }
});
