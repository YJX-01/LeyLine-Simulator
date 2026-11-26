import { beforeAll, describe, expect, it } from 'vitest';
import * as schema from '@leyline/schema';
import { compileCalculation, collectCalculationRoots, createStructuredCombatContext, evaluateCombatBindings, evaluateDamageQuery, evaluateStructuredHit, prepareStructuredBuilds } from '@leyline/engine';
import { readCalculationData } from '../../../../tools/lib/catalog-data.mjs';
import { assembleCalculationLibrary } from '../../../../tools/lib/calculation-library.mjs';
import { createContentLinker } from '../../../../src/game-data/src/link-content.mjs';
import { reactionOccurrence } from '../../../../src/engine/src/calculation/project-reaction';

const weaponKeys = {
  WEAPON_BOW: 'huntersbow', WEAPON_CATALYST: 'apprenticesnotes', WEAPON_CLAYMORE: 'wastergreatsword',
  WEAPON_POLE: 'beginnersprotector', WEAPON_SWORD_ONE_HAND: 'dullblade',
} as const;
const ids = ['aloy', 'amber', 'beidou', 'candace', 'charlotte', 'columbina', 'faruzan', 'furina', 'gorou', 'illuga',
  'kukishinobu', 'lauma', 'mavuika', 'mitya', 'mona', 'nahida', 'nefer', 'sangonomiyakokomi', 'sethos', 'shenhe', 'skirk',
  'valeriy', 'vodyanitsa', 'yumemizukimizuki', 'varka'] as const;
type CharacterId = typeof ids[number];
type WeaponId = typeof weaponKeys[keyof typeof weaponKeys] | 'magicguide' | 'kitaincrossspear';
const weaponTypes: Record<string, WeaponId> = weaponKeys;
type Overrides = Record<string, boolean | number | string>;
const q = (unit: schema.QuantityUnit, value: number): schema.Value => ({ kind: 'quantity', unit, value });
const b = (value: boolean): schema.Value => ({ kind: 'boolean', value });
const fact = (value: schema.Value): schema.CalculationFact => ({ value, provenance: 'explicit', sourceRefs: [] });
const read = (file: string) => readCalculationData('src/game-data/data/' + file + '.json');
const main = read('tables/artifact-main');
const reactions = read('calculation/reactions');
const growth = readCalculationData('tools/data/sources/catalog/genshin-db/characters.json');
const growthCurves = readCalculationData('tools/data/sources/catalog/genshin-db/character-curves.json');
const innateBaseStats = readCalculationData('tools/data/sources/catalog/innate-base-stats.json');
const multipliers = readCalculationData('tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/stats/talents.json');

describe('source-defined hit conditions and grants', () => {
  const characters = new Map<CharacterId, schema.StructuredCharacterDefinition>();
  const weapons = new Map<WeaponId, schema.StructuredWeaponDefinition>();

  beforeAll(() => {
    const rawCharacters = ids.map(id => read('characters/' + id));
    const rawWeapons = [...Object.values(weaponTypes), 'magicguide', 'kitaincrossspear'].map(id => read('weapons/' + id));
    const library = assembleCalculationLibrary(read('calculation/common'), read('calculation/reactions'), [...rawCharacters, ...rawWeapons]);
    const compiled = compileCalculation(library);
    expect(compiled.ok, JSON.stringify(compiled.diagnostics)).toBe(true);
    if (!compiled.ok) throw new Error('Invalid character calculation library');
    const linker = createContentLinker({ schemas: schema, collectCalculationRoots: (_, request) => collectCalculationRoots(compiled.program, request), library });
    for (const character of rawCharacters) characters.set(character.id, linker.character(character));
    for (const weapon of rawWeapons) weapons.set(weapon.id, linker.weapon(weapon));
  });

  type Options = { rank?: number; ascension?: number; critMode?: schema.StructuredHitRequest['critMode'];
    party?: ({ id: string; element: schema.StructuredCharacterDefinition['identity']['element'] } | { id: string; characterId: CharacterId })[];
    changes?: Overrides; targetChanges?: Overrides; teamChanges?: Overrides; weaponId?: WeaponId;
    reaction?: readonly [schema.TransformativeFamily, schema.StructuredCharacterDefinition['identity']['element']] };

  function probe(id: CharacterId, output: string, options: Options = {}) {
    const character = characters.get(id)!;
    const talent = character.talents.find(t => t.hits.some(h => h.id === `${id}.${output}`))!;
    const hit = talent.hits.find(h => h.id === `${id}.${output}`)!;
    const ascension = options.ascension ?? 0, level = [1, 20, 40, 50, 60, 70, 80][ascension];
    const weapon = weapons.get(options.weaponId ?? weaponTypes[character.identity.weaponType])!;
    const build: schema.StructuredBuild = { schemaVersion: character.schemaVersion, kind: 'calculation-build', dataVersion: character.dataVersion,
      character, weapon, sets: [], artifacts: [], artifactMain: main, artifactMainSourceRefs: ['content.artifact-main'],
      sources: [{ id: 'content.artifact-main', kind: 'definition' }], level, ascension, weaponLevel: 1, weaponAscension: 0,
      constellation: options.rank ?? 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 } };
    const allies = (options.party ?? []).map(member => {
      if (!('characterId' in member)) return member;
      const ally = characters.get(member.characterId)!;
      return { id: member.id, build: { ...build, character: ally, weapon: weapons.get(weaponTypes[ally.identity.weaponType])!, level: 1, ascension: 0, constellation: 0 } };
    });
    const team = prepareStructuredBuilds([{ id: 'actor', build }, ...allies], options.reaction ? reactions.calculation : undefined);
    expect(team.ok, JSON.stringify(team.diagnostics)).toBe(true);
    if (!team.ok) throw new Error('Invalid equipment');
    const actorFacts: Record<string, schema.CalculationFact> = { onField: fact(b(true)), hpRatio: fact(q('scalar', 1)), shielded: fact(b(false)),
      radiance: fact({ kind: 'enum', value: 'none' }) };
    const targetFacts: Record<string, schema.CalculationFact> = {};
    const teamFacts: Record<string, schema.CalculationFact> = { firstMoonsign: fact(b(false)), fullMoonsign: fact(b(false)) };
    const query: Record<string, schema.CalculationFact> = { strikingHand: fact({ kind: 'enum', value: 'left' }), stellarAttachments: fact(q('count', 1)) };
    const scoped = { owner: actorFacts, recipient: actorFacts, target: targetFacts, team: teamFacts, query,
      contributor: actorFacts, 'source-event': query };
    const hitInputs = (talent.inputs ?? []).filter(input => input.usage !== 'healing');
    const currentInputs = new Set(hitInputs.map(input => input.id));
    const otherInputs = new Set(character.talents.flatMap(t => t.inputs?.map(input => input.id) ?? []));
    for (const [key, field] of Object.entries(character.metadata.facts ?? {})) {
      if (field.scope === 'query' && otherInputs.has(key) && !currentInputs.has(key)) continue;
      const selected = options.changes?.[key] ?? (field.type.kind === 'enum' ? field.type.values[0] : field.type.kind === 'boolean' ? false : 0);
      scoped[field.scope][key] = fact(field.type.kind === 'quantity' ? q(field.type.unit, Number(selected))
        : field.type.kind === 'enum' ? { kind: 'enum', value: String(selected) } : b(Boolean(selected)));
    }
    for (const input of hitInputs) query[input.id] = fact(q(input.type.unit, Number(options.changes?.[input.id] ?? input.min)));
    for (const [key, value] of Object.entries(options.targetChanges ?? {})) targetFacts[key] = fact(b(Boolean(value)));
    for (const [key, value] of Object.entries(options.teamChanges ?? {})) teamFacts[key] = fact(b(Boolean(value)));
    const setup: schema.StructuredCombatSetup = { targets: [{ id: 'enemy', inputs: { level: fact(q('count', level)),
      defenseReduction: fact(q('scalar', 0)), ordinaryDamageReduction: fact(q('scalar', 0)),
      ...Object.fromEntries(['physical', 'anemo', 'geo', 'electro', 'hydro', 'pyro', 'cryo', 'dendro'].map(e => ['resistance.' + e, fact(q('scalar', 0.1))])),
    }, facts: targetFacts }], team: { inputs: {}, facts: teamFacts, actorFacts: {} }, sources: [], factIntervals: [],
    events: [{ id: 'hit', kind: 'hit', actorId: 'actor', targetIds: ['enemy'], timeMs: 1000, order: 1, skillId: talent.id,
      hitId: hit.id, category: hit.category, sourceEventIds: [], facts: {} }] };
    const request: schema.StructuredHitRequest = { actorId: 'actor', hit: schema.characterHitRef(character, hit.id), critMode: options.critMode ?? 'noncritical',
      reactionMode: 'none', frame: { eventId: 'hit', targetId: 'enemy', sourceEventId: null, phase: 'before', facts: query,
        actorFacts: {}, applications: [], captures: {}, factOverrides: [{ subject: { kind: 'actor', id: 'actor' }, facts: actorFacts }] } };
    let result;
    if (options.reaction) {
      const [family, element] = options.reaction;
      setup.events = [{ id: 'hit', kind: 'reaction', actorId: 'actor', targetIds: ['enemy'], timeMs: 1000, order: 1,
        reactionId: family, reactionElement: element, sourceEventIds: [], facts: {} }];
      const context = createStructuredCombatContext(team.team, setup);
      const reaction: schema.ProjectReaction = { family, element, triggerActorId: 'actor', contributors: [{ actorId: 'actor', qualified: true, crit: request.critMode }] };
      const occurrence = reactionOccurrence('hit', reaction, () => ({ ...request.frame, ownerId: 'actor', recipientId: 'actor', contributorId: 'actor', hit: null }), () => true);
      result = evaluateDamageQuery(team.team.program, context, { kind: 'event', eventId: 'hit', outputs: [occurrence] });
    } else {
      result = evaluateStructuredHit(team.team, setup, request);
    }
    const upstream = growth[id].stats;
    const base = (stat: 'attack' | 'hp' | 'defense') => upstream.base[stat] * growthCurves[level][upstream.curve[stat]] + upstream.promotion[ascension][stat];
    const attack = base('attack') + weapon.baseAttack * weapon.attackCurve[1] + weapon.promotion[0];
    const em = (innateBaseStats.characters[id]?.elementalMastery ?? 0)
      + (upstream.specialized === 'FIGHT_PROP_ELEMENT_MASTERY' ? upstream.promotion[ascension].specialized : 0)
      + (weapon.stat === 'elementalMastery' ? weapon.baseStat * weapon.statCurve[1] : 0);
    return { result, attack, hp: base('hp'), defense: base('defense'), em, level };
  }

  function known({ result }: ReturnType<typeof probe>): number {
    expect(result.diagnostics.filter(d => d.code !== 'unreviewed-mechanism'), JSON.stringify(result.requiredInputs)).toEqual([]);
    const value = result.totals.all;
    expect(value.state).toBe('known');
    return value.state === 'known' && value.value.kind === 'quantity' ? value.value.value : NaN;
  }

  // Independent level-one talent curves and the adopted mechanics text determine these expectations.
  // Each comparison uses a legal catalog build with no player inventory.
  it('chooses the physical or Cryo Aloy branch and applies the corresponding coil multiplier', () => {
    const physical = probe('aloy', 'normal.param1', { changes: { 'aloy.coilStacks': 3 } });
    expect(known(physical)).toBeCloseTo(physical.attack * multipliers.aloy.combat1.param1[0] * 0.45 * (1 + multipliers.aloy.combat2.param7[0]), 8);
    const rushing = { 'aloy.rushingIce': true, 'aloy.coilStacks': 3 };
    expect(known(probe('aloy', 'normal.param1', { changes: rushing }))).toBe(0);
    const infused = probe('aloy', 'normal.ice-1', { changes: rushing });
    expect(known(infused)).toBeCloseTo(infused.attack * multipliers.aloy.combat1.param1[0] * 0.45 * (1 + multipliers.aloy.combat2.param8[0]), 8);
    expect(known(probe('aloy', 'normal.ice-1'))).toBe(0);
  });

  it('gates the second Amber arrow and applies its 20% multiplier', () => {
    const rank = { rank: 1 };
    expect(known(probe('amber', 'normal.c1-full'))).toBe(0);
    expect(known(probe('amber', 'normal.c1-full', rank))).toBeCloseTo(known(probe('amber', 'normal.param7', rank)) * 0.2, 8);
  });

  it('gates Beidou instant counter by A1 and grants both Tidecaller stacks', () => {
    const timing = { 'beidou.instantCounter': true };
    expect(known(probe('beidou', 'skill.perfect-counter', { changes: timing }))).toBe(0);
    const hit = probe('beidou', 'skill.perfect-counter', { ascension: 1, changes: timing });
    expect(known(hit)).toBeCloseTo(hit.attack * (multipliers.beidou.combat2.param3[0] + 2 * multipliers.beidou.combat2.param4[0]) * 0.45, 8);
    expect(known(probe('beidou', 'skill.perfect-counter', { ascension: 1 }))).toBe(0);
  });

  it('allows Candace C6 wave at rank six and only for the explicit qualifying attack', () => {
    const changes = { 'candace.c6Wave': true };
    expect(known(probe('candace', 'burst.c6-wave', { rank: 5, changes }))).toBe(0);
    expect(known(probe('candace', 'burst.c6-wave', { rank: 6 }))).toBe(0);
    const hit = probe('candace', 'burst.c6-wave', { rank: 6, changes });
    expect(known(hit)).toBeCloseTo(hit.hp * 0.15 * 0.45, 8);
  });

  it('adds Charlotte Cryo damage by the number of other non-Fontaine characters', () => {
    const solo = known(probe('charlotte', 'skill.param1', { ascension: 4 }));
    const party: Options['party'] = [{ id: 'outlander', characterId: 'amber' }, { id: 'fontaine', characterId: 'furina' }];
    expect(known(probe('charlotte', 'skill.param1', { ascension: 4, party }))).toBeCloseTo(solo * 1.05, 8);
  });

  it('applies Columbina Lunar Domain only on Lunar output', () => {
    const changes = { 'columbina.lunar-bloomInterference': true };
    const before = known(probe('columbina', 'skill.param4', { changes }));
    const inside = { ...changes, 'columbina.moonDomain': true };
    expect(known(probe('columbina', 'skill.param4', { changes: inside }))).toBeCloseTo(before * 1.13, 8);
    expect(known(probe('columbina', 'skill.param1', { changes: inside }))).toBeCloseTo(known(probe('columbina', 'skill.param1')), 8);
  });

  it('applies Faruzan talent-level Wind Prayer to Anemo hits', () => {
    const normal = known(probe('faruzan', 'skill.param1'));
    expect(known(probe('faruzan', 'skill.param1', { changes: { 'faruzan.prayer': true } }))).toBeCloseTo(normal * 1.18, 8);
  });

  it('scales Furina Salon hits from zero to four allies and excludes the cast hit', () => {
    const changes = { 'furina.salonAllies': 4 };
    expect(known(probe('furina', 'skill.param3', { changes }))).toBeCloseTo(known(probe('furina', 'skill.param3')) * 1.4, 8);
    expect(known(probe('furina', 'skill.param1', { changes }))).toBeCloseTo(known(probe('furina', 'skill.param1')), 8);
    expect(probe('furina', 'skill.param3', { changes: { 'furina.salonAllies': 5 } }).result.execution).toBe('invalid');
  });

  it('checks Gorou three-Geo threshold for the banner bonus', () => {
    const changes = { 'gorou.bannerDomain': true, 'gorou.burstDomain': false };
    const allies: Options['party'] = [{ id: 'first', element: 'geo' }, { id: 'second', element: 'geo' }];
    const before = known(probe('gorou', 'skill.param1', { changes, party: allies.slice(0, 1) }));
    const after = known(probe('gorou', 'skill.param1', { changes, party: allies }));
    expect(after).toBeCloseTo(before * 1.15, 8);
  });

  it('gates the Illuga C2 burst proc and resolves both scaling attributes', () => {
    const changes = { 'illuga.nightingaleSong': true, 'illuga.adongs': true };
    expect(known(probe('illuga', 'burst.c2-adong', { rank: 1, changes }))).toBe(0);
    const hit = probe('illuga', 'burst.c2-adong', { rank: 2, changes, weaponId: 'kitaincrossspear' });
    expect(hit.em).toBeGreaterThan(0);
    expect(known(hit)).toBeCloseTo((hit.defense * 2 + hit.em * 4) * 0.45, 8);
  });

  it('gates the Shinobu C4 skill hit', () => {
    const changes = { 'kukishinobu.c4GrassMark': true };
    expect(known(probe('kukishinobu', 'skill.c4-mark', { rank: 3, changes }))).toBe(0);
    const hit = probe('kukishinobu', 'skill.c4-mark', { rank: 4, changes });
    expect(known(hit)).toBeCloseTo(hit.hp * 0.097 * 0.45, 8);
  });

  it('excludes the replaced Lauma C6 normal attack branch', () => {
    const changes = { 'lauma.c6PaleHymn': true };
    expect(known(probe('lauma', 'normal.param1', { rank: 6, changes }))).toBe(0);
    expect(known(probe('lauma', 'normal.param1', { rank: 5, changes }))).toBeGreaterThan(0);
    expect(known(probe('lauma', 'normal.c6-lunar', { rank: 5, changes }))).toBe(0);
  });

  it('adds Lauma Bloom flat damage after reaction scaling and limits fixed crit to nascent Moon', () => {
    const bloom = ['bloom', 'dendro'] as const;
    const settings = { rank: 2, ascension: 6, reaction: bloom, critMode: 'expected' } as const;
    const changes = { 'lauma.paleHymn': true, 'lauma.skillMoonWindow': true };
    const hit = probe('lauma', 'normal.param1', { ...settings, changes, teamChanges: { firstMoonsign: true } });
    const level = reactions.rules.levelMultipliers[hit.level];
    const base = level * 2 * (1 + 16 * hit.em / (2000 + hit.em));
    const flat = hit.em * (multipliers.lauma.combat3.param3[0] + 5);
    expect(known(hit)).toBeCloseTo((base + flat) * 0.9 * 1.15, 8);
    const full = probe('lauma', 'normal.param1', { ...settings, changes, teamChanges: { firstMoonsign: true, fullMoonsign: true } });
    expect(known(full)).toBeCloseTo((base + flat) * 0.9, 8);
  });

  it('adds Mavuika Fighting Spirit at the legal thresholds', () => {
    for (const points of [50, 200]) {
      const hit = probe('mavuika', 'burst.param1', { changes: { 'mavuika.fightingSpirit': points } });
      expect(known(hit)).toBeCloseTo(hit.attack * (4.448 + 0.016 * points) * 0.45, 8);
    }
  });

  it('checks Mona Omen only on the marked target', () => {
    const neutral = known(probe('mona', 'burst.param2'));
    expect(known(probe('mona', 'burst.param2', { targetChanges: { 'mona.omen': true } }))).toBeCloseTo(neutral * 1.42, 8);
  });

  it('applies Nahida C1 Shrine pyro counting only to Tri-Karma', () => {
    const changes = { 'nahida.inShrine': true };
    const neutral = known(probe('nahida', 'skill.param3', { changes }));
    expect(known(probe('nahida', 'skill.param3', { rank: 1, changes }))).toBeCloseTo(neutral * 1.1488, 8);
    expect(known(probe('nahida', 'skill.param3', { rank: 1, changes, party: [{ id: 'pyro', element: 'pyro' }] }))).toBeCloseTo(neutral * 1.2232, 8);
    expect(known(probe('nahida', 'skill.param1', { rank: 1, changes }))).toBeCloseTo(known(probe('nahida', 'skill.param1')), 8);
  });

  it('applies Nahida fixed C2 critical chance to a marked Bloom target', () => {
    const bloom = ['bloom', 'dendro'] as const;
    const setting = { reaction: bloom, critMode: 'expected' } as const;
    const marked = { targetChanges: { 'nahida.seedMark': true } };
    const neutral = known(probe('nahida', 'normal.param1', setting));
    expect(known(probe('nahida', 'normal.param1', { ...setting, ...marked, rank: 1 }))).toBeCloseTo(neutral, 8);
    expect(known(probe('nahida', 'normal.param1', { ...setting, ...marked, rank: 2 }))).toBeCloseTo(neutral * 1.2, 8);
  });

  it('handles Nefer stacks at zero and before and after the C2 cap', () => {
    const base = known(probe('nefer', 'burst.param1'));
    const at = (rank: number, stacks: number) => probe('nefer', 'burst.param1', { rank, changes: { 'nefer.consumedVeil': stacks } });
    expect(known(at(0, 3))).toBeCloseTo(base * 1.39, 8);
    expect(at(0, 5).result.execution).toBe('invalid');
    expect(known(at(2, 5))).toBeCloseTo(base * 1.65, 8);
  });

  it('includes innate base elemental mastery for Lauma, Nefer, and Mitya', () => {
    for (const [id, expectedEm] of [['lauma', 200], ['nefer', 100], ['mitya', 100], ['nahida', 0]] as const) {
      const character = characters.get(id)!;
      const weapon = weapons.get(weaponTypes[character.identity.weaponType])!;
      const build: schema.StructuredBuild = { schemaVersion: character.schemaVersion, kind: 'calculation-build', dataVersion: character.dataVersion,
        character, weapon, sets: [], artifacts: [], artifactMain: main, artifactMainSourceRefs: ['content.artifact-main'],
        sources: [{ id: 'content.artifact-main', kind: 'definition' }], level: 1, ascension: 0, weaponLevel: 1, weaponAscension: 0,
        constellation: 0, refinement: 1, talents: { normal: 1, skill: 1, burst: 1 } };
      const team = prepareStructuredBuilds([{ id: 'actor', build }]);
      expect(team.ok, JSON.stringify(team.diagnostics)).toBe(true);
      if (!team.ok) continue;
      const talent = character.talents[0], hit = talent.hits[0];
      const setup: schema.StructuredCombatSetup = { targets: [{ id: 'enemy', inputs: {}, facts: {} }], team: { inputs: {}, facts: {}, actorFacts: {} }, sources: [], factIntervals: [],
        events: [{ id: 'stat', kind: 'hit', actorId: 'actor', targetIds: ['enemy'], timeMs: 1000, order: 1, skillId: talent.id, hitId: hit.id, category: hit.category, sourceEventIds: [], facts: {} }] };
      const context = createStructuredCombatContext(team.team, setup);
      const reading = evaluateCombatBindings(team.team.program, context, {
        em: { kind: 'attribute', key: { namespace: 'builtin', id: 'attribute.elementalMastery', revision: '1' }, actor: { role: 'owner' }, at: { kind: 'current', phase: 'same' } },
      }, { eventId: 'stat', targetId: 'enemy', sourceEventId: null, phase: 'before', ownerId: 'actor', recipientId: 'actor', contributorId: null,
        facts: {}, actorFacts: {}, applications: [], captures: {}, factOverrides: [], hit: null });
      expect(reading.diagnostics).toEqual([]);
      expect(reading.outputs.em?.state).toBe('known');
      expect(reading.outputs.em?.state === 'known' && reading.outputs.em.value.kind === 'quantity' ? reading.outputs.em.value.value : NaN).toBe(expectedEm);
    }
  });

  it('uses the three Lunar shades and makes the C1 base damage gain scale with Nefer Veil stacks', () => {
    const base = { ascension: 6, changes: { 'nefer.phantasm': true }, weaponId: 'magicguide' } as const;
    const neutral = known(probe('nefer', 'skill.phantasm-shadow-1', base));
    const c1 = probe('nefer', 'skill.phantasm-shadow-1', { ...base, rank: 1 });
    expect(c1.em).toBeGreaterThan(0);
    const blessing = Math.min(0.14, c1.em * 0.000175);
    const emFactor = 1 + 6 * c1.em / (2000 + c1.em);
    expect(known(c1) - neutral).toBeCloseTo(c1.em * 0.6 * (1 + blessing) * emFactor * 0.9, 8);
    const stacks = probe('nefer', 'skill.phantasm-shadow-1', { ...base, rank: 1, changes: { ...base.changes, 'nefer.phantasmVeil': 3 } });
    expect(known(stacks)).toBeCloseTo(known(c1) * 1.24, 8);
    expect(known(probe('nefer', 'skill.phantasm-shadow-2', { ascension: 6 }))).toBe(0);
  });

  it('converts Kokomi maximum HP into Bake-Kurage flat damage only during Garment', () => {
    const neutral = known(probe('sangonomiyakokomi', 'skill.param3'));
    const hit = probe('sangonomiyakokomi', 'skill.param3', { changes: { 'sangonomiyakokomi.garment': true } });
    expect(known(hit) - neutral).toBeCloseTo(hit.hp * 0.070963 * 0.45, 8);
  });

  it('applies Sethos C1 critical bonus only to a Shadowpiercing Shot', () => {
    const expected = { critMode: 'expected' } as const;
    const noCrit = known(probe('sethos', 'normal.param7'));
    expect(known(probe('sethos', 'normal.param7', { rank: 1, ...expected }))).toBeCloseTo(noCrit * 1.1, 8);
    expect(known(probe('sethos', 'normal.param6', { rank: 1, ...expected }))).toBeCloseTo(known(probe('sethos', 'normal.param6', expected)), 8);
  });

  it('uses Shenhe attack for one Icy Quill and excludes physical hits', () => {
    const changes = { 'shenhe.quillTap': true };
    const original = known(probe('shenhe', 'skill.param1'));
    const affected = probe('shenhe', 'skill.param1', { changes });
    expect(known(affected) - original).toBeCloseTo(affected.attack * 0.45656 * 0.45, 8);
    expect(known(probe('shenhe', 'normal.param1', { changes }))).toBeCloseTo(known(probe('shenhe', 'normal.param1')), 8);
  });

  it('applies Skirk Withering Rift counts only on supported enhanced normals', () => {
    const active = { 'skirk.sevenfold': true, 'skirk.withering': true };
    const neutral = known(probe('skirk', 'skill.param1', { ascension: 1, changes: { 'skirk.sevenfold': true } }));
    expect(known(probe('skirk', 'skill.param1', { ascension: 1, changes: { ...active, 'skirk.consumedRifts': 0 } }))).toBeCloseTo(neutral * 1.035, 8);
    expect(known(probe('skirk', 'skill.param1', { ascension: 1, changes: { ...active, 'skirk.consumedRifts': 3 } }))).toBeCloseTo(neutral * 1.11, 8);
    expect(known(probe('skirk', 'skill.param1', { ascension: 1 }))).toBe(0);
  });

  it('applies Valeriy C6 bonus to falling lightning shells only', () => {
    expect(known(probe('valeriy', 'burst.param2', { rank: 6 }))).toBeCloseTo(known(probe('valeriy', 'burst.param2', { rank: 5 })) * 2, 8);
    expect(known(probe('valeriy', 'burst.param1', { rank: 6 }))).toBeCloseTo(known(probe('valeriy', 'burst.param1', { rank: 5 })), 8);
  });

  it('applies Vodyanitsa Long Song damage to the burst only', () => {
    const changes = { 'vodyanitsa.longSong': true };
    expect(known(probe('vodyanitsa', 'burst.param1', { changes }))).toBeCloseTo(known(probe('vodyanitsa', 'burst.param1')) * 1.48, 8);
    expect(known(probe('vodyanitsa', 'skill.param1', { changes }))).toBeCloseTo(known(probe('vodyanitsa', 'skill.param1')), 8);
  });

  it('uses Mizuki strict 70% snack HP threshold and C4 exception', () => {
    const snack = { 'yumemizukimizuki.snackCollected': true };
    const at = (hp: number, rank = 0) => known(probe('yumemizukimizuki', 'burst.param2', { rank, changes: { ...snack, 'yumemizukimizuki.snackCollectorHp': hp } }));
    expect(at(0.7)).toBe(0);
    expect(at(0.701)).toBeGreaterThan(0);
    expect(at(0.7, 4)).toBeCloseTo(at(0.701, 4), 8);
  });

  it('applies Mizuki dreamdrifter Swirl bonus, Nightmare flat and C6 fixed crit in order', () => {
    const settings = { rank: 6, ascension: 6, reaction: ['swirl', 'hydro'], critMode: 'expected' } as const;
    const changes = { 'yumemizukimizuki.dreamdrifter': true };
    const night = { targetChanges: { 'yumemizukimizuki.c1Night': true } };
    const hit = probe('yumemizukimizuki', 'normal.param1', { ...settings, ...night, changes });
    const level = reactions.rules.levelMultipliers[hit.level];
    const bonus = multipliers.yumemizukimizuki.combat2.param2[3] * hit.em / 100;
    const base = level * 0.6 * (1 + 16 * hit.em / (2000 + hit.em) + bonus);
    expect(known(hit)).toBeCloseTo((base + hit.em * 11) * 0.9 * 1.3, 8);
    expect(known(probe('yumemizukimizuki', 'normal.param1', { ...settings, changes }))).toBeCloseTo(base * 0.9 * 1.3, 8);
  });

  it('multiplies Varka enhanced stance normals only with a qualifying pair', () => {
    const changes = { 'varka.stance': true };
    const ordinary = known(probe('varka', 'skill.param3', { ascension: 1, changes }));
    const pair: Options['party'] = [{ id: 'anemo', element: 'anemo' }];
    expect(known(probe('varka', 'skill.param3', { ascension: 1, changes, party: pair }))).toBeCloseTo(ordinary * 1.4, 8);
    expect(known(probe('varka', 'normal.param1', { ascension: 1, changes, party: pair }))).toBe(0);
  });
});
