import { boundAggregateRequestSchema, calculationJsonPointer, combatContextSchema, definitionKey, inspectCalculationStructure,
  type AggregateEvaluation, type AggregateRequest, type CalculationDiagnosticCode, type CombatFrame, type EvaluatedValue, type FormulaEvaluation, type RequiredInput, type Value } from '@leyline/schema';
import { calculationBudgets, compiledData, type CompiledCalculation } from './compile';
import { interpretAggregate, type AggregateEvaluationOptions } from './aggregate';
import { interpretBoundFormula } from './context';
import { validateContextDefinitions } from './context-validation';
import { CalculationSession } from './session';
import { validateBoundFormula } from './binding-validation';

/** Resolve every contributor against its own build, then rank separately inside each probability state. */
export function evaluateBoundAggregate(program: CompiledCalculation, contextInput: unknown, input: unknown, options: AggregateEvaluationOptions = {}): AggregateEvaluation {
  const fallback = { namespace: 'builtin', id: 'runtime.bound-aggregate', revision: '1' };
  const structure = [contextInput, input].flatMap(value => inspectCalculationStructure(value));
  const parsed = boundAggregateRequestSchema.safeParse(structure.length ? undefined : input);
  const session = new CalculationSession(parsed.success ? parsed.data.definition : fallback), requiredInputs: RequiredInput[] = [];
  const finish = (value: EvaluatedValue): AggregateEvaluation => {
    const result = session.finish({ value });
    return { execution: result.execution, value, states: [], diagnostics: result.diagnostics, trace: result.trace,
      requiredInputs: [...result.requiredInputs, ...requiredInputs], work: result.work };
  };
  const invalid = (code: CalculationDiagnosticCode, pointer: string, message: string) => finish(session.invalid(undefined, 'value', pointer, message, code));
  if (structure.length) return invalid(structure[0].code, structure[0].jsonPointer, structure[0].message);
  if (!parsed.success) return invalid('invalid-range', calculationJsonPointer(parsed.error.issues[0].path), parsed.error.issues[0].message);
  const request = parsed.data, data = compiledData(program), parsedContext = combatContextSchema.safeParse(contextInput);
  if (!data || !parsedContext.success) return invalid('invalid-range', '/context', '聚合上下文或编译程序无效。');
  const definition = data.aggregates.get(definitionKey(request.definition));
  if (!definition) return invalid('missing-dependency', '/definition', '缺少聚合的精确版本。');
  if (!data.features.includes('bound-aggregate-v1')) return invalid('unsupported-feature', '/requiredFeatures', '计算库未声明贡献者绑定能力。');
  for (const key of ['visits', 'depth', 'trace', 'probabilityStates'] as const) {
    const limit = options.limits?.[key];
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < (key === 'trace' ? 3 : 1) || limit > calculationBudgets[key])) return invalid('invalid-range', '/limits/' + key, '聚合预算无效。');
    if (key !== 'probabilityStates' && limit !== undefined) session.limits[key] = limit;
  }
  const context = parsedContext.data, validation = validateContextDefinitions(data, context);
  if (validation.diagnostics.length) return invalid(validation.diagnostics[0].code, validation.diagnostics[0].jsonPointer, validation.diagnostics[0].message);
  const contributors = new Map(request.contributors.map(contributor => [contributor.id, contributor]));
  const actorIds = new Set(context.actors.map(actor => actor.id)), eventIds = new Set(context.events.map(event => event.id)), targetIds = new Set(context.targets.map(target => target.id));
  for (const [index, contributor] of request.contributors.entries()) {
    if (!actorIds.has(contributor.id) || [contributor.frame, ...contributor.rankFrame ? [contributor.rankFrame] : []].some(frame =>
      !eventIds.has(frame.eventId) || !targetIds.has(frame.targetId) || frame.sourceEventId !== null && !eventIds.has(frame.sourceEventId)
      || Object.values(frame.actorFacts).some(id => id !== null && !actorIds.has(id)))) return invalid('stale-reference', `/contributors/${index}/frame`, '贡献者读取帧引用已失效。');
    if (definitionKey(contributor.invocation.formula) !== definitionKey(definition.itemFormula) || contributor.invocation.output !== definition.itemOutput) return invalid('conflicting-definition', `/contributors/${index}/invocation`, '贡献者公式及输出须与聚合定义一致。');
    validateBoundFormula(data, contributor.invocation, (code, pointer, message) => session.report(code, `/contributors/${index}` + pointer, message));
  }
  if (session.diagnostics.length) return invalid(session.diagnostics[0].code, session.diagnostics[0].jsonPointer, session.diagnostics[0].message);
  for (const [index, contributor] of request.contributors.entries()) {
    if (contributor.qualified === null) return finish(session.missing(undefined, 'qualified', { kind: 'boolean' }, 'contributor:' + contributor.id, `/contributors/${index}/qualified`));
    if (!contributor.qualified) return invalid('conflicting-definition', `/contributors/${index}/qualified`, '不符合资格的角色不能列入反应贡献者。');
  }
  const absorb = (result: FormulaEvaluation, prefix: string): FormulaEvaluation['outputs'] => {
    const offset = session.diagnostics.length;
    const reason = (id: string) => id.replace(/^diagnostic-(\d+)$/, (_, index: string) => `diagnostic-${offset + Number(index)}`);
    session.visits += result.work.visits;
    session.trace.push(...result.trace.map(node => ({ ...node, id: prefix + node.id, dependencies: node.dependencies.map(id => prefix + id) })));
    session.diagnostics.push(...result.diagnostics.map(diagnostic => ({ ...diagnostic, affectedOutputIds: ['value'] })));
    requiredInputs.push(...result.requiredInputs.map(required => ({ ...required, scope: prefix + required.scope, requiredBy: ['value'] })));
    return Object.fromEntries(Object.entries(result.outputs).map(([key, value]) => [key, value.state === 'known' ? { ...value, traceId: prefix + value.traceId }
      : { ...value, traceId: prefix + value.traceId, reasons: value.reasons.map(reason) }]));
  };
  const probabilityDependencies: string[] = [];
  let probability: AggregateRequest['probability'] = { kind: 'fixed' };
  if (request.probability.kind === 'joint') probability = { ...request.probability, states: request.probability.states.map(state => ({ ...state,
    bindings: state.bindings.map(({ fact, ...binding }) => ({ ...binding, input: fact })) })) };
  if (request.probability.kind === 'independent') {
    const variables: Extract<AggregateRequest['probability'], { kind: 'independent' }>['variables'] = [];
    for (const [index, variable] of request.probability.variables.entries()) {
      let chance: number | null = null;
      if (variable.probability) {
        const contributor = contributors.get(variable.probability.contributorId)!;
        const visits = session.limits.visits - session.visits, trace = session.limits.trace - session.trace.length - 1;
        if (visits < 1 || trace < 2) return finish(session.budget(undefined, 'probability', '概率读取达到共享预算。', trace < 2));
        const result = interpretBoundFormula(program, context, contributor.invocation, contributor.frame,
          { readBindings: { probability: variable.probability.binding }, limits: { visits, depth: session.limits.depth, trace } }, { context, validation });
        const values = absorb(result, `p${index}:`), value = values.probability ?? values.invalid;
        if (!value || value.state !== 'known') return value ? finish(value) : invalid('invalid-range', '/probability', '概率读取无效。');
        if (value.value.kind !== 'quantity' || value.value.unit !== 'scalar') return invalid('unit-mismatch', `/probability/variables/${index}`, '概率必须为无量纲数量。');
        if (variable.probability.kind === 'probability' && (value.value.value < 0 || value.value.value > 1)) return invalid('invalid-range', `/probability/variables/${index}`, '概率必须位于0至1之间。');
        chance = variable.probability.kind === 'crit-rate' ? Math.max(0, Math.min(1, value.value.value)) : value.value.value;
        const exhausted = session.enter({ definition, pointer: '/probability' }, variable.id, 1);
        if (exhausted) return finish(exhausted);
        const clamped = session.known({ definition, pointer: '/probability' }, variable.id, { kind: 'quantity', unit: 'scalar', value: chance }, [value.traceId]);
        if (clamped.state !== 'known') return finish(clamped);
        probabilityDependencies.push(clamped.traceId);
      }
      variables.push({ id: variable.id, probability: chance, bindings: variable.bindings.map(({ fact, ...binding }) => ({ ...binding, input: fact })) });
    }
    probability = { kind: 'independent', variables };
  }
  const visits = session.limits.visits - session.visits, trace = session.limits.trace - session.trace.length - 2;
  if (visits < 1 || trace < 3) return finish(session.budget(undefined, 'aggregate', '贡献者求值达到共享预算。', trace < 3));
  const result = interpretAggregate(program, { definition: request.definition, contributors: request.contributors.map(contributor => ({ id: contributor.id,
    inputs: {}, ...contributor.rankFrame ? { rankInputs: {} } : {} })), probability },
  { limits: { visits, depth: session.limits.depth, trace, ...options.limits?.probabilityStates !== undefined ? { probabilityStates: options.limits.probabilityStates } : {} } }, {
    evaluate(id, inputs, outputs, rank, limits) {
      const contributor = contributors.get(id)!, original = rank ? contributor.rankFrame! : contributor.frame;
      const frame: CombatFrame = { ...original, facts: { ...original.facts,
        ...Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, { value, provenance: 'derived' as const, sourceRefs: definition.sources }])) } };
      return interpretBoundFormula(program, context, contributor.invocation, frame, { outputs, limits }, { context, validation });
    },
  });
  const { value } = absorb({ ...result, outputs: { value: result.value }, stages: [] }, 'aggregate:');
  const combined = session.emit({ definition, pointer: '' }, 'value', [value.traceId, ...probabilityDependencies],
    value.state === 'known' ? value.value : null, value.state, value.state === 'known' ? [] : value.reasons, 'aggregate');
  return { ...result, execution: combined.state === 'known' ? 'complete' : combined.state === 'unknown' ? 'partial' : 'invalid', value: combined, diagnostics: session.diagnostics, trace: session.trace, requiredInputs,
    work: { visits: session.visits, traceNodes: session.trace.length } };
}
