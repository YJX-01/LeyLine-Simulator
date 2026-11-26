import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBehaviorLedger, reconcileBehaviors, reviewedNormalCurve } from '../../tools/lib/mona-behavior-ledger.mjs';
import { readContentSource } from '../../tools/lib/content-source.mjs';
import { leylineSingleHitInventory } from '../../tools/lib/leyline-single-hit-inventory.mjs';
import { declaredFacets } from '../../tools/lib/mona-behavior-scope.mjs';

const version = { mona: 'fixed', leyline: 'current' };
test('independent category windows bind only to modifiers reading their stack count', async () => {
  const weapon = readContentSource('src/game-data/data/weapons/polarstar.json');
  const set = readContentSource('src/game-data/data/artifact-sets/nymphsdream.json');
  const {rows} = await leylineSingleHitInventory({characters:[],weapons:[weapon],sets:[set]});
  const consumers = rows.filter(row => row.binding?.categoryStacks);
  assert.equal(consumers.filter(row => row.entity === weapon.id).length,4);
  assert.equal(consumers.filter(row => row.entity === set.id).length,6);
  for (const row of consumers) {
    const metadata = row.entity === weapon.id ? weapon : set;
    const [binding] = row.binding.categoryStacks;
    assert.equal(binding.rule, metadata.categoryStacks[0]);
    assert.equal(binding.source,'/categoryStacks/0');
    for (const facet of ['trigger','refresh','stacks','expiry']) assert.ok(declaredFacets(row,'buff').includes(facet));
  }
  assert.ok(rows.some(row => row.entity === weapon.id && row.subject === 'modifier' && !row.binding.categoryStacks));
});
const mona = { id: 'mona:reaction:overload', kind: 'reaction-field', key: 'overload', output: 'damage', source: { path: 'damage.rs' } };
const target = { id: 'public:reactions:attributes:4', subject: 'reaction-attributes', kind: 'reaction', entity: 'reactions',
  source: 'reactions.json#/calculation/attributes/4', binding: { identity: { id: 'attribute.reaction.overloaded.coefficient' } } };
function report() {
  return { provenance: version, mona: [mona], leyline: [target], links: [{ id: 'transformative-overload', disposition: 'matched',
    mona: [mona.id], leyline: [{ id: target.id }], comparisons: [{ expected: 10, actual: 10, tolerance: .001 }] }],
    transformative: { rows: [{ key: 'overload', mona: 10, leyline: 10, independent: 10, tolerance: .001 }] } };
}
const round = (data, before) => reconcileBehaviors(buildBehaviorLedger(data), before);

test('one modifier keeps its prior identity when its value switches from a manual count to the actual party', () => {
  const data = report();
  const oldValue = {fact:'otherElements'};
  const row = {id:'weapon:example:modifier:/buffs/0/modifiers/0', kind:'weapon', entity:'example', subject:'modifier',
    field:'/buffs/0/modifiers/0', binding:{buffId:'example.bonus',modifier:{target:'attribute.attackPercent',value:oldValue}}};
  data.leyline.push(row);
  const before = round(data);
  const initial = before.behaviors.find(item => item.rowId === row.id && item.facet === 'attribute');
  row.binding.modifier.value = {teamCount:{elements:'owner',match:'exclude',excludeOwner:true}};
  const changed = round(data, before);
  assert.ok(changed.behaviors.some(item => item.id === initial.id && !item.gaps.includes('absent')));
  assert.equal(changed.totals['leyline/buff'].discovered, 1);
  assert.equal(round(data, changed).totals['leyline/buff'].discovered, 0);
  const absent = round(report(), before);
  assert.ok(round(data, absent).behaviors.some(item => item.id === initial.id && !item.gaps.includes('absent')));
  const second = structuredClone(row);
  second.field = '/buffs/0/modifiers/1';
  second.id = 'weapon:example:modifier:' + second.field;
  second.binding.modifier.value = {fact:'ambiguousCount'};
  data.leyline.push(second);
  assert.ok(round(data, before).behaviors.some(item => item.id === initial.id && item.gaps.includes('absent')));
});

test('reviewed normal curves require every rank, source, two inputs and actual team identity', () => {
  const path = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/stats/talents.json';
  const ratios = readContentSource(path).kaeya.combat1.param1;
  const target = { id:'character:kaeya:hit:/talents/0/hits/0', binding:{definition:{base:[{stat:'attack',parameter:'param1'}]}} };
  const cases = Array.from({length:11}, (_, i) => i + 1).flatMap(rank => [100, 120].map(attack => {
    const team = rank === 11, damage = attack * ratios[rank - 1] * .45;
    return { level:90, ascension:6, constellation:0, talentLevel:team ? 10 : rank, effectiveTalentLevel:rank,
      rollId:String(attack), element:'physical', target:{level:90,resistance:.1}, talentBonuses:{normal:0},
      monaInput:{character:{skill1:rank-1}}, leylineBuild:{talentLevel:team ? 10 : rank,
        ...(team ? {teammate:{id:'tartaglia',build:{character:{id:'tartaglia'}}}} : {})},
      ...(team ? {teamSupport:{id:'tartaglia',monaTeamMode:'effective-rank-only',source:'src/game-data/data/characters/tartaglia.json#/passives/2'}} : {}),
      mona:damage, leyline:damage, tolerance:1e-6, effectiveAttack:{mona:attack,leyline:attack}, requiredInputs:[],
      coefficientEvidence:{terms:[{parameter:'param1',value:ratios[rank-1],source:`${path}#/kaeya/combat1/param1/${rank-1}`}],
        coefficient:ratios[rank-1],monaCoefficient:ratios[rank-1],independentDamage:damage} };
  }));
  const record = {mona:'mona:branch:Kaeya:0:c0:default:normal',leyline:target.id,constellation:0,status:'matched',cases};
  assert.equal(reviewedNormalCurve(record,target),true);
  for (const mutate of [r=>r.cases.pop(), r=>{r.cases[20].leylineBuild.teammate.build.character.id='amber';},
    r=>{r.cases[4].coefficientEvidence.terms[0].value+=.1;}, r=>{r.cases[4].mona+=1;},
    r=>{r.cases[20].monaInput.character.skill1=9;}, r=>{r.leyline='character:amber:hit:/talents/0/hits/0';}]) {
    const changed=structuredClone(record); mutate(changed); assert.equal(reviewedNormalCurve(changed,target),false);
  }
});

test('lost bindings and out-of-tolerance reads reopen prior behavior IDs and survive subsequent reruns', () => {
  const first = round(report());
  assert.equal(first.complete, true);
  const changed = report();
  changed.links = [];
  changed.leyline = [];
  changed.transformative.rows[0].mona = 9;
  const second = round(changed, first);
  assert.equal(second.complete, false);
  assert.deepEqual(second.behaviors.find(b => b.side === 'leyline').gaps, ['absent']);
  assert.ok(second.behaviors.find(b => b.side === 'mona').gaps.includes('difference'));
  for (const side of ['mona', 'leyline']) assert.equal(second.totals[side + '/damage'].reopened, 1);
  const third = round(changed, second);
  assert.equal(third.totals['leyline/damage'].ending, 1);
  assert.equal(third.totals['leyline/damage'].reopened, 0);
  const fixed = round(report(), third);
  assert.equal(fixed.complete, true);
  assert.equal(fixed.totals['leyline/damage'].closed, 1);
  assert.equal(fixed.batches.find(b => b.facet === 'formula').totals['leyline/damage'].closed, 1);
});

test('classify menu, options, pure healing and mixed source clauses with inspectable owners', () => {
  const data = report();
  data.mona.push({ id: 'mona:input:character:AetherCryo:config:2', kind: 'input', ownerType: 'character', field: 'config', owner: 'AetherCryo',
    value: { name: 'c2_em_state', options: ['未触发', '+60元素精通', '+120元素精通'] }, source: { path: 'character.js', pointer: '/AetherCryo/config/2' } },
  { id: 'mona:heal', kind: 'output-branch', parentId: 'mona:skill:example:0', output: 'healing', branch: 'normal' });
  data.leyline.push({ id: 'clause:mixed', subject: 'clause', source: 'character.json#/passives/0',
    clause: { name: '持续效果', text: '后台可造成火元素伤害，并使队友攻击力提高10%，最多叠加3层。' } });
  const ledger = buildBehaviorLedger(data);
  assert.equal(ledger.assignments.size, 5);
  assert.equal(ledger.assignments.get('mona:heal').role, 'excluded');
  assert.equal(ledger.assignments.get(data.mona[1].id).owner, 'character.js#/AetherCryo');
  assert.equal(ledger.behaviors.filter(b => b.rowId === data.mona[1].id).length, 2);
  const mixed = ledger.behaviors.filter(b => b.rowId === 'clause:mixed');
  assert.deepEqual(new Set(mixed.map(b => b.category)), new Set(['damage', 'buff']));
  for (const facet of ['off-field', 'recipient', 'stacks']) assert.ok(mixed.some(b => b.facet === facet));
  assert.ok(mixed.every(b => b.gaps.includes('unverified')));
});

test('stable hit IDs survive catalog pointer changes and discovered branches preserve accounting', () => {
  const data = report();
  const hit = { id: 'character:aino:hit:/talents/1/hits/0', kind: 'character', entity: 'aino', subject: 'hit',
    binding: { hitId: 'aino.skill.param1', definition: { base: [{ stat: 'attack', parameter: 'param1' }] } } };
  data.leyline.push(hit);
  const prior = round(data);
  hit.id = 'character:aino:hit:/talents/1/hits/1';
  hit.binding.definition.when = ['condition'];
  const next = round(data, prior);
  assert.equal(next.totals['leyline/damage'].discovered, 1);
  assert.ok(!next.behaviors.some(b => b.gaps.includes('absent')));
  for (const c of Object.values(next.totals)) assert.equal(c.ending, c.opening + c.discovered + c.reopened - c.closed);
  assert.throws(() => round({ ...data, provenance: { ...version, mona: 'changed' } }, prior));
});

test('a shared display row needs common-input readings for each observed configuration', () => {
  const data = report();
  const branches = [0, 6].map(c => ({ id: 'mona:branch:pair:' + c, parentId: 'mona:skill:pair',
    kind: 'output-branch', character: 'Pair', branch: 'normal', element: 'hydro', output: 'damage',
    scenario: { id: 'default', constellation: c }, result: { non_critical: 10 } }));
  data.mona.push(...branches);
  data.links.push(...branches.map(b => ({ id: 'map-' + b.id, disposition: 'matched', mona: [b.id], leyline: [{ id: target.id }] })));
  const cases = [10, 15, 20].map(v => ({ element: 'hydro', mona: v, leyline: v, tolerance: 0, effectiveAttack: { mona: v, leyline: v } }));
  data.batches = { commonInputs: [{ mona: branches[0].id, leyline: target.id, status: 'matched', cases }] };
  const formula = () => buildBehaviorLedger(data).behaviors.find(b => b.side === 'mona' && b.id.includes('pair') && b.facet === 'formula');
  assert.ok(formula().gaps.includes('comparison'));
  data.batches.commonInputsC6 = [{ ...data.batches.commonInputs[0], mona: branches[1].id }];
  assert.ok(!formula().gaps.includes('comparison'));
});

test('a scoped support profile does not erase a formal hit or certify an unresolved output', () => {
  const data = report();
  const hit = { id: 'character:fischl:hit:/passives/1/hits/0', kind: 'character', entity: 'fischl', subject: 'hit',
    binding: { hitId: 'fischl.a1.sinful-hex-skill', definition: { base: [{ stat: 'attack', ratio: .8 }], support: 'hit-unavailable' } } };
  data.leyline.push(hit);
  const getFormula = result => result.behaviors.find(item => item.rowId === hit.id && item.facet === 'formula');
  const prior = round(data);
  assert.ok(!getFormula(prior).gaps.includes('implementation'));
  assert.ok(getFormula(prior).gaps.includes('unverified'));
  Object.values(prior.product).find(item => item.rowId === hit.id).bound = false;
  hit.evidence = { status: 'available', refs: ['case'], comparison: { expected: 85.45, value: 85.45 } };
  const observed = round(data, prior);
  assert.ok(!getFormula(observed).gaps.includes('unverified'));
  assert.ok(getFormula(observed).gaps.includes('comparison'));
  assert.deepEqual(observed.productChanges, []);
  hit.binding.definition.family = 'unresolved';
  assert.ok(getFormula(round(data)).gaps.includes('implementation'));
});

test('attack scaling needs an independent coefficient and different attack panels in one configuration', () => {
  const hit = { id: 'character:kaeya:hit:/talents/0/hits/0', kind: 'character', entity: 'kaeya', subject: 'hit',
    binding: { hitId: 'kaeya.normal.1', definition: { base: [{ stat: 'attack', parameter: 'param1' }] } } };
  const branch = { id: 'mona:branch:Kaeya:0:c0:default:normal', parentId: 'mona:skill:Kaeya:0',
    kind: 'output-branch', character: 'Kaeya', branch: 'normal', element: 'physical', output: 'damage',
    scenario: { id: 'default', constellation: 0 }, result: { non_critical: 45 } };
  const sample = attack => ({ level: 90, ascension: 6, talentLevel: 1, constellation: 0, element: 'physical',
    target: { level: 90, resistance: .1 }, mona: attack * .45, leyline: attack * .45, tolerance: .00001,
    effectiveAttack: { mona: attack, leyline: attack }, coefficientEvidence: { terms: [{ parameter: 'param1',
      source: 'fixture.json#/param1/0', value: 1 }], coefficient: 1, monaCoefficient: 1, independentDamage: attack * .45 } });
  const measured = (a, b) => {
    const report = { provenance: version, mona: [branch], leyline: [hit],
      links: [{ id: 'sample', disposition: 'matched', mona: [branch.id], leyline: [{ id: hit.id }] }],
      batches: { commonInputs: [{ mona: branch.id, leyline: hit.id, status: 'matched', cases: [a, b] }] } };
    return buildBehaviorLedger(report).behaviors.find(row => row.rowId === hit.id && row.facet === 'scaling');
  };
  const first = sample(100);
  assert.deepEqual(measured(first, sample(120)).gaps, []);
  for (const change of [
    other => { other.talentLevel = 2; },
    other => { other.target.resistance = .2; },
    other => { other.coefficientEvidence.terms[0].source = ''; },
    other => { other.coefficientEvidence.monaCoefficient = .9; },
    other => { other.coefficientEvidence.independentDamage += 1; },
    other => { other.effectiveAttack.mona += 1; },
  ]) {
    const other = sample(120);
    change(other);
    assert.ok(measured(first, other).gaps.includes('comparison'));
  }
  assert.ok(measured(first, sample(100)).gaps.includes('comparison'));
});

test('panel points need the observed recipient base and both disabled controls to verify a percent buff', () => {
  const effect = { id: 'mona:effect:character:Sample:0', kind: 'effect', key: 'Sample', position: 0,
    effect: { stat: 'atk_percentage' }, source: { path: 'buff.js' } };
  const modifier = { id: 'character:sample:modifier:/passives/0/buffs/0/modifiers/0', kind: 'character', entity: 'sample',
    subject: 'modifier', binding: { buffId: 'sample.bonus', modifier: { target: 'attribute.attackPercent' } } };
  const record = { key: 'Sample', effectId: effect.id, targetId: modifier.id, amount: .2, stat: 'attackPercent',
    status: 'matched', monaExpected: 10, monaDelta: 10, leylineDelta: .2, behaviorEvidence: {
      source: 'sample', recipient: 'kaeya', attribute: 'attackPercent', monaBaseStat: 50,
      mona: { before: 50, enabled: 60, disabled: 50, disabledCondition: 'locked' },
      leyline: { before: 0, enabled: .2, disabled: 0, disabledCondition: 'inactive' },
    } };
  const data = { provenance: version, mona: [effect], leyline: [modifier],
    links: [{ id: 'sample', disposition: 'matched', mona: [effect.id], leyline: [{ id: modifier.id }] }],
    batches: { characterBuffs: [record] } };
  const attributes = () => buildBehaviorLedger(data).behaviors.filter(row => row.facet === 'attribute');
  assert.equal(attributes().length, 2);
  assert.ok(attributes().every(row => !row.gaps.includes('comparison')));
  record.behaviorEvidence.monaBaseStat = 40;
  assert.ok(attributes().every(row => row.gaps.includes('comparison')));
  delete record.behaviorEvidence.monaBaseStat;
  assert.ok(attributes().every(row => row.gaps.includes('comparison')));
  record.behaviorEvidence.monaBaseStat = 50;
  record.behaviorEvidence.leyline.disabled = .2;
  assert.ok(attributes().every(row => row.gaps.includes('comparison')));
});
