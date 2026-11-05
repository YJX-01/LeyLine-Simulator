import { describe, expect, it } from 'vitest';
import { simulateCharacter, resolveAttributes } from './index';
import scenario from '../../../fixtures/scenarios/jean-tap.json';
import expected from '../../../fixtures/expected/jean-tap.json';
import sourceData from '../../../docs/constant/SkillConfig.json';
import sourceTiming from '../../../docs/constant/ActionTime.json';
import { skillRegistry } from '@leyline/game-data';

describe('Jean tap skill repository profile', () => {
  it('preserves raw multipliers and documented frame conversion', () => {
    const skill = skillRegistry['jean.e.tap'];
    const raw = sourceData.Jean.E;
    for (let level = 1; level <= 10; level++) {
      expect(skill.multipliers[level - 1]).toBe(raw[String(level) as keyof typeof raw][0]);
    }
    expect(skill.hitDelayMs).toBe(Math.round(sourceTiming.Jean.E[1] / 60 * 1000));
    expect(skill.cooldownStartDelayMs).toBe(sourceTiming.Jean.E[0] / 60 * 1000);
    expect(skill.cooldownMs).toBe(raw['1'][3] * 1000);
  });
  it('resolves base, percentage and flat attack in the correct order', () => {
    expect(resolveAttributes({ ...scenario.stats, characterBaseAttack: 100, weaponBaseAttack: 100,
      attackPercent: 0.5, flatAttack: 100 }).attack).toBe(400);
  });
  it('matches the independently calculated cooldown fixture', () => {
    const result = simulateCharacter(scenario);
    expect(Math.abs(result.totalDamage - expected.totalDamage)).toBeLessThan(expected.absoluteTolerance);
    expect(Math.abs(result.dps - expected.dps)).toBeLessThan(expected.absoluteTolerance);
    expect(result.events.filter(e => e.type === 'hit').map(e => e.timeMs)).toEqual(expected.hitTimesMs);
    expect(result.events.filter(e => e.type === 'cast').map(e => e.timeMs)).toEqual(expected.castTimesMs);
    expect(result.events.filter(e => e.type === 'rejected').map(e => e.reason)).toEqual(expected.rejectionReasons);
  });
  it('reads buffs at hit time rather than cast time', () => {
    const result = simulateCharacter({ ...scenario, commands: [scenario.commands[0]], buffs: [
      { id: 'late', startMs: 500, durationMs: 268, damageBonus: 0.5 },
      { id: 'expired', startMs: 0, durationMs: 767, damageBonus: 10 },
    ] });
    const hit = result.events.find(e => e.type === 'hit');
    expect(hit?.activeBuffIds).toEqual(['late']);
    expect(hit?.calculation.damage).toBeCloseTo(4380, 3);
  });
  it('includes a hit exactly at the horizon but not beyond it', () => {
    const config = { ...scenario, commands: [scenario.commands[0]] };
    expect(simulateCharacter({ ...config, durationMs: 766 }).totalDamage).toBe(0);
    expect(simulateCharacter({ ...config, durationMs: 767 }).totalDamage).toBeCloseTo(2920, 3);
  });
  it('derives defense character level from character stats', () => {
    const result = simulateCharacter({ ...scenario, commands: [scenario.commands[0]],
      enemy: { enemyLevel: 90, resistance: 0.1, defenseReduction: 0, defenseIgnore: 0 } });
    expect(result.totalDamage).toBeCloseTo(1314, 3);
  });
  it('does not retain cooldown or lock state across runs', () => {
    const first = simulateCharacter(scenario);
    simulateCharacter({ ...scenario, talentLevel: 10 });
    expect(simulateCharacter(scenario)).toEqual(first);
  });
  it.each([
    { character: 'hutao' }, { talentLevel: 11 },
    { commands: [{ id: 'unsupported', timeMs: 0, skillId: 'jean.q' }] },
    { commands: [scenario.commands[0], scenario.commands[0]] },
    { commands: [{ ...scenario.commands[0], timeMs: 9000 }] },
    { stats: { ...scenario.stats, attackPercent: -1 } },
  ])('rejects unsupported or invalid configuration %o', invalid => {
    expect(() => simulateCharacter({ ...scenario, ...invalid })).toThrow();
  });
});
