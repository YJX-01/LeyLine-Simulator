import { describe, expect, it } from 'vitest';
import { simulateTeam } from './team';
import { testTeam } from './testing/team-fixture';
import { resolveLoadout } from './loadout';
import type { Loadout } from '@leyline/schema';
const fourPiece = (set: Loadout['artifacts'][number]['set']): Loadout['artifacts'] => [
  { slot: 'FLOWER', mainStat: 'HP_CONST', set, level: 20, substats: [] },
  { slot: 'PLUME', mainStat: 'ATK_CONST', set, level: 20, substats: [] },
  { slot: 'SANDS', mainStat: 'ATK_PER', set, level: 20, substats: [] },
  { slot: 'GOBLET', mainStat: 'ATK_PER', set, level: 20, substats: [] },
];
describe('supported weapon and artifact behavior', () => {
  it('applies Festering Desire damage and critical rate only to skill damage', () => {
    const config = testTeam(); config.mode = 'expected'; config.actors[0].weapon.id = 'festering-desire';
    config.commands.push({ type: 'cast', id: 'N', timeMs: 1000, actorId: 'jean', action: 'N1' });
    const result = simulateTeam(config);
    expect(result.events.find(e => e.type === 'hit' && e.id === 'E')).toMatchObject({ calculation: { bonusMultiplier: 1.16, critMultiplier: 1.055 } });
    expect(result.events.find(e => e.type === 'hit' && e.id === 'N:0')).toMatchObject({ calculation: { bonusMultiplier: 1, critMultiplier: 1.025 } });
  });
  it('evaluates Harbinger health threshold strictly above 90%', () => {
    const config = testTeam(); config.mode = 'expected'; config.actors[0].initialHpRatio = 0.9;
    const low = simulateTeam(config).events.find(e => e.type === 'hit');
    config.actors[0].initialHpRatio = 0.91;
    const high = simulateTeam(config).events.find(e => e.type === 'hit');
    expect(low?.type === 'hit' && low.calculation.critMultiplier).toBeCloseTo(1 + 0.05 * 0.969);
    expect(high?.type === 'hit' && high.calculation.critMultiplier).toBeCloseTo(1 + 0.19 * 0.969);
  });
  it('resets Sacrificial skill cooldown on a seeded successful hit but observes its own cooldown', () => {
    const config = testTeam('xingqiu'); config.actors[0].weapon = { ...config.actors[0].weapon, id: 'sacrificial-sword', refinement: 5 };
    config.actors[0].initialEnergy = 0;
    config.commands.push({ type: 'cast', id: 'E2', timeMs: 1400, actorId: 'xingqiu', action: 'E' });
    const result = simulateTeam(config);
    expect(result.events.filter(e => e.type === 'rejected')).toEqual([]);
    expect(result.events.filter(e => e.type === 'status' && e.id === 'sacrificial-proc')).toHaveLength(1);
    expect(result.finalEnergy.xingqiu).toBeCloseTo(30 * result.loadouts[0].stats.energyRecharge);
  });
  it('generates Favonius clear particles on criticals and respects the refinement cooldown', () => {
    const config = testTeam(); config.mode = 'critical'; config.actors[0].initialEnergy = 0;
    config.actors[0].weapon = { ...config.actors[0].weapon, id: 'favonius-sword', refinement: 5 };
    config.commands.push({ type: 'cast', id: 'E2', timeMs: 7500, actorId: 'jean', action: 'E' });
    const result = simulateTeam(config);
    expect(result.events.filter(e => e.type === 'status' && e.id === 'favonius-proc')).toHaveLength(2);
    expect(result.events.filter(e => e.type === 'energy' && e.id === 'jean:favonius')).toHaveLength(2);
  });
  it('adds Engulfing burst recharge before resolving its attack conversion and Electro damage', () => {
    const config = testTeam('raiden'); config.actors[0].weapon.id = 'engulfing-lightning';
    config.commands = [{ type: 'cast', id: 'Q', timeMs: 0, actorId: 'raiden', action: 'Q' }];
    const data = resolveLoadout(config.actors[0]);
    const er = data.baseStats.energyRecharge + 0.3;
    const attack = (data.baseStats.characterBaseAttack + data.baseStats.weaponBaseAttack) * (1 + Math.min(0.8, (er - 1) * 0.28));
    const burst = simulateTeam(config).events.find(e => e.type === 'hit' && e.id === 'Q');
    expect(burst?.type === 'hit' && burst.calculation.baseDamage).toBeCloseTo(attack * 4.007999897003174);
    expect(burst?.type === 'hit' && burst.calculation.bonusMultiplier).toBeCloseTo(1 + (er - 1) * 0.4);
  });
  it('applies White Tassel only to normal damage, not converted Raiden burst damage', () => {
    const config = testTeam('raiden'); config.actors[0].weapon.id = 'white-tassel';
    config.commands = [{ type: 'cast', id: 'N', timeMs: 0, actorId: 'raiden', action: 'N1' },
      { type: 'cast', id: 'Q', timeMs: 1000, actorId: 'raiden', action: 'Q' },
      { type: 'cast', id: 'BN', timeMs: 3000, actorId: 'raiden', action: 'N1' }];
    const result = simulateTeam(config);
    expect(result.events.find(e => e.type === 'hit' && e.id === 'N:0')).toMatchObject({ calculation: { bonusMultiplier: 1.24 } });
    const burst = result.events.find(e => e.type === 'hit' && e.id === 'BN:0');
    expect(burst?.type === 'hit' && burst.calculation.bonusMultiplier).toBeCloseTo(1 + (result.loadouts[0].stats.energyRecharge - 1) * 0.4);
  });
  it('stacks Prototype Starglitter twice and applies only normal/charged bonuses', () => {
    const config = testTeam('raiden'); config.actors[0].weapon.id = 'prototype-starglitter';
    config.commands.push({ type: 'cast', id: 'N', timeMs: 1000, actorId: 'raiden', action: 'N1' },
      { type: 'cast', id: 'E2', timeMs: 10500, actorId: 'raiden', action: 'E' },
      { type: 'cast', id: 'N2', timeMs: 11500, actorId: 'raiden', action: 'N1' });
    const result = simulateTeam(config);
    expect(result.events.find(e => e.type === 'hit' && e.id === 'N:0')).toMatchObject({ calculation: { bonusMultiplier: 1.08 } });
    expect(result.events.find(e => e.type === 'hit' && e.id === 'N2:0')).toMatchObject({ calculation: { bonusMultiplier: 1.16 } });
  });
  it('spends Shimenawa energy only when sufficient and limits its damage categories', () => {
    const config = testTeam('hutao'); config.actors[0].artifacts = fourPiece('shimenawa');
    config.commands.push({ type: 'cast', id: 'N', timeMs: 1000, actorId: 'hutao', action: 'N1' });
    const result = simulateTeam(config);
    expect(result.events.find(e => e.type === 'energy' && e.id === 'hutao:shimenawa')).toMatchObject({ details: { spent: 15, before: 60, after: 45 } });
    expect(result.events.find(e => e.type === 'hit' && e.id === 'N:0')).toMatchObject({ calculation: { bonusMultiplier: 1.5 } });
    config.actors[0].initialEnergy = 0;
    expect(simulateTeam(config).events.some(e => e.type === 'energy' && e.id === 'hutao:shimenawa')).toBe(false);
  });
  it('grants nonstacking Noblesse team attack from a successful burst', () => {
    const config = testTeam(); config.actors[0].artifacts = fourPiece('noblesse');
    const other = testTeam('xingqiu').actors[0]; config.actors.push(other);
    config.commands = [{ type: 'cast', id: 'Q', timeMs: 0, actorId: 'jean', action: 'Q' },
      { type: 'switch', id: 'switch', timeMs: 2000, actorId: 'xingqiu' },
      { type: 'cast', id: 'N', timeMs: 2000, actorId: 'xingqiu', action: 'N1' }];
    const loadout = resolveLoadout(other);
    const attack = (loadout.stats.characterBaseAttack + loadout.stats.weaponBaseAttack) * (1 + loadout.stats.attackPercent + 0.2);
    const event = simulateTeam(config).events.find(e => e.type === 'hit' && e.id === 'N:0');
    expect(event?.type === 'hit' && event.calculation.baseDamage).toBeCloseTo(attack * 0.46612000465393066);
  });
  it('caps Emblem at 75% and distinguishes static two/four-piece effects', () => {
    const config = testTeam('raiden'); config.actors[0].weapon.id = 'engulfing-lightning'; config.actors[0].artifacts = fourPiece('emblem');
    for (const piece of config.actors[0].artifacts) piece.substats = [{ stat: 'ER', value: 0.3 }];
    expect(resolveLoadout(config.actors[0]).stats.categoryBonuses.burst).toBe(0.75);
    const jean = testTeam().actors[0];
    jean.artifacts = fourPiece('gladiator'); expect(resolveLoadout(jean).stats.categoryBonuses.normal).toBe(0.35);
    jean.artifacts = fourPiece('wanderer'); expect(resolveLoadout(jean).stats.elementalMastery).toBe(80);
    expect(resolveLoadout(jean).stats.categoryBonuses.charged).toBeUndefined();
    jean.artifacts = fourPiece('bloodstained'); expect(resolveLoadout(jean).stats.damageBonuses.physical).toBe(0.25);
  });
});
