import { describe, expect, it } from 'vitest';
import { simulateTeam } from './team';
import { content } from '@leyline/game-data';
import { resolveLoadout } from './loadout';
import { teamSchema, type CharacterId, type TeamInput } from '@leyline/schema';
export function testTeam(character: CharacterId = 'jean'): TeamInput {
  const polearm = character === 'hutao' || character === 'raiden';
  return teamSchema.parse({ schemaVersion: 1, rulesVersion: 'team-repo-v1', durationMs: 20000, seed: 1, mode: 'noncritical',
    actors: [{ id: character, character, level: 90, ascension: 6, constellation: 0, talents: { normal: 1, skill: 1, burst: 1 },
      weapon: { id: polearm ? 'staff-of-homa' : 'harbinger-of-dawn', level: 90, ascension: 6, refinement: 1 },
      artifacts: [], initialHpRatio: 1, initialEnergy: { jean: 80, xingqiu: 80, hutao: 60, albedo: 40, raiden: 90 }[character] }],
    initialOnField: character, enemy: { level: 90, hpRatio: 1, resistance: 0, defenseReduction: 0, fatalBlossomHits: 2 },
    commands: [{ type: 'cast', id: 'E', timeMs: 0, actorId: character, action: 'E' }], logMode: 'detailed', maxLogEvents: 10000 });
}
describe('registered first-batch character content', () => {
  it('routes Jean E through the unified engine and independently matches its multiplier', () => {
    const config = testTeam(); const result = simulateTeam(config);
    const loadout = resolveLoadout(config.actors[0]);
    const attack = (loadout.stats.characterBaseAttack + loadout.stats.weaponBaseAttack) * (1 + loadout.stats.attackPercent) + loadout.stats.flatAttack;
    expect(result.totalDamage).toBeCloseTo(attack * 2.9200000762939453 * 0.5);
    expect(result.events.find(e => e.type === 'hit')).toMatchObject({ timeMs: 350 });
    expect(result.finalEnergy.jean).toBe(80);
  });
  it('handles Jean hold C1 and heals the party from Q with A4 flat refund', () => {
    const config = testTeam(); config.actors[0].constellation = 1; config.actors[0].initialHpRatio = 0.2;
    config.commands = [{ type: 'cast', id: 'hold', timeMs: 0, actorId: 'jean', action: 'E', holdMs: 1000 }];
    const held = simulateTeam(config);
    const plain = testTeam(); plain.actors[0].constellation = 1;
    expect(held.totalDamage / simulateTeam(plain).totalDamage).toBeCloseTo(1.4);
    config.commands = [{ type: 'cast', id: 'Q', timeMs: 0, actorId: 'jean', action: 'Q' }];
    const burst = simulateTeam(config);
    expect(burst.finalEnergy.jean).toBe(16);
    expect(burst.finalHealth.jean.current).toBeGreaterThan(burst.finalHealth.jean.max * 0.2);
    expect(burst.events.filter(e => e.type === 'hit')).toHaveLength(3);
  });
  it('uses two distinct Hydro hits for Xingqiu E, not the copied old Electro implementation', () => {
    const config = testTeam('xingqiu'); config.actors[0].initialEnergy = 0;
    const result = simulateTeam(config);
    const hits = result.events.filter(e => e.type === 'hit' && !e.id.startsWith('orbitals'));
    expect(hits.map(e => e.timeMs)).toEqual([200, 517]);
    const loadout = resolveLoadout(config.actors[0]);
    const attack = (loadout.stats.characterBaseAttack + loadout.stats.weaponBaseAttack) * (1 + loadout.stats.attackPercent);
    expect(result.totalDamage).toBeCloseTo(attack * (1.6799999475479126 + 1.9119999408721924) * 1.2 * 0.5);
    expect(result.finalEnergy.xingqiu).toBeCloseTo(15);
  });
  it('triggers Xingqiu C6 2/3/5 rain on normal attack attempts with fixed energy restoration', () => {
    const config = testTeam('xingqiu'); config.actors[0].constellation = 6;
    config.commands = [{ type: 'cast', id: 'Q', timeMs: 0, actorId: 'xingqiu', action: 'Q' },
      ...[1000, 2100, 3200].map((timeMs, i) => ({ type: 'cast' as const, id: `N${i}`, timeMs, actorId: 'xingqiu', action: 'N1' as const }))];
    const result = simulateTeam(config);
    const rain = result.events.filter(e => e.type === 'hit' && e.id.startsWith('rain:'));
    expect(rain).toHaveLength(10);
    expect(result.finalEnergy.xingqiu).toBe(3);
    expect(result.events.some(e => e.type === 'enemy-debuff-start' && e.id.includes('C2'))).toBe(true);
  });
  it('consumes 30% current HP and converts HP to attack for Hu Tao without exceeding 4x base', () => {
    const config = testTeam('hutao');
    config.commands.push({ type: 'cast', id: 'C', timeMs: 1000, actorId: 'hutao', action: 'C' });
    const result = simulateTeam(config);
    expect(result.finalHealth.hutao.current / result.finalHealth.hutao.max).toBeCloseTo(0.7);
    expect(result.events.some(e => e.type === 'hit' && e.id.startsWith('blossom'))).toBe(true);
    const charge = result.events.find(e => e.type === 'hit' && e.id === 'C:0');
    const loadout = resolveLoadout(config.actors[0]);
    const conversion = Math.min(loadout.stats.maxHp * content.characters.hutao.skills.E['1'][1], 4 * (loadout.stats.characterBaseAttack + loadout.stats.weaponBaseAttack));
    const attack = loadout.stats.characterBaseAttack + loadout.stats.weaponBaseAttack + loadout.stats.flatAttack + conversion;
    expect(charge?.type === 'hit' && charge.calculation.baseDamage).toBeCloseTo(attack * content.characters.hutao.skills.A['1'][7]);
  });
  it('models Hu Tao C1 stamina and C6 low-health critical window', () => {
    const config = testTeam('hutao'); config.actors[0].constellation = 6; config.actors[0].initialHpRatio = 0.3;
    config.mode = 'expected'; config.commands.push({ type: 'cast', id: 'C', timeMs: 1000, actorId: 'hutao', action: 'C' });
    const result = simulateTeam(config);
    expect(result.events.some(e => e.type === 'status' && e.id === 'hutao-C6')).toBe(true);
    expect(result.events.some(e => e.type === 'status' && e.id === 'stamina')).toBe(false);
    expect(result.events.find(e => e.type === 'hit' && e.id === 'C:0')).toMatchObject({ calculation: { critMultiplier: 1 + result.loadouts[0].stats.critDamage } });
  });
  it('makes Albedo transient blossoms scale on snapshotted DEF and grant C1 energy', () => {
    const config = testTeam('albedo'); config.actors[0].constellation = 1; config.actors[0].initialEnergy = 0;
    config.commands.push({ type: 'cast', id: 'N', timeMs: 1000, actorId: 'albedo', action: 'N1' });
    const result = simulateTeam(config);
    const blossom = result.events.find(e => e.type === 'hit' && e.source === 'summon' && e.skillId.endsWith('E.proc'));
    expect(blossom?.type === 'hit' && blossom.calculation.baseDamage).toBeCloseTo(result.loadouts[0].stats.defense * 1.3359999656677246);
    expect(result.finalEnergy.albedo).toBeCloseTo(3.2);
  });
  it('rejects exhausted Hu Tao charged attacks but makes C1 charged attacks free in E', () => {
    const config = testTeam('hutao');
    config.commands.push(...Array.from({ length: 10 }, (_, i) => ({ type: 'cast' as const, id: `charge-${i}`, timeMs: 500 + i * 800, actorId: 'hutao', action: 'C' as const })));
    expect(simulateTeam(config).events.filter(e => e.type === 'rejected')).toMatchObject([{ details: { reason: 'stamina' } }]);
    config.actors[0].constellation = 1;
    expect(simulateTeam(config).events.filter(e => e.type === 'rejected')).toEqual([]);
  });
  it('lets teammates build Raiden resolve and grants the appropriate C1 multiplier', () => {
    const config = testTeam('raiden'); const jean = testTeam().actors[0]; config.actors.push(jean); config.initialOnField = 'jean';
    config.commands = [{ type: 'cast', id: 'jean-Q', timeMs: 0, actorId: 'jean', action: 'Q' },
      { type: 'switch', id: 'switch', timeMs: 2000, actorId: 'raiden' },
      { type: 'cast', id: 'raiden-Q', timeMs: 2000, actorId: 'raiden', action: 'Q' }];
    const result = simulateTeam(config), actor = resolveLoadout(config.actors[0]);
    const attack = actor.stats.characterBaseAttack + actor.stats.weaponBaseAttack + actor.stats.flatAttack;
    const q = content.characters.raiden.skills.Q['1'];
    const expected = attack * (q[0] + 80 * q[3] * q[1]);
    expect(result.events.find(e => e.type === 'hit' && e.id === 'raiden-Q')).toMatchObject({ calculation: { baseDamage: expected } });
  });
  it('uses explicitly configured Albedo fatal-blossom hit count and forbids guessing it', () => {
    const config = testTeam('albedo');
    config.commands.push({ type: 'cast', id: 'Q', timeMs: 1000, actorId: 'albedo', action: 'Q' });
    const result = simulateTeam(config);
    expect(result.events.filter(e => e.type === 'hit' && e.id.includes(':fatal-'))).toHaveLength(2);
    delete config.enemy.fatalBlossomHits;
    expect(() => simulateTeam(config)).toThrow('fatalBlossomHits');
  });
  it('runs Raiden eye, resolve, burst conversion and five energy restoration opportunities', () => {
    const config = testTeam('raiden'); config.actors[0].constellation = 2;
    config.commands.push({ type: 'cast', id: 'Q', timeMs: 1000, actorId: 'raiden', action: 'Q' },
      ...[3000, 4100, 5200, 6300, 7400, 8500].map((timeMs, i) => ({ type: 'cast' as const, id: `N${i}`, timeMs, actorId: 'raiden', action: 'N1' as const })));
    const result = simulateTeam(config);
    const restores = result.events.filter(e => e.type === 'energy' && e.id === 'raiden:Q-restore');
    expect(restores).toHaveLength(5);
    expect(result.events.find(e => e.type === 'hit' && e.id === 'N0:0')).toMatchObject({ calculation: { defenseMultiplier: 1 / 1.4 } });
  });
  it('isolates character state between successive teams and rejects invalid actions', () => {
    const first = simulateTeam(testTeam('hutao')); simulateTeam(testTeam('raiden'));
    expect(simulateTeam(testTeam('hutao'))).toEqual(first);
    const config = testTeam('jean'); config.commands = [{ type: 'cast', id: 'bad', timeMs: 0, actorId: 'jean', action: 'N6' }];
    expect(() => simulateTeam(config)).toThrow('不支持的动作');
  });
});
