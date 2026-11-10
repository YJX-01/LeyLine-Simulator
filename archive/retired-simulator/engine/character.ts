import { characterSimulationSchema, type RotationEvent, type RotationResult } from '@leyline/schema';
import { GAME_DATA_VERSION, skillRegistry } from '@leyline/game-data';
import { calculateAttack } from './attack';
import { resolveAttributes } from './attributes';
import { scheduleDamageBuffs } from './buffs';
import { EventScheduler } from './scheduler';
import { ENGINE_VERSION } from './version';

export function simulateCharacter(input: unknown): RotationResult {
  const config = characterSimulationSchema.parse(input);
  const scheduler = new EventScheduler();
  const events: RotationEvent[] = [];
  const active = scheduleDamageBuffs(scheduler, config.buffs, events);
  const attributes = resolveAttributes(config.stats);
  const readyAt = new Map<string, number>();
  let lockedUntil = 0;
  let totalDamage = 0;
  for (const command of config.commands) {
    scheduler.schedule(command.timeMs, () => {
      const skill = skillRegistry[command.skillId];
      const reason = scheduler.timeMs < lockedUntil ? 'action-lock'
        : scheduler.timeMs < (readyAt.get(skill.id) ?? 0) ? 'cooldown' : undefined;
      if (reason) {
        events.push({ type: 'rejected', timeMs: scheduler.timeMs, id: command.id, skillId: skill.id, reason });
        return;
      }
      const hitAtMs = scheduler.timeMs + skill.hitDelayMs;
      const readyAtMs = scheduler.timeMs + skill.cooldownStartDelayMs + skill.cooldownMs;
      lockedUntil = scheduler.timeMs + skill.actionLockMs;
      readyAt.set(skill.id, readyAtMs);
      events.push({ type: 'cast', timeMs: scheduler.timeMs, id: command.id, skillId: skill.id, readyAtMs, hitAtMs });
      scheduler.schedule(hitAtMs, () => {
        const calculation = calculateAttack({ schemaVersion: 1, attack: attributes.attack,
          multiplier: skill.multipliers[config.talentLevel - 1],
          damageBonus: config.stats.damageBonus + [...active.values()].reduce((sum, value) => sum + value, 0),
          critRate: config.stats.critRate, critDamage: config.stats.critDamage, mode: config.mode,
          ...(config.enemy ? { enemy: { ...config.enemy, characterLevel: config.stats.level } } : {}),
        });
        totalDamage += calculation.damage;
        events.push({ type: 'hit', timeMs: scheduler.timeMs, id: command.id, skillId: skill.id,
          element: skill.element, activeBuffIds: [...active.keys()], calculation });
      }, 0);
    }, 1);
  }
  scheduler.runUntil(config.durationMs);
  return {
    versions: { schema: 1, engine: ENGINE_VERSION, rules: 'repo-jean-tap-v1', data: GAME_DATA_VERSION },
    durationMs: config.durationMs, totalDamage, dps: totalDamage / (config.durationMs / 1000), events,
    resolvedAttack: attributes.attack,
  };
}
