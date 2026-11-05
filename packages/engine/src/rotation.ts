import { rotationSchema, type RotationEvent, type RotationResult } from '@leyline/schema';
import { calculateAttack } from './attack';
import { EventScheduler } from './scheduler';
import { scheduleDamageBuffs } from './buffs';
import { ENGINE_VERSION } from './version';

/** Synthetic one-attacker rotation. All hits read buffs dynamically at hit time. */
export function simulateRotation(input: unknown): RotationResult {
  const config = rotationSchema.parse(input);
  const scheduler = new EventScheduler();
  const events: RotationEvent[] = [];
  const active = scheduleDamageBuffs(scheduler, config.buffs, events);
  let totalDamage = 0;
  for (const action of config.actions) {
    scheduler.schedule(action.timeMs, () => {
      const damageBonus = config.attacker.damageBonus + [...active.values()].reduce((sum, value) => sum + value, 0);
      const calculation = calculateAttack({ ...config.attacker, multiplier: action.multiplier, damageBonus });
      totalDamage += calculation.damage;
      events.push({ type: 'hit', timeMs: scheduler.timeMs, id: action.id, activeBuffIds: [...active.keys()], calculation });
    });
  }
  scheduler.runUntil(config.durationMs);
  return {
    versions: { schema: 1, engine: ENGINE_VERSION, rules: 'synthetic-rotation-v1', data: 'synthetic-v1' },
    durationMs: config.durationMs, totalDamage, dps: totalDamage / (config.durationMs / 1000), events,
  };
}
