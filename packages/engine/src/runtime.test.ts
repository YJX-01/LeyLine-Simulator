import { expect, it } from 'vitest';
import { combatSchema } from '@leyline/schema';
import scenario from '../../../fixtures/scenarios/combat-stage-3.json';
import { simulateCombat } from './combat';
import type { CombatRuntime } from './combat-runtime';
const config = () => {
  const input = combatSchema.parse(structuredClone(scenario));
  input.skills = [input.skills[2]];
  input.skills[0].energyCost = 0; input.skills[0].cooldownMs = 0; input.skills[0].actionLockMs = 0;
  input.commands = [{ type: 'cast', id: 'hit', timeMs: 0, skillId: 'burst' }];
  input.buffs = []; input.pickups = [];
  return input;
};
it('applies nonlethal HP cost and capped healing in the same runtime', () => {
  const input = config(); input.actors[0].stats.maxHp = 1000;
  const runtime: CombatRuntime = { onCast(ctx) {
    ctx.loseHp('pyro', 300, 'hp-cost');
    ctx.schedule(100, () => ctx.heal('pyro', 500, 'heal'));
  } };
  const result = simulateCombat(input, runtime);
  expect(result.finalHealth.pyro).toEqual({ current: 1000, max: 1000 });
  expect(result.events.filter(e => e.type === 'health')).toMatchObject([
    { details: { before: 1000, after: 700 } }, { details: { actual: 300, after: 1000 } },
  ]);
});
it('supports defense-scaled damage and additive base damage without a second engine', () => {
  const runtime: CombatRuntime = { prepareHit(_ctx, _id, _skill, hit) { return { ...hit, scaling: 'defense', multiplier: 2, flatDamage: 100 }; } };
  const result = simulateCombat(config(), runtime);
  expect(result.totalDamage).toBe(1100);
});
it('runs timed content buffs, cooldown resets and flat restores with inspectable logs', () => {
  const input = config(); input.skills[0].cooldownMs = 10000;
  input.commands.push({ type: 'cast', id: 'again', timeMs: 100, skillId: 'burst' });
  const runtime: CombatRuntime = { onCast(ctx, skill) {
    if (ctx.timeMs !== 0) return;
    ctx.addBuff({ id: 'content-buff', targetIds: ['pyro'], startMs: 0, durationMs: 200, stacking: 'replace', group: 'atk', modifiers: { attackPercent: 0.5 } });
    ctx.schedule(100, () => ctx.resetCooldown(skill.id), -1);
  } };
  const result = simulateCombat(input, runtime);
  expect(result.hits).toBe(2); expect(result.totalDamage).toBe(3000);
});
it('triggers normal-attack coordinated damage before the primary delayed hit lands', () => {
  const input = config(); input.durationMs = 100;
  input.skills[0].hitDelayMs = 1000; input.skills[0].actionCategory = 'normal';
  const runtime: CombatRuntime = { initialize(ctx) {
    ctx.spawn('pyro', input.skills[0], { slot: 'rain', lifetimeMs: 2000,
      hit: { element: 'physical', gauge: 0, multiplier: 1, icdTag: 'rain', icdRule: 'none' },
      trigger: { type: 'coordinated', condition: 'normal-attack', cooldownMs: 1000, delayMs: 20 },
    });
  } };
  expect(simulateCombat(input, runtime).events.filter(e => e.type === 'hit').map(e => e.timeMs)).toEqual([20]);
});

it('reduces a running cooldown without allowing it to move before the current clock', () => {
  const input = config(); input.skills[0].cooldownMs = 1000;
  input.commands.push({ type: 'cast', id: 'second', timeMs: 500, skillId: 'burst' });
  const runtime: CombatRuntime = { onCast(ctx, skill) {
    if (ctx.timeMs === 0) ctx.schedule(100, () => ctx.reduceCooldown(skill.id, 500));
  } };
  expect(simulateCombat(input, runtime).hits).toBe(2);
});

it('triggers another rain wave when a long normal animation outlasts its cooldown', () => {
  const input = config(); input.durationMs = 2000;
  input.skills[0].actionLockMs = 1500; input.skills[0].actionCategory = 'normal';
  const runtime: CombatRuntime = { initialize(ctx) {
    ctx.spawn('pyro', input.skills[0], { slot: 'rain', lifetimeMs: 3000,
      hit: { element: 'physical', gauge: 0, multiplier: 1, icdTag: 'rain', icdRule: 'none' },
      trigger: { type: 'coordinated', condition: 'normal-attack', cooldownMs: 1000, delayMs: 20 },
    });
  } };
  expect(simulateCombat(input, runtime).events.filter(e => e.type === 'hit' && e.source === 'summon').map(e => e.timeMs)).toEqual([20, 1020]);
});

it('keeps a refreshed content debuff when the configured instance expires', () => {
  const input = config();
  input.enemyDebuffs = [{ id: 'shared-shred', startMs: 0, durationMs: 200,
    resistanceReduction: 0.2, defenseReduction: 0 }];
  input.commands = [0, 300, 600].map(timeMs => ({ type: 'cast' as const,
    id: `hit-${timeMs}`, timeMs, skillId: 'burst' }));
  const runtime: CombatRuntime = { initialize(ctx) {
    ctx.schedule(100, () => ctx.addEnemyDebuff({ id: 'shared-shred', startMs: 100,
      durationMs: 500, resistanceReduction: 0.5, defenseReduction: 0 }));
  } };
  const result = simulateCombat(input, runtime);
  const hits = result.events.filter(event => event.type === 'hit');
  expect(hits.map(event => event.damage)).toEqual([1100, 1250, 1000]);
  expect(result.events.filter(event => event.type === 'enemy-debuff-end')
    .map(event => event.timeMs)).toEqual([600]);
});
