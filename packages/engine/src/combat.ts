import { combatSchema, type CombatEvent, type CombatHitEvent, type CombatInput, type CombatResult, type CombatSkill } from '@leyline/schema';
import { calculateResolvedAttack } from './attack';
import { EventScheduler } from './scheduler';
import { ENGINE_VERSION } from './version';
import { BuffStore, type CombatPanel } from './mechanics/buff-store';
import { ApplicationCooldown } from './mechanics/icd';
import { ElementalGauge, amplification } from './mechanics/elements';
import { EnergyPool } from './mechanics/energy';
import { createRandom } from './mechanics/random';

type Hit = Extract<CombatSkill['effect'], { type: 'hit' }>['hit'];
type SummonDefinition = Extract<CombatSkill['effect'], { type: 'summon' }>['summon'];
interface SummonInstance {
  token: number; ownerId: string; skillId: string; definition: SummonDefinition;
  endsAt: number; nextProcAt: number; panel?: CombatPanel;
}
const PRIORITY = { expiry: -30, buffStart: -20, energy: -10, hit: 0, command: 10 } as const;
export const COMBAT_EVENT_BUDGET = 20000;

/** Unified stage-3 mechanics runtime. Configured skills are data, never executable scripts. */
export function simulateCombat(input: unknown): CombatResult {
  const config = combatSchema.parse(input);
  const scheduler = new EventScheduler();
  const buffs = new BuffStore();
  const icd = new ApplicationCooldown();
  const gauge = new ElementalGauge();
  const random = createRandom(config.seed);
  const energy = new EnergyPool(config.actors.map(actor => ({ id: actor.id, element: actor.element,
    capacity: actor.energyCapacity, initial: actor.initialEnergy })));
  const actors = new Map(config.actors.map(actor => [actor.id, actor]));
  const skills = new Map(config.skills.map(skill => [skill.id, skill]));
  const readyAt = new Map<string, number>();
  const particlesReadyAt = new Map<string, number>();
  const summons = new Map<string, SummonInstance>();
  const enemyDebuffs = new Map<string, CombatInput['enemyDebuffs'][number]>();
  const events: CombatEvent[] = [];
  const eventCounts: Record<string, number> = {};
  const reactionCounts: CombatResult['reactionCounts'] = { vaporize: 0, 'reverse-vaporize': 0, melt: 0, 'reverse-melt': 0 };
  const damageByActor = Object.fromEntries(config.actors.map(actor => [actor.id, 0]));
  let onField = config.initialOnField;
  let lockedUntil = 0;
  let switchReadyAt = 0;
  let token = 0;
  let totalDamage = 0;
  let hits = 0;
  const panel = (actorId: string) => buffs.panel(actorId, actors.get(actorId)!.stats);
  const record = (event: CombatEvent) => {
    eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
    if (config.logMode === 'detailed') {
      if (events.length >= config.maxLogEvents) throw new Error('Combat log budget exceeded; use summary mode or a shorter scenario');
      events.push(event);
    }
  };
  const state = (type: Exclude<CombatEvent['type'], 'hit'>, id: string, actorId: string,
    details: Record<string, string | number | boolean> = {}) => record({ type, id, actorId, timeMs: scheduler.timeMs, details });
  const isLive = (instance: SummonInstance) =>
    summons.get(JSON.stringify([instance.ownerId, instance.definition.slot])) === instance && scheduler.timeMs < instance.endsAt;

  function collectParticles(id: string, element: CombatInput['actors'][number]['element'] | 'clear', kind: 'particle' | 'orb', count: number) {
    for (const increment of energy.collect(element, kind, count, onField, actorId => panel(actorId).energyRecharge)) {
      state('energy', id, increment.actorId, { ...increment, pickupType: kind });
    }
  }

  function dealHit(ownerId: string, skillId: string, hit: Hit, id: string,
    source: 'direct' | 'summon', savedPanel?: CombatPanel): void {
    const stats = savedPanel ?? panel(ownerId);
    let applied = false;
    let reaction: CombatHitEvent['reaction'] = null;
    let baseMultiplier = 1;
    gauge.advance(scheduler.timeMs);
    if (hit.element !== 'physical' && hit.gauge !== 0 && icd.allows(ownerId, hit.icdTag, scheduler.timeMs, hit.icdRule)) {
      applied = true;
      const application = gauge.apply(hit.element, hit.gauge, scheduler.timeMs);
      reaction = application.reaction ?? null;
      baseMultiplier = application.baseMultiplier;
    }
    const reactionMultiplier = amplification(baseMultiplier, stats.elementalMastery, stats.reactionBonus);
    const critical = config.mode === 'expected' ? null : config.mode === 'critical' ? true
      : config.mode === 'noncritical' ? false : random() < stats.critRate;
    let resistanceReduction = 0, defenseReduction = config.enemy.defenseReduction;
    for (const debuff of enemyDebuffs.values()) {
      resistanceReduction += debuff.resistanceReduction;
      defenseReduction += debuff.defenseReduction;
    }
    const calculation = calculateResolvedAttack({ schemaVersion: 1, attack: stats.attack, multiplier: hit.multiplier,
      damageBonus: stats.damageBonus + buffs.directBonus(ownerId), critRate: stats.critRate, critDamage: stats.critDamage,
      mode: critical === null ? 'expected' : critical ? 'critical' : 'noncritical',
      enemy: { ...config.enemy, characterLevel: actors.get(ownerId)!.stats.level,
        defenseReduction: Math.min(1, defenseReduction),
        resistance: (config.enemy.resistances?.[hit.element] ?? config.enemy.resistance) - resistanceReduction },
    });
    const damage = calculation.damage * reactionMultiplier;
    totalDamage += damage;
    damageByActor[ownerId] += damage;
    hits++;
    if (reaction) reactionCounts[reaction]++;
    record({ type: 'hit', timeMs: scheduler.timeMs, id, actorId: ownerId, skillId, source, damage,
      calculation, reactionMultiplier, reaction, applied, aura: gauge.advance(scheduler.timeMs),
      buffIds: [...stats.buffIds], directBuffIds: buffs.directIds(ownerId), snapshot: !!savedPanel, critical });
    const particles = skills.get(skillId)?.particlesOnHit;
    if (particles && scheduler.timeMs >= (particlesReadyAt.get(skillId) ?? 0)) {
      particlesReadyAt.set(skillId, scheduler.timeMs + particles.cooldownMs);
      scheduler.schedule(scheduler.timeMs + particles.travelMs, () => {
        collectParticles(`particles:${id}`, particles.element, 'particle', particles.count);
      }, PRIORITY.energy);
    }
    // Only direct friendly hits trigger coordinated summons; summon hits cannot recursively proc them.
    if (source === 'direct') {
      for (const instance of summons.values()) {
        const trigger = instance.definition.trigger;
        if (trigger.type !== 'coordinated' || !isLive(instance) || scheduler.timeMs < instance.nextProcAt) continue;
        instance.nextProcAt = scheduler.timeMs + trigger.cooldownMs;
        const procTime = scheduler.timeMs + trigger.delayMs;
        if (procTime < instance.endsAt) scheduler.schedule(procTime, () => {
          if (isLive(instance)) dealHit(instance.ownerId, instance.skillId, instance.definition.hit,
            `summon-${instance.token}:proc:${id}`, 'summon', instance.panel);
        }, PRIORITY.hit);
      }
    }
  }

  function spawn(ownerId: string, skill: CombatSkill, definition: SummonDefinition, savedPanel?: CombatPanel) {
    const key = JSON.stringify([ownerId, definition.slot]);
    const previous = summons.get(key);
    if (previous) state('summon-end', `summon-${previous.token}`, ownerId, { reason: 'replaced', slot: definition.slot });
    const instance: SummonInstance = { token: ++token, ownerId, skillId: skill.id, definition,
      endsAt: scheduler.timeMs + definition.lifetimeMs, nextProcAt: scheduler.timeMs, panel: savedPanel };
    summons.set(key, instance);
    state('summon-start', `summon-${instance.token}`, ownerId, { slot: definition.slot, endsAt: instance.endsAt, snapshot: !!savedPanel });
    scheduler.schedule(instance.endsAt, () => {
      if (summons.get(key) !== instance) return;
      summons.delete(key);
      state('summon-end', `summon-${instance.token}`, ownerId, { reason: 'expired', slot: definition.slot });
    }, PRIORITY.expiry);
    const trigger = definition.trigger;
    if (trigger.type === 'periodic') {
      const tick = () => {
        if (!isLive(instance)) return;
        dealHit(ownerId, skill.id, definition.hit, `summon-${instance.token}:${scheduler.timeMs}`, 'summon', savedPanel);
        const next = scheduler.timeMs + trigger.intervalMs;
        if (next < instance.endsAt && next <= config.durationMs) scheduler.schedule(next, tick, PRIORITY.hit);
      };
      const first = scheduler.timeMs + trigger.firstDelayMs;
      if (first < instance.endsAt && first <= config.durationMs) scheduler.schedule(first, tick, PRIORITY.hit);
    }
  }

  for (const buff of config.buffs) {
    scheduler.schedule(buff.startMs, () => {
      for (const actorId of buff.targetIds) {
        const replaced = buffs.start(actorId, buff);
        if (replaced) state('buff-replaced', replaced.id, actorId, { replacedBy: buff.id });
        state('buff-start', buff.id, actorId);
      }
    }, PRIORITY.buffStart);
    scheduler.schedule(buff.startMs + buff.durationMs, () => {
      for (const actorId of buff.targetIds) if (buffs.end(actorId, buff)) state('buff-end', buff.id, actorId);
    }, PRIORITY.expiry);
  }
  for (const debuff of config.enemyDebuffs) {
    scheduler.schedule(debuff.startMs, () => {
      enemyDebuffs.set(debuff.id, debuff);
      state('enemy-debuff-start', debuff.id, 'target');
    }, PRIORITY.buffStart);
    scheduler.schedule(debuff.startMs + debuff.durationMs, () => {
      enemyDebuffs.delete(debuff.id);
      state('enemy-debuff-end', debuff.id, 'target');
    }, PRIORITY.expiry);
  }
  for (const pickup of config.pickups) {
    scheduler.schedule(pickup.timeMs, () => {
      if (pickup.type === 'flat') {
        const increment = energy.add(pickup.actorId, pickup.amount);
        state('energy', pickup.id, increment.actorId, { ...increment, pickupType: pickup.type });
      } else collectParticles(pickup.id, pickup.element, pickup.type, pickup.count);
    }, PRIORITY.energy);
  }
  for (const command of config.commands) {
    scheduler.schedule(command.timeMs, () => {
      if (command.type === 'switch') {
        const reason = scheduler.timeMs < lockedUntil ? 'action-lock'
          : scheduler.timeMs < switchReadyAt ? 'switch-cooldown' : onField === command.actorId ? 'already-on-field' : undefined;
        if (reason) { state('rejected', command.id, command.actorId, { reason }); return; }
        const previous = onField;
        onField = command.actorId;
        switchReadyAt = scheduler.timeMs + 1000;
        state('switch', command.id, onField, { previous });
        return;
      }
      const skill = skills.get(command.skillId)!;
      const reason = skill.ownerId !== onField ? 'off-field'
        : scheduler.timeMs < lockedUntil ? 'action-lock'
        : scheduler.timeMs < (readyAt.get(skill.id) ?? 0) ? 'cooldown'
        : energy.get(skill.ownerId) < skill.energyCost ? 'energy' : undefined;
      if (reason) { state('rejected', command.id, skill.ownerId, { reason, skillId: skill.id }); return; }
      const before = energy.get(skill.ownerId);
      energy.spend(skill.ownerId, skill.energyCost);
      const ready = scheduler.timeMs + skill.cooldownStartDelayMs + skill.cooldownMs;
      readyAt.set(skill.id, ready);
      lockedUntil = scheduler.timeMs + skill.actionLockMs;
      const savedPanel = skill.snapshot ? panel(skill.ownerId) : undefined;
      state('cast', command.id, skill.ownerId, { skillId: skill.id, readyAt: ready,
        energyBefore: before, energyAfter: energy.get(skill.ownerId), snapshot: skill.snapshot });
      const hitAt = scheduler.timeMs + skill.hitDelayMs;
      scheduler.schedule(hitAt, () => {
        const effect = skill.effect;
        if (effect.type === 'hit') dealHit(skill.ownerId, skill.id, effect.hit, command.id, 'direct', savedPanel);
        else spawn(skill.ownerId, skill, effect.summon, savedPanel);
      }, PRIORITY.hit);
    }, PRIORITY.command);
  }
  scheduler.runUntil(config.durationMs, COMBAT_EVENT_BUDGET);
  return {
    versions: { schema: 1, engine: ENGINE_VERSION, rules: config.rulesVersion, data: 'synthetic-mechanics-v1' },
    seed: config.seed, mode: config.mode, durationMs: config.durationMs, totalDamage,
    dps: totalDamage / (config.durationMs / 1000), damageByActor, finalEnergy: energy.snapshot(),
    finalAura: gauge.advance(config.durationMs), finalOnField: onField, events, eventCounts, hits, logMode: config.logMode, reactionCounts,
  };
}
