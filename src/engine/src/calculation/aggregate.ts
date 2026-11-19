import { aggregateRequestSchema, calculationJsonPointer, definitionKey, inspectCalculationStructure, valueMatchesType,
  type AggregateEvaluation, type CalculationDiagnostic, type CalculationDiagnosticCode, type CalculationTraceNode,
  type EvaluatedValue, type FormulaEvaluation, type RequiredInput, type Value } from '@leyline/schema';
import { calculationBudgets, compiledData, type CompiledCalculation } from './compile';
import { evaluateFormula } from './interpret';

type Override = { contributorId: string; input: string; value: Value };
interface Outcome { id: string; probability: number; bindings: Override[] }
export interface AggregateEvaluationOptions { limits?: { visits?: number; depth?: number; trace?: number; probabilityStates?: number } }
export interface AggregateItemRuntime {
  evaluate(contributorId: string, inputs: Record<string, Value | null>, outputs: string[], rank: boolean,
    limits: { visits: number; depth: number; trace: number }): FormulaEvaluation;
}

/** Rank inside each admissible probability outcome, then sum probabilities. No expected-value ranking shortcut. */
export function evaluateAggregate(program: CompiledCalculation, input: unknown, options: AggregateEvaluationOptions = {}): AggregateEvaluation {
  return interpretAggregate(program, input, options);
}

/** Internal binding bridge. Runtime callbacks belong to engine code and are never read from JSON. */
export function interpretAggregate(program: CompiledCalculation, input: unknown, options: AggregateEvaluationOptions = {}, runtime?: AggregateItemRuntime): AggregateEvaluation {
  const structuralIssues = inspectCalculationStructure(input);
  const parsed = aggregateRequestSchema.safeParse(structuralIssues.length ? undefined : input);
  const data = compiledData(program);
  const request = parsed.success ? parsed.data : undefined;
  const definition = request ? data?.aggregates.get(definitionKey(request.definition)) : undefined;
  const diagnostics: CalculationDiagnostic[] = [], trace: CalculationTraceNode[] = [], requiredInputs: RequiredInput[] = [];
  const states: AggregateEvaluation['states'] = [];
  const dependencies: string[] = [];
  const identity = definition?.identity ?? request?.definition ?? { namespace: 'builtin', id: 'invalid-aggregate-request', revision: '1' };
  const limits = { visits: calculationBudgets.visits as number, depth: calculationBudgets.depth as number, trace: calculationBudgets.trace as number, probabilityStates: calculationBudgets.probabilityStates as number };
  let visits = 0, invalid = false, unknown = false;
  const report = (code: CalculationDiagnosticCode, jsonPointer: string, message: string, partial = false) => {
    diagnostics.push({ code, severity: 'error', jsonPointer, message, affectedOutputIds: ['value'] });
    if (partial || code === 'missing-fact' || code === 'unreviewed-mechanism') unknown = true; else invalid = true;
  };
  const finish = (number?: number): AggregateEvaluation => {
    const state = invalid ? 'invalid' : unknown || number === undefined ? 'unknown' : 'known';
    const traceId = `aggregate-${trace.length + 1}`;
    const value: Value | null = state === 'known' ? { kind: 'quantity', unit: 'damage', value: number! } : null;
    trace.push({ id: traceId, kind: 'aggregate', definition: identity, nodeId: 'value', dependencies: [...new Set(dependencies)], value, state, sourceRefs: definition?.sources ?? [] });
    return { execution: state === 'known' ? 'complete' : state === 'unknown' ? 'partial' : 'invalid',
      value: state === 'known' ? { state, value: value!, traceId } : { state, reasons: diagnostics.map((_, index) => `diagnostic-${index + 1}`), traceId },
      states, trace, diagnostics, requiredInputs, work: { visits, traceNodes: trace.length } };
  };
  for (const key of ['visits', 'depth', 'trace', 'probabilityStates'] as const) {
    const value = options.limits?.[key];
    if (value !== undefined) {
      if (!Number.isSafeInteger(value) || value < (key === 'trace' ? 3 : 1) || value > calculationBudgets[key]) {
        report('invalid-range', '/limits/' + key, '聚合预算必须在运行时上限内。');
        return finish();
      }
      limits[key] = value;
    }
  }
  if (structuralIssues.length) {
    for (const issue of structuralIssues) report(issue.code, issue.jsonPointer, issue.message);
    return finish();
  }
  if (!parsed.success) {
    for (const issue of parsed.error.issues) report('invalid-range', calculationJsonPointer(issue.path), issue.message);
    return finish();
  }
  if (!request || !definition || !data) { report('missing-dependency', '/definition', '编译程序中缺少聚合的精确版本。'); return finish(); }
  if (request.probability.kind !== 'fixed' && !data.features.includes('probability-enumeration-v1')) {
    report('unsupported-feature', '/probability', '计算库未声明精确概率枚举能力。'); return finish();
  }
  if (definition.policy === 'ranked-weighted-sum' && definition.weights!.length < request.contributors.length) {
    report('unsupported-semantics', '/contributors', '贡献者超过规则已声明的权重范围，不能补0或丢弃贡献者。'); return finish();
  }
  const formula = data.formulas.get(definitionKey(definition.itemFormula))!;
  const checkBinding = (key: string, value: Value | null, pointer: string) => {
    if (runtime) return;
    const spec = Object.hasOwn(formula.definition.inputs, key) ? formula.definition.inputs[key] : undefined;
    if (!spec || value !== null && (!valueMatchesType(value, spec.type) || value.kind === 'quantity'
      && (spec.min !== undefined && value.value < spec.min || spec.max !== undefined && value.value > spec.max))) report('invalid-range', pointer, '贡献者绑定不符合逐人公式签名或范围。');
  };
  for (const [index, contributor] of request.contributors.entries()) {
    for (const [key, value] of Object.entries(contributor.inputs)) checkBinding(key, value, `/contributors/${index}/inputs` + calculationJsonPointer([key]));
    for (const [key, value] of Object.entries(contributor.rankInputs ?? {})) checkBinding(key, value, `/contributors/${index}/rankInputs` + calculationJsonPointer([key]));
  }
  const probability = request.probability;
  if (probability.kind === 'independent') for (const [index, variable] of probability.variables.entries()) {
    if (variable.probability === null) {
      report('missing-fact', `/probability/variables/${index}/probability`, '独立随机变量的概率尚未明确。');
      requiredInputs.push({ key: variable.id, type: { kind: 'quantity', unit: 'scalar' }, scope: 'probability', requiredBy: ['value'], min: 0, max: 1, sourceRefs: definition.sources });
    }
    for (const binding of variable.bindings) { checkBinding(binding.input, binding.yes, `/probability/variables/${index}`); checkBinding(binding.input, binding.no, `/probability/variables/${index}`); }
  }
  if (probability.kind === 'joint') for (const [index, state] of probability.states.entries()) for (const binding of state.bindings) checkBinding(binding.input, binding.value, `/probability/states/${index}`);
  if (invalid || unknown) return finish();
  let outcomes: Outcome[] = [{ id: 'fixed', probability: 1, bindings: [] }];
  if (probability.kind === 'joint') outcomes = probability.states.filter(state => state.probability > 0);
  if (probability.kind === 'independent') for (const variable of probability.variables) {
    const expanded: Outcome[] = [];
    for (const outcome of outcomes) for (const yes of [false, true]) {
      if (++visits > limits.visits) { report('budget', '/probability', '概率展开超过总访问预算。'); return finish(); }
      const chance = yes ? variable.probability! : 1 - variable.probability!;
      if (chance === 0) continue;
      const combined = outcome.probability * chance;
      if (combined === 0) { report('arithmetic', '/probability', '概率乘积下溢，无法声称精确期望。'); return finish(); }
      expanded.push({ id: outcome.id + ':' + variable.id + '=' + String(yes), probability: combined,
        bindings: [...outcome.bindings, ...variable.bindings.map(binding => ({ contributorId: binding.contributorId, input: binding.input, value: yes ? binding.yes : binding.no }))] });
      if (expanded.length > limits.probabilityStates) { report('budget', '/probability', '精确概率状态数超过预算。'); return finish(); }
    }
    outcomes = expanded;
  }
  if (outcomes.length > limits.probabilityStates) { report('budget', '/probability', '精确概率状态数超过预算。'); return finish(); }
  const evaluate = (contributorId: string, inputs: Record<string, Value | null>, outputs: string[], prefix: string, rank = false): FormulaEvaluation | undefined => {
    const availableVisits = limits.visits - visits, availableTrace = limits.trace - trace.length - 1;
    if (availableVisits < 1 || availableTrace < 2) { report('budget', '', '聚合已达到共享访问或追踪预算。'); return undefined; }
    const itemLimits = { visits: availableVisits, depth: limits.depth, trace: availableTrace };
    const result = runtime ? runtime.evaluate(contributorId, inputs, outputs, rank, itemLimits)
      : evaluateFormula(program, definition.itemFormula, inputs, { outputs, limits: itemLimits });
    visits += result.work.visits;
    const offset = diagnostics.length;
    const rebase = (reason: string) => reason.replace(/^diagnostic-(\d+)$/, (_, index: string) => `diagnostic-${offset + Number(index)}`);
    const rebaseValue = (value: EvaluatedValue): EvaluatedValue => value.state === 'known' ? { ...value, traceId: prefix + value.traceId }
      : { ...value, traceId: prefix + value.traceId, reasons: value.reasons.map(rebase) };
    trace.push(...result.trace.map(node => ({ ...node, id: prefix + node.id, dependencies: node.dependencies.map(id => prefix + id) })));
    diagnostics.push(...result.diagnostics.map(diagnostic => ({ ...diagnostic, affectedOutputIds: ['value'] })));
    requiredInputs.push(...result.requiredInputs.map(required => ({ ...required, scope: prefix + required.scope, requiredBy: ['value'] })));
    if (result.execution === 'invalid') invalid = true;
    else if (result.execution === 'partial') unknown = true;
    return { ...result, outputs: Object.fromEntries(Object.entries(result.outputs).map(([key, value]) => [key, rebaseValue(value)])) };
  };
  const number = (value: EvaluatedValue | undefined): number | undefined => value?.state === 'known' && value.value.kind === 'quantity' && value.value.unit === 'damage' ? value.value.value : undefined;
  const fixedRanks = new Map<string, number | undefined>();
  if (definition.policy === 'ranked-weighted-sum' && definition.rankMetric.at === 'fixed') for (const [index, contributor] of request.contributors.entries()) {
    if (!contributor.rankInputs) { report('missing-fact', `/contributors/${index}/rankInputs`, '固定排序依据需要明确的独立输入。'); continue; }
    const result = evaluate(contributor.id, contributor.rankInputs, [definition.rankMetric.output], `rank:c${index}:`, true);
    fixedRanks.set(contributor.id, number(result?.outputs[definition.rankMetric.output]));
    if (result) dependencies.push(result.outputs[definition.rankMetric.output].traceId);
  }
  let expectation = 0;
  for (const [stateIndex, outcome] of outcomes.entries()) {
    const values: { contributorId: string; value: number; rankMetric: number; weight: number }[] = [];
    for (const [index, contributor] of request.contributors.entries()) {
      const inputs = Object.fromEntries([...Object.entries(contributor.inputs), ...outcome.bindings.filter(binding => binding.contributorId === contributor.id).map(binding => [binding.input, binding.value] as const)]);
      const requested = [definition.itemOutput, ...(definition.policy === 'ranked-weighted-sum' && definition.rankMetric.at === 'realized' ? [definition.rankMetric.output] : [])];
      const result = evaluate(contributor.id, inputs, requested, `s${stateIndex}:c${index}:`);
      if (!result) break;
      const value = number(result.outputs[definition.itemOutput]);
      const rankMetric = definition.policy === 'sum' ? value : definition.rankMetric.at === 'fixed' ? fixedRanks.get(contributor.id) : number(result.outputs[definition.rankMetric.output]);
      dependencies.push(...Object.values(result.outputs).map(value => value.traceId));
      if (value !== undefined && rankMetric !== undefined) values.push({ contributorId: contributor.id, value, rankMetric, weight: 1 });
    }
    let total: number | null = null;
    if (values.length === request.contributors.length) {
      let ambiguous = false;
      if (definition.policy === 'ranked-weighted-sum') {
        values.sort((a, b) => {
          visits++;
          return b.rankMetric - a.rankMetric || (a.contributorId < b.contributorId ? -1 : a.contributorId > b.contributorId ? 1 : 0);
        });
        for (let start = 0; start < values.length;) {
          let end = start + 1, unequalValues = false, unequalWeights = false;
          while (end < values.length && values[end].rankMetric === values[start].rankMetric) {
            unequalValues ||= values[end].value !== values[start].value;
            unequalWeights ||= definition.weights![end] !== definition.weights![start];
            visits++; end++;
          }
          if (unequalValues && unequalWeights) ambiguous = true;
          start = end;
        }
      }
      if (ambiguous) {
        report('unsupported-semantics', '/contributors', '排序指标并列但贡献与名次权重不同，缺少来源裁定，不能按身份分配权重。', true);
        // Keep component traces, without publishing an invented ranking or weighted subtotal.
        values.length = 0;
      } else {
        total = values.reduce((sum, value, index) => { value.weight = definition.policy === 'sum' ? 1 : definition.weights![index]; return sum + value.value * value.weight; }, 0);
        visits += values.length;
        expectation += outcome.probability * total;
        if (!Number.isFinite(total) || !Number.isFinite(expectation)) report('arithmetic', '/contributors', '聚合伤害运算溢出。');
      }
    } else if (!invalid) unknown = true;
    states.push({ id: outcome.id, probability: outcome.probability, ranking: values, value: total });
    if (visits > limits.visits) { report('budget', '', '聚合排序或加权超过总访问预算。'); break; }
    if (invalid) break;
  }
  return finish(expectation);
}
