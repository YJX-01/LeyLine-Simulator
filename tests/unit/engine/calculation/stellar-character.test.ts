import { readCalculationData } from '../../../../tools/lib/catalog-data.mjs';
import { readCalculationLibrary } from '../../../helpers/read-calculation-library';
import { beforeAll, describe, expect, it } from 'vitest';
import * as schemas from '@leyline/schema';
import { collectCalculationClosure, collectCalculationRoots, compileStructuredCharacter, createStructuredCombatContext,
  evaluateBoundFormula, evaluateStructuredHit, prepareStructuredBuilds, type PreparedStructuredTeam } from '@leyline/engine';
import { DATA_VERSION, getArtifactMain, getCharacter, getWeapon } from '@leyline/game-data';
import { createContentLinker } from '../../../../src/game-data/src/link-content.mjs';

const read = (path: string) => readCalculationData(path);
const quantity = (unit: Extract<schemas.Value, { kind: 'quantity' }>['unit'], value: number): schemas.Value => ({ kind: 'quantity', unit, value });
const fact = (value: schemas.Value): schemas.CalculationFact => ({ value, provenance: 'explicit', sourceRefs: [] });
type Hit = schemas.StructuredCharacterDefinition['talents'][number]['hits'][number];
type Output = { family: string; origin: Hit['origin']; invocation: Hit['base'] };
const routes = (hit: Hit): Output[] => Object.entries(hit.damage).map(([family, invocation]) => ({ family, invocation, origin: hit.origin }));
type Conditions = { radiant: boolean; stance: boolean; stacks: number };
const parameters = read('tools/data/sources/anime-game-data/talent-params.json').vesna;
const upstream = read('tools/data/sources/anime-game-data/characters.json').vesna.stats;
const curves = read('tools/data/sources/anime-game-data/character-curves.json');

// Independent catalog mathematics with explicit conditions and compatible weapons, without player inventory.
// Automatic actions, resource feasibility and actual damage observations are outside these checks.
describe('Vesna owned single-hit definitions and fixed TS algorithms', () => {
  const characters = new Map<string, schemas.StructuredCharacterDefinition>(), teams = new Map<number, PreparedStructuredTeam>();
  let main: schemas.ArtifactMainTable, weapon: schemas.StructuredWeaponDefinition;
  beforeAll(async () => {
    main = await getArtifactMain();
    for (const id of ['vesna', 'kaeya', 'xingqiu']) characters.set(id, await getCharacter(id));
    weapon = await getWeapon('favoniussword');
  });
  function build(id: string, rank = 0): schemas.StructuredBuild {
    return { schemaVersion: '0.3.0', kind: 'calculation-build', dataVersion: DATA_VERSION,
      character: characters.get(id)!, weapon, sets: [], artifacts: [], artifactMain: main, level: 90, ascension: 6, constellation: rank,
      talents: { normal: 10, skill: 10, burst: 10 }, weaponLevel: 90, weaponAscension: 6, refinement: 1,
      sources: [{ id: 'artifact-main-source', kind: 'repo', repository: 'Rafs-kk/LunaGC-6.6-res', commit: 'b0501c5d89767ead5f647869a2412521447f7682', path: 'ExcelBinOutput/ReliquaryLevelExcelConfigData.json' }], artifactMainSourceRefs: ['artifact-main-source'] };
  }
  function team(rank: number): PreparedStructuredTeam {
    if (!teams.has(rank)) {
      const prepared = prepareStructuredBuilds(['vesna', 'kaeya', 'xingqiu'].map(id => ({ id, build: build(id, id === 'vesna' ? rank : 0) })));
      expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true); if (!prepared.ok) throw new Error('invalid source-derived build');
      teams.set(rank, prepared.team);
    }
    return teams.get(rank)!;
  }
  function setting(hit: Hit, output: Output, conditions: Conditions): { setup: schemas.StructuredCombatSetup; request: schemas.StructuredHitRequest } {
    const skillId = characters.get('vesna')!.talents.find(talent => talent.hits.some(candidate => candidate.id === hit.id))!.id;
    return {
      setup: { targets: [{ id: 'enemy', inputs: { level: fact(quantity('count', 90)), defenseReduction: fact(quantity('scalar', 0)), ordinaryDamageReduction: fact(quantity('scalar', 0)),
        'resistance.anemo': fact(quantity('scalar', 0.1)), 'resistance.physical': fact(quantity('scalar', 0.1)) }, facts: {} }],
      team: { inputs: {}, facts: {}, actorFacts: {} }, sources: [], factIntervals: [{ id: 'vesna-state', subject: { kind: 'actor', id: 'vesna' }, startMs: 0, endMs: 2000,
        facts: { radiance: fact({ kind: 'enum', value: conditions.radiant ? 'stellar-swirl' : 'none' }), 'vesna.stance': fact({ kind: 'boolean', value: conditions.stance }),
          'vesna.disciplineStacks': fact(quantity('count', conditions.stacks)), 'vesna.c6Window': fact({ kind: 'boolean', value: true }) } }],
      events: [{ id: 'hit', kind: 'hit', actorId: 'vesna', targetIds: ['enemy'], timeMs: 1000, order: 0, skillId, hitId: hit.id, category: hit.category, sourceEventIds: [], facts: {} }] },
      request: { actorId: 'vesna', hit: schemas.characterHitRef(characters.get('vesna')!, hit.id), critMode: 'noncritical', reactionMode: 'none',
        frame: { targetId: 'enemy', eventId: 'hit', sourceEventId: null, phase: 'before', facts: {}, actorFacts: {}, captures: {}, applications: [], factOverrides: [] } },
    };
  }
  function selected(id: string, family?: string) {
    const hit = characters.get('vesna')!.talents.flatMap(talent => talent.hits).find(hit => hit.id === id)!;
    return { hit, output: routes(hit).find(output => !family || output.family === family)! };
  }
  const whiteAttack = (level = 90, ascension = 6) => upstream.base.attack * curves[level][upstream.curve.attack] + upstream.promotion[ascension].attack
    + weapon.baseAttack * weapon.attackCurve[90] + weapon.promotion[6];
  function expected(skill: 'normal' | 'skill' | 'burst', id: string, stellar: boolean, rank: number, { radiant, stance, stacks }: Conditions): number {
    const attack = whiteAttack() * (1 + (radiant ? 0.06 * 2 * (rank >= 4 ? 3 : 1) : 0) + (rank >= 2 && stacks === 6 ? 0.4 : 0));
    const mastery = radiant ? 25 * (rank >= 4 ? 3 : 1) : 0;
    const level = 10 + (skill === 'skill' && rank >= 3 || skill === 'burst' && rank >= 5 ? 3 : 0);
    const ratio = id === 'c6.slash' ? 1.5 : id.startsWith('c6.spirit') ? 2 : parameters['combat' + ({ normal: 1, skill: 2, burst: 3 }[skill])][id.replace('.anemo', '')][level - 1];
    const spirit = skill === 'burst' || skill === 'skill' && ['param4', 'param5', 'param6', 'param7', 'param8', 'param9', 'c6.spirit', 'c6.spirit.stellar'].includes(id);
    const base = attack * ratio * (spirit ? 1 + 0.1 * stacks : 1);
    return stellar ? base * (1 + Math.min(attack * 0.00007, 0.14)) * (1 + 6 * mastery / (mastery + 2000) + (rank >= 1 && stance ? 0.2 : 0)) * 0.9 * (rank >= 6 ? 1.2 : 1)
      : base * 0.5 * 0.9;
  }
  it.each([0, 1, 2, 3, 4, 5, 6])('independently evaluates all applicable single segments at constellation %i', rank => {
    let checked = 0;
    for (const radiant of [false, true]) for (const stance of [false, true]) for (const stacks of [0, 6]) {
      const conditions = { radiant, stance, stacks };
      for (const talent of characters.get('vesna')!.talents) for (const hit of talent.hits) for (const output of routes(hit)) {
        const id = hit.id.slice(talent.id.length + 1), stellar = output.family === 'stellar-swirl';
        let active = true;
        if (talent.category === 'normal') active = id.endsWith('.anemo') === stance;
        else if (id.startsWith('c6.')) active = rank === 6 && (id === 'c6.slash' || stellar === radiant);
        else if (talent.category === 'burst') active = stellar === radiant;
        else if (['param5', 'param7', 'param9'].includes(id)) active = stance && radiant;
        else if (['param4', 'param6', 'param8'].includes(id)) active = stance && !radiant;
        else if (id !== 'param1') active = stance;
        if (!active) continue;
        const { setup, request } = setting(hit, output, conditions), result = evaluateStructuredHit(team(rank), setup, request);
        expect(result.execution, JSON.stringify({ id, conditions, diagnostics: result.diagnostics })).toBe('complete');
        const value = result.totals.all;
        expect(value.state).toBe('known'); if (value.state !== 'known' || value.value.kind !== 'quantity') continue;
        expect(value.value.value).toBeCloseTo(expected(talent.category, id, stellar, rank, conditions), 8);
        if (stellar) expect(result.trace.some(node => ['defenseFactor', 'ordinaryBonusMinusReduction', 'levelMultiplier'].includes(node.nodeId))).toBe(false);
        checked++;
      }
    }
    expect(checked).toBe(rank === 6 ? 136 : 120);
  });

  it('preserves unknown state and rejects unavailable infusion or locked C6 outputs', () => {
    const { hit, output } = selected('vesna.normal.param1.anemo');
    const { setup, request } = setting(hit, output, { radiant: true, stance: true, stacks: 0 });
    delete setup.factIntervals[0].facts.radiance;
    const missing = evaluateStructuredHit(team(0), setup, request);
    expect(missing.execution).toBe('partial'); expect(missing.requiredInputs.some(input => input.key === 'radiance')).toBe(true);
    setup.factIntervals[0].facts['vesna.stance'] = fact({ kind: 'boolean', value: false });
    expect(evaluateStructuredHit(team(0), setup, request).totals.all).toMatchObject({ state: 'known', value: { value: 0 } });
    const c6 = selected('vesna.skill.c6.slash'), locked = setting(c6.hit, c6.output, { radiant: false, stance: false, stacks: 0 });
    delete locked.setup.factIntervals[0].facts['vesna.c6Window'];
    const result = evaluateStructuredHit(team(0), locked.setup, locked.request);
    expect(result.totals.all).toMatchObject({ state: 'known', value: { value: 0 } }); expect(result.requiredInputs.some(input => input.key === 'vesna.c6Window' && input.requiredBy.length)).toBe(false);
  });

  it('checks source stack limits and does not silently cap an invalid supplied state', () => {
    const { hit, output } = selected('vesna.skill.param5'), { setup, request } = setting(hit, output, { radiant: true, stance: true, stacks: 7 });
    expect(evaluateStructuredHit(team(0), setup, request).execution).toBe('invalid');
    setup.factIntervals[0].facts['vesna.disciplineStacks'] = fact(quantity('scalar', 6));
    expect(evaluateStructuredHit(team(0), setup, request).execution).toBe('invalid');
  });

  it('activates the no-ascension linchpin but skips locked A1/A4 dependencies', () => {
    const input = build('vesna'); input.level = 20; input.ascension = 0; input.talents = { normal: 1, skill: 1, burst: 1 };
    const prepared = prepareStructuredBuilds([{ id: 'vesna', build: input }]);
    expect(prepared.ok).toBe(true); if (!prepared.ok) return;
    const { hit, output } = selected('vesna.skill.param5'), { setup, request } = setting(hit, output, { radiant: true, stance: true, stacks: 0 });
    delete setup.factIntervals[0].facts['vesna.disciplineStacks'];
    const result = evaluateStructuredHit(prepared.team, setup, request), attack = whiteAttack(20, 0);
    expect(result.execution, JSON.stringify(result.diagnostics)).toBe('complete');
    expect(result.totals.all.state).toBe('known');
    if (result.totals.all.state === 'known') expect(result.totals.all.value.value).toBeCloseTo(attack * parameters.combat2.param5[0] * (1 + Math.min(attack * 0.00007, 0.14)) * 0.9, 8);
    expect(result.requiredInputs.some(input => input.key === 'vesna.disciplineStacks' && input.requiredBy.length)).toBe(false);
  });

  it('keeps missing party identities unknown instead of resolving them from a catalog', () => {
    const { hit, output } = selected('vesna.skill.param5'), { setup, request } = setting(hit, output, { radiant: true, stance: true, stacks: 0 });
    const context = createStructuredCombatContext(team(0), setup); delete context.actors.find(actor => actor.id === 'xingqiu')!.identity;
    const frame: schemas.CombatFrame = { ...request.frame, ownerId: 'vesna', recipientId: 'vesna', contributorId: null,
      facts: { critMode: fact({ kind: 'enum', value: 'noncritical' }) }, hit: { skillId: schemas.findCharacterHit(characters.get('vesna'), request.hit)!.talent.id, hitId: hit.id, element: hit.element, category: hit.category, family: output.family, origin: output.origin, reactionId: null } };
    const result = evaluateBoundFormula(team(0).program, context, output.invocation, frame);
    expect(result.execution).toBe('partial'); expect(result.requiredInputs.some(input => input.key === 'xingqiu.element')).toBe(true);
  });

  it('exports all predicate and binding dependencies without authoring-only template dictionaries', () => {
    const character = characters.get('vesna')!, before = JSON.stringify(character), closure = collectCalculationClosure(character);
    expect(closure.ok).toBe(true); if (!closure.ok) return;
    const exported = { ...structuredClone(character), calculation: { ...character.calculation, bundle: closure.bundle } };
    expect(compileStructuredCharacter(JSON.parse(JSON.stringify(exported))).ok).toBe(true);
    expect(exported.calculation.bundle.formulas.some(formula => formula.identity.id === 'vesna.condition.all2')).toBe(true);
    expect(Object.hasOwn(exported.calculation, 'hitTemplates')).toBe(false); expect(JSON.stringify(character)).toBe(before);
  });

  it('links a declared binding by full identity independent of member order and rejects a missing dependency', () => {
    const linker = createContentLinker({ schemas, collectCalculationRoots, library: readCalculationLibrary() });
    const authored = read('src/game-data/data/characters/vesna.json'), base = authored.talents[0].hits[0].base;
    const { revision, id, namespace } = base.formula;
    base.formula = { revision, id, namespace };
    expect(compileStructuredCharacter(linker.character(authored)).ok).toBe(true);
    base.formula.revision = 'missing';
    expect(() => linker.character(authored)).toThrow();
  });

  it('can prove a disabled C6 output even when an earlier condition is unknown', () => {
    const { hit, output } = selected('vesna.skill.c6.slash'), { setup, request } = setting(hit, output, { radiant: false, stance: false, stacks: 0 });
    delete setup.factIntervals[0].facts['vesna.c6Window'];
    const invocation = structuredClone(output.invocation), predicate = invocation.predicate;
    if (predicate?.kind !== 'formula') throw new Error('expected source-declared conjunctive guard');
    [predicate.inputs.term0, predicate.inputs.term1] = [predicate.inputs.term1, predicate.inputs.term0];
    const frame: schemas.CombatFrame = { ...request.frame, ownerId: 'vesna', recipientId: 'vesna', contributorId: null,
      facts: {}, hit: { skillId: schemas.findCharacterHit(characters.get('vesna'), request.hit)!.talent.id, hitId: hit.id, element: hit.element, category: hit.category, family: output.family, origin: output.origin, reactionId: null } };
    const result = evaluateBoundFormula(team(0).program, createStructuredCombatContext(team(0), setup), invocation, frame);
    expect(result.outputs.value).toMatchObject({ state: 'known', value: { value: 0 } });
    expect(result.requiredInputs.some(input => input.key === 'vesna.c6Window' && input.requiredBy.length)).toBe(false);
  });
});
