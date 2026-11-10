import { describe, expect, it } from 'vitest';
import { statKeys, type Build, type Enemy, type DamageRequest, type Project } from '@leyline/schema';
import { resolveBuild, evaluateDamage } from '@leyline/engine';
import { evaluateTimeline } from '@leyline/engine';
import { getCharacter, getWeapon, getArtifactSet, getArtifactMain, DATA_VERSION } from '@leyline/game-data';

const source = { repository: 'independent-fixture', commit: '1', path: 'manual' };
const support = { supported: true, reason: '独立手算样本' };
const curve = () => Array.from({ length: 91 }, () => 1);
function build(): Build {
  return { dataVersion: 'real-fixture-v1', character: { schemaVersion:2,kind:'character-definition',id:'character',revision:'1',dataVersion:'real-fixture-v1',origin:'custom',identity:{name:'独立角色',title:'',description:'',element:'hydro',weaponType:'sword',rarity:5},attributes:{
    base: { hp: 1000, attack: 100, defense: 100, critRate: 0.05, critDamage: 0.5 }, specialized:'healingBonus',modifiers:[]},progression:{curves:{hp:curve(),attack:curve(),defense:curve()},
    promotion: [20, 40, 50, 60, 70, 80, 90].map(maxLevel => ({ maxLevel, hp: 0, attack: 0, defense: 0, specialized: 0 }))},
    talents: [{ id: 'skill', name: '独立双段技能', category: 'skill', element:'hydro',description:'',parameters:[{id:'hit1',unit:'ratio',values:Array(15).fill(2)},{id:'hit2',unit:'ratio',values:Array(15).fill(3)}],details:[],hits:[{parameter:'hit1'},{parameter:'hit2'}],support}],passives:[],constellations:[],capabilities:{text:'unavailable',numbers:'partial',calculation:support} },
    weapon: { id: 'weapon', name: '独立武器', weaponType: 'sword', rarity: 4, baseAttack: 20, baseStat: 0, stat: 'attackPercent', attackCurve: curve(), statCurve: curve(), promotion: Array(7).fill(0), modifiers: [], support, source },
    sets: [], artifactMain: Object.fromEntries(statKeys.map(stat => [stat, Array(21).fill(0)])) as Build['artifactMain'],
    level: 90, ascension: 6, constellation: 0, talents: { normal: 1, skill: 1, burst: 1 }, weaponLevel: 90, weaponAscension: 6, refinement: 1, hpRatio: 1, artifacts: [] };
}
function enemy(resistance = 0.1): Enemy {
  return { level: 90, resistances: { physical: resistance, anemo: resistance, geo: resistance, electro: resistance, hydro: resistance, pyro: resistance, cryo: resistance, dendro: resistance }, defenseReduction: 0, defenseIgnore: 0 };
}
const hit: DamageRequest = { skillId: 'skill', hitIndex: 0, crit: 'noncritical', reaction: 'none' };

describe('snapshot-bound real game panel and damage', () => {
  it.each([
    { id: 'jean', element: 'anemoBonus', attack: 1452.569362495, values: [4756.802681885993] },
    { id: 'kaeya', element: 'cryoBonus', attack: 1425.9678159486002, values: [3057.68693097647] },
    { id: 'xingqiu', element: 'hydroBonus', attack: 1548.4809545214, values: [3315.5194661030046, 3773.3769161838954] },
  ] as const)('verifies the fixed real $id snapshot against separately calculated panel and hit values', async reference => {
    const input = build();
    input.dataVersion = DATA_VERSION;
    input.character = await getCharacter(reference.id);
    input.weapon = await getWeapon(reference.id === 'xingqiu' ? 'sacrificialsword' : 'favoniussword');
    input.sets = [await getArtifactSet('gladiatorsfinale')];
    input.artifactMain = await getArtifactMain();
    input.talents.skill = 9;
    input.artifacts = [
      { id: 'real-flower', slot: 'flower', setId: 'gladiatorsfinale', rarity: 5, level: 20, mainStat: 'hp', substats: [] },
      { id: 'real-plume', slot: 'plume', setId: 'gladiatorsfinale', rarity: 5, level: 20, mainStat: 'attack', substats: [] },
      { id: 'real-sands', slot: 'sands', setId: 'none', rarity: 5, level: 20, mainStat: 'attackPercent', substats: [] },
      { id: 'real-goblet', slot: 'goblet', setId: 'none', rarity: 5, level: 20, mainStat: reference.element, substats: [] },
      { id: 'real-circlet', slot: 'circlet', setId: 'none', rarity: 5, level: 20, mainStat: 'critRate', substats: [] },
    ];
    const panel = resolveBuild(input);
    expect(panel.diagnostics).toEqual([]);
    expect(panel.stats.attack).toBeCloseTo(reference.attack, 7);
    for (const [hitIndex, expected] of reference.values.entries()) {
      const result = evaluateDamage(input, { ...hit, skillId: `${reference.id}.skill`, hitIndex }, enemy());
      expect(result.status).toBe('complete');
      expect(result.value).toBeCloseTo(expected, 7);
    }
    // Source constants, not the engine, produced the reference values above:
    // character base*level-90 curve+promotion; plus 41.0671*7.275+155.6 weapon;
    // attack sands .466 + two-piece .18 (+ Xingqiu ascension .24), then flat feather 311;
    // E9 coefficient * (1+.466 [+ Xingqiu A4 .2]) * .5 defense * .9 resistance.
    const restored = JSON.parse(JSON.stringify(input));
    input.weapon.baseAttack = 0;
    expect(resolveBuild(restored).stats.attack).toBeCloseTo(reference.attack, 7);
  });
  it('calculates independent multi-hit damage, crit and additive damage-bonus intervals', () => {
    const input = build();
    input.character.attributes.modifiers.push({ stat: 'hydroBonus', values: [0.2], minAscension: 4 });
    expect(evaluateDamage(input, hit, enemy()).value).toBeCloseTo(129.6, 10); // (100+20)*2*1.2*.5*.9
    expect(evaluateDamage(input, { ...hit, hitIndex: 1 }, enemy()).value).toBeCloseTo(194.4, 10);
    expect(evaluateDamage(input, hit, enemy(), 0.3).value).toBeCloseTo(162, 10); // 120*2*(1+.2+.3)*.5*.9
    expect(evaluateDamage(input, { ...hit, crit: 'critical' }, enemy()).value).toBeCloseTo(194.4, 10);
    expect(evaluateDamage(input, { ...hit, crit: 'expected' }, enemy()).value).toBeCloseTo(132.84, 10);
    input.character.attributes.base.critRate = 2;
    expect(evaluateDamage(input, { ...hit, crit: 'expected' }, enemy()).value).toBeCloseTo(194.4, 10);
  });
  it('keeps skill-only damage and crit modifiers out of the global panel', () => {
    const input = build();
    input.weapon.modifiers = [{ stat: 'hydroBonus', category: 'skill', values: [0.16, 0.2, 0.24, 0.28, 0.32] }, { stat: 'critRate', category: 'skill', values: [0.06, 0.075, 0.09, 0.105, 0.12] }];
    input.refinement = 5;
    const panel = resolveBuild(input);
    expect(panel.stats.hydroBonus).toBe(0);
    expect(panel.stats.critRate).toBe(0.05);
    expect(evaluateDamage(input, { ...hit, crit: 'expected' }, enemy()).value).toBeCloseTo(154.6776, 10); // 120*2*1.32*(1+.17*.5)*.5*.9
  });
  it('resolves flat/percent stats, exact main values, static two-piece and HP conditions from the stored snapshot', () => {
    const input = build();
    input.artifactMain.hp[20] = 4780;
    input.artifactMain.attack[20] = 311;
    input.artifacts = [{ id: 'flower', slot: 'flower', setId: 'set', rarity: 5, level: 20, mainStat: 'hp', substats: [{ stat: 'attackPercent', value: 0.1 }] },
      { id: 'plume', slot: 'plume', setId: 'set', rarity: 5, level: 20, mainStat: 'attack', substats: [{ stat: 'critDamage', value: 0.14 }] }];
    input.sets = [{ id: 'set', name: '独立攻击套装', source, effects: [{ pieces: 2, modifiers: [{ stat: 'attackPercent', values: [0.18] }], support }] }];
    input.weapon.modifiers.push({ stat: 'critRate', values: [0.14], hpAbove: 0.9 });
    const panel = resolveBuild(input);
    expect(panel.status).toBe('complete');
    expect(panel.stats.attack).toBeCloseTo(464.6, 10); // 120*(1+.1+.18)+311
    expect(panel.stats.hp).toBe(5780);
    expect(panel.stats.critRate).toBeCloseTo(0.19);
    input.hpRatio = 0.9;
    expect(resolveBuild(input).stats.critRate).toBe(0.05);
    expect(JSON.parse(JSON.stringify(input))).toEqual(input);
  });
  it('uses explicit defense and all three resistance branches', () => {
    expect(evaluateDamage(build(), hit, enemy(-0.2)).value).toBeCloseTo(132, 10);
    expect(evaluateDamage(build(), hit, enemy(0.75)).value).toBe(30);
    expect(evaluateDamage(build(), hit, enemy(0.8)).value).toBeCloseTo(28.57142857142857, 10);
    const target = enemy(0);
    target.defenseReduction = 0.5; target.defenseIgnore = 0.5;
    expect(evaluateDamage(build(), hit, target).value).toBe(192);
  });
  it('distinguishes the before/after ascension configurations at the same level', () => {
    const input = build();
    input.level = 20; input.ascension = 0;
    input.weaponLevel = 20; input.weaponAscension = 0;
    input.character.progression.promotion[1].attack = 10;
    input.weapon.promotion[1] = 5;
    expect(resolveBuild(input).stats.attack).toBe(120);
    expect(resolveBuild(input).status).toBe('complete');
    input.ascension = 1; input.weaponAscension = 1;
    expect(resolveBuild(input).stats.attack).toBe(135);
    expect(resolveBuild(input).status).toBe('complete');
    input.talents.skill = 2;
    expect(resolveBuild(input).status).toBe('invalid');
  });
  it('does not call unknown facts or unsupported content complete', () => {
    expect(evaluateDamage(build(), { ...hit, crit: null }, enemy()).status).toBe('partial');
    expect(evaluateDamage(build(), { ...hit, reaction: null }, enemy()).value).toBeNull();
    expect(evaluateDamage(build(), hit, undefined).value).toBeNull();
    expect(evaluateDamage(build(), undefined, enemy()).value).toBeNull();
    for (const alter of [(input: Build) => { input.constellation = 1; }, (input: Build) => { input.weapon.support = { supported: false, reason: '未核验被动' }; },
      (input: Build) => { input.character.talents[0].support = { supported: false, reason: '未核验命中' }; }]) {
      const input = build(); alter(input);
      const result = evaluateDamage(input, hit, enemy());
      expect(result.status).toBe('partial'); expect(result.value).toBeNull();
    }
  });
  it('rejects illegal level/talent/equipment and keeps unsupported four-piece effects partial', () => {
    for (const alter of [(input: Build) => { input.level = 19; input.ascension = 1; }, (input: Build) => { input.level = 20; input.ascension = 0; input.talents.skill = 2; },
      (input: Build) => { input.weapon.weaponType = 'bow'; }, (input: Build) => { input.artifacts = [{ id: 'invalid', slot: 'flower', setId: 'none', rarity: 5, level: 20, mainStat: 'critRate', substats: [] }]; }]) {
      const input = build(); alter(input); expect(resolveBuild(input).status).toBe('invalid');
    }
    const input = build();
    input.artifacts = ['flower', 'plume', 'sands', 'goblet'].map((slot, i) => ({ id: String(i), slot: slot as 'flower' | 'plume' | 'sands' | 'goblet', setId: 'set', rarity: 5, level: 0, mainStat: i === 0 ? 'hp' : i === 1 ? 'attack' : 'attackPercent', substats: [] }));
    input.sets = [{ id: 'set', name: '条件套装', source, effects: [{ pieces: 4, modifiers: [], support: { supported: false, reason: '条件效果尚未支持' } }] }];
    expect(resolveBuild(input).status).toBe('partial');
    expect(evaluateDamage(input, hit, enemy()).value).toBeNull();
    input.artifacts[0].substats = [{ stat: 'hp', value: 100 }];
    expect(resolveBuild(input).status).toBe('invalid');
  });
  it('uses the same controlled game node in the axis and adds interval bonus in its damage bucket', () => {
    const input = build(); input.character.attributes.modifiers.push({ stat: 'hydroBonus', values: [0.2] });
    const project: Project = { schemaVersion: 2, rulesVersion: 'timeline-v1', calculationProfile: 'direct', id: 'real-axis', revision: '1',
      definitions: [{ id: 'character', version: '1', source: { kind: 'preset', reference: 'fixture', verified: true }, nodes: [], effects: [] },
        { id: 'weapon', version: '1', source: { kind: 'preset', reference: 'fixture', verified: true }, nodes: [{ id: 'bonus', op: 'constant', quantity: { value: 0.3, unit: 'scalar' } }], effects: [{ id: 'effect', startMs: 0, endMs: 5000, value: 'bonus' }] },
        { id: 'damage', version: '1', source: { kind: 'preset', reference: 'fixture', verified: true }, nodes: [{ id: 'root', op: 'game-damage' }], damage: 'root', effects: [] }],
      candidate: { id: 'candidate', actors: [{ id: 'actor', character: 'character', weapon: 'weapon', inputs: {}, build: input }] },
      enemy: enemy(), conditions: {}, objective: {}, timeline: [{ id: 'hit', actor: 'actor', kind: 'damage', definition: 'damage', timeMs: 0, order: 0, damage: hit }] };
    const result = evaluateTimeline(project);
    expect(result.status).toBe('complete'); expect(result.totalValue).toBeCloseTo(162, 10);
    expect(result.points[0].real?.parts.bonus).toBe(1.5);
    expect(evaluateTimeline(JSON.parse(JSON.stringify(project)))).toEqual(result);
    project.definitions[1].effects[0].condition = 'unknown-effect';
    project.conditions['unknown-effect'] = null;
    const unknown = evaluateTimeline(project);
    expect(unknown.status).toBe('partial');
    expect(unknown.points[0].value).toBeNull();
    expect(unknown.points[0].real?.status).toBe('partial');
    expect(unknown.points[0].real?.value).toBeNull();
    project.conditions['unknown-effect'] = true;
    expect(evaluateTimeline(project).totalValue).toBeCloseTo(162, 10);
    project.candidate.actors[0].build!.weapon.support = { supported: false, reason: '未核验被动' };
    expect(evaluateTimeline(project).status).toBe('partial');
    expect(evaluateTimeline(project).totalValue).toBeNull();
  });
});
