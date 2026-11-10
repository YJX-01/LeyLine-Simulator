import type { RotationEvent, RotationInput } from '@leyline/schema';
import { EventScheduler } from './scheduler';

export function scheduleDamageBuffs(scheduler: EventScheduler, buffs: RotationInput['buffs'], events: RotationEvent[]) {
  const active = new Map<string, number>();
  for (const buff of buffs) {
    scheduler.schedule(buff.startMs, () => {
      active.set(buff.id, buff.damageBonus);
      events.push({ type: 'buff-start', timeMs: scheduler.timeMs, id: buff.id });
    }, -1);
    scheduler.schedule(buff.startMs + buff.durationMs, () => {
      active.delete(buff.id);
      events.push({ type: 'buff-end', timeMs: scheduler.timeMs, id: buff.id });
    }, -2);
  }
  return active;
}
