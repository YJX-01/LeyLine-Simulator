import { buildSetCounts, type Build, type Project, subjectFacts, definitionKey, type CalculationEvent, type CalculationFact, type CalculationEventSelector, type CalculationHitSelector,
  type CombatActor, type CombatContext, type CombatFrame, type DefinitionRef, type EffectDefinition } from '@leyline/schema';
import type { CompiledData } from './compile';

export interface EffectInstance { id: string; owner: CombatActor; definition: EffectDefinition; source: CalculationEvent | null; triggerKnown: boolean; until?: number; replacedBy?: CalculationEvent; possibleEndMs?: number; certainEndMs?: number }
export function calculationEffectInstanceId(ownerId: string, definition: DefinitionRef, sourceEventId: string | null): string {
  return JSON.stringify([ownerId, definition.namespace, definition.id, definition.revision, sourceEventId]);
}
type EventPosition = Pick<CalculationEvent, 'id' | 'order' | 'timeMs'>;
export function eventOrder(a: EventPosition, b: EventPosition): number | null {
  if (a.id === b.id) return 0;
  return Math.sign(comparePosition(a, b)) || null;
}
export function eventMatches(selector: CalculationEventSelector, event: CalculationEvent, ownerId: string, targetId: string): boolean | null {
  if (event.occurred === false || !selector.kinds.includes(event.kind) && !(event.kind === 'hit' && event.reactionId && selector.kinds.includes('reaction'))) return false;
  const checks: (boolean | null)[] = [];
  if (event.occurred === null) checks.push(null);
  if (selector.actor === 'owner') checks.push(event.actorId === null ? null : event.actorId === ownerId);
  if (selector.target === 'enemy') checks.push(event.targetIds === null ? null : event.targetIds.length > 0);
  const contact = event.facts.targetsHit;
  if (event.kind === 'hit' && selector.target !== 'any' && contact?.value?.kind === 'quantity' && contact.value.value === 0) checks.push(false);
  if (event.kind === 'hit' && selector.zeroDamage === 'unknown') {
    const damaged = event.facts.targetsDamaged;
    checks.push(damaged?.provenance !== 'preset' && damaged?.value?.kind === 'quantity' && damaged.value.value > 0 ? true : null);
  } else if (event.kind === 'hit' && selector.target !== 'any' && !selector.allowZeroDamage && event.facts.targetsDamaged) {
    const count = event.facts.targetsDamaged.value;
    checks.push(count?.kind === 'quantity' ? count.value > 0 : null);
  }
  if (selector.target === 'query') checks.push(event.targetIds === null ? null : event.targetIds.includes(targetId));
  if (selector.skillIds) checks.push(event.skillId === undefined ? null : selector.skillIds.includes(event.skillId));
  if (selector.hitIds) checks.push(event.hitId === undefined ? null : selector.hitIds.includes(event.hitId));
  if (selector.categories) checks.push(event.category === undefined ? null : selector.categories.includes(event.category));
  if (selector.reactionIds || selector.reactionElements) {
    const elements = event.reactionId && selector.reactionElements?.[event.reactionId];
    checks.push(event.reactionId === undefined ? null
      : elements ? event.reactionElement === undefined ? null : elements.includes(event.reactionElement)
      : selector.reactionIds?.includes(event.reactionId) ?? false);
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
    && (!selector.excludeHitIds || hit.hitId === null || !selector.excludeHitIds.includes(hit.hitId))
    && (!selector.elements || selector.elements.includes(hit.element)) && (!selector.categories || hit.category !== null && selector.categories.includes(hit.category))
    && (!selector.families || selector.families.includes(hit.family)) && (!selector.origins || selector.origins.includes(hit.origin))
    && (!selector.reactionIds || hit.reactionId !== null && selector.reactionIds.includes(hit.reactionId));
}
export function effectRecipientMatches(recipient: EffectDefinition['recipient'], ownerId: string, recipientId: string,
  identity?: Pick<NonNullable<CombatActor['identity']>, 'element' | 'weaponType'>, factActor?: string | null): boolean | null {
  if (recipient.role === 'owner') return ownerId === recipientId;
  if (recipient.role === 'target') return true;
  if (recipient.role === 'fact-actor') return factActor == null ? null : factActor === recipientId;
  if (recipient.excludeOwner && ownerId === recipientId
    || recipient.elements && identity && !recipient.elements.includes(identity.element)
    || recipient.weaponTypes && identity?.weaponType && !recipient.weaponTypes.includes(identity.weaponType)) return false;
  return recipient.elements && !identity || recipient.weaponTypes && !identity?.weaponType ? null : true;
}

export function buffTriggerMatches(definition: EffectDefinition, event: CalculationEvent, ownerId: string, targetId: string): boolean | null {
  if (definition.trigger.kind !== 'event') return false;
  if (event.confirmedBuff) {
    if (event.confirmedBuff.recipientId) return false;
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
export function effectUnlocked(activation: EffectDefinition['activation'], owner: Pick<CombatActor, 'ascension' | 'constellation' | 'refinement' | 'setCounts'> & { identity?: Pick<NonNullable<CombatActor['identity']>,'element'|'weaponType'|'gameId'> }): boolean {
  return owner.ascension !== null && owner.ascension >= (activation.ascension ?? 0)
    && owner.constellation !== null && owner.constellation >= (activation.constellation ?? 0)
    && owner.refinement !== null && owner.refinement >= (activation.refinement ?? 1)
    && (!activation.weaponTypes || !!owner.identity?.weaponType && activation.weaponTypes.includes(owner.identity.weaponType))
    && (!activation.characterGameIds || !!owner.identity?.gameId && activation.characterGameIds.includes(owner.identity.gameId))
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
  const events = cooldown ? [...context.events].sort((a,b) => comparePosition(a, b) || a.id.localeCompare(b.id)) : context.events;
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
    if (definition.stacking.refreshUnverified || definition.stacking.refreshAll) sources.sort((a,b) => comparePosition(a.source, b.source) || a.source.id.localeCompare(b.source.id));
    for (const match of sources) {
      const instance: EffectInstance = {id: calculationEffectInstanceId(owner.id,definition.buff ?? reference,match.source.id),owner,definition,...match};
      if (definition.stacking.refreshUnverified || definition.stacking.refreshAll) {
        const end = buffEndMs(definition, instance.source, match.until);
        previous = previous.filter(p => (p.possibleEndMs ?? buffEndMs(definition,p.source,p.until)) > match.source.timeMs);
        if (!match.source.confirmedBuff) for (const prior of previous) {
          if (!visit()) return result;
          const latest = Math.min(end, prior.until ?? Infinity);
          const certainEnd = prior.certainEndMs ?? buffEndMs(definition,prior.source,prior.until);
          const strictlyLater = prior.source!.timeMs < match.source.timeMs || prior.source!.order < match.source.order;
          const knownRefresh = definition.stacking.refreshAll && match.triggerKnown && prior.triggerKnown
            && strictlyLater && match.source.timeMs < certainEnd;
          if (knownRefresh) prior.certainEndMs = Math.max(certainEnd,latest);
          if (latest > (prior.possibleEndMs ?? certainEnd)) prior.possibleEndMs = latest;
        }
        previous.push(instance);
        if (previous.length > definition.stacking.maxStacks && (definition.stacking.refreshUnverified
          || previous.every(item => item.triggerKnown) && previous.every((item, index) => index === 0
            || item.source!.timeMs !== previous[index - 1].source!.timeMs || item.source!.order !== previous[index - 1].source!.order))) previous.shift();
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
  return instance.possibleEndMs !== undefined && timeMs >= (instance.certainEndMs ?? buffEndMs(instance.definition, instance.source, instance.until)) && timeMs < instance.possibleEndMs;
}

export function instanceActive(instance: EffectInstance, event: EventPosition, phase: CombatFrame['phase']): boolean | null {
  const lifetime = instance.definition.lifetime;
  if (lifetime.kind === 'permanent' || !instance.source) return instance.triggerKnown ? true : null;
  const end = instance.certainEndMs ?? buffEndMs(instance.definition, instance.source, instance.until);
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

type SourceOwnerFactReader = (owner: string, source: CalculationEvent, key: string) => boolean | null;
/** Index source-time facts once for event projections that do not have query overrides. */
export function sourceOwnerFactReader(context: CombatContext): SourceOwnerFactReader {
  const frames = new Map<string, CalculationFact>();
  for (const entry of context.stateFrames ?? []) if (entry.subject.kind === 'actor' && entry.phase === 'before') {
    for (const [key, fact] of Object.entries(entry.facts)) frames.set(JSON.stringify([entry.subject.id, entry.eventId, key]), fact);
  }
  const intervals = new Map<string, CombatContext['factIntervals']>();
  for (const interval of context.factIntervals) if (interval.subject.kind === 'actor') for (const key of Object.keys(interval.facts)) {
    const id = JSON.stringify([interval.subject.id, key]), list = intervals.get(id) ?? [];
    list.push(interval); intervals.set(id, list);
  }
  for (const list of intervals.values()) list.sort((a, b) => a.startMs - b.startMs);
  const actors = new Map(context.actors.map(actor => [actor.id, actor]));
  return (owner, source, key) => {
    const observed = subjectFacts(source.subjectFacts, { kind: 'actor', id: owner })?.[key];
    let fact = observed?.provenance !== 'preset' ? observed : undefined;
    fact ??= frames.get(JSON.stringify([owner, source.id, key])) ?? source.derivedStates?.before[owner]?.[key];
    if (!fact) {
      const list = intervals.get(JSON.stringify([owner, key])) ?? [];
      fact = intervalFactAt(list, source.timeMs, key);
    }
    fact ??= actors.get(owner)?.facts[key];
    return fact?.provenance === 'preset' || fact?.value?.kind !== 'boolean' ? null : fact.value.value;
  };
}

function intervalFactAt(intervals: CombatContext['factIntervals'], timeMs: number, key: string) {
  let start = 0;
  let end = intervals.length;
  while (start < end) {
    const middle = (start + end) >>> 1;
    if (intervals[middle].startMs <= timeMs) start = middle + 1;
    else end = middle;
  }
  const latest = intervals[start - 1];
  return latest && timeMs < latest.endMs ? latest.facts[key] : undefined;
}

type Position = {timeMs: number; order: number};
const comparePosition = (a: Position, b: Position) => a.timeMs - b.timeMs || a.order - b.order;

/** Records with the same time and order share an observation boundary. */
function groupTimelineRecords<T extends { timeMs: number; order: number }>(records: readonly T[]): T[][] {
  const groups: T[][] = [];
  for (const record of [...records].sort(comparePosition)) {
    const group = groups.at(-1);
    if (group && group[0].timeMs === record.timeMs && group[0].order === record.order) group.push(record);
    else groups.push([record]);
  }
  return groups;
}

type CategoryStackRule = NonNullable<Build['weapon']>['metadata']['categoryStacks'] extends (infer T)[] | undefined ? T : never;
type CategoryStackWindow = { certainUntil: number; possibleUntil: number; certainSource?: string; possibleSource?: string };

const recorded = (fact?: CalculationFact) => fact && (fact.provenance === 'explicit' || fact.provenance === 'recorded');

/** Both equipment stack rules project observations onto the same ordered events. */
export function applyEquipmentStacks(timeline: Project['timeline'], context: CombatContext, builds: Map<string, Build>, events: Map<string, CalculationEvent>): void {
  const holders = [...builds].filter(([, build]) => build.weapon?.metadata.categoryStacks?.length
    || build.weapon?.metadata.sharedEventStacks?.length || build.sets.some(set => set.metadata.categoryStacks?.length));
  if (!holders.length) return;
  const groups = groupTimelineRecords(timeline);
  const sources = new Map<string, string>();
  const index = { groups, events, sources };
  applyCategoryStacks(context, holders, index);
  applySharedEventStacks(context, holders, index);
  const existing = new Set(context.sources.map(source => source.id));
  for (const [id, reference] of sources) if (!existing.has(id)) context.sources.push({ id, kind: 'recording', reference });
}

interface StackTimeline {
  groups: Project['timeline'][];
  events: Map<string, CalculationEvent>;
  sources: Map<string, string>;
}

function applyCategoryStacks(context: CombatContext, builds: [string, Build][], {groups, events, sources}: StackTimeline): void {
  for (const [owner, build] of builds) {
    const rules: CategoryStackRule[] = [...build.weapon?.metadata.categoryStacks ?? [], ...build.sets.flatMap(set =>
      (set.metadata.categoryStacks ?? []).filter(rule => rule.pieces !== undefined && (buildSetCounts(build)[set.id] ?? 0) >= rule.pieces))];
    for (const rule of rules) {
      const windows = new Map(rule.categories.map(category => [category, { certainUntil: 0, possibleUntil: rule.durationMs } as CategoryStackWindow]));
      const marker = 'category-stack-' + owner + '-' + rule.fact + '-';
      let anchorSources: string[] = [];
      for (const event of context.events) for (const phase of ['before', 'after'] as const) {
        const facts = event.derivedStates?.[phase]?.[owner];
        if (facts?.[rule.fact]?.provenance === 'derived') delete facts[rule.fact];
      }
      function write(id: string, phase: 'before' | 'after', time: number) {
        const event = events.get(id);
        if (!event) return;
        const current = [...windows.values()];
        const lower = Math.min(rule.maxStacks, current.filter(window => time < window.certainUntil).length);
        const upper = Math.min(rule.maxStacks, current.filter(window => time < window.possibleUntil).length);
        const refs = [...new Set([...anchorSources, ...current.flatMap(window => [window.certainSource, window.possibleSource].filter((value): value is string => !!value))])].map(source => marker + source);
        event.derivedStates ??= { before: {}, after: {} };
        (event.derivedStates[phase][owner] ??= {})[rule.fact] = {
          value: lower === upper ? { kind: 'quantity', unit: 'count', value: lower } : null,
          provenance: 'derived', sourceRefs: refs,
        };
      }
      for (const group of groups) {
        const manual = group.flatMap(record => {
          const fact = record.damage && subjectFacts(record.damage.facts, { kind: 'actor', id: owner })?.[rule.fact];
          return fact && ['explicit', 'recorded'].includes(fact.provenance) ? [{ fact, id: record.id }] : [];
        });
        if (manual.length) {
          const clear = manual.every(({ fact }) => fact.value?.kind === 'quantity' && fact.value.unit === 'count' && fact.value.value === 0);
          anchorSources = manual.map(item => item.id);
          for (const item of manual) sources.set(marker + item.id, item.id);
          for (const window of windows.values()) {
            window.certainUntil = 0;
            window.possibleUntil = clear ? 0 : group[0].timeMs + rule.durationMs;
            window.certainSource = undefined;
            window.possibleSource = undefined;
          }
        }
        for (const record of group) write(record.id, 'before', record.timeMs);
        for (const record of group) {
          if (record.damage?.hit.definition.group !== 'characters') continue;
          const event = events.get(record.id), category = event?.category;
          const window = category && category !== 'other' ? windows.get(category) : undefined;
          if (!event || !window || event.occurred === false || event.actorId !== owner && event.actorId !== null) continue;
          const hit = event.facts.targetsHit, damage = event.facts.targetsDamaged;
          const observed = (value: typeof hit) => value && ['explicit', 'recorded'].includes(value.provenance) && value.value?.kind === 'quantity' ? value.value.value : undefined;
          const hits = observed(hit), damaged = observed(damage);
          const contact = hits !== undefined ? hits > 0 : damaged !== undefined && damaged > 0 ? true : null;
          if (contact === false) continue;
          const end = record.timeMs + rule.durationMs;
          if (contact === true && event.actorId === owner && event.occurred !== null) {
            window.certainUntil = end;
            window.certainSource = record.id;
          }
          window.possibleUntil = end;
          window.possibleSource = record.id;
          sources.set(marker + record.id, record.id);
        }
        for (const record of group) write(record.id, 'after', record.timeMs);
      }
    }
  }
}

function applySharedEventStacks(context: CombatContext, builds: [string, Build][], {groups, events, sources}: StackTimeline): void {
  const readSource = sourceOwnerFactReader(context);
  for (const [owner, build] of builds) for (const rule of build.weapon?.metadata.sharedEventStacks ?? []) {
    let lower = 0, upper = rule.initialStacks ?? rule.maxStacks, certainUntil = 0, possibleUntil = rule.durationMs;
    let certainEnds: number[] = [];
    let ready = 0, possibleReady = rule.cooldownMs, refs: string[] = [];
    const actor = context.actors.find(item => item.id === owner);
    const marker = 'shared-event-stack-' + owner + '-' + rule.countFact + '-';
    if (rule.fullTriggerFact) for (const event of context.events) {
      if (event.actorId === owner && event.facts[rule.fullTriggerFact]?.provenance === 'derived') delete event.facts[rule.fullTriggerFact];
    }
    const manualIntervals = new Map([rule.countFact, ...(rule.fullFact ? [rule.fullFact] : [])].map(key => [key, context.factIntervals
      .filter(row => row.subject.kind === 'actor' && row.subject.id === owner && recorded(row.facts[key]))
      .sort((a, b) => a.startMs - b.startMs)]));
    const manual = (eventId: string, time: number, key: string) => {
      const direct = subjectFacts(events.get(eventId)?.subjectFacts, { kind: 'actor', id: owner })?.[key];
      if (recorded(direct)) return true;
      const intervals = manualIntervals.get(key) ?? [];
      if (intervalFactAt(intervals, time, key)) return true;
      return !!recorded(actor?.facts[key]);
    };
    function write(eventId: string, phase: 'before' | 'after', time: number) {
      const event = events.get(eventId); if (!event) return;
      const count = lower === upper ? lower : null;
      const full = lower === rule.maxStacks ? true : upper < rule.maxStacks ? false : null;
      const countManual = manual(eventId, time, rule.countFact), fullManual = rule.fullFact && manual(eventId, time, rule.fullFact);
      const states = event.derivedStates ??= { before: {}, after: {} };
      const facts = states[phase][owner] ??= {};
      if (!countManual) facts[rule.countFact] = { value: count === null ? null : { kind: 'quantity', unit: 'count', value: count }, provenance: 'derived', sourceRefs: refs };
      else if (facts[rule.countFact]?.provenance === 'derived') delete facts[rule.countFact];
      if (rule.fullFact && !fullManual && !countManual) facts[rule.fullFact] = { value: full === null ? null : { kind: 'boolean', value: full }, provenance: 'derived', sourceRefs: refs };
      else if (rule.fullFact && facts[rule.fullFact]?.provenance === 'derived') delete facts[rule.fullFact];
    }
    for (const group of groups) {
      const time = group[0].timeMs;
      if (rule.refresh === 'unverified') { certainEnds = certainEnds.filter(end => time < end); lower = certainEnds.length; }
      else if (time >= certainUntil) lower = 0;
      if (time >= possibleUntil) upper = 0;
      const beforeLower = lower, beforeUpper = upper, beforeRefs = refs;
      for (const record of group) write(record.id, 'before', time);
      for (const record of group) {
        const event = events.get(record.id); if (!event) continue;
        const matches = eventMatches(rule.selector, event, owner, 'target');
        if (matches === false || time < ready) continue;
        const field = rule.sourceOwnerFact ? readSource(owner, event, rule.sourceOwnerFact) : true;
        if (field === false) continue;
        const certain = matches === true && field === true && time >= possibleReady && group.length === 1;
        if (certain) {
          if (rule.refresh === 'unverified') {
            certainEnds.sort((a, b) => a - b);
            if (certainEnds.length >= rule.maxStacks) certainEnds.pop();
            certainEnds.push(time + rule.durationMs); lower = certainEnds.length;
          } else { lower = Math.min(rule.maxStacks, lower + 1); certainUntil = time + rule.durationMs; }
          ready = time + rule.cooldownMs;
        }
        upper = Math.min(rule.maxStacks, upper + 1); possibleUntil = time + rule.durationMs;
        possibleReady = time + rule.cooldownMs;
        const source = marker + event.id; refs = [...refs, source].slice(-rule.maxStacks); sources.set(source, event.id);
        if (rule.fullTriggerFact) {
          const full = certain && lower === rule.maxStacks ? true : upper < rule.maxStacks ? false : null;
          event.facts[rule.fullTriggerFact] = { value: full === null ? null : { kind: 'boolean', value: full }, provenance: 'derived', sourceRefs: refs };
        }
      }
      if (group.length > 1 && (lower !== beforeLower || upper !== beforeUpper)) {
        const afterLower = lower, afterUpper = upper, afterRefs = refs;
        lower = Math.min(beforeLower, afterLower); upper = Math.max(beforeUpper, afterUpper);
        refs = [...new Set([...beforeRefs, ...afterRefs])].slice(-rule.maxStacks);
        for (const record of group) write(record.id, 'before', time);
        lower = afterLower; upper = afterUpper; refs = afterRefs;
      }
      for (const record of group) write(record.id, 'after', time);
    }
  }
}
