import { calculationJsonPointer, calculationSelectionSchema, combatContextSchema, damageQuerySchema, inspectCalculationStructure,
  type AggregateEvaluation, type CalculationDiagnostic, type DefinitionRef, type EvaluatedValue,
  type FormulaEvaluation, type RequiredInput, type StructuredDamageEvaluation, type StructuredDamageOutput } from '@leyline/schema';
import { compiledData, type CompiledCalculation } from './compile';
import { interpretBoundFormula, type BoundAttributeReader } from './context';
import { evaluateAggregate } from './aggregate';
import { evaluateBoundAggregate } from './bound-aggregate';
import { checkInventoryFeasibility } from './feasibility';
import { validateContextDefinitions } from './context-validation';
import { CalculationSession } from './session';
import type { FormulaEvaluationOptions } from './interpret';

function absorb(session: CalculationSession, result: FormulaEvaluation | AggregateEvaluation, scope: string, eventId: string): (value: EvaluatedValue) => EvaluatedValue {
  const reasons = new Map(result.diagnostics.map((diagnostic, index) => [`diagnostic-${index + 1}`, session.report(diagnostic.code,
    '/outputs' + calculationJsonPointer([scope]) + diagnostic.jsonPointer, diagnostic.message, diagnostic.nodeId, eventId)]));
  const traceIds = new Map(result.trace.map((node, index) => [node.id, `trace-${session.trace.length + index + 1}`]));
  session.trace.push(...result.trace.map(node => ({ ...node, id: traceIds.get(node.id)!, dependencies: node.dependencies.map(id => traceIds.get(id)!) })));
  session.visits += result.work.visits;
  return value => value.state === 'known' ? { ...value, traceId: traceIds.get(value.traceId)! }
    : { ...value, traceId: traceIds.get(value.traceId)!, reasons: value.reasons.map(reason => reasons.get(reason)!) };
}

/** Evaluate only the explicit occurrences of this event. Source-event edges do not add damage a second time. */
export function evaluateDamageQuery(program: CompiledCalculation, contextInput: unknown, queryInput: unknown,
  options: Pick<FormulaEvaluationOptions, 'limits'> & { attributeReader?: BoundAttributeReader } = {}): StructuredDamageEvaluation {
  const runtime: DefinitionRef = { namespace: 'builtin', id: 'runtime.damage-query', revision: '1' };
  const session = new CalculationSession(runtime), outputs: StructuredDamageOutput[] = [], requiredInputs: RequiredInput[] = [];
  const values: Record<string, EvaluatedValue> = Object.create(null) as Record<string, EvaluatedValue>;
  let eventId: string | null = null;
  let feasibility = [checkInventoryFeasibility(undefined)];
  const finish = (total: EvaluatedValue): StructuredDamageEvaluation => {
    const result = session.finish({ ...values, 'event-total': total });
    const diagnostics = result.diagnostics.map(diagnostic => ({ ...diagnostic, affectedOutputIds: diagnostic.affectedOutputIds.filter(id => id !== 'event-total') }));
    for (const output of outputs) output.diagnosticIds = diagnostics.flatMap((diagnostic, index) => diagnostic.affectedOutputIds.includes(output.id) ? [`diagnostic-${index + 1}`] : []);
    return { execution: result.execution, outputs, events: eventId === null ? [] : [{ eventId, outputIds: outputs.map(output => output.outputId), total }],
      totals: { all: total, objective: total }, feasibility, trace: result.trace, diagnostics, requiredInputs,
      work: result.work };
  };
  const invalid = (code: CalculationDiagnostic['code'], pointer: string, message: string) => finish(session.invalid(undefined, 'query', pointer, message, code));
  const structural = [contextInput, queryInput].flatMap(input => inspectCalculationStructure(input));
  if (structural.length) {
    structural.forEach(diagnostic => session.report(diagnostic.code, diagnostic.jsonPointer, diagnostic.message));
    return invalid(structural[0].code, structural[0].jsonPointer, structural[0].message);
  }
  const query = damageQuerySchema.safeParse(queryInput), parsedContext = combatContextSchema.safeParse(contextInput), data = compiledData(program);
  if (!query.success || !parsedContext.success || !data) {
    for (const [prefix, parsed] of [['query', query], ['context', parsedContext]] as const) if (!parsed.success) for (const issue of parsed.error.issues) session.report('invalid-range', '/' + prefix + calculationJsonPointer(issue.path), issue.message);
    return invalid('invalid-range', '', '事件请求、上下文或编译程序无效。');
  }
  for (const key of ['visits', 'depth', 'trace'] as const) {
    const limit = options.limits?.[key];
    if (limit !== undefined) {
      if (!Number.isSafeInteger(limit) || limit < (key === 'trace' ? 3 : 1) || limit > session.limits[key]) return invalid('invalid-range', '/limits/' + key, '事件执行预算无效。');
      session.limits[key] = limit;
    }
  }
  const context = parsedContext.data, request = query.data;
  const contextValidation = validateContextDefinitions(data, context);
  if (contextValidation.diagnostics.length) return invalid(contextValidation.diagnostics[0].code, contextValidation.diagnostics[0].jsonPointer, contextValidation.diagnostics[0].message);
  eventId = request.kind === 'event' ? request.eventId : request.output.eventId;
  const event = context.events.find(event => event.id === eventId);
  if (!event) return invalid('stale-reference', '/eventId', '事件引用已失效。');
  const occurrences = request.kind === 'event' ? request.outputs : [request.output], actorIds = new Set(context.actors.map(actor => actor.id));
  if (event.kind === 'capture' && occurrences.length) return invalid('invalid-range', '/eventId', '独立捕获记录不能携带伤害输出。');
  if (request.inventoryAllocations?.some(allocation => !actorIds.has(allocation.actorId))) return invalid('stale-reference', '/inventoryAllocations', '装备占用引用了不存在的队员。');
  feasibility = [checkInventoryFeasibility(request.inventoryAllocations)];
  if (feasibility[0].status === 'pass' && context.actors.some(actor => !request.inventoryAllocations?.some(allocation => allocation.actorId === actor.id))) feasibility[0].status = 'unknown';
  for (const occurrence of occurrences) {
    session.enter(undefined, occurrence.outputId, 1);
    if (!data.damageFamilies.includes(occurrence.family)) return invalid('missing-dependency', '/outputs', '输出引用了未声明的伤害族。');
    if (occurrence.actorId !== null && !actorIds.has(occurrence.actorId) || occurrence.contributorIds.some(id => !actorIds.has(id))) return invalid('stale-reference', '/outputs', '输出归属或参与队员引用已失效。');
    const id = JSON.stringify([occurrence.eventId, occurrence.outputId]), computation = occurrence.computation;
    if (computation.kind === 'formula' && (event.targetIds !== null && !event.targetIds.includes(computation.frame.targetId)
      || event.actorId !== null && event.actorId !== occurrence.actorId
      || event.reactionId !== undefined && event.reactionId !== computation.frame.hit?.reactionId
      || computation.frame.hit?.origin !== 'reaction' && (event.skillId !== undefined && event.skillId !== computation.frame.hit?.skillId
        || event.hitId !== undefined && event.hitId !== computation.frame.hit?.hitId
        || event.category !== undefined && event.category !== computation.frame.hit?.category))) return invalid('conflicting-definition', '/outputs', '输出读取帧与已确认事件事实冲突。');
    if (computation.kind === 'bound-aggregate' && computation.request.contributors.some(({ frame, rankFrame }) => [frame, ...rankFrame ? [rankFrame] : []].some(read =>
      read.eventId !== occurrence.eventId || read.hit?.family !== occurrence.family || read.hit.origin !== 'reaction'
      || event.targetIds !== null && !event.targetIds.includes(read.targetId)
      || event.reactionId !== undefined && event.reactionId !== read.hit.reactionId))) return invalid('conflicting-definition', '/outputs', '聚合贡献者读取帧与反应事件不一致。');
    const reference = computation.kind === 'formula' ? computation.invocation.formula : computation.request.definition;
    let value: EvaluatedValue, stages: FormulaEvaluation['stages'] = [], aggregation: StructuredDamageOutput['aggregation'];
    const visits = session.limits.visits - session.visits, trace = session.limits.trace - session.trace.length - 3;
    if (session.budgetValue || visits < 1 || trace < (computation.kind === 'formula' ? 2 : 3)) value = session.budget(undefined, occurrence.outputId, '事件输出达到共享预算。', trace < 2);
    else {
      const result = computation.kind === 'formula' ? interpretBoundFormula(program, context, computation.invocation, computation.frame,
        { limits: { visits, trace, depth: session.limits.depth }, attributeReader: options.attributeReader }, { context, validation: contextValidation })
        : computation.kind === 'bound-aggregate' ? evaluateBoundAggregate(program, context, computation.request, { limits: { visits, depth: session.limits.depth, trace }, attributeReader: options.attributeReader })
          : evaluateAggregate(program, computation.request, { limits: { visits, depth: session.limits.depth, trace } });
      const rebase = absorb(session, result, occurrence.outputId, occurrence.eventId);
      const rawValue = 'value' in result ? result.value : result.outputs[computation.kind === 'formula' ? computation.invocation.output : 'value'] ?? result.outputs.invalid;
      value = rebase(rawValue);
      if ('stages' in result) stages = result.stages.map(stage => ({ ...stage, value: rebase(stage.value) }));
      if ('states' in result) aggregation = { states: result.states };
      requiredInputs.push(...result.requiredInputs.map(required => ({ ...required, scope: id + ':' + required.scope, requiredBy: required.requiredBy.length ? [id] : [] })));
    }
    values[id] = value;
    outputs.push({ id, eventId: occurrence.eventId, outputId: occurrence.outputId, actorId: occurrence.actorId, contributorIds: occurrence.contributorIds,
      family: occurrence.family, computation: { kind: computation.kind, definition: reference }, value, stages, diagnosticIds: [], evidence: 'declared', ...(aggregation ? { aggregation } : {}),
      execution: value.state === 'known' ? 'complete' : value.state === 'unknown' ? 'partial' : 'invalid' });
  }
  const failed = session.inherit(undefined, 'event-total', Object.values(values));
  if (failed) return finish(failed);
  let total = 0;
  for (const output of outputs) {
    const exhausted = session.enter(undefined, 'event-total', 1);
    if (exhausted) return finish(exhausted);
    if (output.value.state !== 'known' || output.value.value.kind !== 'quantity' || output.value.value.unit !== 'damage') return invalid('unit-mismatch', '/outputs', '事件伤害输出必须为damage数量。');
    total += output.value.value.value;
  }
  return finish(session.known(undefined, 'event-total', { kind: 'quantity', unit: 'damage', value: total }, outputs.map(output => output.value.traceId)));
}

export function selectCalculationValue(evaluation: StructuredDamageEvaluation, input: unknown): {
  execution: FormulaEvaluation['execution']; value: EvaluatedValue | null; diagnostics: CalculationDiagnostic[];
} {
  const structure = inspectCalculationStructure(input);
  if (structure.length) return { execution: 'invalid', value: null, diagnostics: structure };
  const parsed = calculationSelectionSchema.safeParse(input);
  const selection = parsed.success ? parsed.data : undefined;
  const output = selection?.kind === 'output' ? evaluation.outputs.find(output => output.eventId === selection.eventId && output.outputId === selection.outputId) : undefined;
  const value = selection?.kind === 'event-total' ? evaluation.events.find(event => event.eventId === selection.eventId)?.total : output?.value;
  if (!selection || !value) return { execution: 'invalid', value: null, diagnostics: [{ code: selection ? 'stale-reference' : 'invalid-range', severity: 'error', jsonPointer: '/selection', affectedOutputIds: [], message: '计算结果选择缺失、无效或已失效。' }] };
  return { execution: value.state === 'known' ? 'complete' : value.state === 'unknown' ? 'partial' : 'invalid', value,
    diagnostics: evaluation.diagnostics.filter(diagnostic => selection.kind === 'event-total' || output && diagnostic.affectedOutputIds.includes(output.id)) };
}
