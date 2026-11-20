import { calculationJsonPointer, combatContextSchema, definitionKey, inspectCalculationStructure, stateMachineRequestSchema, valueMatchesType,
  type CalculationDiagnosticCode, type CalculationFactFrame, type CombatFrame, type EvaluatedValue,
  type FormulaEvaluation, type RequiredInput, type StateValueSource, type StateVariable, type Value } from '@leyline/schema';
import { calculationBudgets, compiledData, type CompiledCalculation } from './compile';
import { interpretBoundFormula } from './context';
import { validateContextDefinitions } from './context-validation';
import { eventMatches } from './effects';
import { CalculationSession } from './session';

export interface StateMachineEvaluation extends FormulaEvaluation { stateFrames: CalculationFactFrame[] }
interface State {
  value: EvaluatedValue;
  expiresAt: number | null;
  expiries: (number | null)[] | null;
  uncertainSince: number | null;
  certainEnd: number | null;
}
const equal = (a: Value, b: Value) => a.kind === b.kind && a.value === b.value && (a.kind !== 'quantity' || b.kind === 'quantity' && a.unit === b.unit);

/** Consume explicit events once. Timers, individual stack expiry and phase snapshots are owned by this run. */
export function evaluateStateMachine(program: CompiledCalculation, contextInput: unknown, input: unknown,
  options: { limits?: { visits?: number; depth?: number; trace?: number } } = {}): StateMachineEvaluation {
  const structure = [contextInput, input].flatMap(value => inspectCalculationStructure(value));
  const parsed = stateMachineRequestSchema.safeParse(structure.length ? undefined : input), parsedContext = combatContextSchema.safeParse(structure.length ? undefined : contextInput);
  const session = new CalculationSession(parsed.success ? parsed.data.definition : { namespace: 'builtin', id: 'runtime.invalid-state', revision: '1' });
  const outputs: FormulaEvaluation['outputs'] = Object.create(null) as FormulaEvaluation['outputs'], stateFrames: CalculationFactFrame[] = [];
  const externalRequired: { input: RequiredInput; reasons: Set<string> }[] = [];
  const finish = (): StateMachineEvaluation => {
    const result = session.finish(outputs);
    return { ...result, stateFrames, requiredInputs: [...result.requiredInputs, ...externalRequired.map(({ input, reasons }) => ({ ...input,
      requiredBy: Object.entries(outputs).flatMap(([key, value]) => value.state !== 'known' && value.reasons.some(reason => reasons.has(reason)) ? [key] : []) }))] };
  };
  const invalid = (code: CalculationDiagnosticCode, pointer: string, message: string): StateMachineEvaluation => {
    outputs.invalid = session.invalid(undefined, 'invalid', pointer, message, code); return finish();
  };
  if (structure.length) return invalid(structure[0].code, structure[0].jsonPointer, structure[0].message);
  if (!parsed.success || !parsedContext.success) {
    const error = !parsed.success ? parsed.error : !parsedContext.success ? parsedContext.error : null;
    return invalid('invalid-range', calculationJsonPointer(error!.issues[0].path), error!.issues[0].message);
  }
  const request = parsed.data, context = parsedContext.data, data = compiledData(program), machine = data?.stateMachines.get(definitionKey(request.definition));
  if (!data || !machine) return invalid('missing-dependency', '/definition', '状态机的精确版本不可用。');
  if (!data.features.includes('event-state-v1')) return invalid('unsupported-feature', '/requiredFeatures', '运行闭包未声明事件状态能力。');
  const owner = context.actors.find(actor => actor.id === request.ownerId);
  if (!owner || !context.targets.some(target => target.id === request.targetId)) return invalid('stale-reference', '/ownerId', '状态机队员或目标引用已失效。');
  const { ascension, constellation } = owner;
  if (ascension === null || constellation === null) return invalid('missing-dependency', '/ownerId', '动作状态需要队员的突破和命座。');
  const validation = validateContextDefinitions(data, context);
  if (validation.diagnostics.length) return invalid(validation.diagnostics[0].code, validation.diagnostics[0].jsonPointer, validation.diagnostics[0].message);
  for (const key of ['visits', 'depth', 'trace'] as const) {
    const limit = options.limits?.[key];
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < (key === 'trace' ? 3 : 1) || limit > calculationBudgets[key])) return invalid('invalid-range', '/limits/' + key, '状态计算预算无效。');
    if (limit !== undefined) session.limits[key] = limit;
  }
  const origin = { definition: machine, pointer: '/definition' }, states = new Map<string, State>();
  const definitions = new Map(machine.states.map(state => [state.key, state]));
  if (Object.keys(request.initial).some(key => !definitions.has(key))) return invalid('invalid-range', '/initial', '初始状态包含未声明字段。');
  for (const definition of machine.states) {
    const initial = request.initial[definition.key], value = initial?.value;
    if (definition.kind !== 'stacked' && initial?.stackExpiries !== undefined || definition.kind === 'stacked' && initial?.expiresAtMs != null) return invalid('invalid-range', '/initial' + calculationJsonPointer([definition.key]), '普通状态使用单一过期时刻；独立层数使用逐层过期记录。');
    if (value != null && (!valueMatchesType(value, definition.type) || value.kind === 'quantity' && definition.capacity !== null && (value.value > definition.capacity || value.value < 0))) return invalid('invalid-range', '/initial' + calculationJsonPointer([definition.key]), '初始状态类型或上限不符。');
    const inactive = value != null && equal(value, definition.inactiveValue);
    const expiries = definition.kind === 'stacked' ? initial?.stackExpiries ?? (value?.kind === 'quantity' && value.value === 0 ? [] : null) : null;
    if (definition.kind === 'stacked' && expiries && (value?.kind !== 'quantity' || expiries.length !== value.value || expiries.some(expiry => expiry !== null && expiry <= request.startMs))) return invalid('invalid-range', '/initial' + calculationJsonPointer([definition.key]), '初始层数与独立过期记录不符。');
    if (!inactive && value != null && initial?.expiresAtMs !== null && initial?.expiresAtMs !== undefined && initial.expiresAtMs <= request.startMs) return invalid('invalid-range', '/initial' + calculationJsonPointer([definition.key]), '初始有效状态不能已经过期。');
    const evaluated = value == null ? session.missing(origin, definition.key, definition.type, 'initial-state', '/initial' + calculationJsonPointer([definition.key])) : session.known(origin, definition.key, value);
    states.set(definition.key, { value: evaluated, expiresAt: initial?.expiresAtMs ?? null, expiries,
      uncertainSince: definition.duration && !inactive && (definition.kind === 'stacked' ? !expiries || expiries.includes(null) : initial?.expiresAtMs == null) ? request.startMs : null,
      certainEnd: null });
    outputs['initial:' + definition.key] = evaluated;
  }
  const ordered = [...context.events].sort((a, b) => a.timeMs - b.timeMs || a.order - b.order), seen = new Set<string>();
  const ambiguous = ordered.some(event => { const key = `${event.timeMs}:${event.order}`, duplicate = seen.has(key); seen.add(key); return duplicate; });
  const existing = new Set((context.stateFrames ?? []).flatMap(entry => Object.keys(entry.facts).map(key => JSON.stringify([entry.subject, entry.eventId, entry.phase, key]))));
  let calls = 0;
  const frameAt = (event: typeof ordered[number], phase: CombatFrame['phase']): CombatFrame => ({ ownerId: owner.id, recipientId: owner.id, contributorId: null,
    targetId: request.targetId, eventId: event.id, sourceEventId: event.sourceEventIds.length === 1 ? event.sourceEventIds[0] : null, phase, facts: {}, actorFacts: {}, captures: {}, applications: [], hit: null,
    factOverrides: [{ subject: { kind: 'actor', id: owner.id }, facts: Object.fromEntries([...states].map(([key, state]) => [key, { value: state.value.state === 'known' ? state.value.value : null, provenance: 'derived' as const, sourceRefs: machine.sources }])) }] });
  const readValue = (source: StateValueSource, event: typeof ordered[number], phase: CombatFrame['phase'], key: string): EvaluatedValue => {
    const exhausted = session.enter(origin, key, 1); if (exhausted) return exhausted;
    if (source.kind === 'literal') return session.known(origin, key, source.value);
    if (source.kind === 'input') {
      const fact = source.scope === 'event' ? event.facts[source.key] : owner.facts[source.key];
      if (fact?.value == null) return session.missing(origin, source.key, source.type, source.scope, '/context' + calculationJsonPointer([source.scope, source.key]));
      return valueMatchesType(fact.value, source.type) ? session.known(origin, source.key, fact.value) : session.invalid(origin, key, '/context', '状态输入单位不符。', 'unit-mismatch');
    }
    const visits = session.limits.visits - session.visits, trace = session.limits.trace - session.trace.length - 1;
    if (visits < 1 || trace < 2) return session.budget(origin, key, '状态公式达到共享预算。', trace < 2);
    const result = interpretBoundFormula(program, context, source.invocation, frameAt(event, phase), { limits: { visits, trace, depth: session.limits.depth } }, { context, validation });
    const prefix = `state-binding-${++calls}:`, reasons = new Map(result.diagnostics.map((diagnostic, index) => [`diagnostic-${index + 1}`, session.report(diagnostic.code, diagnostic.jsonPointer, diagnostic.message, diagnostic.nodeId, event.id)]));
    session.visits += result.work.visits;
    session.trace.push(...result.trace.map(node => ({ ...node, id: prefix + node.id, dependencies: node.dependencies.map(id => prefix + id) })));
    const raw = result.outputs[source.invocation.output] ?? result.outputs.invalid;
    const value: EvaluatedValue = raw.state === 'known' ? { ...raw, traceId: prefix + raw.traceId } : { ...raw, traceId: prefix + raw.traceId, reasons: raw.reasons.map(reason => reasons.get(reason)!) };
    for (const input of result.requiredInputs) externalRequired.push({ input: { ...input, scope: prefix + input.scope }, reasons: new Set(value.state === 'known' ? [] : value.reasons) });
    return value;
  };
  const read = (source: StateValueSource, event: typeof ordered[number], phase: CombatFrame['phase'], key: string): EvaluatedValue => {
    const value = readValue(source, event, phase, key);
    if (value.state === 'invalid') outputs.invalid = value;
    return value;
  };
  const forget = (definition: StateVariable, event: typeof ordered[number], reason: string) => {
    const state = states.get(definition.key)!;
    state.value = session.missing(origin, definition.key + '.' + reason, definition.type, 'state-transition:' + event.id, '/context/events');
    state.expiries = null; state.expiresAt = null; state.uncertainSince = null; state.certainEnd = null;
  };
  const reset = (definition: StateVariable, event: typeof ordered[number], reason: string) => {
    const state = states.get(definition.key)!;
    state.value = session.known(origin, definition.key + '.' + reason, definition.inactiveValue, [state.value.traceId]);
    state.expiries = definition.kind === 'stacked' ? [] : null; state.expiresAt = null; state.uncertainSince = null; state.certainEnd = null;
    for (const update of definition.expireUpdates) {
      const target = definitions.get(update.state)!, current = states.get(update.state)!;
      current.value = session.known(origin, update.state + '.expired-source', target.inactiveValue, [state.value.traceId]);
      current.expiries = target.kind === 'stacked' ? [] : null; current.expiresAt = null; current.uncertainSince = null; current.certainEnd = null;
    }
  };
  const expire = (event: typeof ordered[number]) => {
    for (const definition of machine.states) {
      if (session.enter(origin, 'expiry', 1)) return;
      const state = states.get(definition.key)!;
      if (state.certainEnd !== null && event.timeMs >= state.certainEnd || state.expiresAt !== null && event.timeMs >= state.expiresAt) { reset(definition, event, 'expired'); continue; }
      if (state.uncertainSince !== null && event.timeMs > state.uncertainSince) state.value = session.missing(origin, definition.key + '.expiry', definition.type, 'state-time', '/initial' + calculationJsonPointer([definition.key]));
      if (definition.kind === 'stacked' && state.expiries) {
        const active = state.expiries.filter(expiry => expiry === null || expiry > event.timeMs);
        if (active.length !== state.expiries.length && !active.includes(null)) state.value = session.known(origin, definition.key + '.expired-stacks', { kind: 'quantity', unit: 'count', value: active.length }, [state.value.traceId]);
        state.expiries = active;
      }
    }
  };
  const snapshot = (event: typeof ordered[number], phase: CombatFrame['phase'], unavailable?: EvaluatedValue) => {
    const facts: CalculationFactFrame['facts'] = {};
    for (const definition of machine.states) {
      if (session.enter(origin, 'state-frame', 1)) return;
      if (existing.has(JSON.stringify([{ kind: 'actor', id: owner.id }, event.id, phase, definition.key]))) {
        outputs.invalid = session.invalid(origin, definition.key, '/context/stateFrames', '已有同一事件阶段的状态，不能静默覆盖。', 'conflicting-definition'); return;
      }
      const current = unavailable ?? states.get(definition.key)!.value;
      const value = session.emit(origin, definition.key, [current.traceId], current.state === 'known' ? current.value : null, current.state,
        current.state === 'known' ? [] : current.reasons, 'state', { eventId: event.id, phase, actorId: owner.id });
      outputs[JSON.stringify([event.id, phase, definition.key])] = value;
      facts[definition.key] = { value: value.state === 'known' ? value.value : null, provenance: 'derived', sourceRefs: machine.sources };
    }
    stateFrames.push({ id: request.id + '.' + stateFrames.length, subject: { kind: 'actor', id: owner.id }, eventId: event.id, phase, facts });
  };
  for (const event of ordered) {
    if (session.budgetValue || outputs.invalid) break;
    if (event.timeMs < request.startMs || ambiguous) {
      const unknown = session.missing(origin, ambiguous ? 'eventOrder' : 'historyBeforeInitialState', { kind: 'quantity', unit: 'count' }, 'state-history', '/context/events');
      snapshot(event, 'before', unknown); snapshot(event, 'after', unknown); continue;
    }
    expire(event);
    let legal: EvaluatedValue | undefined;
    for (const requirement of machine.requirements) {
      if (session.enter(origin, requirement.id, 1)) break;
      const matches = eventMatches(requirement.selector, event, owner.id, request.targetId);
      if (matches === false) continue;
      const condition = matches === null ? session.missing(origin, requirement.id + '.event', { kind: 'boolean' }, 'event', '/context/events') : read({ kind: 'formula', invocation: requirement.predicate }, event, 'before', requirement.id);
      if (condition.state !== 'known') legal = condition;
      else if (condition.value.kind !== 'boolean' || !condition.value.value) { outputs.invalid = session.invalid(origin, requirement.id, '/context/events', '明确动作与当前状态或资源条件冲突。', 'conflicting-definition', [condition.traceId]); break; }
    }
    if (outputs.invalid) break;
    for (const phase of ['before', 'after'] as const) {
      const transitions = machine.transitions.filter(transition => transition.phase === phase).sort((a, b) => a.priority - b.priority);
      for (const transition of transitions) {
        if (session.enter(origin, transition.id, 1)) break;
        if (transition.activation.ascension !== undefined && ascension < transition.activation.ascension || transition.activation.constellation !== undefined && constellation < transition.activation.constellation) continue;
        const matches = eventMatches(transition.selector, event, owner.id, request.targetId);
        if (matches === false) continue;
        const predicate = legal ?? (matches === null ? session.missing(origin, transition.id + '.event', { kind: 'boolean' }, 'event', '/context/events')
          : transition.predicate ? read({ kind: 'formula', invocation: transition.predicate }, event, phase, transition.id) : undefined);
        if (predicate?.state === 'known' && (predicate.value.kind !== 'boolean' || !predicate.value.value)) continue;
        for (const update of transition.updates) {
          if (session.enter(origin, update.state, 1)) break;
          const definition = definitions.get(update.state)!, state = states.get(update.state)!;
          if (predicate && predicate.state !== 'known') { state.value = predicate; state.expiries = null; state.expiresAt = null; state.uncertainSince = null; state.certainEnd = null; continue; }
          if (update.operation === 'clear') { reset(definition, event, 'clear'); continue; }
          if (update.operation === 'unknown') { forget(definition, event, 'unverified-transition'); continue; }
          const amount = read(update.value!, event, phase, update.state);
          if (amount.state !== 'known') { state.value = amount; state.expiries = null; state.expiresAt = null; state.uncertainSince = null; state.certainEnd = null; continue; }
          if (!valueMatchesType(amount.value, definition.type)) { outputs.invalid = session.invalid(origin, update.state, '/definition', '状态更新单位不符。', 'unit-mismatch'); break; }
          let next: Value = amount.value;
          const dependencies = [amount.traceId];
          if (update.operation !== 'set') {
            const inherited = session.inherit(origin, update.state, [state.value, amount]);
            if (inherited) { state.value = inherited; state.expiries = null; state.expiresAt = null; state.uncertainSince = null; state.certainEnd = null; continue; }
            const previous = state.value as Extract<EvaluatedValue, { state: 'known' }>;
            if (previous.value.kind !== 'quantity' || amount.value.kind !== 'quantity' || amount.value.value < 0) { outputs.invalid = session.invalid(origin, update.state, '/definition', '状态增减必须为非负数量。', 'unit-mismatch'); break; }
            next = { ...previous.value, value: previous.value.value + (update.operation === 'consume' ? -amount.value.value : amount.value.value) };
            dependencies.push(previous.traceId);
            if (next.value < 0) { outputs.invalid = session.invalid(origin, update.state, '/context/events', '资源不足，不能继续消耗。', 'invalid-range'); break; }
          }
          if (definition.kind === 'stacked') {
            const duration = read(definition.duration!, event, phase, definition.key + '.duration');
            if (duration.state !== 'known') { state.value = duration; state.expiries = null; state.expiresAt = null; state.uncertainSince = null; state.certainEnd = null; continue; }
            if (duration.value.kind !== 'quantity' || duration.value.unit !== 'milliseconds' || duration.value.value <= 0 || !Number.isSafeInteger(event.timeMs + duration.value.value)) { outputs.invalid = session.invalid(origin, update.state, '/definition', '独立层数时效非法。', 'invalid-range'); break; }
            const increment = amount.value.kind === 'quantity' ? amount.value.value : NaN;
            if (!Number.isSafeInteger(increment) || increment > calculationBudgets.visits) { outputs.invalid = session.invalid(origin, update.state, '/definition', '独立层数更新超出预算。', 'budget'); break; }
            const fresh: number[] = [];
            for (let index = 0; index < increment; index++) { if (session.enter(origin, update.state + '.stack', 1)) break; fresh.push(event.timeMs + duration.value.value); }
            const expiries = [...update.operation === 'set' ? [] : state.expiries ?? [], ...fresh];
            if (update.operation !== 'set' && state.expiries === null) { state.value = session.missing(origin, definition.key + '.expiry', definition.type, 'state-time', '/initial'); continue; }
            if (expiries.length > definition.capacity! && definition.overflow === 'unknown') {
              state.expiries = null; state.uncertainSince = event.timeMs;
              state.certainEnd = expiries.includes(null) ? null : Math.max(event.timeMs + duration.value.value, ...expiries as number[]);
            } else { state.expiries = expiries.slice(-definition.capacity!); state.uncertainSince = null; state.certainEnd = null; }
            next = { kind: 'quantity', unit: 'count', value: Math.min(expiries.length, definition.capacity!) }; dependencies.push(duration.traceId);
          } else if (next.kind === 'quantity') {
            if (definition.capacity !== null) next = { ...next, value: Math.min(next.value, definition.capacity) };
            else if (definition.knownCapacityFloor !== undefined && next.value > Math.max(definition.knownCapacityFloor,
              state.value.state === 'known' && state.value.value.kind === 'quantity' ? state.value.value.value : 0)) {
              forget(definition, event, 'capacity'); continue;
            }
          }
          state.value = session.known(origin, update.state + '.' + update.operation, next, dependencies, definition.type);
          state.expiresAt = null;
          if (definition.kind !== 'stacked') { state.uncertainSince = null; state.certainEnd = null; }
          if (definition.kind !== 'stacked' && definition.duration && !equal(next, definition.inactiveValue)) {
            const duration = read(definition.duration, event, phase, definition.key + '.duration');
            if (duration.state !== 'known') { state.uncertainSince = event.timeMs; continue; }
            if (duration.value.kind !== 'quantity' || duration.value.unit !== 'milliseconds' || duration.value.value <= 0 || !Number.isSafeInteger(event.timeMs + duration.value.value)) { outputs.invalid = session.invalid(origin, update.state, '/definition', '状态时效非法。', 'invalid-range'); break; }
            state.expiresAt = event.timeMs + duration.value.value; state.uncertainSince = null;
          }
        }
        if (outputs.invalid || session.budgetValue) break;
      }
      if (outputs.invalid || session.budgetValue) break;
      snapshot(event, phase);
    }
  }
  if (session.budgetValue) outputs.budget = session.budgetValue;
  return finish();
}
