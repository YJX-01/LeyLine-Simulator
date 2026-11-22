import { readCalculationData } from '../../../../tools/lib/catalog-data.mjs';
import { readCalculationLibrary } from '../../../helpers/read-calculation-library';
import { beforeAll, describe, expect, it } from 'vitest';
import * as schemas from '@leyline/schema';
import { compileCharacterActions, createStructuredCombatContext, evaluateBoundFormula, evaluateStateMachine,
  prepareStructuredBuilds, type PreparedStructuredTeam } from '@leyline/engine';
import { getArtifactMain, getCharacter, getCharacterActions, getWeapon } from '@leyline/game-data';

const read = (path: string) => readCalculationData(path);
const quantity = (unit: schemas.CalculationUnit, value: number): schemas.Value => ({ kind: 'quantity', unit, value });
const fact = (value: schemas.Value): schemas.CalculationFact => ({ value, provenance: 'explicit', sourceRefs: [] });

// Source-derived action/state boundary checks. These explicit protocol conditions are not a
// recorded player rotation, an observed damage sequence, or acceptance of automatic scheduling.
describe('Vesna source actions and fixed event-state execution', () => {
  let character: schemas.StructuredCharacterDefinition, actions: schemas.CharacterActionsDefinition, library: schemas.CalculationBundle;
  let build: schemas.StructuredBuild;
  const teams = new Map<string, PreparedStructuredTeam>();
  beforeAll(async () => {
    library = readCalculationLibrary();
    character = await getCharacter('vesna');
    actions = (await getCharacterActions({ namespace: character.namespace, id: character.id, revision: character.revision }))!;
    build = { schemaVersion: '0.2.0', kind: 'calculation-build', dataVersion: character.dataVersion, character,
      weapon: await getWeapon('favoniussword'), artifacts: [], sets: [], artifactMain: await getArtifactMain(),
      level: 90, ascension: 6, constellation: 0, talents: { normal: 10, skill: 10, burst: 10 }, weaponLevel: 90, weaponAscension: 6, refinement: 1,
      sources: [{ id: 'artifact-main-source', kind: 'repo', repository: 'Rafs-kk/LunaGC-6.6-res', commit: 'b0501c5d89767ead5f647869a2412521447f7682', path: 'ExcelBinOutput/ReliquaryLevelExcelConfigData.json' }], artifactMainSourceRefs: ['artifact-main-source'] };
  });
  function team(rank = 0, ascension = 6): PreparedStructuredTeam {
    const key = rank + ':' + ascension;
    if (!teams.has(key)) {
      const input = structuredClone(build); input.constellation = rank; input.ascension = ascension;
      if (ascension === 0) { input.level = 20; input.talents = { normal: 1, skill: 1, burst: 1 }; }
      const result = prepareStructuredBuilds([{ id: 'vesna', build: input }], actions.calculation.bundle);
      expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true); if (!result.ok) throw new Error('Invalid actual catalog build');
      teams.set(key, result.team);
    }
    return teams.get(key)!;
  }
  function action(id: string, timeMs = 0, facts: schemas.CalculationEvent['facts'] = {}): schemas.CalculationEvent {
    const definition = actions.actions.find(action => action.id === 'vesna.' + id)!;
    return { id, kind: 'action', actionId: definition.id, actorId: 'vesna', targetIds: [], timeMs, order: 0,
      ...definition.skillId ? { skillId: definition.skillId } : {}, sourceEventIds: [], facts };
  }
  const probe = (timeMs: number): schemas.CalculationEvent => ({ id: 'boundary.' + timeMs, kind: 'state-change', actorId: 'vesna', targetIds: [], timeMs, order: 0, sourceEventIds: [], facts: {} });
  function setup(events: schemas.CalculationEvent[]): schemas.StructuredCombatSetup {
    return { events, targets: [{ id: 'enemy', inputs: { level: fact(quantity('count', 90)), defenseReduction: fact(quantity('scalar', 0)), ordinaryDamageReduction: fact(quantity('scalar', 0)), 'resistance.anemo': fact(quantity('scalar', 0.1)) }, facts: {} }],
      team: { inputs: {}, facts: {}, actorFacts: {} }, factIntervals: [{ id: 'explicit-radiance', subject: { kind: 'actor', id: 'vesna' }, startMs: 0, endMs: 100000, facts: { radiance: fact({ kind: 'enum', value: 'none' }) } }], sources: [] };
  }
  function request(): schemas.StateMachineRequest {
    return { id: 'vesna-state', definition: actions.calculation.stateMachine, ownerId: 'vesna', targetId: 'enemy', startMs: 0,
      initial: Object.fromEntries(actions.calculation.bundle.stateMachines[0].states.map(state => [state.key, { value: state.inactiveValue, expiresAtMs: null }])) };
  }
  function active(input: schemas.StateMachineRequest, rank = 0, highest = 0) {
    input.initial['vesna.stance'] = { value: { kind: 'boolean', value: true }, expiresAtMs: 15000 };
    input.initial['vesna.specialStage'] = { value: quantity('count', 3), expiresAtMs: null };
    input.initial['vesna.highestCasts'] = { value: quantity('count', highest), expiresAtMs: null };
    input.initial['vesna.swordQiSixths'] = { value: quantity('count', rank > 0 && highest === 0 ? 0 : 6), expiresAtMs: null };
  }
  function run(events: schemas.CalculationEvent[], input = request(), rank = 0, ascension = 6, limits?: { visits?: number; depth?: number; trace?: number }) {
    const prepared = team(rank, ascension), context = createStructuredCombatContext(prepared, setup(events));
    return evaluateStateMachine(prepared.program, context, input, { limits });
  }
  function value(result: ReturnType<typeof evaluateStateMachine>, eventId: string, phase: 'before' | 'after', key: string) {
    const output = result.outputs[JSON.stringify([eventId, phase, 'vesna.' + key])];
    expect(output, JSON.stringify(result.diagnostics)).toBeDefined();
    return output?.state === 'known' ? output.value.value : output?.state;
  }

  it('keeps one exact optional companion, closed data and unknown action timings', async () => {
    const canonical = read('src/game-data/data/actions/vesna.json');
    expect(compileCharacterActions(canonical, character, library).ok).toBe(true);
    expect(compileCharacterActions(actions, character).ok).toBe(true);
    expect(actions.actions).toHaveLength(15);
    expect(actions.actions.every(action => action.durationMs === null && action.cancelAfterMs === null && action.hits.every(hit => hit.offsetsMs.every(offset => offset === null)))).toBe(true);
    expect(await getCharacterActions({ namespace: 'builtin', id: 'vesna', revision: 'missing' })).toBeNull();
    const mismatch = structuredClone(actions); mismatch.character.revision = 'missing';
    const checked = compileCharacterActions(mismatch, character);
    expect(checked.ok).toBe(false); expect(checked.diagnostics.some(diagnostic => diagnostic.code === 'stale-reference')).toBe(true);
  });

  it.each([0, 2])('sets entry state and C2 stacks at constellation %i after the action only', rank => {
    const event = action('skill-enter'), result = run([event, probe(15000)], request(), rank);
    expect(result.execution, JSON.stringify(result.diagnostics)).toBe('complete');
    expect(value(result, event.id, 'before', 'stance')).toBe(false);
    expect(value(result, event.id, 'after', 'stance')).toBe(true);
    expect(value(result, event.id, 'after', 'disciplineStacks')).toBe(rank === 2 ? 6 : 0);
    expect(value(result, 'boundary.15000', 'before', 'stance')).toBe(false);
    expect(value(result, 'boundary.15000', 'before', 'swordQiSixths')).toBe(0);
    expect(value(result, 'boundary.15000', 'before', 'disciplineStacks')).toBe(rank === 2 ? 6 : 0);
  });

  it('requires the actual A1 unlock even at C2', () => {
    const result = run([action('skill-enter')], request(), 2, 0);
    expect(result.execution).toBe('complete'); expect(value(result, 'skill-enter', 'after', 'disciplineStacks')).toBe(0);
  });

  it('expires individual stacks on their own left-closed boundary', () => {
    const input = request(); input.startMs = 1000;
    input.initial['vesna.disciplineStacks'] = { value: quantity('count', 2), expiresAtMs: null, stackExpiries: [20000, 21000] };
    const result = run([probe(19999), probe(20000), probe(21000)], input);
    expect(result.execution).toBe('complete');
    expect(value(result, 'boundary.19999', 'before', 'disciplineStacks')).toBe(2);
    expect(value(result, 'boundary.20000', 'before', 'disciplineStacks')).toBe(1);
    expect(value(result, 'boundary.21000', 'before', 'disciplineStacks')).toBe(0);
  });

  it('keeps discipline and the C6 window independent from stance expiry', () => {
    const input = request(); active(input); input.startMs = 10000;
    input.initial['vesna.stance'].expiresAtMs = 12500;
    input.initial['vesna.disciplineStacks'] = { value: quantity('count', 6), expiresAtMs: null, stackExpiries: Array(6).fill(20000) };
    input.initial['vesna.c6Window'] = { value: { kind: 'boolean', value: true }, expiresAtMs: 15000 };
    const result = run([probe(12500), probe(15000), probe(20000)], input, 6);
    expect(result.execution).toBe('complete');
    expect(value(result, 'boundary.12500', 'before', 'stance')).toBe(false);
    expect(value(result, 'boundary.12500', 'before', 'disciplineStacks')).toBe(6);
    expect(value(result, 'boundary.12500', 'before', 'c6Window')).toBe(true);
    expect(value(result, 'boundary.15000', 'before', 'c6Window')).toBe(false);
    expect(value(result, 'boundary.15000', 'before', 'disciplineStacks')).toBe(6);
    expect(value(result, 'boundary.20000', 'before', 'disciplineStacks')).toBe(0);
  });

  it.each([0, 1, 6])('ends the stance at its source highest-cast limit at constellation %i', rank => {
    const input = request(); active(input, rank, rank === 0 ? 2 : 3);
    const result = run([action('special.3', 0, { 'vesna.swordQiCostSixths': fact(quantity('count', 6)) }), probe(5000)], input, rank);
    expect(result.execution).toBe('complete');
    expect(value(result, 'special.3', 'before', 'stance')).toBe(true);
    expect(value(result, 'special.3', 'after', 'stance')).toBe(false);
    expect(value(result, 'special.3', 'after', 'swordQiSixths')).toBe(0);
    expect(value(result, 'special.3', 'after', 'c6Window')).toBe(rank === 6);
    expect(value(result, 'boundary.5000', 'before', 'c6Window')).toBe(false);
  });

  it('allows the first C1 highest cast with zero resource and no invented paid cost', () => {
    const input = request(); active(input, 1, 0);
    const result = run([action('special.3')], input, 1);
    expect(result.execution).toBe('complete');
    expect(value(result, 'special.3', 'after', 'stance')).toBe(true);
    expect(value(result, 'special.3', 'after', 'swordQiSixths')).toBe(0);
    expect(result.requiredInputs.some(input => input.key === 'vesna.swordQiCostSixths' && input.requiredBy.length)).toBe(false);
  });

  it('keeps missing paid cost unknown and rejects explicit invalid resources, stages and C6 unlocks', () => {
    const input = request(); active(input);
    expect(run([action('special.3')], input).execution).toBe('partial');
    expect(run([action('special.3', 0, { 'vesna.swordQiCostSixths': fact(quantity('count', 7)) })], input).execution).toBe('invalid');
    expect(run([action('special.3', 0, { 'vesna.swordQiCostSixths': fact(quantity('count', 0)) })], input).execution).toBe('invalid');
    expect(run([action('special.2', 0, { 'vesna.swordQiCostSixths': fact(quantity('count', 6)) })], input).execution).toBe('invalid');
    expect(run([action('special.c6')], input).execution).toBe('invalid');
    expect(run([action('special.3', 0, { 'vesna.swordQiCostSixths': fact(quantity('scalar', 1)) })], input).execution).toBe('invalid');
  });

  it('grants a pinion at emission without a hit, retaining the unknown capacity above its proved floor', () => {
    const input = request(); active(input);
    const emitted = action('pinion-emitted'), result = run([emitted], input);
    expect(result.execution).toBe('complete'); expect(value(result, emitted.id, 'after', 'swordQiSixths')).toBe(7);
    input.initial['vesna.swordQiSixths'].value = quantity('count', 12);
    const unknown = run([emitted], input);
    expect(unknown.execution).toBe('partial'); expect(value(unknown, emitted.id, 'after', 'swordQiSixths')).toBe('unknown');
    expect(run([emitted], request()).execution).toBe('invalid');
  });

  it('preserves the unknown full-stack replacement policy until all possible expiries pass', () => {
    const input = request();
    input.initial['vesna.disciplineStacks'] = { value: quantity('count', 6), expiresAtMs: null, stackExpiries: Array(6).fill(20000) };
    const result = run([action('burst', 1000), probe(20000), probe(21000)], input);
    expect(result.execution).toBe('partial');
    expect(value(result, 'burst', 'after', 'disciplineStacks')).toBe(6);
    expect(value(result, 'boundary.20000', 'before', 'disciplineStacks')).toBe('unknown');
    expect(value(result, 'boundary.21000', 'before', 'disciplineStacks')).toBe(0);
  });

  it('retains the proved current resource count when consuming above an otherwise unknown capacity floor', () => {
    const input = request(); active(input);
    input.initial['vesna.specialStage'].value = quantity('count', 1);
    input.initial['vesna.swordQiSixths'].value = quantity('count', 18);
    const result = run([action('special.1', 0, { 'vesna.swordQiCostSixths': fact(quantity('count', 1)) })], input);
    expect(result.execution).toBe('complete');
    expect(value(result, 'special.1', 'after', 'swordQiSixths')).toBe(17);
    const changed = structuredClone(actions); delete changed.calculation.bundle.stateMachines[0].states.find(state => state.key === 'vesna.swordQiSixths')!.knownCapacityFloor;
    expect(compileCharacterActions(changed, character).ok).toBe(false);
  });

  it('clears discipline on leaving the field without inventing a stance-end rule', () => {
    const input = request(); active(input);
    input.initial['vesna.disciplineStacks'] = { value: quantity('count', 1), expiresAtMs: null, stackExpiries: [20000] };
    const result = run([action('leave-field')], input);
    expect(result.execution).toBe('complete'); expect(value(result, 'leave-field', 'after', 'disciplineStacks')).toBe(0);
    expect(value(result, 'leave-field', 'after', 'stance')).toBe(true);
  });

  it('does not fabricate missing initial expiry, event ordering or C6 discipline behavior', () => {
    const input = request(); active(input); input.initial['vesna.stance'].expiresAtMs = null;
    const missing = run([probe(0), probe(1)], input);
    expect(value(missing, 'boundary.0', 'before', 'stance')).toBe(true);
    expect(value(missing, 'boundary.1', 'before', 'stance')).toBe('unknown');
    const duplicate = run([probe(0), { ...probe(0), id: 'other-boundary' }]);
    expect(duplicate.execution).toBe('partial'); expect(value(duplicate, 'boundary.0', 'before', 'stance')).toBe('unknown');
    const c6 = request(); c6.initial['vesna.c6Window'] = { value: { kind: 'boolean', value: true }, expiresAtMs: 5000 };
    const result = run([action('special.c6')], c6, 6);
    expect(result.execution).toBe('partial'); expect(value(result, 'special.c6', 'after', 'disciplineStacks')).toBe('unknown');
  });

  it('uses the derived event phase in the same damage evaluator without future state leaking backwards', () => {
    const event = action('skill-enter'), prepared = team(2), context = createStructuredCombatContext(prepared, setup([event]));
    const state = evaluateStateMachine(prepared.program, context, request());
    context.stateFrames = state.stateFrames;
    const hit = character.talents.find(talent => talent.id === 'vesna.skill')!.hits.find(hit => hit.id === 'vesna.skill.param1')!;
    const frame: schemas.CombatFrame = { ownerId: 'vesna', recipientId: 'vesna', contributorId: null, targetId: 'enemy', eventId: event.id, sourceEventId: null,
      phase: 'before', facts: { critMode: fact({ kind: 'enum', value: 'noncritical' }), reactionMode: fact({ kind: 'enum', value: 'none' }) }, actorFacts: {}, captures: {}, applications: [], factOverrides: [],
      hit: { skillId: 'vesna.skill', hitId: hit.id, element: hit.element, category: hit.category, family: Object.keys(hit.damage)[0], origin: hit.origin, reactionId: null } };
    const before = evaluateBoundFormula(prepared.program, context, Object.values(hit.damage)[0], frame);
    const after = evaluateBoundFormula(prepared.program, context, Object.values(hit.damage)[0], { ...frame, phase: 'after' });
    expect(before.execution, JSON.stringify(before.diagnostics)).toBe('complete'); expect(after.execution, JSON.stringify(after.diagnostics)).toBe('complete');
    const a = before.outputs[Object.values(hit.damage)[0].output], b = after.outputs[Object.values(hit.damage)[0].output];
    expect(a.state).toBe('known'); expect(b.state).toBe('known');
    if (a.state === 'known' && b.state === 'known' && a.value.kind === 'quantity' && b.value.kind === 'quantity') expect(b.value.value / a.value.value).toBeCloseTo(1.4, 12);
    const conflict = evaluateStateMachine(prepared.program, context, request());
    expect(conflict.execution).toBe('invalid'); expect(conflict.diagnostics.some(diagnostic => diagnostic.code === 'conflicting-definition')).toBe(true);
  });

  it('rejects source unit or identity changes and keeps low budgets explicit and bounded', () => {
    const changed = structuredClone(actions);
    changed.calculation.bundle.stateMachines[0].states[0].duration = { kind: 'formula', invocation: { formula: { namespace: 'builtin', id: 'binding.milliseconds', revision: '1' }, output: 'value', captures: [],
      bindings: { value: { kind: 'talent-parameter', actor: { role: 'owner' }, skillId: 'vesna.skill', parameterId: 'absent', type: { kind: 'quantity', unit: 'milliseconds' } } } } };
    expect(compileCharacterActions(changed, character).ok).toBe(false);
    changed.calculation.bundle.stateMachines[0].states[0].duration.invocation.bindings.value = { kind: 'talent-parameter', actor: { role: 'owner' }, skillId: 'vesna.burst', parameterId: 'param4', type: { kind: 'quantity', unit: 'milliseconds' } };
    const units = compileCharacterActions(changed, character);
    expect(units.ok).toBe(false); expect(units.diagnostics.some(diagnostic => diagnostic.code === 'unit-mismatch')).toBe(true);
    for (const trace of [3, 5, 19, 51, 81]) {
      const result = run([action('skill-enter')], request(), 2, 6, { trace });
      expect(result.trace.length).toBeLessThanOrEqual(trace);
      if (result.execution === 'invalid') expect(result.diagnostics.some(diagnostic => diagnostic.code === 'budget')).toBe(true);
      else { expect(result.execution).toBe('complete'); expect(value(result, 'skill-enter', 'after', 'disciplineStacks')).toBe(6); }
    }
    expect(run([action('skill-enter')], request(), 2, 6, { trace: 3 }).execution).toBe('invalid');
    expect(run([action('skill-enter')], request(), 0, 6, { visits: 1 }).execution).toBe('invalid');
    const lowDepth = request(); active(lowDepth, 1);
    expect(run([action('special.3')], lowDepth, 1, 6, { depth: 1 }).execution).toBe('invalid');
  });
});
