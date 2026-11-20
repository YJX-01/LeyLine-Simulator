import { readCalculationData } from '../../../../tools/lib/catalog-data.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import * as schemas from '@leyline/schema';
import { createStructuredCombatContext, evaluateBoundFormula, evaluateStructuredHit, prepareStructuredBuilds, resolveBuild } from '@leyline/engine';
import { DATA_VERSION, getArtifactMain, getArtifactSet, getCharacter, getWeapon, loadCatalog } from '@leyline/game-data';
import { createAccount } from '../../../../src/web/src/domain/account';
import { confirmMonaImport, previewMonaImport } from '../../../../src/web/src/domain/mona-import';

const root = new URL('../../../../', import.meta.url);
const read = (path: string) => readCalculationData(new URL(path, root));
const reviews: { characterId: string; skillId: string; hitId: string }[] = read('tools/data/sources/calculation-hits/ordinary-bindings.json').hits;
const quantity = (unit: Extract<schemas.Value, { kind: 'quantity' }>['unit'], value: number): schemas.Value => ({ kind: 'quantity', unit, value });
const fact = (value: schemas.Value | null): schemas.CalculationFact => ({ value, provenance: 'explicit', sourceRefs: [] });
const numeric = (result: schemas.StructuredDamageEvaluation): number => {
  expect(result.execution, JSON.stringify(result.diagnostics)).toBe('complete');
  const value = result.totals.all; return value.state === 'known' && value.value.kind === 'quantity' ? value.value.value : NaN;
};

describe('current snapshot assembly and parameter-bound catalog outputs', () => {
  let main: schemas.StructuredBuild['artifactMain'];
  const characters = new Map<string, schemas.StructuredCharacterDefinition>(), weapons = new Map<string, schemas.StructuredWeaponDefinition>();
  const text = read('tools/data/sources/character-text/base-and-manekin.json');
  const upstream = read('tools/data/sources/catalog/genshin-db/characters.json'), curves = read('tools/data/sources/catalog/genshin-db/character-curves.json');
  const talents = read('tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/stats/talents.json');
  const proud = new Map(read(text.proudSkillsFile).map((row: { proudSkillGroupId: number; level: number; paramList: number[] }) => [`${row.proudSkillGroupId}/${row.level}`, row]));
  beforeAll(async () => {
    main = await getArtifactMain();
    for (const id of new Set(reviews.map(review => review.characterId))) characters.set(id, await getCharacter(id));
    for (const id of ['favoniussword', 'harbingerofdawn', 'primordialjadecutter']) weapons.set(id, await getWeapon(id));
  });
  function build(id: string, weaponId = 'favoniussword'): schemas.StructuredBuild {
    return { schemaVersion: '0.1.0', kind: 'calculation-build', dataVersion: DATA_VERSION, character: structuredClone(characters.get(id)!), weapon: structuredClone(weapons.get(weaponId)!),
      sets: [], artifacts: [], artifactMain: structuredClone(main), level: 90, ascension: 6, constellation: 0, talents: { normal: 1, skill: 1, burst: 1 }, weaponLevel: 90, weaponAscension: 6, refinement: 1,
      sources: [{ id: 'artifact-main-source', kind: 'repo', repository: 'Rafs-kk/LunaGC-6.6-res', commit: 'b0501c5d89767ead5f647869a2412521447f7682', path: 'ExcelBinOutput/ReliquaryLevelExcelConfigData.json' }], artifactMainSourceRefs: ['artifact-main-source'] };
  }
  function rate(id: string, skillId: string, hitId: string, level = 1): number {
    const original = read('src/game-data/data/characters/' + id + '.json'), index = original.talents.findIndex((talent: { id: string }) => talent.id === skillId), parameter = hitId.slice(skillId.length + 1);
    const binding = text.bindings[id];
    if (binding) {
      const group = text.skills[text.skillDepots[binding.skillDepotId].skills[0]].proudSkillGroupId;
      return (proud.get(`${group}/${level}`) as { paramList: number[] }).paramList[Number(parameter.replace('param', '')) - 1];
    }
    return talents[id]['combat' + (index + 1)][parameter][level - 1];
  }
  function attack(id: string, weaponId = 'favoniussword'): number {
    const source = upstream[id].stats, weapon = read('src/game-data/data/weapons/' + weaponId + '.json');
    const white = source.base.attack * curves[90][source.curve.attack] + source.promotion[6].attack + weapon.baseAttack * weapon.attackCurve[90] + weapon.promotion[6];
    return white * (1 + (id === 'xingqiu' || id === 'aether' || id === 'lumine' ? source.promotion[6].specialized : 0));
  }
  function setting(characterId: string, skillId: string, hitId: string) {
    const character = characters.get(characterId)!, hit = character.talents.find(talent => talent.id === skillId)!.hits.find(hit => hit.id === hitId)!;
    const request: schemas.StructuredHitRequest = { actorId: 'actor', skillId, hitId, outputId: hit.outputs[0]?.id ?? 'damage', critMode: 'noncritical', reactionMode: 'none',
      frame: { targetId: 'enemy', eventId: 'hit', sourceEventId: null, phase: 'before', facts: {}, actorFacts: {}, captures: {}, applications: [], factOverrides: [] } };
    const setup: schemas.StructuredCombatSetup = { targets: [{ id: 'enemy', inputs: { level: fact(quantity('count', 90)), defenseReduction: fact(quantity('scalar', 0)), ordinaryDamageReduction: fact(quantity('scalar', 0)),
      ...Object.fromEntries(schemas.elements.map(element => ['resistance.' + element, fact(quantity('scalar', 0.1))])) }, facts: {} }],
      team: { inputs: {}, facts: {}, actorFacts: {} }, sources: [], factIntervals: [], events: [{ id: 'hit', kind: 'hit', actorId: 'actor', targetIds: ['enemy'], timeMs: 1000, order: 1, skillId, hitId, category: hit.category, sourceEventIds: [], facts: {} }] };
    if (hit.base.captures.length) { setup.events.unshift({ id: 'source', kind: 'capture', actorId: 'actor', targetIds: [], timeMs: 0, order: 0, skillId, sourceEventIds: [], facts: {} }); request.frame.captures.panel = { eventId: 'source', phase: 'after' }; }
    return { setup, request, hit };
  }

  it.each(reviews)('independently evaluates $hitId from fixed source parameters in the new runtime', review => {
    const input = build(review.characterId), original = JSON.stringify(input), prepared = prepareStructuredBuilds([{ id: 'actor', build: input }]);
    expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true); if (!prepared.ok) return;
    const { setup, request, hit } = setting(review.characterId, review.skillId, review.hitId);
    const expected = attack(review.characterId) * rate(review.characterId, review.skillId, review.hitId) * (review.characterId === 'xingqiu' && hit.element === 'hydro' ? 1.2 : 1) * 0.5 * 0.9;
    expect(numeric(evaluateStructuredHit(prepared.team, setup, request))).toBeCloseTo(expected, 8);
    expect(JSON.stringify(input)).toBe(original);
  });

  it.skipIf(!existsSync('.references/artifacts_mona.json'))('uses each rarity table in both evaluators on an explicit main-stat dispatch derivative of the original inventory', async () => {
    const catalog = await loadCatalog(), account = createAccount();
    confirmMonaImport(account, await previewMonaImport(readFileSync('.references/artifacts_mona.json', 'utf8'), account, catalog.sets, main));
    const original = account.artifacts.find(item => item.real?.slot === 'plume' && item.real.level === 20
      && item.real.substats.every(sub => sub.value <= (schemas.artifactSubstatLimits[4][sub.stat] ?? 0)))!.real!;
    const set = await getArtifactSet(original.setId);
    const flower = account.artifacts.find(item => item.real?.slot === 'flower' && item.real.setId !== original.setId)!.real!;
    const flowerSet = await getArtifactSet(flower.setId);
    const levels = read('tools/data/sources/lunagc/b0501c5d89767ead5f647869a2412521447f7682/ReliquaryLevelExcelConfigData.json');
    for (const rarity of [4, 5] as const) {
      const piece = structuredClone(original);
      piece.rarity = rarity; piece.level = rarity === 4 ? 16 : 20;
      piece.substats.forEach(sub => delete sub.rolls); delete piece.source;
      // Explicit format/mathematical derivative: unchanged scanned substats isolate table dispatch.
      // This is not a claimed four-star physical item, player export, or enhancement history.
      const input = build('kaeya'); input.sets = [set, flowerSet];
      input.artifacts = [{ ...piece, inventory: null, sourceRefs: [] }, { ...structuredClone(flower), inventory: null, sourceRefs: [] }];
      const prepared = prepareStructuredBuilds([{ id: 'actor', build: input }]);
      expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true); if (!prepared.ok) continue;
      const expectedMain = levels.find((row: { rank: number; level: number }) => row.rank === rarity && row.level === piece.level + 1)
        .addProps.find((prop: { propType: string }) => prop.propType === 'FIGHT_PROP_ATTACK').value;
      const subs = [...piece.substats, ...flower.substats];
      const expectedAttack = attack('kaeya') * (1 + subs.filter(sub => sub.stat === 'attackPercent').reduce((sum, sub) => sum + sub.value, 0))
        + expectedMain + subs.filter(sub => sub.stat === 'attack').reduce((sum, sub) => sum + sub.value, 0);
      const { setup, request } = setting('kaeya', 'kaeya.skill', 'kaeya.skill.param1');
      expect(numeric(evaluateStructuredHit(prepared.team, setup, request))).toBeCloseTo(expectedAttack * rate('kaeya', request.skillId, request.hitId) * 0.45, 8);
      expect(resolveBuild(input).stats.attack).toBeCloseTo(expectedAttack, 8);
      const oldShape = { ...input, artifactMain: input.artifactMain[5] };
      expect(prepareStructuredBuilds([{ id: 'actor', build: oldShape }]).ok).toBe(false);
      if (rarity === 4) {
        const wrongSlot = structuredClone(input);
        wrongSlot.artifacts[0].setId = 'prayersforwisdom';
        wrongSlot.sets[0] = await getArtifactSet('prayersforwisdom');
        const rejected = prepareStructuredBuilds([{ id: 'actor', build: wrongSlot }]);
        expect(rejected.ok).toBe(false);
        expect(rejected.diagnostics.some(diagnostic => diagnostic.message.includes('合法集合'))).toBe(true);
      }
    }
    expect(original.rarity).toBe(5);
    expect(original.level).toBe(20);
  });

  it('applies constellation talent levels once and keeps uncovered constellation mechanisms partial', () => {
    const input = build('kaeya'); input.constellation = 3; input.talents.skill = 7;
    const prepared = prepareStructuredBuilds([{ id: 'actor', build: input }]); expect(prepared.ok).toBe(true); if (!prepared.ok) return;
    const { setup, request, hit } = setting('kaeya', 'kaeya.skill', 'kaeya.skill.param1'), context = createStructuredCombatContext(prepared.team, setup);
    expect(context.actors[0].talents.find(talent => talent.id === 'kaeya.skill')!.level).toBe(10);
    const frame = { ...request.frame, ownerId: 'actor', recipientId: 'actor', contributorId: null, hit: { skillId: 'kaeya.skill', hitId: hit.id, element: hit.element, category: hit.category, family: 'ordinary', origin: 'talent' as const, reactionId: null },
      facts: { critMode: fact({ kind: 'enum', value: 'noncritical' }), reactionMode: fact({ kind: 'enum', value: 'none' }) } };
    const component = evaluateBoundFormula(prepared.team.program, context, hit.outputs[0].invocation, frame), value = component.outputs.value;
    expect(component.execution).toBe('complete');
    if (value.state === 'known') expect(value.value.value).toBeCloseTo(attack('kaeya') * rate('kaeya', 'kaeya.skill', hit.id, 10) * 0.45, 8);
    expect(numeric(evaluateStructuredHit(prepared.team, setup, request))).toBeCloseTo(attack('kaeya') * rate('kaeya', request.skillId, hit.id, 10) * 0.45, 8);
    input.constellation = 4;
    const uncovered = prepareStructuredBuilds([{ id: 'actor', build: input }]);
    if (!uncovered.ok) throw new Error('C4 build failed structural preparation');
    const partial = evaluateStructuredHit(uncovered.team, setup, request);
    expect(partial.trace.find(node => node.id === partial.totals.all.traceId)?.state).toBe('unknown');
  });

  it('uses the actual Jade Cutter refinements through the effect graph without double-applying HP', () => {
    const input = build('kaeya', 'primordialjadecutter'); input.refinement = 5;
    const prepared = prepareStructuredBuilds([{ id: 'actor', build: input }]); expect(prepared.ok).toBe(true); if (!prepared.ok) return;
    const { setup, request } = setting('kaeya', 'kaeya.skill', 'kaeya.skill.param1'), source = upstream.kaeya.stats;
    const hp = (source.base.hp * curves[90][source.curve.hp] + source.promotion[6].hp) * 1.4;
    const expected = (attack('kaeya', 'primordialjadecutter') + hp * 0.024) * rate('kaeya', 'kaeya.skill', 'kaeya.skill.param1') * 0.45;
    expect(numeric(evaluateStructuredHit(prepared.team, setup, request))).toBeCloseTo(expected, 8);
  });

  it('preserves independent snapshots after JSON reopening and refuses legacy, conflicting and illegal derivatives', () => {
    const input = build('kaeya'), reopened = JSON.parse(JSON.stringify(input));
    expect(schemas.structuredBuildSchema.safeParse(reopened).success).toBe(true);
    expect(schemas.structuredCharacterDefinitionSchema.safeParse({ ...input.character, schemaVersion: 2 }).success).toBe(false);
    const changed = structuredClone(input); changed.character.talents[0].parameters[0].values[0] += 0.01;
    expect(prepareStructuredBuilds([{ id: 'left', build: input }, { id: 'right', build: changed }]).ok).toBe(false);
    const illegal = structuredClone(input); illegal.ascension = 0;
    expect(prepareStructuredBuilds([{ id: 'actor', build: illegal }]).ok).toBe(false);
    const prepared = prepareStructuredBuilds([{ id: 'actor', build: reopened }]); expect(prepared.ok).toBe(true);
    if (prepared.ok) { const { setup, request } = setting('kaeya', 'kaeya.skill', 'kaeya.skill.param1'); expect(evaluateStructuredHit(prepared.team, { ...setup, actors: [] }, request).execution).toBe('invalid'); }
  });

  it('selects critical modes lazily and requires Harbinger HP only for a probability-dependent result', () => {
    const input = build('kaeya', 'harbingerofdawn'), prepared = prepareStructuredBuilds([{ id: 'actor', build: input }]); expect(prepared.ok).toBe(true); if (!prepared.ok) return;
    const { setup, request } = setting('kaeya', 'kaeya.skill', 'kaeya.skill.param1');
    const base = attack('kaeya', 'harbingerofdawn') * rate('kaeya', 'kaeya.skill', 'kaeya.skill.param1') * 0.45;
    expect(numeric(evaluateStructuredHit(prepared.team, setup, request))).toBeCloseTo(base, 8);
    request.critMode = 'critical';
    const critDamage = upstream.kaeya.stats.base.critdmg + input.weapon!.baseStat * input.weapon!.statCurve[90];
    expect(numeric(evaluateStructuredHit(prepared.team, setup, request))).toBeCloseTo(base * (1 + critDamage), 8);
    request.critMode = 'expected';
    expect(evaluateStructuredHit(prepared.team, setup, request).execution).toBe('partial');
    for (const ratio of [0.9, 0.9 + Number.EPSILON]) {
      request.frame.factOverrides = [{ subject: { kind: 'actor', id: 'actor' }, facts: { hpRatio: fact(quantity('scalar', ratio)) } }];
      expect(numeric(evaluateStructuredHit(prepared.team, setup, request))).toBeCloseTo(base * (1 + (upstream.kaeya.stats.base.critrate + (ratio > 0.9 ? 0.14 : 0)) * critDamage), 8);
    }
  });

  it('binds actual Cryo/Hydro amplification and refuses a changed event or duplicate mode fact', () => {
    for (const [id, reaction, multiplier] of [['kaeya', 'melt', 1.5], ['xingqiu', 'vaporize', 2]] as const) {
      const input = build(id), prepared = prepareStructuredBuilds([{ id: 'actor', build: input }]); expect(prepared.ok).toBe(true); if (!prepared.ok) continue;
      const { setup, request } = setting(id, id + '.skill', id + '.skill.param1'); request.reactionMode = reaction;
      expect(numeric(evaluateStructuredHit(prepared.team, setup, request))).toBeCloseTo(attack(id) * rate(id, request.skillId, request.hitId) * (id === 'xingqiu' ? 1.2 : 1) * 0.45 * multiplier, 8);
      setup.events[0].skillId = id + '.normal';
      expect(evaluateStructuredHit(prepared.team, setup, request).execution).toBe('invalid');
      setup.events[0].skillId = request.skillId; request.frame.facts.reactionMode = fact({ kind: 'enum', value: 'none' });
      expect(evaluateStructuredHit(prepared.team, setup, request).execution).toBe('invalid');
    }
  });

  it('keeps unreviewed team mechanisms unknown and preserves stable identities for unreviewed catalog hits', async () => {
    const input = build('kaeya'), teammate = build('kaeya'); teammate.character = await getCharacter('bennett');
    const prepared = prepareStructuredBuilds([{ id: 'actor', build: input }, { id: 'teammate', build: teammate }]); expect(prepared.ok).toBe(true); if (!prepared.ok) return;
    const { setup, request } = setting('kaeya', 'kaeya.skill', 'kaeya.skill.param1'), result = evaluateStructuredHit(prepared.team, setup, request);
    expect(result.execution).toBe('partial'); expect(result.outputs[0].value.state).toBe('unknown');
    expect(result.trace.find(node => node.id === result.outputs[0].value.traceId)?.state).toBe('unknown');
    const character = teammate.character, unknown = character.talents.flatMap(talent => talent.hits.map(hit => ({ skillId: talent.id, hit }))).find(entry => !entry.hit.outputs.length)!;
    setup.events[0].actorId = 'teammate'; setup.events[0].skillId = unknown.skillId; setup.events[0].hitId = unknown.hit.id; setup.events[0].category = unknown.hit.category;
    const unsupported = evaluateStructuredHit(prepared.team, setup, { ...request, actorId: 'teammate', skillId: unknown.skillId, hitId: unknown.hit.id, outputId: null });
    expect(unsupported.execution).toBe('partial'); expect(unsupported.totals.all.state).toBe('unknown');
    expect(unsupported.trace.find(node => node.id === unsupported.totals.all.traceId)?.state).toBe('unknown');
  });

  it('evaluates the actual Ayato ATK/HP base component with typed Namisen counts and skips an inactive HP term', async () => {
    const id = 'kamisatoayato'; characters.set(id, await getCharacter(id));
    const input = build(id), prepared = prepareStructuredBuilds([{ id: 'actor', build: input }]); expect(prepared.ok).toBe(true); if (!prepared.ok) return;
    const { setup, request, hit } = setting(id, id + '.skill', id + '.skill.param1'), context = createStructuredCombatContext(prepared.team, setup);
    const source = upstream[id].stats, hp = source.base.hp * curves[90][source.curve.hp] + source.promotion[6].hp;
    const frame: schemas.CombatFrame = { ...request.frame, ownerId: 'actor', recipientId: 'actor', contributorId: null,
      hit: { skillId: request.skillId, hitId: hit.id, element: hit.element, category: hit.category, family: 'ordinary', origin: 'talent', reactionId: null } };
    for (const count of [0, 4]) {
      frame.facts.namisen = fact(quantity('count', count));
      const result = evaluateBoundFormula(prepared.team.program, context, hit.base, frame), value = result.outputs.base;
      expect(result.execution).toBe('complete');
      if (value.state === 'known') expect(value.value.value).toBeCloseTo(attack(id) * talents[id].combat2.param1[0] + hp * talents[id].combat2.param5[0] * count, 8);
    }
    context.actors[0].inputs.whiteHp = fact(null); frame.facts.namisen = fact(quantity('count', 0));
    expect(evaluateBoundFormula(prepared.team.program, context, hit.base, frame).execution).toBe('complete');
    request.frame.facts.namisen = fact(quantity('count', 5));
    expect(evaluateStructuredHit(prepared.team, setup, request).execution).toBe('invalid');
    request.frame.facts.namisen = fact(quantity('scalar', 4));
    expect(evaluateStructuredHit(prepared.team, setup, request).execution).toBe('invalid');
  });

  it.skipIf(!existsSync('.references/artifacts_mona.json'))('keeps shared actual artifact claims separate from each actor calculation and preserves detached ownership', async () => {
    const original = readFileSync('.references/artifacts_mona.json', 'utf8'), account = createAccount(), catalog = await loadCatalog();
    confirmMonaImport(account, await previewMonaImport(original, account, catalog.sets, main));
    const piece = account.artifacts.find(item => item.real?.slot === 'flower')!, real = piece.real!, sourceRef = 'authorized-mona-source';
    const artifact: schemas.StructuredBuild['artifacts'][number] = { ...real, inventory: { accountId: account.id, itemId: piece.id }, sourceRefs: [sourceRef] };
    const set = await getArtifactSet(real.setId);
    const left = build('kaeya'), right = build('jean');
    for (const input of [left, right]) { input.artifacts = [structuredClone(artifact)]; input.sets = [structuredClone(set)]; input.sources.push({ id: sourceRef, kind: 'recording', reference: 'authorized-local-mona-original' }); }
    const prepared = prepareStructuredBuilds([{ id: 'actor', build: left }, { id: 'teammate', build: right }]); expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true); if (!prepared.ok) return;
    const { setup, request } = setting('kaeya', 'kaeya.skill', 'kaeya.skill.param1'), result = evaluateStructuredHit(prepared.team, setup, request);
    const atkPercent = real.substats.find(sub => sub.stat === 'attackPercent')?.value ?? 0, flatAtk = real.substats.find(sub => sub.stat === 'attack')?.value ?? 0;
    expect(numeric(result)).toBeCloseTo((attack('kaeya') * (1 + atkPercent) + flatAtk) * rate('kaeya', 'kaeya.skill', 'kaeya.skill.param1') * 0.45, 8);
    expect(result.feasibility[0].status).toBe('conflict');
    right.artifacts[0].inventory = null;
    const detached = prepareStructuredBuilds([{ id: 'actor', build: left }, { id: 'teammate', build: right }]); expect(detached.ok).toBe(true);
    if (detached.ok) expect(evaluateStructuredHit(detached.team, setup, request).feasibility[0].status).toBe('unknown');
    expect(readFileSync('.references/artifacts_mona.json', 'utf8')).toBe(original);
  });
});
