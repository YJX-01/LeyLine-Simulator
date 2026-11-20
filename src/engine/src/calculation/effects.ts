import { definitionKey, type CalculationEvent, type CalculationEventSelector, type CalculationHitSelector,
  type CombatActor, type CombatContext, type CombatFrame, type DefinitionRef, type EffectDefinition } from '@leyline/schema';
import type { CompiledData } from './compile';

export interface EffectInstance { id: string; owner: CombatActor; definition: EffectDefinition; source: CalculationEvent | null; triggerKnown: boolean }
export function calculationEffectInstanceId(ownerId: string, definition: DefinitionRef, sourceEventId: string | null): string {
  return JSON.stringify([ownerId, definition.namespace, definition.id, definition.revision, sourceEventId]);
}
export function eventOrder(a: CalculationEvent, b: CalculationEvent): number | null {
  if (a.id === b.id) return 0;
  return a.timeMs !== b.timeMs ? Math.sign(a.timeMs - b.timeMs) : a.order !== b.order ? Math.sign(a.order - b.order) : null;
}
export function eventMatches(selector: CalculationEventSelector, event: CalculationEvent, ownerId: string, targetId: string): boolean | null {
  if (!selector.kinds.includes(event.kind)) return false;
  const checks: (boolean | null)[] = [];
  if (selector.actor === 'owner') checks.push(event.actorId === null ? null : event.actorId === ownerId);
  if (selector.target === 'query') checks.push(event.targetIds === null ? null : event.targetIds.includes(targetId));
  if (selector.skillIds) checks.push(event.skillId === undefined ? null : selector.skillIds.includes(event.skillId));
  if (selector.hitIds) checks.push(event.hitId === undefined ? null : selector.hitIds.includes(event.hitId));
  if (selector.categories) checks.push(event.category === undefined ? null : selector.categories.includes(event.category));
  if (selector.reactionIds) checks.push(event.reactionId === undefined ? null : selector.reactionIds.includes(event.reactionId));
  if (selector.actionIds) checks.push(event.actionId === undefined ? null : selector.actionIds.includes(event.actionId));
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
export function effectUnlocked(activation: EffectDefinition['activation'], owner: Pick<CombatActor, 'ascension' | 'constellation' | 'refinement' | 'setCounts'>): boolean {
  return owner.ascension !== null && owner.ascension >= (activation.ascension ?? 0)
    && owner.constellation !== null && owner.constellation >= (activation.constellation ?? 0)
    && owner.refinement !== null && owner.refinement >= (activation.refinement ?? 1)
    && (!activation.set || (owner.setCounts[activation.set.id] ?? 0) >= activation.set.pieces);
}
export function collectEffectInstances(data: CompiledData, context: CombatContext, targetId: string, visit: () => boolean): EffectInstance[] {
  const result: EffectInstance[] = [];
  for (const owner of context.actors) for (const reference of owner.effects) {
    if (!visit()) return result;
    const definition = data.effects.get(definitionKey(reference))!;
    if (!effectUnlocked(definition.activation, owner)) continue;
    if (definition.trigger.kind === 'permanent') result.push({ id: calculationEffectInstanceId(owner.id, reference, null), owner, definition, source: null, triggerKnown: true });
    else for (const source of context.events) {
      if (!visit()) return result;
      const matches = eventMatches(definition.trigger.selector, source, owner.id, targetId);
      if (matches !== false) result.push({ id: calculationEffectInstanceId(owner.id, reference, source.id), owner, definition, source, triggerKnown: matches === true });
    }
  }
  return result;
}
export function instanceActive(instance: EffectInstance, event: CalculationEvent, phase: CombatFrame['phase']): boolean | null {
  const lifetime = instance.definition.lifetime;
  if (lifetime.kind === 'permanent' || !instance.source) return instance.triggerKnown ? true : null;
  if (event.timeMs >= instance.source.timeMs + lifetime.durationMs || event.timeMs < instance.source.timeMs) return false;
  const order = eventOrder(instance.source, event);
  if (order === null) return null;
  if (order > 0 || order === 0 && lifetime.phase === 'after' && phase === 'before') return false;
  return instance.triggerKnown ? true : null;
}
