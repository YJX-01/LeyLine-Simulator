import { describe, expect, it } from 'vitest';
import { combatSchema, type CombatSkill } from '@leyline/schema';
import scenario from '../../../fixtures/scenarios/combat-stage-3.json';
import { simulateCombat } from './combat';
import { ReactionGauge } from './mechanics/reactions';
const input = (elements: string[]) => {
  const config = combatSchema.parse(structuredClone(scenario));
  config.rulesVersion = 'team-core-v1'; config.durationMs = 2000;
  config.buffs = []; config.pickups = [];
  config.skills = elements.map((element, i) => ({ id: String(i), ownerId: 'pyro', energyCost: 0,
    cooldownMs: 0, cooldownStartDelayMs: 0, actionLockMs: 0, hitDelayMs: 0, snapshot: false,
    effect: { type: 'hit', hit: { element, multiplier: 0, gauge: element === 'physical' ? 0 : 1,
      icdTag: String(i), icdRule: 'none', category: 'skill' } },
  } as CombatSkill));
  config.commands = elements.map((_, i) => ({ id: String(i), type: 'cast', timeMs: i, skillId: String(i) }));
  return config;
};
describe('versioned real-content reactions', () => {
  it('swirls the aura element and ignores defense and critical damage', () => {
    const config = input(['hydro', 'anemo']);
    config.enemy.defenseIgnore = 0; config.enemy.resistance = 0.1; config.mode = 'critical';
    const result = simulateCombat(config);
    expect(result.reactionCounts.swirl).toBe(1);
    expect(result.totalDamage).toBeCloseTo(1446.8535 * 0.6 * 0.9, 1);
  });
  it('crystallizes without adding damage and cannot leave a Geo aura', () => {
    const config = input(['hydro', 'geo']);
    const result = simulateCombat(config);
    expect(result.totalDamage).toBe(0); expect(result.reactionCounts.crystallize).toBe(1);
    expect(result.finalAura?.element).toBe('hydro');
    const state = new ReactionGauge(); state.apply('geo', 1, 0);
    expect(state.snapshot()).toEqual([]);
  });
  it('ticks electro-charge twice from one pair of 1U applications', () => {
    const result = simulateCombat(input(['hydro', 'electro']));
    expect(result.events.filter(e => e.type === 'hit' && e.source === 'reaction').map(e => e.timeMs)).toEqual([1, 1001]);
    expect(result.reactionCounts['electro-charged']).toBe(2);
    expect(result.totalDamage).toBeCloseTo(1446.8535 * 4, 1);
  });
  it('supports over-vape on coexisting Hydro and Electro without an extra stale EC tick', () => {
    const config = input(['hydro', 'electro', 'pyro']);
    if (config.skills[2].effect.type === 'hit') config.skills[2].effect.hit.multiplier = 1;
    const result = simulateCombat(config);
    expect(result.reactionCounts['electro-charged']).toBe(1);
    expect(result.reactionCounts.overloaded).toBe(1);
    expect(result.reactionCounts['reverse-vaporize']).toBe(1);
    expect(result.totalDamage).toBeCloseTo(1500 + 1446.8535 * 4.75, 1);
  });
  it('applies superconduct only to subsequent physical resistance', () => {
    const config = input(['cryo', 'electro', 'physical']);
    config.enemy.resistance = 0.1;
    if (config.skills[2].effect.type === 'hit') config.skills[2].effect.hit.multiplier = 1;
    const result = simulateCombat(config);
    expect(result.events.find(e => e.type === 'hit' && e.id === '2')).toMatchObject({ damage: 1150 });
    expect(result.reactionCounts.superconduct).toBe(1);
  });
  it('tracks freeze and shatter while retaining underlying gauge', () => {
    const config = input(['hydro', 'cryo', 'physical']);
    if (config.skills[2].effect.type === 'hit') config.skills[2].effect.hit.blunt = true;
    const result = simulateCombat(config);
    expect(result.reactionCounts.frozen).toBe(1); expect(result.reactionCounts.shattered).toBe(1);
    expect(result.totalDamage).toBeCloseTo(1446.8535 * 3, 1);
  });
  it('retains the explicit unsupported-freeze behavior of the previous contract', () => {
    const config = input(['hydro', 'cryo']); config.rulesVersion = 'combat-core-v1';
    expect(() => simulateCombat(config)).toThrow('Unsupported reaction');
  });
});
