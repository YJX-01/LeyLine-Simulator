import { combatSchema, type CombatEvent, type CombatHitEvent, type CombatInput, type CombatResult, type CombatSkill } from '@leyline/schema';
import { calculateResolvedAttack } from './attack';
import { EventScheduler } from './scheduler';
import { ENGINE_VERSION } from './version';
import { BuffStore, type CombatPanel } from './mechanics/buff-store';
import { ApplicationCooldown } from './mechanics/icd';
import { ElementalGauge, amplification } from './mechanics/elements';
import { EnergyPool } from './mechanics/energy';
import { createRandom } from './mechanics/random';
import { HealthPool } from './mechanics/health';
import type { CombatRuntime, RuntimeContext, RuntimeHit, RuntimeSummon, RuntimeSummonInstance } from './combat-runtime';
import { ReactionGauge, type ReactionDescriptor } from './mechanics/reactions';
import { content } from '@leyline/game-data';

type Hit = RuntimeHit;
type SummonDefinition = RuntimeSummon;
type SummonInstance = RuntimeSummonInstance;
const PRIORITY = { expiry: -30, buffStart: -20, energy: -10, hit: 0, command: 10 } as const;
export const COMBAT_EVENT_BUDGET = 20000;

/** Unified stage-3 mechanics runtime. Configured skills are data, never executable scripts. */
export function simulateCombat(input: unknown, runtime?: CombatRuntime): CombatResult {
  const config = combatSchema.parse(input);
  const scheduler = new EventScheduler();
  const buffs = new BuffStore();
  const icd = new ApplicationCooldown();
  const advancedGauge = config.rulesVersion === 'team-core-v1' ? new ReactionGauge() : undefined;
  const gauge = advancedGauge ?? new ElementalGauge();
  const random = createRandom(config.seed);
  const energy = new EnergyPool(config.actors.map(actor => ({ id: actor.id, element: actor.element,
    capacity: actor.energyCapacity, initial: actor.initialEnergy })));
  const health = new HealthPool(config.actors.map(actor => ({ id: actor.id, maxHp: actor.stats.maxHp, ratio: actor.initialHpRatio })));
  const actors = new Map(config.actors.map(actor => [actor.id, actor]));
  const skills = new Map(config.skills.map(skill => [skill.id, skill]));
  const readyAt = new Map<string, number>();
  const particlesReadyAt = new Map<string, number>();
  const summons = new Map<string, SummonInstance>();
  const enemyDebuffs = new Map<string, CombatInput['enemyDebuffs'][number]>();
  const events: CombatEvent[] = [];
  const eventCounts: Record<string, number> = {};
  const reactionCounts: CombatResult['reactionCounts'] = { vaporize: 0, 'reverse-vaporize': 0, melt: 0, 'reverse-melt': 0,
    swirl: 0, crystallize: 0, overloaded: 0, superconduct: 0, 'electro-charged': 0, frozen: 0, shattered: 0 };
  const reactionWindows = new Map<string, { start: number; count: number }>();
  let ecOwner = '', ecPanel: CombatPanel | undefined, ecLastTick = -Infinity, ecNextAt: number | undefined, ecToken = 0;
  const damageByActor = Object.fromEntries(config.actors.map(actor => [actor.id, 0]));
  let onField = config.initialOnField;
  let lockedUntil = 0;
  let switchReadyAt = 0;
  let token = 0;
  let totalDamage = 0;
  let hits = 0;
  const panel = (actorId: string) => {
    const value = buffs.panel(actorId, actors.get(actorId)!.stats);
    return runtime?.modifyPanel?.(context, actorId, value) ?? value;
  };
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
    if (count <= 0) return;
    for (const increment of energy.collect(element, kind, count, onField, actorId => panel(actorId).energyRecharge)) {
      state('energy', id, increment.actorId, { ...increment, pickupType: kind });
      runtime?.onEnergy?.(context, increment.actorId, kind);
    }
  }

  function reactionDamage(ownerId: string, descriptor: ReactionDescriptor, stats = panel(ownerId)) {
    runtime?.onReaction?.(context, ownerId, descriptor);
    reactionCounts[descriptor.reaction]++;
    if (!descriptor.coefficient) return;
    if (descriptor.reaction !== 'electro-charged') {
      const key = `${ownerId}:${descriptor.reaction}`;
      let window = reactionWindows.get(key);
      if (!window || context.timeMs >= window.start + 500) reactionWindows.set(key, window = { start: context.timeMs, count: 0 });
      if (window.count >= (descriptor.reaction === 'overloaded' ? 1 : 2)) return;
      window.count++;
    }
    let resistance = config.enemy.resistances?.[descriptor.element as keyof NonNullable<typeof config.enemy.resistances>] ?? config.enemy.resistance;
    for (const debuff of enemyDebuffs.values()) if (!debuff.elements || debuff.elements.includes(descriptor.element)) resistance -= debuff.resistanceReduction;
    const base = content.reactionLevels[actors.get(ownerId)!.stats.level] * descriptor.coefficient
      * (1 + 16 * stats.elementalMastery / (2000 + stats.elementalMastery) + stats.reactionBonus);
    const calculation = calculateResolvedAttack({ schemaVersion: 1, attack: base, multiplier: 1, damageBonus: 0,
      critRate: 0, critDamage: 0, mode: 'noncritical', enemy: { ...config.enemy, characterLevel: actors.get(ownerId)!.stats.level,
        resistance, defenseIgnore: 1 } });
    totalDamage += calculation.damage; damageByActor[ownerId] += calculation.damage; hits++;
    record({ type: 'hit', timeMs: context.timeMs, id: `${descriptor.reaction}:${hits}`, actorId: ownerId,
      skillId: descriptor.reaction, source: 'reaction', damage: calculation.damage, calculation,
      reactionMultiplier: 1, reaction: descriptor.reaction, applied: false, aura: gauge.advance(context.timeMs),
      buffIds: stats.buffIds, directBuffIds: [], snapshot: false, critical: false });
    if (descriptor.reaction === 'superconduct') context.addEnemyDebuff({ id: 'superconduct', startMs: context.timeMs, durationMs: 12000,
      resistanceReduction: 0.4, defenseReduction: 0, elements: ['physical'] });
  }
  function planEC() {
    if (!advancedGauge) return;
    if (!advancedGauge.hasEC()) { ecToken++; ecNextAt = undefined; return; }
    const remaining = advancedGauge.ecRemainingMs();
    let next = ecLastTick === -Infinity ? context.timeMs : Math.max(context.timeMs, ecLastTick + 1000);
    let final = false;
    if (next > context.timeMs + remaining) {
      if (context.timeMs + remaining - ecLastTick <= 500) return;
      next = Math.ceil(context.timeMs + remaining); final = true;
    }
    if (ecNextAt !== undefined && ecNextAt <= next) return;
    ecNextAt = next;
    const generation = ++ecToken;
    context.schedule(next, () => {
      if (generation !== ecToken) return;
      ecNextAt = undefined;
      advancedGauge.advance(context.timeMs);
      if (!advancedGauge.hasEC() && !final) return;
      reactionDamage(ecOwner, { reaction: 'electro-charged', element: 'electro', coefficient: 2 }, ecPanel);
      ecLastTick = context.timeMs;
      advancedGauge.consumeEC();
      planEC();
    });
  }

  function dealHit(ownerId: string, skillId: string, hit: Hit, id: string,
    source: 'direct' | 'summon', savedPanel?: CombatPanel): void {
    hit = runtime?.prepareHit?.(context, ownerId, skillId, { ...hit }) ?? hit;
    const stats = savedPanel ?? panel(ownerId);
    let applied = false;
    let reaction: CombatHitEvent['reaction'] = null;
    let baseMultiplier = 1;
    let extraReactions: ReactionDescriptor[] = [];
    gauge.advance(scheduler.timeMs);
    if (hit.element !== 'physical' && hit.gauge !== 0 && icd.allows(ownerId, hit.icdTag, scheduler.timeMs, hit.icdRule)) {
      applied = true;
      const application = advancedGauge ? advancedGauge.apply(hit.element, hit.gauge, scheduler.timeMs, hit.blunt)
        : ['pyro', 'hydro', 'cryo'].includes(hit.element) ? (gauge as ElementalGauge).apply(hit.element as 'pyro' | 'hydro' | 'cryo', hit.gauge, scheduler.timeMs)
        : (() => { throw new Error(`Unsupported element in combat-core-v1: ${hit.element}`); })();
      if ('reactions' in application) {
        extraReactions = application.reactions;
        reaction = extraReactions.find(item => ['vaporize', 'reverse-vaporize', 'melt', 'reverse-melt'].includes(item.reaction))?.reaction ?? null;
      } else reaction = application.reaction ?? null;
      baseMultiplier = application.baseMultiplier;
      if (advancedGauge?.hasEC() && ['hydro', 'electro'].includes(hit.element)) { ecOwner = ownerId; ecPanel = panel(ownerId); }
    } else if (advancedGauge && hit.element === 'physical' && hit.blunt) {
      extraReactions = advancedGauge.apply('physical', 1, context.timeMs, true).reactions;
    }
    const reactionMultiplier = amplification(baseMultiplier, stats.elementalMastery, stats.reactionBonus);
    if (hit.applicationOnly) {
      if (reaction) reactionCounts[reaction]++;
      state('status', id, ownerId, { element: hit.element, applicationOnly: true, applied });
      for (const descriptor of extraReactions) if (!['vaporize', 'reverse-vaporize', 'melt', 'reverse-melt', 'electro-charged'].includes(descriptor.reaction)) reactionDamage(ownerId, descriptor);
      if (advancedGauge) planEC();
      return;
    }
    const critical = config.mode === 'expected' ? null : config.mode === 'critical' ? true
      : config.mode === 'noncritical' ? false : random() < Math.min(1, stats.critRate + (hit.critRateBonus ?? 0));
    let resistanceReduction = 0, defenseReduction = config.enemy.defenseReduction;
    for (const debuff of enemyDebuffs.values()) {
      if (debuff.elements && !debuff.elements.includes(hit.element)) continue;
      resistanceReduction += debuff.resistanceReduction;
      defenseReduction += debuff.defenseReduction;
    }
    const calculation = calculateResolvedAttack({ schemaVersion: 1, attack: hit.scaling ? stats[hit.scaling] : stats.attack, multiplier: hit.multiplier,
      damageBonus: stats.damageBonus + (hit.damageBonus ?? 0) + (stats.damageBonuses[hit.element] ?? 0) + (stats.categoryBonuses[hit.category ?? ''] ?? 0) + buffs.directBonus(ownerId), critRate: Math.min(1, stats.critRate + (hit.critRateBonus ?? 0)), critDamage: stats.critDamage,
      mode: critical === null ? 'expected' : critical ? 'critical' : 'noncritical',
      enemy: { ...config.enemy, characterLevel: actors.get(ownerId)!.stats.level,
        defenseReduction: Math.min(1, defenseReduction),
        defenseIgnore: Math.max(config.enemy.defenseIgnore, hit.defenseIgnore ?? 0),
        resistance: (config.enemy.resistances?.[hit.element] ?? config.enemy.resistance) - resistanceReduction },
    }, hit.flatDamage ?? 0);
    const damage = calculation.damage * reactionMultiplier;
    totalDamage += damage;
    damageByActor[ownerId] += damage;
    hits++;
    if (reaction) reactionCounts[reaction]++;
    const event: CombatHitEvent = { type: 'hit', timeMs: scheduler.timeMs, id, actorId: ownerId, skillId, source, damage,
      calculation, reactionMultiplier, reaction, applied, aura: gauge.advance(scheduler.timeMs),
      buffIds: [...stats.buffIds], directBuffIds: buffs.directIds(ownerId), snapshot: !!savedPanel, critical };
    record(event);
    runtime?.onHit?.(context, event, hit);
    for (const descriptor of extraReactions) {
      if (['vaporize', 'reverse-vaporize', 'melt', 'reverse-melt', 'electro-charged'].includes(descriptor.reaction)) continue;
      reactionDamage(ownerId, descriptor);
    }
    if (advancedGauge) planEC();
    const particles = skills.get(skillId)?.particlesOnHit;
    if (particles && scheduler.timeMs >= (particlesReadyAt.get(skillId) ?? 0)) {
      particlesReadyAt.set(skillId, scheduler.timeMs + particles.cooldownMs);
      scheduler.schedule(scheduler.timeMs + particles.travelMs, () => {
        collectParticles(`particles:${id}`, particles.element, 'particle', particles.count);
      }, PRIORITY.energy);
    }
    // Only direct friendly hits trigger coordinated summons; summon hits cannot recursively proc them.
    if (damage > 0) {
      for (const instance of summons.values()) {
        const trigger = instance.definition.trigger;
        if (trigger.type !== 'coordinated' || trigger.condition === 'normal-attack' || !isLive(instance)
          || scheduler.timeMs < instance.nextProcAt || (source === 'summon' && !trigger.allowSummonHits)
          || (ownerId === instance.ownerId && skillId === instance.skillId)) continue;
        if (runtime?.canTriggerSummon && !runtime.canTriggerSummon(context, instance, event, hit)) continue;
        instance.nextProcAt = scheduler.timeMs + trigger.cooldownMs;
        const procTime = scheduler.timeMs + trigger.delayMs;
        if (procTime < instance.endsAt) scheduler.schedule(procTime, () => {
          if (isLive(instance) && !runtime?.onSummonTrigger?.(context, instance, id)) dealHit(instance.ownerId, instance.skillId, instance.definition.hit,
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

  const context: RuntimeContext = {
    get timeMs() { return scheduler.timeMs; }, get onField() { return onField; }, input: config,
    health, energy, random, panel,
    schedule: (time, callback, priority = 0) => { if (time <= config.durationMs) scheduler.schedule(time, callback, priority); },
    log: state,
    heal: (id, amount, sourceId) => state('health', sourceId, id, { ...health.change(id, amount) }),
    loseHp: (id, amount, sourceId) => state('health', sourceId, id, { ...health.change(id, -amount, true) }),
    restoreEnergy: (id, amount, sourceId) => state('energy', sourceId, id, { ...energy.add(id, amount), pickupType: 'flat' }),
    particles: (id, element, count, delay) => context.schedule(context.timeMs + delay, () => collectParticles(id, element, 'particle', count), PRIORITY.energy),
    addBuff: buff => {
      for (const actorId of buff.targetIds) {
        const replaced = buffs.start(actorId, buff);
        if (replaced) state('buff-replaced', replaced.id, actorId, { replacedBy: buff.id });
        state('buff-start', buff.id, actorId);
      }
      context.schedule(context.timeMs + buff.durationMs, () => {
        for (const actorId of buff.targetIds) if (buffs.end(actorId, buff)) state('buff-end', buff.id, actorId);
      }, PRIORITY.expiry);
    },
    addEnemyDebuff: debuff => {
      enemyDebuffs.set(debuff.id, debuff);
      state('enemy-debuff-start', debuff.id, 'target');
      context.schedule(context.timeMs + debuff.durationMs, () => {
        if (enemyDebuffs.get(debuff.id) !== debuff) return;
        enemyDebuffs.delete(debuff.id); state('enemy-debuff-end', debuff.id, 'target');
      }, PRIORITY.expiry);
    },
    spawn, hit: (ownerId, skillId, hit, id, source = 'direct', savedPanel) => dealHit(ownerId, skillId, hit, id, source, savedPanel),
    resetCooldown: id => { readyAt.set(id, scheduler.timeMs); },
    reduceCooldown: (id, amount) => { readyAt.set(id, Math.max(scheduler.timeMs, (readyAt.get(id) ?? 0) - amount)); },
    skill: id => skills.get(id)!,
    hasSummon: (id, slot) => { const instance = summons.get(JSON.stringify([id, slot])); return !!instance && isLive(instance); },
    endSummon: (id, slot) => { const key = JSON.stringify([id, slot]); const instance = summons.get(key); if (instance) { summons.delete(key); state('summon-end', `summon-${instance.token}`, id, { reason: 'removed', slot }); } },
  };
  runtime?.initialize?.(context);
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
      if (enemyDebuffs.get(debuff.id) !== debuff) return;
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
        runtime?.onSwitch?.(context, previous, onField);
        return;
      }
      const originalSkill = skills.get(command.skillId)!;
      const skill = runtime?.prepareSkill?.(context, structuredClone(originalSkill), command.id) ?? originalSkill;
      const reason = skill.ownerId !== onField ? 'off-field'
        : scheduler.timeMs < lockedUntil ? 'action-lock'
        : scheduler.timeMs < (readyAt.get(skill.id) ?? 0) ? 'cooldown'
        : energy.get(skill.ownerId) < skill.energyCost ? 'energy' : runtime?.rejectCast?.(context, skill);
      if (reason) { state('rejected', command.id, skill.ownerId, { reason, skillId: skill.id }); return; }
      const before = energy.get(skill.ownerId);
      energy.spend(skill.ownerId, skill.energyCost);
      const ready = scheduler.timeMs + skill.cooldownStartDelayMs + skill.cooldownMs;
      readyAt.set(skill.id, ready);
      lockedUntil = scheduler.timeMs + skill.actionLockMs;
      const savedPanel = skill.snapshot ? panel(skill.ownerId) : undefined;
      state('cast', command.id, skill.ownerId, { skillId: skill.id, readyAt: ready,
        energyBefore: before, energyAfter: energy.get(skill.ownerId), snapshot: skill.snapshot });
      const handled = runtime?.onCast?.(context, skill, command.id);
      if (skill.actionCategory === 'normal') for (const instance of summons.values()) {
        const trigger = instance.definition.trigger;
        if (trigger.type !== 'coordinated' || trigger.condition !== 'normal-attack' || !isLive(instance)) continue;
        const animationEnd = context.timeMs + Math.max(1, skill.actionLockMs);
        const attempt = () => {
          if (!isLive(instance) || context.onField !== skill.ownerId || context.timeMs >= animationEnd) return;
          if (context.timeMs < instance.nextProcAt) { context.schedule(instance.nextProcAt, attempt); return; }
          instance.nextProcAt = context.timeMs + trigger.cooldownMs;
          context.schedule(context.timeMs + trigger.delayMs, () => {
            if (isLive(instance) && !runtime?.onSummonTrigger?.(context, instance, command.id)) dealHit(instance.ownerId, instance.skillId, instance.definition.hit, `summon-${instance.token}:${command.id}`, 'summon', instance.panel);
          });
          if (instance.nextProcAt < animationEnd) context.schedule(instance.nextProcAt, attempt);
        };
        attempt();
      }
      if (handled) return;
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
    finalAura: gauge.advance(config.durationMs), finalOnField: onField, events, eventCounts, hits, logMode: config.logMode, reactionCounts, finalHealth: health.snapshot(),
  };
}
