import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBehaviorLedger, reconcileBehaviors } from '../../tools/lib/mona-behavior-ledger.mjs';

const version = { mona: 'fixed', leyline: 'current' };
const mona = { id: 'mona:reaction:overload', kind: 'reaction-field', key: 'overload', output: 'damage', source: { path: 'damage.rs' } };
const target = { id: 'public:reactions:attributes:4', subject: 'reaction-attributes', kind: 'reaction', entity: 'reactions',
  source: 'reactions.json#/calculation/attributes/4', binding: { identity: { id: 'attribute.reaction.overloaded.coefficient' } } };
function report() {
  return { provenance: version, mona: [mona], leyline: [target], links: [{ id: 'transformative-overload', disposition: 'matched',
    mona: [mona.id], leyline: [{ id: target.id }], comparisons: [{ expected: 10, actual: 10, tolerance: .001 }] }],
    transformative: { rows: [{ key: 'overload', mona: 10, leyline: 10, independent: 10, tolerance: .001 }] } };
}
const round = (data, before) => reconcileBehaviors(buildBehaviorLedger(data), before);

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
  data.batches.commonInputs.push({ ...data.batches.commonInputs[0], mona: branches[1].id });
  assert.ok(!formula().gaps.includes('comparison'));
});
