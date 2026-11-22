import { readCalculationData } from '../../../../tools/lib/catalog-data.mjs';
import { readCalculationLibrary } from '../../../helpers/read-calculation-library';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { calculationEffectInstanceId, compileCalculation, evaluateBoundFormula, type CompiledCalculation } from '@leyline/engine';
import { statKeys, type BoundFormula, type CalculationBinding, type CalculationBundle, type CombatActor, type CombatContext, type CombatFrame,
  type DefinitionRef, type Element, type FormulaEvaluation, type Value } from '@leyline/schema';

const root = new URL('../../../../', import.meta.url);
const read = (path: string) => readCalculationData(new URL('src/game-data/data/' + path + '.json', root));
const ref = (id: string): DefinitionRef => ({ namespace: 'builtin', id, revision: '1' });
const quantity = (unit: Extract<Value, { kind: 'quantity' }>['unit'], value: number): Value => ({ kind: 'quantity', unit, value });
const constant = (unit: Extract<Value, { kind: 'quantity' }>['unit'], value: number): CalculationBinding => ({ kind: 'constant', value: quantity(unit, value) });
const attribute = (key: string, role: 'owner' | 'recipient' | 'contributor' = 'owner'): CalculationBinding => ({ kind: 'attribute', actor: { role }, key: ref('attribute.' + key), at: { kind: 'current', phase: 'before' } });
const fact = (value: Value | null) => ({ value, provenance: 'explicit' as const, sourceRefs: [] });

// Catalog-derived component inputs at level 90, without artifacts. These are explicit mathematical requests,
// not player builds, combat recordings, or full-kit acceptance cases. Interval times below come from adopted effects.
function component(id: string, weaponId: string, effects: string[] = []): CombatActor {
  const character = read('characters/' + id), weapon = read('weapons/' + weaponId);
  const inputs: CombatActor['inputs'] = {};
  for (const key of statKeys) inputs[key] = fact(quantity(key === 'elementalMastery' ? key : ['hp', 'attack', 'defense'].includes(key) ? key as 'hp' | 'attack' | 'defense' : 'scalar', 0));
  for (const key of ['hp', 'attack', 'defense'] as const) {
    const white = character.attributes.base[key] * character.progression.curves[key][90] + character.progression.promotion[6][key]
      + (key === 'attack' ? weapon.baseAttack * weapon.attackCurve[90] + weapon.promotion[6] : 0);
    inputs['white' + key[0].toUpperCase() + key.slice(1)] = fact(quantity(key, white));
    inputs['flat' + key[0].toUpperCase() + key.slice(1)] = fact(quantity(key, 0));
  }
  inputs.critRate = fact(quantity('scalar', character.attributes.base.critRate));
  inputs.critDamage = fact(quantity('scalar', character.attributes.base.critDamage));
  const secondary = weapon.baseStat * weapon.statCurve[90];
  if (weapon.stat !== 'attack') inputs[weapon.stat] = fact(quantity(weapon.stat === 'elementalMastery' ? weapon.stat : 'scalar', secondary));
  const specialized = character.attributes.specialized;
  const existing = inputs[specialized]?.value;
  if (existing?.kind === 'quantity') inputs[specialized] = fact({ ...existing, value: existing.value + character.progression.promotion[6].specialized });
  return { id, inputs, facts: {}, actorFacts: {}, ascension: 6, constellation: 0, refinement: 1, setCounts: {}, effects: effects.map(ref),
    talents: character.talents.map((talent: { id: string; parameters: { id: string; unit: string; values: number[] }[] }) => ({ id: talent.id, level: 1, sourceRefs: [],
      parameters: talent.parameters.map(parameter => ({ id: parameter.id, type: ['ratio', 'scalar'].includes(parameter.unit) ? { kind: 'quantity' as const, unit: 'scalar' as const } : null,
        values: parameter.values.map(value => ['ratio', 'scalar'].includes(parameter.unit) ? quantity('scalar', value) : null) })) })) };
}
function request(actors: CombatActor[], skillId: string, category: 'normal' | 'skill' | 'burst', element: Element = 'physical') {
  const owner = actors[0].id;
  const context: CombatContext = { actors, targets: [{ id: 'target', inputs: {}, facts: {} }], team: { inputs: {}, facts: {}, actorFacts: {} }, sources: [], factIntervals: [],
    events: [{ id: 'query', kind: 'hit', actorId: owner, targetIds: ['target'], timeMs: 0, order: 1, skillId, category, sourceEventIds: [], facts: {} }] };
  const frame: CombatFrame = { ownerId: owner, recipientId: owner, contributorId: null, targetId: 'target', eventId: 'query', sourceEventId: null, phase: 'before',
    facts: {}, actorFacts: {}, hit: { skillId, hitId: skillId + '.param1', category, element, family: 'ordinary', origin: 'talent', reactionId: null }, captures: {}, applications: [], factOverrides: [] };
  return { context, frame };
}
function scaling(key: 'attack' | 'hp' | 'defense', skillId: string, parameterId = 'param1'): BoundFormula {
  return { formula: ref(key + '-damage-base'), bindings: { attribute: attribute(key), ratio: { kind: 'talent-parameter', actor: { role: 'owner' }, skillId, parameterId, type: { kind: 'quantity', unit: 'scalar' } } }, output: 'base', captures: [] };
}
function ordinary(base: CalculationBinding, flat = attribute('baseDamageBonus'), bonus = attribute('damageBonus')): BoundFormula {
  return { formula: ref('ordinary-hit'), bindings: { skillBase: base, baseMultiplier: constant('scalar', 1), preReactionFlat: flat,
    additiveReactionBase: constant('damage', 0), ordinaryBonusMinusReduction: bonus, critFactor: constant('scalar', 1), defenseFactor: constant('scalar', 1), resistanceFactor: constant('scalar', 1), amplificationFactor: constant('scalar', 1) }, output: 'value', captures: [] };
}
function numeric(result: FormulaEvaluation, output = Object.keys(result.outputs)[0]): number {
  expect(result.execution, JSON.stringify(result.diagnostics)).toBe('complete');
  const value = result.outputs[output];
  expect(value.state).toBe('known');
  return value.state === 'known' && value.value.kind === 'quantity' ? value.value.value : NaN;
}
function input(actor: CombatActor, key: string): number { const value = actor.inputs[key].value; return value?.kind === 'quantity' ? value.value : NaN; }
function rate(actor: CombatActor, skill: string, parameter = 'param1'): number {
  const talent = actor.talents.find(item => item.id === skill)!, value = talent.parameters.find(item => item.id === parameter)!.values[talent.level - 1];
  return value?.kind === 'quantity' ? value.value : NaN;
}

describe('bound catalog components and adopted effect conditions', () => {
  let bundle: CalculationBundle, program: CompiledCalculation;
  beforeAll(async () => { bundle = readCalculationLibrary(); const compiled = compileCalculation(bundle); expect(compiled.ok).toBe(true); if (compiled.ok) program = compiled.program; });

  it('resolves Jade Cutter HP to ATK after its own HP-percent effect at all five refinements', () => {
    for (let refinement = 1; refinement <= 5; refinement++) {
      const actor = component('kamisatoayato', 'primordialjadecutter', ['primordialjadecutter.static-hpPercent', 'primordialjadecutter.hp-to-attack.attack']); actor.refinement = refinement;
      const { context, frame } = request([actor], 'kamisatoayato.normal', 'normal');
      const hp = input(actor, 'whiteHp') * (1 + [0.2, 0.25, 0.3, 0.35, 0.4][refinement - 1]);
      const expected = (input(actor, 'whiteAttack') + hp * [0.012, 0.015, 0.018, 0.021, 0.024][refinement - 1]) * rate(actor, 'kamisatoayato.normal');
      expect(numeric(evaluateBoundFormula(program, context, scaling('attack', 'kamisatoayato.normal'), frame))).toBeCloseTo(expected, 8);
    }
  });

  it('keeps Homa strict-below and Hu Tao at-or-below thresholds distinct', () => {
    const actor = component('hutao', 'staffofhoma', ['staffofhoma.static-hpPercent', 'staffofhoma.hp-to-attack.attack', 'hutao.ascension-four.pyro-bonus']);
    const { context, frame } = request([actor], 'hutao.normal', 'normal');
    const scale = scaling('attack', 'hutao.normal');
    const invocation = ordinary({ kind: 'formula', formula: scale.formula, inputs: scale.bindings, output: 'base' }, constant('damage', 0), attribute('pyroBonus'));
    const hp = input(actor, 'whiteHp') * 1.2;
    for (const ratio of [0.5, 0.5 - Number.EPSILON, 0.5 + Number.EPSILON]) {
      actor.facts.hpRatio = fact(quantity('scalar', ratio));
      const expected = (input(actor, 'whiteAttack') + hp * (0.008 + (ratio < 0.5 ? 0.01 : 0))) * rate(actor, 'hutao.normal') * (1 + (ratio <= 0.5 ? 0.33 : 0));
      expect(numeric(evaluateBoundFormula(program, context, invocation, frame))).toBeCloseTo(expected, 8);
    }
    actor.facts.hpRatio = fact(null);
    expect(evaluateBoundFormula(program, context, invocation, frame).execution).toBe('partial');
  });

  it('reads Yun Jin as effect owner and Ayato as recipient, with an explicit normal-hit application', () => {
    const ayato = component('kamisatoayato', 'harangeppakufutsu');
    const yunjin = component('yunjin', 'favoniuslance', ['yunjin.flying-cloud-base.base']);
    const { context, frame } = request([ayato, yunjin], 'kamisatoayato.normal', 'normal');
    context.events.unshift({ id: 'yunjin-cast', kind: 'action', actorId: yunjin.id, targetIds: [], timeMs: 0, order: 0, skillId: 'yunjin.burst', category: 'burst', sourceEventIds: [], facts: {} });
    const scale = scaling('attack', 'kamisatoayato.normal');
    const invocation = ordinary({ kind: 'formula', formula: scale.formula, inputs: scale.bindings, output: 'base' });
    const instance = calculationEffectInstanceId(yunjin.id, ref('yunjin.flying-cloud-base.base'), 'yunjin-cast');
    const incomplete = evaluateBoundFormula(program, context, invocation, frame);
    expect(incomplete.execution).toBe('partial');
    expect(incomplete.requiredInputs.some(required => required.scope === 'effect-applicability')).toBe(true);
    frame.applications = [{ instanceId: instance, active: true }];
    const base = input(ayato, 'whiteAttack') * rate(ayato, 'kamisatoayato.normal');
    expect(numeric(evaluateBoundFormula(program, context, invocation, frame))).toBeCloseTo(base + input(yunjin, 'whiteDefense') * rate(yunjin, 'yunjin.burst', 'param2'), 8);
    frame.applications[0].active = false;
    yunjin.inputs.whiteDefense = fact(null);
    const inactive = evaluateBoundFormula(program, context, invocation, frame);
    expect(numeric(inactive)).toBeCloseTo(base, 8);
    expect(inactive.requiredInputs).toEqual([]);
    frame.applications[0].active = true; frame.hit!.category = 'skill';
    expect(evaluateBoundFormula(program, context, invocation, frame).execution).toBe('invalid');
    frame.applications = [];
    expect(numeric(evaluateBoundFormula(program, context, invocation, frame))).toBeCloseTo(base, 8);
    frame.hit!.category = 'normal';
    frame.applications = [{ instanceId: instance, active: true }];
    yunjin.talents.find(talent => talent.id === 'yunjin.burst')!.parameters = yunjin.talents.find(talent => talent.id === 'yunjin.burst')!.parameters.filter(parameter => parameter.id !== 'param2');
    const missingParameter = evaluateBoundFormula(program, context, invocation, frame);
    expect(missingParameter.execution).toBe('invalid');
    expect(missingParameter.diagnostics.some(diagnostic => diagnostic.code === 'missing-dependency')).toBe(true);
  });

  it('applies Noblesse only after the action and before the source-defined twelve-second expiry', () => {
    const kaeya = component('kaeya', 'favoniussword', ['noblesseoblige.burst-team-attack.team-attack']); kaeya.setCounts.noblesseoblige = 4;
    const { context, frame } = request([kaeya], 'kaeya.burst', 'burst', 'cryo');
    context.events.unshift({ id: 'cast', kind: 'action', actorId: kaeya.id, targetIds: [], timeMs: 0, order: 0, skillId: 'kaeya.burst', category: 'burst', sourceEventIds: [], facts: {} });
    const invocation = scaling('attack', 'kaeya.burst');
    const expected = input(kaeya, 'whiteAttack') * rate(kaeya, 'kaeya.burst');
    frame.eventId = 'cast'; frame.phase = 'before';
    expect(numeric(evaluateBoundFormula(program, context, invocation, frame))).toBeCloseTo(expected, 8);
    frame.phase = 'after';
    // Explicit before reads continue to see the pre-action panel.
    expect(numeric(evaluateBoundFormula(program, context, invocation, frame))).toBeCloseTo(expected, 8);
    frame.eventId = 'query'; frame.phase = 'before'; context.events[1].timeMs = 11999;
    expect(numeric(evaluateBoundFormula(program, context, invocation, frame))).toBeCloseTo(expected * 1.2, 8);
    context.events[1].timeMs = 12000;
    expect(numeric(evaluateBoundFormula(program, context, invocation, frame))).toBeCloseTo(expected, 8);
    kaeya.setCounts.noblesseoblige = 3; context.events[1].timeMs = 1;
    expect(numeric(evaluateBoundFormula(program, context, invocation, frame))).toBeCloseTo(expected, 8);
  });

  it('uses the declared capture event while leaving another attribute read dynamic', () => {
    const kaeya = component('kaeya', 'favoniussword', ['noblesseoblige.burst-team-attack.team-attack']); kaeya.setCounts.noblesseoblige = 4;
    const { context, frame } = request([kaeya], 'kaeya.burst', 'burst', 'cryo');
    context.events.unshift({ id: 'cast', kind: 'action', actorId: kaeya.id, targetIds: [], timeMs: 0, order: 0, skillId: 'kaeya.burst', category: 'burst', sourceEventIds: [], facts: {} });
    context.events[1].timeMs = 12000;
    const invocation = scaling('attack', 'kaeya.burst');
    invocation.bindings.attribute = { ...attribute('attack'), at: { kind: 'capture', slot: 'burst-panel' } } as CalculationBinding;
    invocation.captures = [{ id: 'burst-panel', sourceSkillId: 'kaeya.burst', attributes: [ref('attribute.attack')], allowedPhases: ['after'] }];
    frame.captures['burst-panel'] = { eventId: 'cast', phase: 'after' };
    const base = input(kaeya, 'whiteAttack') * rate(kaeya, 'kaeya.burst');
    expect(numeric(evaluateBoundFormula(program, context, invocation, frame))).toBeCloseTo(base * 1.2, 8);
    expect(numeric(evaluateBoundFormula(program, context, scaling('attack', 'kaeya.burst'), frame))).toBeCloseTo(base, 8);
    frame.captures['burst-panel'] = null;
    expect(evaluateBoundFormula(program, context, invocation, frame).execution).toBe('partial');
    frame.captures['burst-panel'] = { eventId: 'query', phase: 'after' };
    expect(evaluateBoundFormula(program, context, invocation, frame).execution).toBe('invalid');
  });

  it.each(['attribute', 'fact'] as const)('checks source-event order for %s reads of the same Kaeya scaling', kind => {
    const actor = component('kaeya', 'favoniussword');
    const { context, frame } = request([actor], 'kaeya.skill', 'skill', 'cryo'), invocation = scaling('attack', 'kaeya.skill');
    const source = { ...structuredClone(context.events[0]), id: 'source', order: 0, facts: { attack: fact(actor.inputs.whiteAttack.value) } };
    context.events.unshift(source); frame.sourceEventId = source.id;
    invocation.bindings.attribute = kind === 'attribute' ? { ...attribute('attack'), at: { kind: 'source-event', phase: 'before' } } as CalculationBinding
      : { kind: 'fact', scope: 'source-event', key: 'attack', type: { kind: 'quantity', unit: 'attack' } };
    const expected = input(actor, 'whiteAttack') * rate(actor, 'kaeya.skill');
    expect(numeric(evaluateBoundFormula(program, context, invocation, frame))).toBeCloseTo(expected, 8);
    // One-field time/order error derivatives, rather than an invented combat recording.
    source.order = context.events[1].order;
    const ambiguous = evaluateBoundFormula(program, context, invocation, frame);
    expect(ambiguous.execution).toBe('partial');
    expect(ambiguous.requiredInputs.some(input => input.key === 'sourceEventOrder')).toBe(true);
    source.timeMs = context.events[1].timeMs + 1;
    const future = evaluateBoundFormula(program, context, invocation, frame);
    expect(future.execution).toBe('invalid');
    expect(future.diagnostics).toContainEqual(expect.objectContaining({ code: 'invalid-range', jsonPointer: '/frame/sourceEventId' }));
    source.timeMs = 0; source.order = 0;
    expect(numeric(evaluateBoundFormula(program, context, invocation, frame))).toBeCloseTo(expected, 8);
    if (kind === 'attribute') {
      frame.sourceEventId = frame.eventId;
      invocation.bindings.attribute = { ...attribute('attack'), at: { kind: 'source-event', phase: 'after' } } as CalculationBinding;
      expect(evaluateBoundFormula(program, context, invocation, frame).execution).toBe('invalid');
      frame.phase = 'after';
      expect(numeric(evaluateBoundFormula(program, context, invocation, frame))).toBeCloseTo(expected, 8);
    }
  });

  it('does not request Ayato HP bindings in the source-defined zero-Namisen branch', () => {
    const actor = component('kamisatoayato', 'favoniussword');
    const { context, frame } = request([actor], 'kamisatoayato.skill', 'skill', 'hydro');
    actor.inputs.whiteHp = fact(null);
    const invocation: BoundFormula = { formula: ref('kamisatoayato-shunsuiken-base'), bindings: { attack: attribute('attack'), hp: attribute('hp'),
      attackRate: constant('scalar', 0.5289), hpRate: { kind: 'fact', key: 'hpRate', type: { kind: 'quantity', unit: 'scalar' }, scope: 'query' }, namisen: constant('count', 0) }, output: 'base', captures: [] };
    const result = evaluateBoundFormula(program, context, invocation, frame);
    expect(numeric(result)).toBeCloseTo(input(actor, 'whiteAttack') * 0.5289, 8);
    expect(result.requiredInputs).toEqual([]);
    expect(result.trace.some(node => node.nodeId === 'attribute.hp')).toBe(false);
  });

  it('limits Nahida ascension bonuses to Tri-Karma and applies each source-defined cap independently', () => {
    const actor = component('nahida', 'magicguide', ['nahida.ascension-four.tri-karma-bonus', 'nahida.ascension-four.tri-karma-crit']);
    const { context, frame } = request([actor], 'nahida.skill', 'skill', 'dendro');
    const invocation = ordinary({ kind: 'formula', formula: ref('nahida.skill.tri-karma.base'), inputs: { attack: attribute('attack'), em: attribute('elementalMastery'),
      attackRate: { kind: 'talent-parameter', actor: { role: 'owner' }, skillId: 'nahida.skill', parameterId: 'param3', type: { kind: 'quantity', unit: 'scalar' } },
      emRate: { kind: 'talent-parameter', actor: { role: 'owner' }, skillId: 'nahida.skill', parameterId: 'param4', type: { kind: 'quantity', unit: 'scalar' } } }, output: 'base' }, constant('damage', 0));
    const crit: BoundFormula = { formula: ref('crit'), bindings: { critRate: attribute('critRate'), critDamage: attribute('critDamage') }, output: 'expected', captures: [] };
    frame.hit!.hitId = 'nahida.skill.param3';
    for (const em of [0, 200, 1000, 1000 + input(actor, 'elementalMastery')]) {
      actor.inputs.elementalMastery = fact(quantity('elementalMastery', em));
      const base = input(actor, 'whiteAttack') * rate(actor, 'nahida.skill', 'param3') + em * rate(actor, 'nahida.skill', 'param4');
      expect(numeric(evaluateBoundFormula(program, context, invocation, frame))).toBeCloseTo(base * (1 + Math.min(Math.max(em - 200, 0) * 0.001, 0.8)), 8);
      expect(numeric(evaluateBoundFormula(program, context, crit, frame))).toBeCloseTo(1 + (input(actor, 'critRate') + Math.min(Math.max(em - 200, 0) * 0.0003, 0.24)) * input(actor, 'critDamage'), 10);
      frame.hit!.hitId = 'nahida.skill.param1';
      expect(numeric(evaluateBoundFormula(program, context, invocation, frame))).toBeCloseTo(base, 8);
      frame.hit!.hitId = 'nahida.skill.param3';
    }
    actor.ascension = 3;
    const result = evaluateBoundFormula(program, context, crit, frame);
    expect(numeric(result)).toBeCloseTo(1 + input(actor, 'critRate') * input(actor, 'critDamage'), 10);
    expect(result.trace.some(node => node.definition.id === 'nahida.ascension-four')).toBe(false);
  });

  it('evaluates Cinnabar at the declared base-flat port and rejects double binding', () => {
    const actor = component('albedo', 'cinnabarspindle', ['cinnabarspindle.defense-skill-base.base']);
    const { context, frame } = request([actor], 'albedo.skill', 'skill');
    const base = scaling('defense', 'albedo.skill', 'param2');
    const invocation = ordinary({ kind: 'formula', formula: base.formula, inputs: base.bindings, output: 'base' });
    const derivative = structuredClone(bundle), formula = derivative.formulas.find(formula => formula.identity.id === 'ordinary-hit')!;
    if (formula.template.id !== 'ordinary-hit') throw new Error('Actual ordinary template changed');
    formula.template.baseFlat = 'effect-port';
    derivative.effects.find(effect => effect.identity.id === 'cinnabarspindle.defense-skill-base.base')!.target = { kind: 'port', formula: formula.identity, port: 'base-flat' };
    const compiled = compileCalculation(derivative); expect(compiled.ok).toBe(true); if (!compiled.ok) return;
    expect(evaluateBoundFormula(compiled.program, context, invocation, frame).diagnostics.some(diagnostic => diagnostic.code === 'conflicting-definition')).toBe(true);
    delete invocation.bindings.preReactionFlat;
    expect(evaluateBoundFormula(compiled.program, context, invocation, frame).execution).toBe('complete');
    frame.applications = [{ instanceId: calculationEffectInstanceId(actor.id, actor.effects[0], 'query'), active: true }];
    const defense = input(actor, 'whiteDefense') * (1 + input(actor, 'defensePercent'));
    expect(numeric(evaluateBoundFormula(compiled.program, context, invocation, frame))).toBeCloseTo(defense * (rate(actor, 'albedo.skill', 'param2') + 0.4), 8);
    frame.hit!.category = 'burst';
    expect(evaluateBoundFormula(compiled.program, context, invocation, frame).execution).toBe('invalid');
    frame.applications = [];
    expect(numeric(evaluateBoundFormula(compiled.program, context, invocation, frame))).toBeCloseTo(defense * rate(actor, 'albedo.skill', 'param2'), 8);
  });

  it('keeps Harbinger eligibility unknown until its HP fact is supplied and excludes the 90-percent boundary', () => {
    const actor = component('kaeya', 'harbingerofdawn', ['harbingerofdawn.static-critRate']);
    const { context, frame } = request([actor], 'kaeya.skill', 'skill', 'cryo');
    const invocation: BoundFormula = { formula: ref('crit'), bindings: { critRate: attribute('critRate'), critDamage: attribute('critDamage') }, output: 'expected', captures: [] };
    expect(evaluateBoundFormula(program, context, invocation, frame).execution).toBe('partial');
    for (const ratio of [0.9, 0.9 + Number.EPSILON]) {
      actor.facts.hpRatio = fact(quantity('scalar', ratio));
      expect(numeric(evaluateBoundFormula(program, context, invocation, frame))).toBeCloseTo(1 + (input(actor, 'critRate') + (ratio > 0.9 ? 0.14 : 0)) * input(actor, 'critDamage'), 10);
    }
  });

  it('reads Neuvillette HP conditions from intervals and preserves an explicitly unknown override', () => {
    const actor = component('neuvillette', 'prototypeamber', ['neuvillette.ascension-four.hydro-bonus']);
    const { context, frame } = request([actor], 'neuvillette.normal', 'normal', 'hydro');
    const base = scaling('hp', 'neuvillette.normal', 'param5');
    const invocation = ordinary({ kind: 'formula', formula: base.formula, inputs: base.bindings, output: 'base' }, constant('damage', 0), attribute('hydroBonus'));
    const hp = input(actor, 'whiteHp') * (1 + input(actor, 'hpPercent'));
    for (const ratio of [0.3, 0.8, 1]) {
      context.factIntervals = [{ id: 'hp-condition', subject: { kind: 'actor', id: actor.id }, startMs: 0, endMs: 12000, facts: { hpRatio: fact(quantity('scalar', ratio)) } }];
      expect(numeric(evaluateBoundFormula(program, context, invocation, frame))).toBeCloseTo(hp * rate(actor, 'neuvillette.normal', 'param5') * (1 + Math.min(Math.max(ratio - 0.3, 0) * 0.6, 0.3)), 8);
    }
    frame.factOverrides = [{ subject: { kind: 'actor', id: actor.id }, facts: { hpRatio: fact(null) } }];
    expect(evaluateBoundFormula(program, context, invocation, frame).execution).toBe('partial');
    frame.factOverrides = [];
    context.events[0].timeMs = 12000;
    expect(evaluateBoundFormula(program, context, invocation, frame).execution).toBe('partial');
    context.events[0].timeMs = 0;
    context.factIntervals.push({ ...context.factIntervals[0], id: 'overlap' });
    expect(evaluateBoundFormula(program, context, invocation, frame).execution).toBe('invalid');
  });

  it('refreshes a shared Noblesse group without stacking and reports ambiguous source order', () => {
    const kaeya = component('kaeya', 'favoniussword', ['noblesseoblige.burst-team-attack.team-attack']);
    const xingqiu = component('xingqiu', 'sacrificialsword', ['noblesseoblige.burst-team-attack.team-attack']);
    kaeya.setCounts.noblesseoblige = 4; xingqiu.setCounts.noblesseoblige = 4;
    const { context, frame } = request([kaeya, xingqiu], 'kaeya.skill', 'skill', 'cryo');
    context.events.unshift(...[kaeya, xingqiu].map((actor, index) => ({ id: actor.id + '-cast', kind: 'action' as const, actorId: actor.id, targetIds: [], timeMs: index * 6000, order: index, skillId: actor.id + '.burst', category: 'burst' as const, sourceEventIds: [], facts: {} })));
    context.events[2].timeMs = 11000;
    const invocation = scaling('attack', 'kaeya.skill'), expected = input(kaeya, 'whiteAttack') * rate(kaeya, 'kaeya.skill');
    expect(numeric(evaluateBoundFormula(program, context, invocation, frame))).toBeCloseTo(expected * 1.2, 8);
    context.events[0].timeMs = context.events[1].timeMs; context.events[0].order = context.events[1].order;
    const ambiguous = evaluateBoundFormula(program, context, invocation, frame);
    expect(ambiguous.execution).toBe('partial');
    expect(ambiguous.requiredInputs.some(input => input.scope === 'stacking-order')).toBe(true);
    context.events[0].sourceEventIds = [context.events[1].id]; context.events[1].sourceEventIds = [context.events[0].id];
    expect(evaluateBoundFormula(program, context, invocation, frame).diagnostics.some(diagnostic => diagnostic.code === 'cycle')).toBe(true);
  });

  it('reads explicit target attributes and keeps missing enemy defense facts unknown', () => {
    const actor = component('kaeya', 'favoniussword');
    const { context, frame } = request([actor], 'kaeya.skill', 'skill', 'cryo');
    actor.inputs.level = fact(quantity('count', 90)); actor.inputs.defenseIgnore = fact(quantity('scalar', 0));
    context.targets[0].inputs = { level: fact(quantity('count', 90)), defenseReduction: fact(quantity('scalar', 0)) };
    const invocation: BoundFormula = { formula: ref('defense'), bindings: { characterLevel: attribute('level'), enemyLevel: { kind: 'enemy', key: ref('target.level'), at: { kind: 'current', phase: 'before' } },
      reduction: { kind: 'enemy', key: ref('target.defenseReduction'), at: { kind: 'current', phase: 'before' } }, ignore: attribute('defenseIgnore') }, output: 'value', captures: [] };
    expect(numeric(evaluateBoundFormula(program, context, invocation, frame))).toBeCloseTo((90 + 100) / ((90 + 100) + (90 + 100)), 12);
    context.targets[0].inputs.defenseReduction = fact(null);
    const result = evaluateBoundFormula(program, context, invocation, frame);
    expect(result.execution).toBe('partial');
    expect(result.requiredInputs.some(required => required.key === 'defenseReduction')).toBe(true);
    // Actor and target can share a unit, but a target-only attribute cannot use an actor read.
    invocation.bindings.enemyLevel = { kind: 'attribute', actor: { role: 'owner' }, key: ref('target.level'), at: { kind: 'current', phase: 'before' } };
    expect(evaluateBoundFormula(program, context, invocation, frame).diagnostics.some(diagnostic => diagnostic.code === 'unit-mismatch')).toBe(true);
  });

  it('preserves explicit unknown actor selectors instead of falling back to a team assignment', () => {
    const kaeya = component('kaeya', 'favoniussword'), yunjin = component('yunjin', 'favoniuslance');
    const { context, frame } = request([kaeya, yunjin], 'kaeya.skill', 'skill', 'cryo');
    const invocation = scaling('defense', 'yunjin.burst', 'param2');
    invocation.bindings.ratio = { kind: 'talent-parameter', actor: { role: 'fact-actor', input: 'support' }, skillId: 'yunjin.burst', parameterId: 'param2', type: { kind: 'quantity', unit: 'scalar' } };
    invocation.bindings.attribute = { kind: 'attribute', actor: { role: 'fact-actor', input: 'support' }, key: ref('attribute.defense'), at: { kind: 'current', phase: 'before' } };
    context.team.actorFacts.support = yunjin.id;
    expect(numeric(evaluateBoundFormula(program, context, invocation, frame))).toBeCloseTo(input(yunjin, 'whiteDefense') * rate(yunjin, 'yunjin.burst', 'param2'), 8);
    frame.actorFacts.support = null;
    expect(evaluateBoundFormula(program, context, invocation, frame).execution).toBe('partial');
  });

  it('rejects exact-reference, unit, cycle and budget error derivatives without mutating catalog definitions', () => {
    const actor = component('kamisatoayato', 'primordialjadecutter', ['primordialjadecutter.hp-to-attack.attack']);
    const { context, frame } = request([actor], 'kamisatoayato.normal', 'normal');
    const invocation = scaling('attack', 'kamisatoayato.normal');
    invocation.bindings.attribute = attribute('hp');
    expect(evaluateBoundFormula(program, context, invocation, frame).diagnostics.some(diagnostic => diagnostic.code === 'unit-mismatch')).toBe(true);
    invocation.bindings.attribute = attribute('attack');
    const limited = evaluateBoundFormula(program, context, invocation, frame, { limits: { visits: 5 } });
    expect(limited.execution).toBe('invalid');
    expect(limited.diagnostics.some(diagnostic => diagnostic.code === 'budget')).toBe(true);
    const derivative = structuredClone(bundle), effect = derivative.effects.find(effect => effect.identity.id === 'primordialjadecutter.hp-to-attack.attack')!;
    effect.value = attribute('attack');
    const compiled = compileCalculation(derivative); expect(compiled.ok).toBe(true);
    if (compiled.ok) expect(evaluateBoundFormula(compiled.program, context, invocation, frame).diagnostics.some(diagnostic => diagnostic.code === 'cycle')).toBe(true);
    const truncated = evaluateBoundFormula(program, context, invocation, frame, { limits: { trace: 3 } });
    expect(truncated.execution).toBe('invalid');
    expect(truncated.trace.length).toBeLessThanOrEqual(3);
    expect(truncated.diagnostics.some(diagnostic => diagnostic.code === 'trace-truncated' && diagnostic.affectedOutputIds.length > 0)).toBe(true);
    actor.effects[0].revision = 'unavailable';
    expect(evaluateBoundFormula(program, context, invocation, frame).execution).toBe('invalid');
  });

  it('statically rejects incomplete effect dependencies, incompatible types and undeclared features', () => {
    for (const change of ['attribute', 'value', 'predicate', 'feature', 'family', 'source'] as const) {
      const derivative = structuredClone(bundle), effect = derivative.effects.find(effect => effect.identity.id === 'primordialjadecutter.hp-to-attack.attack')!;
      if (change === 'attribute' && effect.target.kind === 'attribute') effect.target.attribute.revision = 'absent';
      if (change === 'value') effect.value = constant('hp', 1);
      if (change === 'predicate') effect.predicate = constant('scalar', 1);
      if (change === 'feature') derivative.requiredFeatures = derivative.requiredFeatures.filter(feature => feature !== 'effect-v1');
      if (change === 'family') effect.appliesTo.families = ['undeclared-family'];
      if (change === 'source') effect.sources = ['absent-source'];
      const compiled = compileCalculation(derivative);
      expect(compiled.ok, change).toBe(false);
    }
  });

  it('rejects cyclic objects and accessors before recursive schema validation', () => {
    const derivative = structuredClone(bundle) as CalculationBundle & { cycle?: unknown };
    derivative.cycle = derivative;
    const cyclic = compileCalculation(derivative);
    expect(cyclic.ok).toBe(false);
    if (!cyclic.ok) expect(cyclic.diagnostics[0].code).toBe('cycle');
    delete derivative.cycle;
    let invoked = false;
    Object.defineProperty(derivative, 'schemaVersion', { get: () => { invoked = true; return 1; }, enumerable: true });
    expect(compileCalculation(derivative).ok).toBe(false);
    expect(invoked).toBe(false);
  });
});
