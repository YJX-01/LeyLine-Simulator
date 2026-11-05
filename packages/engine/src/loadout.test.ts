import { describe, expect, it } from 'vitest';
import { resolveLoadout } from './loadout';
const input = { id: 'jean', character: 'jean', level: 90, ascension: 6, constellation: 0,
  talents: { normal: 1, skill: 1, burst: 1 }, weapon: { id: 'harbinger-of-dawn', level: 90, ascension: 6, refinement: 1 },
  artifacts: [], initialHpRatio: 1, initialEnergy: 0 };
describe('actual loadout attributes', () => {
  it('matches independent rounded level90 base stats and weapon', () => {
    const result = resolveLoadout(input);
    expect(result.stats.characterBaseAttack).toBeCloseTo(239.18, 1);
    expect(result.baseHp).toBeCloseTo(14695.06, 0);
    expect(result.stats.weaponBaseAttack).toBeCloseTo(401, 0);
    expect(result.stats.critRate).toBeCloseTo(0.19);
    expect(result.baseStats.critRate).toBeCloseTo(0.05);
    expect(result.stats.critDamage).toBeCloseTo(0.969, 2);
  });
  it('converts artifact main percentages once and adds correct flat stats', () => {
    const result = resolveLoadout({ ...input, artifacts: [
      { slot: 'FLOWER', set: 'gladiator', level: 20, mainStat: 'HP_CONST', substats: [{ stat: 'ER', value: 0.1 }] },
      { slot: 'SANDS', set: 'gladiator', level: 20, mainStat: 'ATK_PER', substats: [] },
    ] });
    expect(result.stats.attackPercent).toBeCloseTo(0.646);
    expect(result.stats.maxHp - result.baseHp).toBe(4780);
    expect(result.stats.energyRecharge).toBeCloseTo(1.1);
  });
  it('resolves Homa HP and conditional conversion, with talent constellation increments', () => {
    const result = resolveLoadout({ ...input, id: 'hutao', character: 'hutao', constellation: 5, initialHpRatio: 0.49,
      weapon: { ...input.weapon, id: 'staff-of-homa' } });
    expect(result.stats.critDamage).toBeCloseTo(1.5455, 2);
    expect(result.stats.maxHp / result.baseHp).toBeCloseTo(1.2);
    expect(result.stats.flatAttack).toBeCloseTo(result.stats.maxHp * 0.018);
    expect(result.talents).toEqual({ normal: 1, skill: 4, burst: 4 });
  });
  it('rejects weapon mismatch, illegal artifact main/substats and invalid talent stage', () => {
    expect(() => resolveLoadout({ ...input, weapon: { ...input.weapon, id: 'staff-of-homa' } })).toThrow('武器类型');
    expect(() => resolveLoadout({ ...input, level: 20, ascension: 0, talents: { normal: 2, skill: 1, burst: 1 } })).toThrow('天赋等级');
    expect(() => resolveLoadout({ ...input, artifacts: [{ slot: 'FLOWER', set: 'none', level: 20, mainStat: 'CRIT_RATE', substats: [] }] })).toThrow('主词条');
  });
});
