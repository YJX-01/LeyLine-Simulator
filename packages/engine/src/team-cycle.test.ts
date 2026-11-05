import { expect, it } from 'vitest';
import scenario from '../../../fixtures/scenarios/first-team.json';
import { simulateTeam } from './team';
import { content } from '@leyline/game-data';

it('completes two real four-character rotations with supported equipment and no rejected commands', () => {
  const result = simulateTeam(scenario);
  expect(result.events.filter(e => e.type === 'rejected')).toEqual([]);
  expect(result.events.filter(e => e.type === 'status' && e.id === 'sacrificial-proc')).toHaveLength(2);
  const bursts = result.events.filter(e => e.type === 'cast' && e.actorId === 'xingqiu' && String(e.details.skillId).endsWith('.Q'));
  expect(bursts).toHaveLength(2);
  expect(bursts[1]).toMatchObject({ details: { energyBefore: 80, energyAfter: 0 } });
  expect(result.finalEnergy.xingqiu).toBe(80);
  expect(Object.values(result.damageByActor).every(damage => damage > 0)).toBe(true);
  expect(result.reactionCounts['reverse-vaporize']).toBeGreaterThan(0);
  expect(result.reactionCounts.crystallize).toBeGreaterThan(0);
  const hutaoHp = result.loadouts.find(actor => actor.loadout.id === 'hutao')!.stats.maxHp;
  const xingqiuHp = result.loadouts.find(actor => actor.loadout.id === 'xingqiu')!.stats.maxHp;
  expect(result.finalHealth.hutao.current).toBeCloseTo(hutaoHp * 0.294 + xingqiuHp * 0.306);
  expect(result.totalDamage).toBeGreaterThan(100000);
  expect(result.totalDamage).toBeLessThan(2000000);
});

it('independently audits every damage event in the four-character fixture', () => {
  const result = simulateTeam(scenario);
  const loadouts = Object.fromEntries(result.loadouts.map(actor => [actor.loadout.id, actor]));
  const maxHp = loadouts.hutao.stats.maxHp, rainHp = loadouts.xingqiu.stats.maxHp;
  function hutaoHp(time: number) {
    let hp = maxHp * 0.6;
    if (time >= 6000) hp *= 0.7;
    if (time >= 17200) hp += rainHp * 0.18;
    if (time >= 30000) hp *= 0.7;
    if (time >= 41200) hp += rainHp * 0.18;
    return hp;
  }
  let independentlySummedDamage = 0;
  for (const event of result.events) {
    if (event.type !== 'hit') continue;
    let expected: number;
    if (event.source === 'reaction') {
      expect(event.reaction).toBe('swirl');
      expected = content.reactionLevels[90] * 0.6 * 0.9;
    } else {
      const actor = loadouts[event.actorId], stats = actor.baseStats, table = content.characters[actor.loadout.character];
      const E = table.skills.E['8'], Q = table.skills.Q['8'], A = table.skills.A['8'];
      const baseAttack = stats.characterBaseAttack + stats.weaponBaseAttack;
      let attack = baseAttack * (1 + stats.attackPercent) + stats.flatAttack;
      let base: number, bonus: number, criticalRate = stats.critRate;
      if (event.actorId === 'xingqiu') {
        const rain = event.skillId.endsWith('Q.proc');
        base = attack * (rain ? Q[0] : E[event.id.endsWith(':0') ? 0 : 1]);
        bonus = 1 + 0.466 + 0.2 + (rain ? 0.75 : 0);
      } else if (event.actorId === 'albedo') {
        const transient = event.source === 'summon';
        base = transient ? stats.defense * E[1] : attack * E[0];
        bonus = 1 + stats.damageBonuses.geo;
        criticalRate += 0.14;
      } else if (event.actorId === 'jean') {
        base = attack * E[0]; bonus = 1 + 0.466 + 0.16; criticalRate += 0.06;
      } else {
        const low = hutaoHp(event.timeMs) <= maxHp * 0.5;
        attack += maxHp * (low ? 0.018 : 0.008);
        const infusion = (event.timeMs >= 6000 && event.timeMs < 15000) || (event.timeMs >= 30000 && event.timeMs < 39000);
        if (infusion) attack += Math.min(maxHp * E[1], 4 * baseAttack);
        const blossom = event.id.startsWith('blossom:');
        const charged = event.id.includes('-C-');
        base = attack * (blossom ? E[2] : charged ? A[7] : A[0]);
        bonus = 1 + 0.466 + (low ? 0.33 : 0) + (blossom ? 0 : 0.5);
      }
      const amplify = event.reaction === 'reverse-vaporize' ? 1.5 : event.reaction === 'vaporize' ? 2 : 1;
      const reaction = amplify === 1 ? 1 : amplify * (1 + 2.78 * stats.elementalMastery / (1400 + stats.elementalMastery));
      expected = base * bonus * (1 + criticalRate * stats.critDamage) * 0.5 * 0.9 * reaction;
      expect(event.calculation.baseDamage, `${event.timeMs}:${event.id}:base`).toBeCloseTo(base, 6);
    }
    expect(event.damage, `${event.timeMs}:${event.id}:damage`).toBeCloseTo(expected, 6);
    independentlySummedDamage += expected;
  }
  expect(result.totalDamage).toBeCloseTo(independentlySummedDamage, 6);
});
