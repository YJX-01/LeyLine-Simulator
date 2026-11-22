import { definitionKey, type CalculationEvent, type CalculationFact, type CalculationEventSelector, type CalculationHitSelector,
  type CombatActor, type CombatContext, type CombatFrame, type DefinitionRef, type EffectDefinition } from '@leyline/schema';
import type { CompiledData } from './compile';

export interface EffectInstance { id: string; owner: CombatActor; definition: EffectDefinition; source: CalculationEvent | null; triggerKnown: boolean; until?: number; replacedBy?: CalculationEvent; possibleEndMs?: number }
export function calculationEffectInstanceId(ownerId: string, definition: DefinitionRef, sourceEventId: string | null): string {
  return JSON.stringify([ownerId, definition.namespace, definition.id, definition.revision, sourceEventId]);
}
type EventPosition = Pick<CalculationEvent, 'id' | 'order' | 'timeMs'>;
export function eventOrder(a: EventPosition, b: EventPosition): number | null {
  if (a.id === b.id) return 0;
  return a.timeMs !== b.timeMs ? Math.sign(a.timeMs - b.timeMs) : a.order !== b.order ? Math.sign(a.order - b.order) : null;
}
export function eventMatches(selector: CalculationEventSelector, event: CalculationEvent, ownerId: string, targetId: string): boolean | null {
  if (event.occurred === false || !selector.kinds.includes(event.kind) && !(event.kind === 'hit' && event.reactionId && selector.kinds.includes('reaction'))) return false;
  const checks: (boolean | null)[] = [];
  if (event.occurred === null) checks.push(null);
  if (selector.actor === 'owner') checks.push(event.actorId === null ? null : event.actorId === ownerId);
  if (selector.target === 'enemy') checks.push(event.targetIds === null ? null : event.targetIds.length > 0);
  if (event.kind === 'hit' && selector.target !== 'any' && !selector.allowZeroDamage && event.facts.targetsDamaged) {
    const count = event.facts.targetsDamaged.value;
    checks.push(count?.kind === 'quantity' ? count.value > 0 : null);
  }
  if (selector.target === 'query') checks.push(event.targetIds === null ? null : event.targetIds.includes(targetId));
  if (selector.skillIds) checks.push(event.skillId === undefined ? null : selector.skillIds.includes(event.skillId));
  if (selector.hitIds) checks.push(event.hitId === undefined ? null : selector.hitIds.includes(event.hitId));
  if (selector.categories) checks.push(event.category === undefined ? null : selector.categories.includes(event.category));
  if (selector.reactionIds || selector.reactionElements) {
    const elements = event.reactionId && selector.reactionElements?.[event.reactionId];
    checks.push(event.reactionId === undefined ? null : selector.reactionIds?.includes(event.reactionId) ? true
      : elements ? event.reactionElement === undefined ? null : elements.includes(event.reactionElement) : false);
  }
  if (selector.actionIds) checks.push(event.actionId === undefined ? null : selector.actionIds.includes(event.actionId));
  if (selector.observation) {
    const { key, test } = selector.observation, fact = event.facts[key], value = fact?.value;
    checks.push(!fact ? false : !value ? null : test === 'true' ? value.kind === 'boolean' && value.value
      : value.kind === 'quantity' && (test === 'increase' ? value.value > 0 : test === 'decrease' ? value.value < 0 : value.value !== 0));
  }
  return checks.includes(false) ? false : checks.includes(null) ? null : true;
}
export function hitMatches(selector: CalculationHitSelector, hit: CombatFrame['hit']): boolean | null {
  if (!Object.keys(selector).length) return true;
  if (!hit) return null;
  return (!selector.skillIds || hit.skillId !== null && selector.skillIds.includes(hit.skillId)) && (!selector.hitIds || hit.hitId !== null && selector.hitIds.includes(hit.hitId))
    && (!selector.elements || selector.elements.includes(hit.element)) && (!selector.categories || hit.category !== null && selector.categories.includes(hit.category))
    && (!selector.families || selector.families.includes(hit.family)) && (!selector.origins || selector.origins.includes(hit.origin))
    && (!selector.reactionIds || hit.reactionId !== null && selector.reactionIds.includes(hit.reactionId));
}
export function buffTriggerMatches(definition: EffectDefinition, event: CalculationEvent, ownerId: string, targetId: string): boolean | null {
  if (definition.trigger.kind !== 'event') return false;
  if (event.confirmedBuff) {
    if (event.kind !== 'state-change' || event.occurred === false || event.actorId !== ownerId || definitionKey(event.confirmedBuff) !== definitionKey(definition.buff ?? definition.identity)) return false;
    return event.occurred === null ? null : true;
  }
  const { selector } = definition.trigger;
  if (!Array.isArray(selector)) return eventMatches(selector, event, ownerId, targetId);
  let unknown = false;
  for (const branch of selector) {
    const match = eventMatches(branch, event, ownerId, targetId);
    if (match === true) return true;
    if (match === null) unknown = true;
  }
  return unknown ? null : false;
}
export function effectUnlocked(activation: EffectDefinition['activation'], owner: Pick<CombatActor, 'ascension' | 'constellation' | 'refinement' | 'setCounts'> & { identity?: Pick<NonNullable<CombatActor['identity']>,'element'|'weaponType'> }): boolean {
  return owner.ascension !== null && owner.ascension >= (activation.ascension ?? 0)
    && owner.constellation !== null && owner.constellation >= (activation.constellation ?? 0)
    && owner.refinement !== null && owner.refinement >= (activation.refinement ?? 1)
    && (!activation.weaponTypes || !!owner.identity?.weaponType && activation.weaponTypes.includes(owner.identity.weaponType))
    && (!activation.elements || !!owner.identity && activation.elements.includes(owner.identity.element))
    && (!activation.set || (owner.setCounts[activation.set.id] ?? 0) >= activation.set.pieces);
}
export function buffSources(definition: EffectDefinition, context: Pick<CombatContext,'events'|'factIntervals'>, owner: string, target: string, visit?: () => boolean) {
  const sources: { source: CalculationEvent; triggerKnown: boolean; until?: number }[] = [];
  const trigger = definition.trigger;
  if (trigger.kind !== 'event') return sources;
  const key = trigger.duringTeamInterval;
  const windows = key && context.factIntervals.filter(row => row.subject.kind === 'team' && row.facts[key]?.value?.value === true);
  const cooldown = trigger.cooldownMs ?? 0;
  const events = cooldown ? [...context.events].sort((a,b) => a.timeMs-b.timeMs || a.order-b.order || a.id.localeCompare(b.id)) : context.events;
  let ready = 0, possible = 0, lastWindow: string | undefined;
  for (const source of events) {
    if (visit && !visit()) break;
    const matches = buffTriggerMatches(definition,source,owner,target);
    if (matches === false) continue;
    const window = windows ? windows.find(w => w.startMs <= source.timeMs && source.timeMs < w.endMs) : undefined;
    if (key && !window) continue;
    if (window?.id !== lastWindow) { ready = 0; possible = 0; lastWindow = window?.id; }
    if (!source.confirmedBuff && source.timeMs < ready) continue;
    const known = matches === true && (Boolean(source.confirmedBuff) || source.timeMs >= possible);
    sources.push({source,triggerKnown:known,until:window?.endMs});
    if (cooldown && !source.confirmedBuff) {
      possible = source.timeMs + cooldown;
      if (known) ready = possible;
    }
  }
  return sources;
}
export function collectEffectInstances(data: CompiledData, context: CombatContext, targetId: string, visit: () => boolean): EffectInstance[] {
  const result: EffectInstance[] = [];
  const replacements = new Map<string, EffectInstance[]>();
  for (const owner of context.actors) for (const reference of owner.effects) {
    if (!visit()) return result;
    const definition = data.effects.get(definitionKey(reference))!;
    if (!effectUnlocked(definition.activation, owner)) continue;
    if (definition.trigger.kind === 'permanent' || definition.windowFact) result.push({ id: calculationEffectInstanceId(owner.id, definition.buff ?? reference, null), owner, definition, source: null, triggerKnown: true });
    const sources = buffSources(definition,context,owner.id,targetId,visit);
    let previous: EffectInstance[] = [];
    if (definition.stacking.refreshUnverified) sources.sort((a,b) => a.source.timeMs-b.source.timeMs || a.source.order-b.source.order || a.source.id.localeCompare(b.source.id));
    for (const match of sources) {
      const instance: EffectInstance = {id: calculationEffectInstanceId(owner.id,definition.buff ?? reference,match.source.id),owner,definition,...match};
      if (definition.stacking.refreshUnverified) {
        const end = buffEndMs(definition, instance.source, match.until);
        previous = previous.filter(p => (p.possibleEndMs ?? buffEndMs(definition,p.source,p.until)) > match.source.timeMs);
        if (!match.source.confirmedBuff) for (const prior of previous) {
          const latest = Math.min(end, prior.until ?? Infinity);
          if (latest > (prior.possibleEndMs ?? buffEndMs(definition,prior.source,prior.until))) prior.possibleEndMs = latest;
        }
        previous.push(instance);
        if (previous.length > definition.stacking.maxStacks) previous.shift();
      }
      result.push(instance);
      if (definition.stacking.endOnNewTrigger) {
        const key = JSON.stringify([definition.stacking.group, definition.stacking.scope === 'owner' ? owner.id : null]);
        const group = replacements.get(key) ?? [];
        group.push(instance);
        replacements.set(key, group);
      }
    }
  }
  for (const group of replacements.values()) {
    group.sort((a,b) => b.source!.timeMs-a.source!.timeMs || b.source!.order-a.source!.order);
    let next: CalculationEvent | undefined;
    for (let i=0; i<group.length;) {
      const start = i, at = group[i].source!;
      do { group[i++].replacedBy = next; }
      while (i < group.length && group[i].source!.timeMs === at.timeMs && group[i].source!.order === at.order);
      const confirmed = group.slice(start,i).find(instance => instance.triggerKnown);
      if (confirmed) next = confirmed.source!;
    }
  }
  return result;
}
export function buffEndMs(definition: EffectDefinition, source: CalculationEvent | null, until = Infinity): number {
  if (!source || definition.lifetime.kind !== 'interval') return 3600001;
  return Math.min(until,source.timeMs + Math.min(definition.lifetime.durationMs, source.confirmedBuff?.remainingMs ?? Infinity));
}

export function stackExpiryUncertain(instance: EffectInstance, timeMs: number): boolean {
  return instance.possibleEndMs !== undefined && timeMs >= buffEndMs(instance.definition, instance.source, instance.until) && timeMs < instance.possibleEndMs;
}

export function instanceActive(instance: EffectInstance, event: EventPosition, phase: CombatFrame['phase']): boolean | null {
  const lifetime = instance.definition.lifetime;
  if (lifetime.kind === 'permanent' || !instance.source) return instance.triggerKnown ? true : null;
  const end = buffEndMs(instance.definition, instance.source, instance.until);
  if (event.timeMs >= (instance.possibleEndMs ?? end) || event.timeMs < instance.source.timeMs) return false;
  const order = eventOrder(instance.source, event);
  if (order === null) return null;
  if (order > 0 || order === 0 && lifetime.phase === 'after' && phase === 'before') return false;
  if (instance.replacedBy) {
    const replacement = eventOrder(instance.replacedBy, event);
    if (replacement === null) return null;
    if (replacement < 0 || replacement === 0 && (lifetime.phase === 'before' || phase === 'after')) return false;
  }
  return event.timeMs < end && instance.triggerKnown ? true : null;
}

export function hasRecipientCharges(instance: EffectInstance, events: Iterable<CalculationEvent>, current: CalculationEvent, recipient: string): boolean | null {
  const limit = instance.definition.charges;
  if (!limit) return true;
  let used = 0, possible = 0;
  for (const event of events) {
    if (event.kind !== 'hit' || event.occurred === false || event.actorId !== recipient || !event.category || !limit.categories.includes(event.category)) continue;
    const order = eventOrder(event, current);
    if (order !== null && order >= 0 || instanceActive(instance, event, 'before') === false) continue;
    const application = event.applications?.find(entry => entry.instanceId === instance.id);
    if (application?.active === false) continue;
    const targets = event.facts.targetsDamaged;
    const cost = targets?.value?.kind === 'quantity' ? targets.value.value : targets ? limit.perRecipient : event.targetIds?.length ?? limit.perRecipient;
    possible += cost;
    if (order !== null && event.occurred !== null && (targets ? targets.value !== null : event.targetIds) && instanceActive(instance, event, 'before') && (application ? application.active : instance.definition.application !== 'explicit')) used += cost;
  }
  return used >= limit.perRecipient ? false : possible >= limit.perRecipient ? null : true;
}

export function teamHealthCounter(instance: EffectInstance, events: Iterable<CalculationEvent>, current: CalculationEvent,
  phase: CombatFrame['phase'], key: string, currentPoints?: CalculationFact, override?: CalculationFact) {
  const rule = instance.definition.counter;
  if (!rule || !instance.source || instance.owner.constellation === null) return null;
  let initial = 0, cap = rule.cap, factor = rule.perRatio;
  for (const adjustment of rule.bonuses) if (instance.owner.constellation >= adjustment.constellation) {
    initial += adjustment.initial ?? 0; cap += adjustment.extraCap ?? 0; factor *= adjustment.gainFactor ?? 1;
  }
  const sources = new Set(instance.definition.sources);
  const overflow = key === rule.overflowFact;
  const pointsOf = (fact: CalculationFact | undefined) => fact?.value?.kind === 'quantity' && fact.value.unit === 'scalar' && fact.value.value >= 0 ? fact.value.value : null;
  const result = (value: number) => ({ value: { kind: 'quantity' as const, unit: 'scalar' as const, value }, provenance: 'derived' as const, sourceRefs: [...sources] });
  if (override) {
    const value = pointsOf(override);
    if (value === null || !overflow && value > cap) return null;
    if (overflow && currentPoints && value > 0 && pointsOf(currentPoints) !== cap) return null;
    return override;
  }
  if (overflow && currentPoints) {
    currentPoints.sourceRefs.forEach(source => sources.add(source));
    const points = pointsOf(currentPoints);
    return points !== null && points < cap ? result(0) : null;
  }
  let total = initial;
  if (instance.source.confirmedBuff) {
    const snapshot = instance.source.facts[rule.fact], points = pointsOf(snapshot);
    if (points === null || points > cap) return null;
    snapshot.sourceRefs.forEach(source => sources.add(source));
    total = points;
    if (overflow && points === cap) {
      const excess = instance.source.facts[key], value = pointsOf(excess);
      if (value === null) return null;
      excess.sourceRefs.forEach(source => sources.add(source));
      total += value;
    }
  }
  for (const event of events) {
    const change = event.kind === 'state-change' && event.facts[rule.change];
    if (!change) continue;
    const start = eventOrder(event, instance.source), end = eventOrder(event, current);
    if (start !== null && start <= 0 || end !== null && (end > 0 || end === 0 && phase === 'before')) continue;
    if (start === null || end === null || !event.actorId || change.value?.kind !== 'quantity' || change.value.unit !== 'scalar' || Math.abs(change.value.value) > 1) return null;
    total += Math.abs(change.value.value) * factor;
    change.sourceRefs.forEach(source => sources.add(source));
  }
  return result(overflow ? Math.max(0, total - cap) : Math.min(total, cap));
}
