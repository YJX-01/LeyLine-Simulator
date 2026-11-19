import { readCalculationLibrary } from '../../../helpers/read-calculation-library';
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { compileCalculation, evaluateDamageQuery, selectCalculationValue, type CompiledCalculation } from '@leyline/engine';
import { getArtifactMain, loadCatalog } from '@leyline/game-data';
import { type CalculationBinding, type CombatActor, type CombatContext, type CombatFrame, type DamageOccurrence, type DamageQuery,
  type DefinitionRef, type EvaluatedValue, type InventoryAllocation, type Value } from '@leyline/schema';
import { createAccount } from '../../../../src/web/src/domain/account';
import { confirmMonaImport, previewMonaImport } from '../../../../src/web/src/domain/mona-import';

const root = new URL('../../../../', import.meta.url);
const read = (path: string) => JSON.parse(readFileSync(new URL('src/game-data/data/' + path + '.json', root), 'utf8'));
const ref = (id: string): DefinitionRef => ({ namespace: 'builtin', id, revision: '1' });
const quantity = (unit: Extract<Value, { kind: 'quantity' }>['unit'], value: number): Value => ({ kind: 'quantity', unit, value });
const constant = (unit: Extract<Value, { kind: 'quantity' }>['unit'], value: number): CalculationBinding => ({ kind: 'constant', value: quantity(unit, value) });
const fact = (value: Value | null) => ({ value, provenance: 'explicit' as const, sourceRefs: [] });
function actor(id: string): CombatActor {
  return { id, inputs: {}, facts: {}, actorFacts: {}, ascension: 6, constellation: 0, refinement: 1, setCounts: {}, effects: [], talents: [] };
}
const numeric = (value: EvaluatedValue): number => { expect(value.state).toBe('known'); return value.state === 'known' && value.value.kind === 'quantity' ? value.value.value : NaN; };
function frame(actorId: string, eventId: string): CombatFrame {
  return { ownerId: actorId, recipientId: actorId, contributorId: null, targetId: 'target', eventId, sourceEventId: null, phase: 'before',
    facts: {}, actorFacts: {}, captures: {}, applications: [], factOverrides: [], hit: null };
}

// Source-derived mathematical requests: actual Kaeya charged-attack parameters and a compatible weapon,
// fixed level-90 growth and Hilichurl factors. No attack sequence or player build is claimed.
function charged(weaponId = 'favoniussword'): { context: CombatContext; query: Extract<DamageQuery, { kind: 'event' }>; expected: number[] } {
  const kaeya = read('characters/kaeya'), weapon = read('weapons/' + weaponId), talent = kaeya.talents.find((talent: { id: string }) => talent.id === 'kaeya.normal');
  const attack = kaeya.attributes.base.attack * kaeya.progression.curves.attack[90] + kaeya.progression.promotion[6].attack
    + weapon.baseAttack * weapon.attackCurve[90] + weapon.promotion[6];
  const rates = ['param6', 'param7'].map(id => talent.parameters.find((parameter: { id: string }) => parameter.id === id).values[0]);
  const context: CombatContext = { actors: [actor('kaeya')], targets: [{ id: 'target', inputs: {}, facts: {} }], team: { inputs: {}, facts: {}, actorFacts: {} }, sources: [], factIntervals: [],
    events: [{ id: 'charged', kind: 'action', actorId: 'kaeya', targetIds: ['target'], timeMs: 0, order: 0, skillId: 'kaeya.normal', category: 'charged', sourceEventIds: [], facts: {} }] };
  const outputs: DamageOccurrence[] = rates.map((ratio, index) => {
    const readFrame = frame('kaeya', 'charged');
    readFrame.hit = { skillId: 'kaeya.normal', hitId: 'kaeya.normal.param' + (index + 6), element: 'physical', category: 'charged', family: 'ordinary', origin: 'talent', reactionId: null };
    return { eventId: 'charged', outputId: 'param' + (index + 6), actorId: 'kaeya', contributorIds: [], family: 'ordinary', computation: { kind: 'formula', frame: readFrame,
      invocation: { formula: ref('ordinary-hit'), bindings: { skillBase: { kind: 'formula', formula: ref('attack-damage-base'), inputs: { attribute: constant('attack', attack), ratio: constant('scalar', ratio) }, output: 'base' },
        baseMultiplier: constant('scalar', 1), preReactionFlat: constant('damage', 0), additiveReactionBase: constant('damage', 0), ordinaryBonusMinusReduction: constant('scalar', 0),
        critFactor: constant('scalar', 1), defenseFactor: constant('scalar', 0.5), resistanceFactor: constant('scalar', 0.9), amplificationFactor: constant('scalar', 1) }, output: 'value', captures: [] } } };
  });
  return { context, query: { kind: 'event', eventId: 'charged', outputs }, expected: rates.map(ratio => attack * ratio * 0.5 * 0.9) };
}

describe('explicit event outputs, selection and inventory feasibility', () => {
  let program: CompiledCalculation;
  beforeAll(async () => { const compiled = compileCalculation(readCalculationLibrary()); expect(compiled.ok).toBe(true); if (compiled.ok) program = compiled.program; });

  it('keeps each real charged-hit component separate and sums the event exactly once', () => {
    const { context, query, expected } = charged(), original = JSON.stringify({ context, query });
    const result = evaluateDamageQuery(program, context, query);
    expect(result.execution).toBe('complete');
    expect(result.outputs).toHaveLength(2);
    result.outputs.forEach((output, index) => expect(numeric(output.value)).toBeCloseTo(expected[index], 8));
    expect(numeric(result.events[0].total)).toBeCloseTo(expected[0] + expected[1], 8);
    expect(numeric(result.totals.all)).toBe(numeric(result.events[0].total));
    expect(result.feasibility[0].status).toBe('unknown');
    const selected = selectCalculationValue(result, { kind: 'output', eventId: 'charged', outputId: 'param7' });
    expect(numeric(selected.value!)).toBeCloseTo(expected[1], 8);
    expect(numeric(selectCalculationValue(result, { kind: 'event-total', eventId: 'charged' }).value!)).toBeCloseTo(expected[0] + expected[1], 8);
    expect(selectCalculationValue(result, null).execution).toBe('invalid');
    expect(selectCalculationValue(result, { kind: 'output', eventId: 'charged', outputId: 'deleted' }).diagnostics[0].code).toBe('stale-reference');
    expect(JSON.stringify({ context, query })).toBe(original);
    const ids = new Set(result.trace.map(node => node.id));
    expect(ids.size).toBe(result.trace.length);
    expect(result.trace.every(node => node.dependencies.every(dependency => ids.has(dependency)))).toBe(true);
  });

  it('retains the same explicit output selection for a real weapon candidate and refuses a removed output', () => {
    const baseline = charged(), candidate = charged('harbingerofdawn');
    const selection = { kind: 'output' as const, eventId: 'charged', outputId: 'param6' };
    const left = selectCalculationValue(evaluateDamageQuery(program, baseline.context, baseline.query), selection);
    const right = selectCalculationValue(evaluateDamageQuery(program, candidate.context, candidate.query), selection);
    expect(numeric(right.value!) - numeric(left.value!)).toBeCloseTo(candidate.expected[0] - baseline.expected[0], 8);
    candidate.query.outputs.shift();
    const missing = selectCalculationValue(evaluateDamageQuery(program, candidate.context, candidate.query), selection);
    expect(missing.execution).toBe('invalid'); expect(missing.value).toBe(null);
  });

  it.each(['actor', 'skill', 'hit', 'category', 'target'] as const)('rejects the same conflicting %s fact in hit and event requests', field => {
    const { context, query } = charged(), event = context.events[0];
    // Change one declared fact of the same source-derived Kaeya charged attack.
    if (field === 'actor') { context.actors.push(actor('xingqiu')); event.actorId = 'xingqiu'; }
    else if (field === 'skill') event.skillId = 'kaeya.skill';
    else if (field === 'hit') event.hitId = 'kaeya.normal.param7';
    else if (field === 'category') event.category = 'normal';
    else event.targetIds = [];
    const output = query.outputs[0];
    const requests: DamageQuery[] = [{ kind: 'hit', output }, { kind: 'event', eventId: event.id, outputs: [output] }];
    for (const request of requests) {
      const result = evaluateDamageQuery(program, context, request);
      expect(result.execution, request.kind).toBe('invalid');
      expect(result.diagnostics.some(diagnostic => diagnostic.code === 'conflicting-definition')).toBe(true);
    }
  });

  it('preserves a known individual output when another event output is unknown and does not report a known partial sum', () => {
    const { context, query, expected } = charged(), second = query.outputs[1].computation;
    if (second.kind !== 'formula') throw new Error('Expected source formula output.');
    second.invocation.bindings.skillBase = { kind: 'fact', scope: 'query', key: 'unconfirmed-base', type: { kind: 'quantity', unit: 'damage' } };
    const result = evaluateDamageQuery(program, context, query);
    expect(result.execution).toBe('partial'); expect(result.events[0].total.state).toBe('unknown');
    const selected = selectCalculationValue(result, { kind: 'output', eventId: 'charged', outputId: 'param6' });
    expect(selected.execution).toBe('complete'); expect(numeric(selected.value!)).toBeCloseTo(expected[0], 8);
    expect(selected.diagnostics).toEqual([]);
    expect(result.requiredInputs[0].requiredBy).toEqual([JSON.stringify(['charged', 'param7'])]);
    expect(result.outputs[1].diagnosticIds.length).toBeGreaterThan(0);
    expect(result.outputs[0].diagnosticIds).toEqual([]);
  });

  it('evaluates an independent Hyperbloom occurrence without reading its source hit or ordinary factors', () => {
    const kuki = read('characters/kukishinobu'), weapon = read('weapons/ironsting'), level = read('calculation/reactions').rules.levelMultipliers[90];
    expect(kuki.identity.element).toBe('electro');
    const em = weapon.baseStat * weapon.statCurve[90], owner = actor('kukishinobu');
    owner.inputs.level = fact(quantity('count', 90)); owner.inputs.elementalMastery = fact(quantity('elementalMastery', em));
    const context: CombatContext = { actors: [owner], targets: [{ id: 'target', inputs: {}, facts: {} }], team: { inputs: {}, facts: {}, actorFacts: {} }, sources: [], factIntervals: [],
      events: [{ id: 'skill-source', kind: 'hit', actorId: owner.id, targetIds: ['target'], timeMs: 0, order: 0, skillId: 'kukishinobu.skill', category: 'skill', sourceEventIds: [], facts: {} },
        { id: 'hyperbloom', kind: 'reaction', actorId: owner.id, targetIds: ['target'], timeMs: 0, order: 1, reactionId: 'hyperbloom', sourceEventIds: ['skill-source'], facts: {} }] };
    const readFrame = frame(owner.id, 'hyperbloom');
    readFrame.hit = { skillId: null, hitId: null, category: null, family: 'transformative', element: 'dendro', origin: 'reaction', reactionId: 'hyperbloom' };
    const query: DamageQuery = { kind: 'event', eventId: 'hyperbloom', outputs: [{ eventId: 'hyperbloom', outputId: 'homing-projectile', actorId: owner.id, contributorIds: [owner.id], family: 'transformative', computation: {
      kind: 'formula', frame: readFrame, invocation: { formula: ref('transformative'), bindings: {
        levelMultiplier: { kind: 'formula', formula: ref('reaction-level-multiplier'), inputs: { level: { kind: 'attribute', actor: { role: 'owner' }, key: ref('attribute.level'), at: { kind: 'current', phase: 'same' } } }, output: 'value' },
        em: { kind: 'attribute', actor: { role: 'owner' }, key: ref('attribute.elementalMastery'), at: { kind: 'current', phase: 'same' } }, reactionCoefficient: constant('scalar', 3), reactionBonus: constant('scalar', 0), resistanceFactor: constant('scalar', 0.9),
      }, output: 'value', captures: [] } } }] };
    const result = evaluateDamageQuery(program, context, query);
    expect(result.outputs).toHaveLength(1);
    expect(numeric(result.totals.all)).toBeCloseTo(3 * level * (1 + 16 * em / (em + 2000)) * 0.9, 8);
    expect(result.trace.some(node => ['defenseFactor', 'critRate', 'ordinaryBonusMinusReduction'].includes(node.nodeId))).toBe(false);
    expect(result.events).toHaveLength(1); expect(result.events[0].eventId).toBe('hyperbloom');
    expect(evaluateDamageQuery(program, context, { kind: 'hit', output: query.outputs[0] }).execution).toBe('invalid');
    context.events[1].reactionId = 'bloom';
    expect(evaluateDamageQuery(program, context, query).diagnostics.some(diagnostic => diagnostic.code === 'conflicting-definition')).toBe(true);
  });

  it('accepts an ownerless lunar aggregate with explicitly supplied real contributors and no skill placeholder', () => {
    const level = read('calculation/reactions').rules.levelMultipliers[90];
    const inputs = [['kukishinobu', 'ironsting'], ['xingqiu', 'sacrificialsword']].map(([id, weaponId]) => {
      const weapon = read('weapons/' + weaponId), character = read('characters/' + id), em = weapon.stat === 'elementalMastery' ? weapon.baseStat * weapon.statCurve[90] : 0;
      expect(character.identity.weaponType).toBe(weapon.weaponType);
      return { id, em, input: { levelMultiplier: quantity('damage', level), em: quantity('elementalMastery', em), reactionBaseBonus: quantity('scalar', 0), reactionBonus: quantity('scalar', 0),
        flatBaseBonus: quantity('damage', 0), critFactor: quantity('scalar', 1), resistanceFactor: quantity('scalar', 0.9), elevationFactor: quantity('scalar', 1) } };
    });
    expect(read('characters/ineffa').identity.element).toBe('electro');
    const context: CombatContext = { actors: [...inputs.map(input => actor(input.id)), actor('ineffa')], targets: [{ id: 'target', inputs: {}, facts: {} }], team: { inputs: {}, facts: {}, actorFacts: {} }, sources: [], factIntervals: [],
      events: [{ id: 'lunar-charged', kind: 'reaction', actorId: null, targetIds: ['target'], timeMs: 0, order: 0, reactionId: 'lunar-charged', sourceEventIds: [], facts: {} }] };
    const query: DamageQuery = { kind: 'event', eventId: 'lunar-charged', outputs: [{ eventId: 'lunar-charged', outputId: 'thundercloud', actorId: null, contributorIds: inputs.map(input => input.id), family: 'lunar-charged', computation: {
      kind: 'aggregate', request: { definition: ref('lunar-charged'), contributors: inputs.map(input => ({ id: input.id, inputs: input.input })), probability: { kind: 'fixed' } } } }] };
    const result = evaluateDamageQuery(program, context, query), individual = inputs.map(input => 3 * level * (1 + 6 * input.em / (input.em + 2000)) * 0.9).sort((a, b) => b - a);
    expect(numeric(result.totals.all)).toBeCloseTo(individual[0] * 0.6 + individual[1] * 0.3, 8);
    expect(result.outputs[0].actorId).toBe(null); expect(result.outputs[0].computation.kind).toBe('aggregate');
    expect(result.outputs[0].aggregation?.states[0].ranking).toHaveLength(2);
  });

  it('represents a resource-only lunar Bloom occurrence without fabricating a damage output', () => {
    const { context } = charged();
    context.actors = ['nahida', 'xingqiu', 'lauma'].map(id => { expect(read('characters/' + id).identity.element).toBe(id === 'xingqiu' ? 'hydro' : 'dendro'); return actor(id); });
    context.events[0] = { id: 'lunar-bloom', kind: 'reaction', actorId: null, targetIds: ['target'], timeMs: 0, order: 0, reactionId: 'lunar-bloom', sourceEventIds: [], facts: {} };
    const result = evaluateDamageQuery(program, context, { kind: 'event', eventId: 'lunar-bloom', outputs: [] });
    expect(result.execution).toBe('complete'); expect(result.outputs).toEqual([]); expect(numeric(result.totals.all)).toBe(0);
  });

  it('enforces a single total budget and rejects duplicate or stale event references', () => {
    const { context, query } = charged();
    const limited = evaluateDamageQuery(program, context, query, { limits: { visits: 5, trace: 10 } });
    expect(limited.execution).toBe('invalid'); expect(limited.totals.all.state).toBe('invalid');
    expect(limited.diagnostics.some(diagnostic => diagnostic.code === 'budget')).toBe(true); expect(limited.trace.length).toBeLessThanOrEqual(10);
    query.outputs.push(structuredClone(query.outputs[0]));
    expect(evaluateDamageQuery(program, context, query).execution).toBe('invalid'); query.outputs.pop(); query.eventId = 'deleted';
    expect(evaluateDamageQuery(program, context, query).execution).toBe('invalid');
  });

  it.skipIf(!existsSync('.references/artifacts_mona.json'))('reports shared actual inventory references separately while retaining the same mathematical outputs', async () => {
    const original = readFileSync('.references/artifacts_mona.json', 'utf8'), account = createAccount(), catalog = await loadCatalog();
    confirmMonaImport(account, await previewMonaImport(original, account, catalog.sets, await getArtifactMain()));
    const item = account.artifacts.find(item => item.real)!, before = JSON.stringify(account), { context, query, expected } = charged();
    context.actors.push(actor('xingqiu'));
    const claim = { slot: item.real!.slot, inventoryAccountId: account.id, inventoryItemId: item.id };
    const allocations: InventoryAllocation[] = context.actors.map(actor => ({ actorId: actor.id, artifacts: [{ ...claim }] })); query.inventoryAllocations = allocations;
    const conflict = evaluateDamageQuery(program, context, query);
    expect(conflict.execution).toBe('complete'); expect(numeric(conflict.totals.all)).toBeCloseTo(expected[0] + expected[1], 8);
    expect(conflict.feasibility[0].status).toBe('conflict'); expect(conflict.feasibility[0].itemRefs[0].itemId).toBe(item.id);
    expect(conflict.diagnostics).toEqual([]);
    // Identity/error derivatives of this same original: unknown account, then detached inventory identity.
    allocations[1].artifacts[0].inventoryAccountId = null;
    expect(evaluateDamageQuery(program, context, query).feasibility[0].status).toBe('unknown');
    allocations[1].artifacts[0].inventoryItemId = null;
    expect(evaluateDamageQuery(program, context, query).feasibility[0].status).toBe('unknown');
    allocations[1].artifacts = [];
    expect(evaluateDamageQuery(program, context, query).feasibility[0].status).toBe('pass');
    expect(JSON.stringify(account)).toBe(before); expect(readFileSync('.references/artifacts_mona.json', 'utf8')).toBe(original);
  });
});
