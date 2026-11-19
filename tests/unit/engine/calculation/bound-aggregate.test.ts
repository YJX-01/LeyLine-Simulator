import { catalogInventory, readCalculationData } from '../../../../tools/lib/catalog-data.mjs';
import { readCalculationLibrary } from '../../../helpers/read-calculation-library';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import * as schemas from '@leyline/schema';
import { collectCalculationRoots, createStructuredCombatContext, describeCalculationTemplate, evaluateBoundAggregate, evaluateDamageQuery, prepareStructuredBuilds } from '@leyline/engine';
import { getArtifactMain } from '@leyline/game-data';
import { createContentLinker } from '../../../../tools/lib/content-linking.mjs';

const read = (path: string) => readCalculationData(path);
const ref = (id: string): schemas.DefinitionRef => ({ namespace: 'builtin', id, revision: '1' });
const quantity = (unit: Extract<schemas.Value, { kind: 'quantity' }>['unit'], value: number): schemas.Value => ({ kind: 'quantity', unit, value });
const fact = (value: schemas.Value | null): schemas.CalculationFact => ({ value, provenance: 'explicit', sourceRefs: [] });
const attribute = (key: string): schemas.CalculationBinding => ({ kind: 'attribute', actor: { role: 'contributor' }, key: ref('attribute.' + key), at: { kind: 'current', phase: 'same' } });
const constant = (unit: Extract<schemas.Value, { kind: 'quantity' }>['unit'], value: number): schemas.CalculationBinding => ({ kind: 'constant', value: quantity(unit, value) });
const numeric = (value: schemas.EvaluatedValue): number => { expect(value.state).toBe('known'); return value.state === 'known' && value.value.kind === 'quantity' ? value.value.value : NaN; };

// Catalog-derived mathematical conditions, with compatible level-90 weapons and no invented inventory.
// These checks cover contributor assembly, not full Vesna/Traveler kits or observed reaction sequences.
describe('build-bound stellar contributions and per-state ranking', () => {
  let library: schemas.CalculationBundle, main: schemas.ArtifactMainTable;
  let prepare: ReturnType<typeof createContentLinker>;
  const characters = new Map<string, schemas.StructuredCharacterDefinition>(), weapons = new Map<string, schemas.StructuredWeaponDefinition>();
  beforeAll(async () => {
    library = readCalculationLibrary(); main = await getArtifactMain();
    prepare = createContentLinker({ schemas, collectCalculationRoots, describeCalculationTemplate, library,
      manifest: catalogInventory(), hitReviews: read('tools/data/sources/calculation-hits/ordinary-bindings.json'),
      retainedRules: read('tools/data/sources/calculation-effects/retained-rules.json'), textBindings: read('tools/data/sources/character-text/base-and-manekin.json') });
    for (const id of ['vesna', 'aether-cryo']) characters.set(id, await prepare.character(read('src/game-data/data/characters/' + id + '.json')));
    for (const id of ['favoniussword', 'ironsting', 'harbingerofdawn']) weapons.set(id, await prepare.weapon(read('src/game-data/data/weapons/' + id + '.json')));
  });
  function build(id: string, weaponId: string): schemas.StructuredBuild {
    return { schemaVersion: '0.1.0', kind: 'calculation-build', dataVersion: 'genshin-db-8e5badd-content-v2', character: structuredClone(characters.get(id)!), weapon: structuredClone(weapons.get(weaponId)!),
      sets: [], artifacts: [], artifactMain: main, level: 90, ascension: 6, constellation: 0, talents: { normal: 1, skill: 1, burst: 1 }, weaponLevel: 90, weaponAscension: 6, refinement: 1,
      sources: [{ id: 'artifact-main-source', kind: 'repo', repository: 'Rafs-kk/LunaGC-6.6-res', commit: 'b0501c5d89767ead5f647869a2412521447f7682', path: 'ExcelBinOutput/ReliquaryLevelExcelConfigData.json' }], artifactMainSourceRefs: ['artifact-main-source'] };
  }
  function setting(weaponId = 'favoniussword') {
    const builds = [{ id: 'vesna', build: build('vesna', 'favoniussword') }, { id: 'aether-cryo', build: build('aether-cryo', weaponId) }];
    const prepared = prepareStructuredBuilds(builds, library);
    expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true); if (!prepared.ok) throw new Error('build assembly failed');
    const setup: schemas.StructuredCombatSetup = {
      targets: [{ id: 'enemy', inputs: { 'resistance.anemo': fact(quantity('scalar', 0.1)) }, facts: {} }],
      team: { inputs: {}, facts: {}, actorFacts: {} }, sources: [], factIntervals: [{ id: 'vesna-no-radiance', subject: { kind: 'actor', id: 'vesna' }, startMs: 0, endMs: 3000,
        facts: { radiance: fact({ kind: 'enum', value: 'none' }) } }],
      events: [{ id: 'reaction', kind: 'reaction', actorId: null, targetIds: ['enemy'], timeMs: 1000, order: 1, reactionId: 'stellar-swirl', sourceEventIds: [], facts: {} }],
    };
    const request: schemas.BoundAggregateRequest = { definition: ref('stellar-swirl'), probability: { kind: 'fixed' }, contributors: builds.map(({ id }) => ({
      id, qualified: true,
      invocation: { formula: ref('stellar-swirl-individual'), output: 'value', captures: [], bindings: {
        levelMultiplier: { kind: 'formula', formula: ref('reaction-level-multiplier'), output: 'value', inputs: { level: attribute('level') } },
        reactionCoefficient: constant('scalar', 0.75), reactionBaseBonus: constant('scalar', 0), em: attribute('elementalMastery'), reactionBonus: constant('scalar', 0), flatBaseBonus: constant('damage', 0), elevationFactor: constant('scalar', 1),
        critFactor: { kind: 'formula', formula: ref('crit-selected'), output: 'value', inputs: {
          mode: { kind: 'fact', scope: 'query', key: 'critMode', type: { kind: 'enum', values: ['noncritical', 'critical', 'expected'] } }, critRate: attribute('critRate'), critDamage: attribute('critDamage') } },
        resistanceFactor: { kind: 'formula', formula: ref('resistance'), output: 'value', inputs: { resistance: { kind: 'enemy', key: ref('target.resistance.anemo'), at: { kind: 'current', phase: 'same' } } } },
      } },
      frame: { ownerId: id, recipientId: id, contributorId: id, targetId: 'enemy', eventId: 'reaction', sourceEventId: null, phase: 'before',
        facts: { critMode: fact({ kind: 'enum', value: 'noncritical' }) }, actorFacts: {}, captures: {}, applications: [], factOverrides: [],
        hit: { skillId: null, hitId: null, element: 'anemo', category: null, family: 'stellar-swirl', origin: 'reaction', reactionId: 'stellar-swirl' } },
    })) };
    return { builds, team: prepared.team, setup, context: createStructuredCombatContext(prepared.team, setup), request };
  }
  function independent(request: schemas.BoundAggregateRequest) {
    request.probability = { kind: 'independent', variables: request.contributors.map(contributor => ({ id: contributor.id + '.crit',
      probability: { kind: 'crit-rate', contributorId: contributor.id, binding: attribute('critRate') },
      bindings: [{ contributorId: contributor.id, fact: 'critMode', yes: { kind: 'enum', value: 'critical' }, no: { kind: 'enum', value: 'noncritical' } }],
    })) };
  }
  function sourceValues(id: string, weaponId: string) {
    const character = read('src/game-data/data/characters/' + id + '.json'), weapon = read('src/game-data/data/weapons/' + weaponId + '.json');
    const growth = character.progression.promotion[6];
    const stat = (key: string) => (character.attributes.base[key] ?? 0) + (character.attributes.specialized === key ? growth.specialized : 0)
      + (weapon.stat === key ? weapon.baseStat * weapon.statCurve[90] : 0);
    const em = stat('elementalMastery'), level = read('src/game-data/data/calculation/reactions.json').rules.levelMultipliers[90];
    return { base: level * 0.75 * (1 + 6 * em / (em + 2000)) * 0.9, chance: stat('critRate'), critical: 1 + stat('critDamage') };
  }
  function expected(weaponId = 'favoniussword', secondChanceBonus = 0) {
    const values = [sourceValues('vesna', 'favoniussword'), sourceValues('aether-cryo', weaponId)];
    values[1].chance += secondChanceBonus;
    let total = 0;
    for (const a of [false, true]) for (const b of [false, true]) {
      const flags = [a, b], probability = values.reduce((product, item, index) => product * (flags[index] ? item.chance : 1 - item.chance), 1);
      const damage = values.map((item, index) => item.base * (flags[index] ? item.critical : 1)).sort((x, y) => y - x);
      total += probability * (damage[0] * 0.6 + damage[1] * 0.3);
    }
    return total;
  }

  it('reads actual level, mastery, crit and target inputs from separate builds without ordinary defense', () => {
    const { team, context, request } = setting('ironsting'), before = JSON.stringify({ context, request });
    const result = evaluateBoundAggregate(team.program, context, request), a = sourceValues('vesna', 'favoniussword'), b = sourceValues('aether-cryo', 'ironsting');
    expect(result.execution, JSON.stringify(result.diagnostics)).toBe('complete');
    expect(numeric(result.value)).toBeCloseTo(Math.max(a.base, b.base) * 0.6 + Math.min(a.base, b.base) * 0.3, 8);
    expect(result.trace.some(node => node.nodeId === 'defenseFactor')).toBe(false);
    expect(new Set(result.trace.flatMap(node => node.context?.actorId ? [node.context.actorId] : []))).toEqual(new Set(['vesna', 'aether-cryo', 'enemy']));
    expect(JSON.stringify({ context, request })).toBe(before);
  });

  it('derives independent crit probabilities from builds and ranks within all four outcomes', () => {
    const { team, context, request } = setting(); independent(request);
    const result = evaluateBoundAggregate(team.program, context, request);
    expect(result.execution, JSON.stringify(result.diagnostics)).toBe('complete');
    expect(result.states).toHaveLength(4); expect(numeric(result.value)).toBeCloseTo(expected(), 8);
    expect(new Set(result.states.map(state => state.ranking[0].contributorId)).size).toBe(2);
    const means = [sourceValues('vesna', 'favoniussword'), sourceValues('aether-cryo', 'favoniussword')]
      .map(value => value.base * (1 + value.chance * (value.critical - 1))).sort((a, b) => b - a);
    expect(Math.abs(numeric(result.value) - (means[0] * 0.6 + means[1] * 0.3))).toBeGreaterThan(1);
    const ids = new Set(result.trace.map(node => node.id));
    expect(result.trace.every(node => node.dependencies.every(id => ids.has(id)))).toBe(true);
  });

  it('rebuilds mastery, per-state values and ranking after a compatible weapon change', () => {
    const original = setting(), changed = setting('ironsting'); independent(original.request); independent(changed.request);
    const first = evaluateBoundAggregate(original.team.program, original.context, original.request);
    const second = evaluateBoundAggregate(changed.team.program, changed.context, changed.request);
    expect(numeric(first.value)).toBeCloseTo(expected(), 8); expect(numeric(second.value)).toBeCloseTo(expected('ironsting'), 8);
    expect(numeric(second.value)).toBeGreaterThan(numeric(first.value));
    expect(second.states.find(state => state.id.endsWith('aether-cryo.crit=false'))!.ranking[0].contributorId).toBe('aether-cryo');
    expect(numeric(evaluateBoundAggregate(original.team.program, original.context, original.request).value)).toBe(numeric(first.value));
  });

  it('uses Harbinger of Dawn HP condition for both probability and critical damage', () => {
    const { team, context, request } = setting('harbingerofdawn'); independent(request);
    context.actors.find(actor => actor.id === 'aether-cryo')!.facts.hpRatio = fact(quantity('scalar', 1));
    const high = evaluateBoundAggregate(team.program, context, request);
    expect(numeric(high.value)).toBeCloseTo(expected('harbingerofdawn', 0.14), 8);
    context.actors.find(actor => actor.id === 'aether-cryo')!.facts.hpRatio = fact(quantity('scalar', 0.9));
    expect(numeric(evaluateBoundAggregate(team.program, context, request).value)).toBeCloseTo(expected('harbingerofdawn'), 8);
    delete context.actors.find(actor => actor.id === 'aether-cryo')!.facts.hpRatio;
    const unknown = evaluateBoundAggregate(team.program, context, request);
    expect(unknown.execution).toBe('partial'); expect(unknown.requiredInputs.some(input => input.key === 'hpRatio')).toBe(true);
  });

  it('keeps contributor qualification unknown and rejects contradictory actor ownership', () => {
    const { team, context, request } = setting(); request.contributors[1].qualified = null;
    const missing = evaluateBoundAggregate(team.program, context, request);
    expect(missing.execution).toBe('partial'); expect(missing.states).toEqual([]); expect(missing.requiredInputs[0].key).toBe('qualified');
    request.contributors[1].qualified = false;
    expect(evaluateBoundAggregate(team.program, context, request).execution).toBe('invalid');
    request.contributors[1].qualified = true; request.contributors[1].frame.ownerId = 'vesna';
    expect(evaluateBoundAggregate(team.program, context, request).execution).toBe('invalid');
    request.contributors[1].frame.ownerId = 'aether-cryo'; request.contributors[1].qualified = null;
    delete request.contributors[1].invocation.bindings.em;
    const invalid = evaluateBoundAggregate(team.program, context, request);
    expect(invalid.execution).toBe('invalid'); expect(invalid.diagnostics.some(diagnostic => diagnostic.code === 'missing-dependency')).toBe(true);
  });

  it('reads an explicitly declared capture time and rejects a future capture', () => {
    // Binding-protocol derivative of the actual weapon condition; no claim that this reaction snapshots crit rate in game.
    const { team, context, request } = setting('harbingerofdawn'); independent(request);
    const contributor = request.contributors[1], key = ref('attribute.critRate');
    contributor.invocation.captures = [{ id: 'panel', sourceSkillId: 'aether-cryo.skill', attributes: [key], allowedPhases: ['after'] }];
    contributor.frame.captures.panel = { eventId: 'capture', phase: 'after' };
    if (request.probability.kind !== 'independent') throw new Error('expected independent model');
    request.probability.variables[1].probability!.binding = { kind: 'attribute', actor: { role: 'contributor' }, key, at: { kind: 'capture', slot: 'panel' } };
    context.events.unshift({ id: 'capture', kind: 'capture', actorId: 'aether-cryo', targetIds: [], timeMs: 0, order: 0, skillId: 'aether-cryo.skill', sourceEventIds: [], facts: {} });
    context.actors.find(actor => actor.id === 'aether-cryo')!.facts.hpRatio = fact(quantity('scalar', 0.8));
    context.factIntervals.push({ id: 'before-damage', subject: { kind: 'actor', id: 'aether-cryo' }, startMs: 0, endMs: 500, facts: { hpRatio: fact(quantity('scalar', 1)) } });
    const result = evaluateBoundAggregate(team.program, context, request);
    expect(numeric(result.value)).toBeCloseTo(expected('harbingerofdawn', 0.14), 8);
    expect(result.trace.some(node => node.context?.captureSlot === 'panel')).toBe(true);
    context.events[0].timeMs = 2000;
    expect(evaluateBoundAggregate(team.program, context, request).execution).toBe('invalid');
  });

  it('distinguishes probability range errors, crit clamping, wrong units and missing facts', () => {
    const { team, context, request } = setting(); independent(request);
    if (request.probability.kind !== 'independent') throw new Error('expected independent model');
    const source = request.probability.variables[0].probability!;
    source.kind = 'probability'; source.binding = constant('scalar', sourceValues('vesna', 'favoniussword').critical);
    expect(evaluateBoundAggregate(team.program, context, request).execution).toBe('invalid');
    source.kind = 'crit-rate';
    const clamped = evaluateBoundAggregate(team.program, context, request);
    expect(clamped.execution).toBe('complete'); expect(clamped.states).toHaveLength(2);
    source.binding = attribute('elementalMastery');
    expect(evaluateBoundAggregate(team.program, context, request).diagnostics.some(diagnostic => diagnostic.code === 'unit-mismatch')).toBe(true);
    request.probability.variables[0].probability = null;
    expect(evaluateBoundAggregate(team.program, context, request).execution).toBe('partial');
  });

  it('evaluates an explicit correlated model with the same source-derived crit marginals', () => {
    const { team, context, request } = setting(); independent(request);
    const independentValue = numeric(evaluateBoundAggregate(team.program, context, request).value);
    const a = sourceValues('vesna', 'favoniussword'), b = sourceValues('aether-cryo', 'favoniussword');
    const cases = [[false, false, 1 - a.chance], [true, false, a.chance - b.chance], [true, true, b.chance]] as const;
    request.probability = { kind: 'joint', states: cases.map(([left, right, probability], index) => ({ id: String(index), probability,
      bindings: [left, right].map((critical, i) => ({ contributorId: request.contributors[i].id, fact: 'critMode', value: { kind: 'enum', value: critical ? 'critical' : 'noncritical' } })),
    })) };
    const result = evaluateBoundAggregate(team.program, context, request);
    const expected = cases.reduce((sum, [left, right, probability]) => {
      const damages = [a.base * (left ? a.critical : 1), b.base * (right ? b.critical : 1)].sort((x, y) => y - x);
      return sum + probability * (damages[0] * 0.6 + damages[1] * 0.3);
    }, 0);
    expect(numeric(result.value)).toBeCloseTo(expected, 8); expect(Math.abs(numeric(result.value) - independentValue)).toBeGreaterThan(1);
  });

  it('shares work and trace limits between probability reads, effects and every outcome', () => {
    const { team, context, request } = setting(); independent(request);
    for (const limits of [{ visits: 10 }, { depth: 1 }, { trace: 20 }, { probabilityStates: 2 }]) {
      const result = evaluateBoundAggregate(team.program, context, request, { limits });
      expect(result.execution).toBe('invalid'); expect(result.diagnostics.some(diagnostic => diagnostic.code === 'budget')).toBe(true);
      if (limits.trace) expect(result.trace.length).toBeLessThanOrEqual(limits.trace);
    }
    for (const trace of [3, 4, 5, 19, 21, 31, 51, 81]) {
      const result = evaluateBoundAggregate(team.program, context, request, { limits: { trace } });
      expect(result.trace.length).toBeLessThanOrEqual(trace);
      expect(result.execution).toBe(result.value.state === 'known' ? 'complete' : result.value.state === 'unknown' ? 'partial' : 'invalid');
    }
  });

  it('connects the bound contribution output to event totals and rejects conflicting event facts', () => {
    const { team, context, request } = setting(); independent(request);
    const query: schemas.DamageQuery = { kind: 'event', eventId: 'reaction', outputs: [{ eventId: 'reaction', outputId: 'stellar-swirl.damage', actorId: null,
      contributorIds: request.contributors.map(contributor => contributor.id), family: 'stellar-swirl', computation: { kind: 'bound-aggregate', request } }] };
    const result = evaluateDamageQuery(team.program, context, query);
    expect(result.execution, JSON.stringify(result.diagnostics)).toBe('complete'); expect(numeric(result.totals.all)).toBeCloseTo(expected(), 8);
    expect(result.outputs[0].aggregation!.states).toHaveLength(4);
    request.contributors[0].frame.hit!.reactionId = 'lunar-charged';
    expect(evaluateDamageQuery(team.program, context, query).execution).toBe('invalid');
  });
});
