import { boundFormulaSchema, calculationBindingSchema, calculationJsonPointer, combatContextSchema, combatFrameSchema, definitionKey, inspectCalculationStructure, valueMatchesType, valueTypeAssignable,
  type AttributeDefinition, type BoundFormula, type CalculationActorSelector, type CalculationBinding, type CalculationDiagnostic, type CalculationFact,
  type CalculationReadTime, type CombatContext, type CombatFrame, type DefinitionRef, type EvaluatedValue, type FormulaEvaluation, type Value, type ValueType } from '@leyline/schema';
import { compiledData, type CompiledCalculation, type CompiledData } from './compile';
import { validateBinding, validateBoundFormula } from './binding-validation';
import { collectEffectInstances, eventOrder, hitMatches, instanceActive, type EffectInstance } from './effects';
import { interpretFormula, type FormulaEvaluationOptions } from './interpret';
import { CalculationSession, type TraceOrigin } from './session';
import { factsHaveSources, validateContextDefinitions } from './context-validation';

interface ReadFrame extends CombatFrame { excluded: ReadonlySet<string>; instance: EffectInstance | null }
export type BoundAttributeReader = (actorId: string, key: DefinitionRef, eventId: string, phase: CombatFrame['phase']) => Value | null | undefined;
interface Contribution { instance: EffectInstance; value: EvaluatedValue }
const boolean: ValueType = { kind: 'boolean' };
const own = <T>(record: Record<string, T>, key: string): T | undefined => Object.hasOwn(record, key) ? record[key] : undefined;
const firstOwn = <T>(primary: Record<string, T>, secondary: Record<string, T>, key: string): T | undefined => Object.hasOwn(primary, key) ? primary[key] : own(secondary, key);
const originOf = (definition: { identity: DefinitionRef; sources: string[] }, pointer = ''): TraceOrigin => ({ definition, pointer });

/** All reads and memo entries belong to this invocation, including hypothetical candidate evaluations. */
class BoundEvaluator {
  readonly actors: Map<string, CombatContext['actors'][number]>;
  readonly targets: Map<string, CombatContext['targets'][number]>;
  readonly events: Map<string, CombatContext['events'][number]>;
  readonly instances: EffectInstance[];
  readonly intervals = new Map<string, CombatContext['factIntervals']>();
  readonly overrides = new Map<string, CalculationFact>();
  readonly stateFrames = new Map<string, CalculationFact>();
  readonly memo = new Map<string, EvaluatedValue>();
  readonly active = new Set<string>();
  constructor(readonly program: CompiledCalculation, readonly data: CompiledData, readonly context: CombatContext,
    readonly invocation: BoundFormula, readonly session: CalculationSession, readonly initialFrame: CombatFrame, readonly attributeReader?: BoundAttributeReader) {
    this.actors = new Map(context.actors.map(actor => [actor.id, actor]));
    this.targets = new Map(context.targets.map(target => [target.id, target]));
    this.events = new Map(context.events.map(event => [event.id, event]));
    for (const interval of context.factIntervals) {
      for (const field of Object.keys(interval.facts)) {
        const key = JSON.stringify([interval.subject, field]), entries = this.intervals.get(key) ?? [];
        entries.push(interval); this.intervals.set(key, entries);
      }
    }
    for (const entries of this.intervals.values()) entries.sort((a, b) => a.startMs - b.startMs);
    for (const override of initialFrame.factOverrides) for (const [field, fact] of Object.entries(override.facts)) this.overrides.set(JSON.stringify([override.subject, field]), fact);
    for (const entry of context.stateFrames ?? []) for (const [field, fact] of Object.entries(entry.facts)) this.stateFrames.set(JSON.stringify([entry.subject, field, entry.eventId, entry.phase]), fact);
    this.instances = collectEffectInstances(data, context, initialFrame.targetId, () => !session.enter(undefined, 'effect-instance', 1));
  }
  missing(origin: TraceOrigin, key: string, type: ValueType, scope: string): EvaluatedValue {
    return this.session.missing(origin, key, type, scope, '/context' + calculationJsonPointer([scope, key]));
  }
  actor(selector: CalculationActorSelector, frame: ReadFrame, origin: TraceOrigin): string | EvaluatedValue {
    const id = selector.role === 'owner' ? frame.ownerId : selector.role === 'recipient' ? frame.recipientId
      : selector.role === 'contributor' ? frame.contributorId : selector.role === 'fact-actor' ? firstOwn(frame.actorFacts, this.context.team.actorFacts, selector.input) : null;
    return id == null ? this.missing(origin, selector.role === 'fact-actor' ? selector.input : selector.role, { kind: 'enum', values: [...this.actors.keys()] }, 'actor')
      : this.actors.has(id) ? id : this.session.invalid(origin, 'actor', '/frame', '队员引用已失效。', 'stale-reference');
  }
  readFact(origin: TraceOrigin, key: string, type: ValueType, scope: string, fact: CalculationFact | undefined): EvaluatedValue {
    if (fact?.value == null) return this.missing(origin, key, type, scope);
    const result = valueMatchesType(fact.value, type) ? this.session.known(origin, key, fact.value)
      : this.session.invalid(origin, key, '/context' + calculationJsonPointer([scope, key]), '事实类型或单位不匹配。', 'unit-mismatch');
    const trace = this.session.trace.at(-1);
    if (trace?.id === result.traceId) trace.sourceRefs = [...new Set([...trace.sourceRefs, ...fact.sourceRefs])];
    return result;
  }
  scopedFact(subject: CombatContext['factIntervals'][number]['subject'], key: string, frame: ReadFrame): CalculationFact | undefined {
    const identity = JSON.stringify([subject, key]);
    if (frame.eventId === this.initialFrame.eventId && this.overrides.has(identity)) return this.overrides.get(identity);
    const eventFrame = this.stateFrames.get(JSON.stringify([subject, key, frame.eventId, frame.phase]));
    if (eventFrame) return eventFrame;
    const timeMs = this.events.get(frame.eventId)!.timeMs;
    const entries = this.intervals.get(identity) ?? [];
    let left = 0, right = entries.length;
    while (left < right) { const middle = (left + right) >>> 1; if (entries[middle].startMs <= timeMs) left = middle + 1; else right = middle; }
    const interval = entries[left - 1];
    if (interval && timeMs < interval.endMs) return interval.facts[key];
    return subject.kind === 'team' ? own(this.context.team.facts, key) : subject.kind === 'actor' ? own(this.actors.get(subject.id)!.facts, key) : own(this.targets.get(subject.id)!.facts, key);
  }
  sourceTime(frame: ReadFrame, origin: TraceOrigin, phase: ReadFrame['phase']): ReadFrame | EvaluatedValue {
    if (!frame.sourceEventId) return this.missing(origin, 'sourceEventId', { kind: 'enum', values: [...this.events.keys()] }, 'source-event');
    const source = this.events.get(frame.sourceEventId), current = this.events.get(frame.eventId);
    if (!source || !current) return this.session.invalid(origin, 'source-event', '/frame/sourceEventId', '来源事件引用已失效。', 'stale-reference');
    const order = eventOrder(source, current);
    if (order === null) return this.missing(origin, 'sourceEventOrder', boolean, 'source-event');
    if (order > 0 || order === 0 && frame.phase === 'before' && phase === 'after') return this.session.invalid(origin, 'source-event', '/frame/sourceEventId', '不得读取未来来源事件。', 'invalid-range');
    return { ...frame, eventId: source.id, phase };
  }
  time(at: CalculationReadTime, frame: ReadFrame, origin: TraceOrigin, attribute: DefinitionRef, actorId: string): ReadFrame | EvaluatedValue {
    if (at.kind === 'current') {
      if (frame.phase === 'before' && at.phase === 'after') return this.session.invalid(origin, 'phase', '/frame/phase', '当前阶段不得读取事件之后的属性。', 'invalid-range');
      return { ...frame, phase: at.phase === 'same' ? frame.phase : at.phase };
    }
    if (at.kind === 'source-event') return this.sourceTime(frame, origin, at.phase);
    const slot = this.invocation.captures.find(candidate => candidate.id === at.slot), capture = own(frame.captures, at.slot);
    if (!slot || !slot.attributes.some(reference => definitionKey(reference) === definitionKey(attribute))) return this.session.invalid(origin, at.slot, '/invocation/captures', '属性未在捕获槽中声明。', 'missing-dependency');
    if (!capture) return this.missing(origin, at.slot, { kind: 'enum', values: [...this.events.keys()] }, 'capture');
    const event = this.events.get(capture.eventId), current = this.events.get(frame.eventId)!;
    if (!event || event.actorId !== actorId || event.skillId !== slot.sourceSkillId || !slot.allowedPhases.includes(capture.phase)) return this.session.invalid(origin, at.slot, '/frame/captures', '捕获事件、施放者、技能或阶段不符合声明。', 'stale-reference');
    const order = eventOrder(event, current);
    if (order === null) return this.missing(origin, 'captureOrder.' + at.slot, boolean, 'capture');
    if (order > 0 || order === 0 && capture.phase === 'after' && frame.phase === 'before') return this.session.invalid(origin, at.slot, '/frame/captures', '不得读取未来捕获。', 'invalid-range');
    return { ...frame, eventId: event.id, phase: capture.phase };
  }
  binding(binding: CalculationBinding, frame: ReadFrame, origin: TraceOrigin, depth: number): EvaluatedValue {
    const exhausted = this.session.enter(origin, binding.kind, depth);
    if (exhausted) return exhausted;
    if (binding.kind === 'constant') return this.session.known(origin, 'constant', binding.value);
    if (binding.kind === 'formula') return this.formula(binding.formula, binding.inputs, binding.output, frame, depth + 1, false).outputs[binding.output];
    if (binding.kind === 'actor-state') {
      const actorId = this.actor(binding.actor, frame, origin);
      return typeof actorId !== 'string' ? actorId : this.session.known(origin, binding.property, { kind: 'quantity', unit: 'count', value: this.actors.get(actorId)![binding.property] });
    }
    if (binding.kind === 'team-count') {
      let count = 0;
      const sources = new Set<string>();
      for (const actor of this.context.actors) {
        if (binding.excludeOwner && actor.id === frame.ownerId) continue;
        if (!actor.identity) return this.missing(origin, actor.id + '.element', { kind: 'enum', values: ['physical', 'anemo', 'geo', 'electro', 'hydro', 'pyro', 'cryo', 'dendro'] }, 'team-composition');
        actor.identity.sourceRefs.forEach(source => sources.add(source));
        if (binding.elements.includes(actor.identity.element) === (binding.match === 'include')) count++;
      }
      const value = this.session.known(origin, 'team-count', { kind: 'quantity', unit: 'count', value: count });
      const trace = this.session.trace.at(-1); if (trace?.id === value.traceId) trace.sourceRefs = [...new Set([...trace.sourceRefs, ...sources])];
      return value;
    }
    if (binding.kind === 'refinement-parameter') {
      const actor = this.actors.get(frame.ownerId)!;
      return this.session.known(origin, 'refinement', { kind: 'quantity', unit: binding.type.unit, value: binding.values[actor.refinement - 1] }, [], binding.type);
    }
    if (binding.kind === 'talent-parameter') {
      const actorId = this.actor(binding.actor, frame, origin);
      if (typeof actorId !== 'string') return actorId;
      const talent = this.actors.get(actorId)!.talents.find(candidate => candidate.id === binding.skillId);
      const parameter = talent?.parameters.find(candidate => candidate.id === binding.parameterId);
      const pointer = () => '/context/actors/' + this.context.actors.findIndex(actor => actor.id === actorId) + '/talents';
      if (!parameter) return this.session.invalid(origin, binding.parameterId, pointer(), '队员缺少绑定的技能参数：' + binding.skillId + '.' + binding.parameterId, 'missing-dependency');
      if (parameter.type && !valueTypeAssignable(parameter.type, binding.type)) return this.session.invalid(origin, binding.parameterId, pointer(), '队员参数与绑定的类型或单位不匹配。', 'unit-mismatch');
      const value = parameter?.values[talent!.level - 1];
      if (value == null || !parameter?.type) return this.missing(origin, binding.skillId + '.' + binding.parameterId, binding.type, actorId);
      return this.readFact(origin, binding.parameterId, binding.type, actorId, { value, provenance: 'derived', sourceRefs: talent!.sourceRefs });
    }
    if (binding.kind === 'fact') {
      if (binding.scope === 'source-event') {
        const source = this.sourceTime(frame, origin, frame.phase);
        if ('state' in source) return source;
        return this.readFact(origin, binding.key, binding.type, 'source-event', own(this.events.get(source.eventId)!.facts, binding.key));
      }
      const event = this.events.get(frame.eventId)!;
      const scope = binding.scope === 'owner' ? frame.ownerId : binding.scope === 'recipient' ? frame.recipientId
        : binding.scope === 'contributor' ? frame.contributorId : binding.scope;
      const fact = binding.scope === 'query' ? own(frame.facts, binding.key) ?? own(event.facts, binding.key)
        : binding.scope === 'target' ? this.scopedFact({ kind: 'target', id: frame.targetId }, binding.key, frame)
          : binding.scope === 'team' ? this.scopedFact({ kind: 'team' }, binding.key, frame) : scope ? this.scopedFact({ kind: 'actor', id: scope }, binding.key, frame) : undefined;
      return this.readFact(origin, binding.key, binding.type, scope ?? 'contributor', fact);
    }
    const actorId = binding.kind === 'enemy' ? frame.targetId : this.actor(binding.actor, frame, origin);
    if (typeof actorId !== 'string') return actorId;
    const at = this.time(binding.at, frame, origin, binding.key, actorId);
    if ('state' in at) return at;
    const excluded = binding.kind === 'attribute' && binding.excludeCurrentEffect && frame.instance
      ? new Set([...frame.excluded, frame.instance.id]) : frame.excluded;
    const value = this.attribute(binding.key, actorId, { ...at, excluded }, depth + 1);
    return binding.at.kind === 'capture' ? this.session.emit(origin, binding.at.slot, [value.traceId], value.state === 'known' ? value.value : null,
      value.state, value.state === 'known' ? [] : value.reasons, 'capture', { eventId: at.eventId, phase: at.phase, actorId, captureSlot: binding.at.slot }) : value;
  }
  formula(reference: DefinitionRef, bindings: Record<string, CalculationBinding>, output: string, frame: ReadFrame, depth: number, ports: boolean): FormulaEvaluation {
    const formula = this.data.formulas.get(definitionKey(reference))!, origin = formula;
    return interpretFormula(this.program, reference, {}, { outputs: [output] }, { session: this.session, depth, resolveInput: (key, spec, inputDepth) => {
      const port = ports ? Object.values(formula.definition.modifierPorts ?? {}).find(candidate => candidate.input === key) : undefined;
      if (port) {
        if (port.scope === 'contributor' && frame.contributorId === null) return this.missing(origin, 'contributor', { kind: 'enum', values: [...this.actors.keys()] }, 'actor');
        const portFrame = port.scope === 'contributor' ? { ...frame, recipientId: frame.contributorId! } : frame;
        const portId = Object.entries(formula.definition.modifierPorts!).find(([, candidate]) => candidate.input === key)![0];
        const contributions = this.contributions(portFrame, origin, inputDepth + 1, instance => instance.definition.target.kind === 'port'
          && definitionKey(instance.definition.target.formula) === definitionKey(reference) && instance.definition.target.port === portId);
        return this.combine(origin, key, this.session.known(origin, key + '.neutral', port.neutral), contributions, port.combine, spec.type);
      }
      const binding = own(bindings, key);
      return binding ? this.binding(binding, frame, origin, inputDepth + 1) : undefined;
    } });
  }
  attribute(reference: DefinitionRef, actorId: string, frame: ReadFrame, depth: number): EvaluatedValue {
    const definition = this.data.attributes.get(definitionKey(reference))!, origin = originOf(definition);
    const key = JSON.stringify([definitionKey(reference), actorId, frame.ownerId, frame.recipientId, frame.contributorId, frame.targetId, frame.eventId,
      frame.phase, frame.sourceEventId, frame.instance?.id, [...frame.excluded].sort()]);
    if (this.memo.has(key)) return this.memo.get(key)!;
    const exhausted = this.session.enter(origin, definition.identity.id, depth);
    if (exhausted) return exhausted;
    const external = frame.excluded.size ? undefined : this.attributeReader?.(actorId, reference, frame.eventId, frame.phase);
    if (external !== undefined) {
      const read = external === null ? this.missing(origin, reference.id, definition.type, 'project-attribute') : this.session.known(origin, reference.id, external, [], definition.type);
      const value = this.session.emit(origin, reference.id, [read.traceId], read.state === 'known' ? read.value : null, read.state,
        read.state === 'known' ? [] : read.reasons, 'attribute', { eventId: frame.eventId, phase: frame.phase, actorId });
      this.memo.set(key, value); return value;
    }
    if (this.active.has(key)) return this.session.invalid(origin, definition.identity.id, '/attributes', '属性与效果存在依赖循环；需要显式排除当前效果或修正规则。', 'cycle');
    this.active.add(key);
    const subject = definition.scope === 'target' ? this.targets.get(frame.targetId)! : definition.scope === 'team' ? this.context.team : this.actors.get(actorId)!;
    const baseFrame = definition.scope === 'target' || definition.scope === 'team' ? frame : { ...frame, ownerId: actorId, recipientId: actorId };
    const base = () => definition.base.kind === 'input' ? this.readFact(origin, definition.base.key, definition.type, definition.scope === 'team' ? 'team' : actorId,
      definition.scope === 'hit' ? own(frame.facts, definition.base.key) : own(subject.inputs, definition.base.key))
      : this.binding(definition.base, baseFrame, origin, depth + 1);
    const contributions = this.contributions({ ...frame, recipientId: definition.scope === 'target' ? frame.recipientId : actorId }, origin, depth + 1,
      instance => instance.definition.target.kind === 'attribute' && definitionKey(instance.definition.target.attribute) === definitionKey(reference));
    let value = this.combine(origin, definition.identity.id, base, contributions, definition.combine, definition.type);
    if (value.state === 'known' && value.value.kind === 'quantity' && definition.bounds) value = this.session.known(origin, definition.identity.id + '.bounds',
      { ...value.value, value: Math.min(definition.bounds.max ?? Infinity, Math.max(definition.bounds.min ?? -Infinity, value.value.value)) }, [value.traceId], definition.type);
    const result = this.session.emit(origin, definition.identity.id, [value.traceId], value.state === 'known' ? value.value : null, value.state,
      value.state === 'known' ? [] : value.reasons, 'attribute', { eventId: frame.eventId, phase: frame.phase, actorId });
    this.active.delete(key); this.memo.set(key, result);
    return result;
  }
  contributions(frame: ReadFrame, origin: TraceOrigin, depth: number, matches: (instance: EffectInstance) => boolean): Contribution[] {
    const groups = new Map<string, Contribution[]>();
    for (const instance of this.instances) {
      const exhausted = this.session.enter(origin, 'effect-selection', depth);
      if (exhausted) return [{ instance, value: exhausted }];
      if (frame.excluded.has(instance.id) || !matches(instance)) continue;
      const revision = this.context.effectRevisions?.find(revision => revision.instanceId === instance.id);
      if (revision?.disabled) continue;
      const effect = instance.definition, recipient = effect.recipient;
      const recipientActor = recipient.role === 'fact-actor' ? firstOwn(instance.owner.actorFacts, frame.actorFacts, recipient.input) : undefined;
      const recipientMatches: boolean | null = recipient.role === 'owner' ? instance.owner.id === frame.recipientId
        : recipient.role === 'target' ? true : recipient.role === 'team' ? !recipient.excludeOwner || instance.owner.id !== frame.recipientId
          : recipientActor == null ? null : recipientActor === frame.recipientId;
      const hit = hitMatches(effect.appliesTo, frame.hit), active = instanceActive(instance, this.events.get(frame.eventId)!, frame.phase);
      const application = frame.applications.find(candidate => candidate.instanceId === instance.id);
      if (recipientMatches === false || hit === false || active === false || application?.active === false) continue;
      const effectFrame: ReadFrame = { ...frame, ownerId: instance.owner.id, sourceEventId: instance.source?.id ?? null, instance,
        actorFacts: { ...frame.actorFacts, ...instance.owner.actorFacts } };
      const effectOrigin = originOf(effect, '/effects' + calculationJsonPointer([definitionKey(effect.identity)]));
      const predicate = effect.predicate ? this.binding(effect.predicate, effectFrame, effectOrigin, depth + 1) : undefined;
      if (predicate?.state === 'known' && predicate.value.kind === 'boolean' && !predicate.value.value) continue;
      let value: EvaluatedValue;
      if (predicate && predicate.state !== 'known') value = predicate;
      else if (recipientMatches === null || hit === null || active === null || effect.application === 'explicit' && application?.active !== true) {
        value = this.missing(effectOrigin, instance.id, boolean, 'effect-applicability');
      } else if (revision?.value) {
        const type = effect.target.kind === 'attribute' ? this.data.attributes.get(definitionKey(effect.target.attribute))!.type
          : this.data.formulas.get(definitionKey(effect.target.formula))!.definition.modifierPorts![effect.target.port].type;
        value = this.session.known(effectOrigin, 'revision', revision.value, [], type);
      } else value = this.binding(effect.value, effectFrame, effectOrigin, depth + 1);
      value = this.session.emit(effectOrigin, effect.identity.id, [value.traceId, ...predicate ? [predicate.traceId] : []], value.state === 'known' ? value.value : null,
        value.state, value.state === 'known' ? [] : value.reasons, 'effect', { eventId: frame.eventId, phase: frame.phase, actorId: instance.owner.id, effectInstanceId: instance.id });
      const scope = effect.stacking.scope === 'owner' ? instance.owner.id : effect.stacking.scope === 'recipient' ? frame.recipientId : 'team';
      const key = JSON.stringify([effect.stacking.group, scope]);
      const group = groups.get(key) ?? []; group.push({ instance, value }); groups.set(key, group);
    }
    return [...groups.values()].flatMap(group => this.stack(group, origin));
  }
  stack(group: Contribution[], origin: TraceOrigin): Contribution[] {
    const { stacking } = group[0].instance.definition;
    if (group.some(contribution => contribution.value.state !== 'known')) return group;
    if (group.length > stacking.maxStacks) {
      const compare = (a: Contribution, b: Contribution): number | null => {
        if (stacking.retain === 'highest-priority') return a.instance.definition.priority === b.instance.definition.priority ? null : b.instance.definition.priority - a.instance.definition.priority;
        if (!a.instance.source || !b.instance.source) return a.instance.source ? 1 : b.instance.source ? -1 : null;
        const order = eventOrder(a.instance.source, b.instance.source);
        return order === null ? null : stacking.retain === 'earliest' ? order : -order;
      };
      if (group.some((a, i) => group.slice(i + 1).some(b => compare(a, b) === null))) return [{ instance: group[0].instance,
        value: this.missing(origin, stacking.group, boolean, 'stacking-order') }];
      group = [...group].sort((a, b) => compare(a, b)!).slice(0, stacking.maxStacks);
    }
    if (stacking.policy === 'max') {
      const values = group.map(item => item.value).filter((value): value is Extract<EvaluatedValue, { state: 'known' }> => value.state === 'known');
      const largest = Math.max(...values.map(value => value.value.kind === 'quantity' ? value.value.value : NaN));
      const first = group[0];
      return [{ instance: first.instance, value: this.session.known(origin, stacking.group, { ...(values[0].value as Extract<Value, { kind: 'quantity' }>), value: largest }, values.map(value => value.traceId)) }];
    }
    return group;
  }
  combine(origin: TraceOrigin, id: string, baseInput: EvaluatedValue | (() => EvaluatedValue), contributions: Contribution[], policy: AttributeDefinition['combine'], type: ValueType): EvaluatedValue {
    const values = contributions.map(contribution => contribution.value);
    if (policy === 'replace' && contributions.length) {
      const priority = Math.max(...contributions.map(contribution => contribution.instance.definition.priority));
      const selected = contributions.filter(contribution => contribution.instance.definition.priority === priority);
      if (selected.length > 1) return this.missing(origin, id, type, 'replacement-priority');
      return selected[0].value;
    }
    const base = typeof baseInput === 'function' ? baseInput() : baseInput;
    const inherited = this.session.inherit(origin, id, [base, ...values]);
    if (inherited) return inherited;
    if (!contributions.length) return base;
    const known = [base, ...values] as Extract<EvaluatedValue, { state: 'known' }>[];
    if (known.some(value => value.value.kind !== 'quantity')) return this.session.invalid(origin, id, origin.pointer, '数值合并要求数量。', 'unit-mismatch');
    const numeric = known.map(value => (value.value as Extract<Value, { kind: 'quantity' }>).value);
    const value = policy === 'sum' ? numeric.reduce((a, b) => a + b, 0) : policy === 'product' ? numeric.reduce((a, b) => a * b, 1) : Math.max(...numeric);
    return this.session.known(origin, id, { ...(known[0].value as Extract<Value, { kind: 'quantity' }>), value }, known.map(value => value.traceId), type);
  }
}

function validateRuntimeFrame(evaluator: BoundEvaluator, frame: CombatFrame): string | null {
  if (frame.factOverrides.some(override => override.subject.kind !== 'team' && !(override.subject.kind === 'actor' ? evaluator.actors : evaluator.targets).has(override.subject.id))) return '状态覆盖引用已失效。';
  if (evaluator.context.effectRevisions?.some(revision => !evaluator.instances.some(instance => instance.id === revision.instanceId))) return '效果修订引用已失效。';
  for (const application of frame.applications) {
    const instance = evaluator.instances.find(instance => instance.id === application.instanceId);
    if (!instance) return '效果适用事实引用已失效。';
    const effect = instance.definition, recipient = effect.recipient;
    if (effect.application !== 'explicit' || hitMatches(effect.appliesTo, frame.hit) === false
      || recipient.role === 'owner' && instance.owner.id !== frame.recipientId
      || recipient.role === 'team' && recipient.excludeOwner && instance.owner.id === frame.recipientId
      || recipient.role === 'fact-actor' && firstOwn(instance.owner.actorFacts, frame.actorFacts, recipient.input) != null
        && firstOwn(instance.owner.actorFacts, frame.actorFacts, recipient.input) !== frame.recipientId
      || instance.source && eventOrder(instance.source, evaluator.events.get(frame.eventId)!) === null
      || instanceActive(instance, evaluator.events.get(frame.eventId)!, frame.phase) === false) return '效果适用事实的对象、命中类型、顺序或时效不符合声明。';
  }
  return null;
}

export function evaluateBoundFormula(program: CompiledCalculation, contextInput: unknown, invocationInput: unknown, frameInput: unknown,
  options: Pick<FormulaEvaluationOptions, 'limits'> = {}): FormulaEvaluation {
  return interpretBoundFormula(program, contextInput, invocationInput, frameInput, options);
}

/** Panel reads use the same binding evaluator, without selecting a damage output or inventing a cast. */
export function evaluateCombatBindings(program: CompiledCalculation, contextInput: unknown, bindingsInput: Record<string, CalculationBinding>, frameInput: unknown,
  options: Pick<FormulaEvaluationOptions, 'limits'> = {}): FormulaEvaluation {
  const reference: DefinitionRef = { namespace: 'builtin', id: 'runtime.attribute-read', revision: '1' }, session = new CalculationSession(reference);
  const fail = (message: string): FormulaEvaluation => session.finish({ invalid: session.invalid(undefined, 'attributes', '/context', message, 'invalid-range') });
  if ([contextInput, bindingsInput, frameInput].some(value => inspectCalculationStructure(value).length)) return fail('属性读取结构无效。');
  const data = compiledData(program), context = combatContextSchema.safeParse(contextInput), frame = combatFrameSchema.safeParse(frameInput);
  if (!data || !context.success || !frame.success) return fail('属性读取上下文无效。');
  const validation = validateContextDefinitions(data, context.data);
  if (validation.diagnostics.length) return fail(validation.diagnostics.map(diagnostic => diagnostic.message).join('；'));
  for (const key of ['visits', 'depth', 'trace'] as const) if (options.limits?.[key] !== undefined) {
    const limit = options.limits[key]!;
    if (!Number.isSafeInteger(limit) || limit < (key === 'trace' ? 2 : 1) || limit > session.limits[key]) return fail('属性读取预算无效。');
    session.limits[key] = limit;
  }
  const bindings: Record<string, CalculationBinding> = {};
  for (const [key, input] of Object.entries(bindingsInput)) {
    const parsed = calculationBindingSchema.safeParse(input);
    if (!parsed.success) return fail('属性绑定格式无效。');
    bindings[key] = parsed.data;
    validateBinding(data, parsed.data, '/bindings' + calculationJsonPointer([key]), (code, path, message) => session.report(code, path, message));
  }
  const current = frame.data;
  if (![current.ownerId, current.recipientId, ...current.contributorId ? [current.contributorId] : []].every(id => context.data.actors.some(actor => actor.id === id))
    || !context.data.events.some(event => event.id === current.eventId) || !context.data.targets.some(target => target.id === current.targetId)) return fail('属性读取引用已失效。');
  if (!factsHaveSources([...Object.values(current.facts), ...current.factOverrides.flatMap(override => Object.values(override.facts))], validation.sources)) return fail('属性读取事实缺少来源。');
  if (session.diagnostics.length) return fail('属性绑定依赖无效。');
  const evaluator = new BoundEvaluator(program, data, context.data, { formula: reference, bindings: {}, output: 'attributes', captures: [] }, session, current);
  const frameIssue = validateRuntimeFrame(evaluator, current);
  if (frameIssue) return fail(frameIssue);
  const origin = originOf({ identity: reference, sources: [] });
  return session.finish(Object.fromEntries(Object.entries(bindings).map(([key, binding]) => [key, evaluator.binding(binding, { ...current, excluded: new Set(), instance: null }, origin, 0)])));
}

/** Query orchestration may reuse its owned, already validated context without reparsing it per output. */
export function interpretBoundFormula(program: CompiledCalculation, contextInput: unknown, invocationInput: unknown, frameInput: unknown,
  options: Pick<FormulaEvaluationOptions, 'limits'> & { outputs?: readonly string[]; readBindings?: Record<string, CalculationBinding>; attributeReader?: BoundAttributeReader } = {},
  prepared?: { context: CombatContext; validation: ReturnType<typeof validateContextDefinitions> }): FormulaEvaluation {
  const parsedInvocation = inspectCalculationStructure(invocationInput).length ? null : boundFormulaSchema.safeParse(invocationInput);
  const reference = parsedInvocation?.success ? parsedInvocation.data.formula : { namespace: 'builtin', id: 'invalid', revision: '1' };
  const session = new CalculationSession(reference), data = compiledData(program);
  const invalid = (message: string, diagnostics: CalculationDiagnostic[] = []): FormulaEvaluation => {
    diagnostics.forEach(diagnostic => session.report(diagnostic.code, diagnostic.jsonPointer, diagnostic.message, diagnostic.nodeId, diagnostic.eventId));
    session.report('invalid-range', '/context', message, 'context');
    return session.finish({ invalid: session.emit(undefined, 'context', [], null, 'invalid', session.diagnostics.map((_, index) => `diagnostic-${index + 1}`)) });
  };
  const structure = [...prepared ? [] : [contextInput], frameInput, invocationInput, ...options.readBindings ? [options.readBindings] : []].flatMap(input => inspectCalculationStructure(input));
  if (structure.length) return invalid('战斗上下文结构无效。', structure);
  const parsedContext = prepared ? { success: true as const, data: prepared.context } : combatContextSchema.safeParse(contextInput), parsedFrame = combatFrameSchema.safeParse(frameInput);
  if (!data || !parsedInvocation?.success || !parsedContext.success || !parsedFrame.success) {
    const details: CalculationDiagnostic[] = [];
    for (const [prefix, parsed] of [['context', parsedContext], ['frame', parsedFrame], ['invocation', parsedInvocation]] as const) {
      if (parsed && !parsed.success) for (const issue of parsed.error.issues) details.push({ code: 'invalid-range', severity: 'error', affectedOutputIds: [],
        jsonPointer: '/' + prefix + calculationJsonPointer(issue.path), message: issue.message });
    }
    return invalid('战斗上下文、请求或编译程序无效。', details);
  }
  const context = parsedContext.data, invocation = parsedInvocation.data, frame = parsedFrame.data;
  const contextValidation = prepared?.validation ?? validateContextDefinitions(data, context);
  if (contextValidation.diagnostics.length) return invalid('上下文依赖无效。', contextValidation.diagnostics);
  for (const name of ['visits', 'depth', 'trace'] as const) {
    const requested = options.limits?.[name];
    if (requested !== undefined) {
      if (!Number.isSafeInteger(requested) || requested < (name === 'trace' ? 2 : 1) || requested > session.limits[name]) return invalid('执行预算无效。');
      session.limits[name] = requested;
    }
  }
  validateBoundFormula(data, invocation, (code, pointer, message) => session.report(code, pointer, message));
  for (const output of options.outputs ?? []) validateBoundFormula(data, { ...invocation, output }, (code, pointer, message) => session.report(code, pointer, message));
  for (const [key, binding] of Object.entries(options.readBindings ?? {})) validateBinding(data, binding, '/bindings' + calculationJsonPointer([key]), (code, pointer, message) => session.report(code, pointer, message));
  if (!data.features.includes('combat-binding-v1')) session.report('unsupported-feature', '/requiredFeatures', '计算闭包未声明上下文绑定能力。');
  if (frame.hit && !data.damageFamilies.includes(frame.hit.family)) session.report('missing-dependency', '/frame/hit/family', '读取帧引用了未声明的伤害族。');
  const actors = new Set(context.actors.map(actor => actor.id)), events = new Set(context.events.map(event => event.id));
  if (![frame.ownerId, frame.recipientId, ...frame.contributorId ? [frame.contributorId] : []].every(id => actors.has(id))
    || !context.targets.some(target => target.id === frame.targetId) || !events.has(frame.eventId) || frame.sourceEventId !== null && !events.has(frame.sourceEventId)
    || Object.values(frame.actorFacts).some(id => id !== null && !actors.has(id))) return invalid('战斗读取帧引用已失效。');
  if (!factsHaveSources([...Object.values(frame.facts), ...frame.factOverrides.flatMap(override => Object.values(override.facts))], contextValidation.sources)) return invalid('读取帧事实缺少来源记录。');
  if (session.diagnostics.length) return invalid('公式绑定无效。');
  const evaluator = new BoundEvaluator(program, data, context, invocation, session, frame, options.attributeReader);
  const frameIssue = validateRuntimeFrame(evaluator, frame);
  if (frameIssue) return invalid(frameIssue);
  const initialReadFrame: ReadFrame = { ...frame, excluded: new Set(), instance: null };
  if (context.actors.filter(actor => {
    const value = evaluator.scopedFact({ kind: 'actor', id: actor.id }, 'onField', initialReadFrame)?.value;
    return value?.kind === 'boolean' && value.value;
  }).length > 1) return invalid('状态区间与命中覆盖合并后有多位队员站场。');
  if (invocation.predicate) {
    const origin = originOf(data.formulas.get(definitionKey(invocation.formula))!.definition, '/invocation/predicate');
    const active = evaluator.binding(invocation.predicate, initialReadFrame, origin, 0);
    if (active.state !== 'known') return session.finish({ [invocation.output]: active });
    if (active.value.kind !== 'boolean') return invalid('输出条件必须为布尔值。');
    if (!active.value.value) return session.finish({ [invocation.output]: session.invalid(origin, 'predicate', '/invocation/predicate', '当前条件下不能执行此输出。', 'conflicting-definition', [active.traceId]) });
  }
  if (options.readBindings) {
    const origin = originOf(data.formulas.get(definitionKey(invocation.formula))!.definition);
    return session.finish(Object.fromEntries(Object.entries(options.readBindings).map(([key, binding]) => [key, evaluator.binding(binding, initialReadFrame, origin, 0)])));
  }
  const outputs: FormulaEvaluation['outputs'] = Object.create(null) as FormulaEvaluation['outputs'];
  const stages: FormulaEvaluation['stages'] = [];
  for (const output of new Set(options.outputs ?? [invocation.output])) {
    const result = evaluator.formula(invocation.formula, invocation.bindings, output, initialReadFrame, 0, true);
    Object.assign(outputs, result.outputs); stages.push(...result.stages);
  }
  return session.finish(outputs, stages);
}
