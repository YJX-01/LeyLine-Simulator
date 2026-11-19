import { calculationJsonPointer, calculationValueSchema, definitionKey, inspectCalculationStructure, valueMatchesType,
  type DefinitionRef,
  type EvaluatedValue, type FormulaEvaluation, type FormulaInput, type Value } from '@leyline/schema';
import { calculationBudgets, compiledData, type CompiledCalculation, type CompiledFormula } from './compile';
import { CalculationSession } from './session';

export interface FormulaEvaluationOptions {
  outputs?: readonly string[];
  limits?: { visits?: number; depth?: number; trace?: number };
}
interface Frame {
  formula: CompiledFormula;
  memo: Map<string, EvaluatedValue>;
  input: (key: string, spec: FormulaInput, depth: number) => EvaluatedValue;
}

export interface FormulaRuntime {
  session: CalculationSession;
  depth: number;
  resolveInput: (key: string, spec: FormulaInput, depth: number) => EvaluatedValue | undefined;
}

/** Pure interpretation: immutable compiled definitions, independent memo/state/trace per invocation. */
export function evaluateFormula(program: CompiledCalculation, reference: DefinitionRef,
  inputs: Record<string, Value | null>, options: FormulaEvaluationOptions = {}): FormulaEvaluation {
  return interpretFormula(program, reference, inputs, options);
}

/** Internal lazy binding bridge; callbacks are engine code, never serialized formula operations. */
export function interpretFormula(program: CompiledCalculation, reference: DefinitionRef,
  inputs: Record<string, Value | null>, options: FormulaEvaluationOptions = {}, runtime?: FormulaRuntime): FormulaEvaluation {
  const data = compiledData(program), formula = data?.formulas.get(definitionKey(reference));
  const session = runtime?.session ?? new CalculationSession(reference);
  const { limits } = session;
  const report = session.report.bind(session), emit = session.emit.bind(session), invalid = session.invalid.bind(session);
  const outputs: Record<string, EvaluatedValue> = Object.create(null) as Record<string, EvaluatedValue>;
  const selected = [...new Set(options.outputs ?? Object.keys(formula?.definition.outputs ?? {}))].sort();
  const finish = (): FormulaEvaluation => {
    const stages = formula ? formula.definition.stages.flatMap(stage => {
      const value = root?.memo.get(stage.node);
      return value ? [{ id: stage.id, value }] : [];
    }) : [];
    if (!runtime) return session.finish(outputs, stages);
    // Bound callers finish the shared session once; nested formula calls only need their own outputs.
    return { execution: session.budgetValue || Object.values(outputs).some(value => value.state === 'invalid') ? 'invalid'
      : Object.values(outputs).some(value => value.state === 'unknown') ? 'partial' : 'complete', outputs, stages,
      trace: session.trace, diagnostics: session.diagnostics, requiredInputs: [], work: { visits: session.visits, traceNodes: session.trace.length } };
  };
  let root: Frame | undefined;
  for (const name of ['visits', 'depth', 'trace'] as const) {
    const requested = options.limits?.[name];
    if (requested !== undefined) {
      if (!Number.isSafeInteger(requested) || requested < (name === 'trace' ? 2 : 1) || requested > calculationBudgets[name]) {
        outputs.invalid = invalid(formula, 'limits', '/limits/' + name, '执行预算必须是运行时上限内的正整数。', 'invalid-range');
        return finish();
      }
      limits[name] = requested;
    }
  }
  if (!formula || !data) {
    outputs.invalid = invalid(undefined, 'formula', '/formula', '编译程序无效或不包含此公式的精确版本。', 'missing-dependency');
    return finish();
  }
  if (!selected.length) {
    outputs.invalid = invalid(formula, 'outputs', '/outputs', '至少请求一个公式输出。', 'invalid-range');
    return finish();
  }
  for (const name of selected) if (!Object.hasOwn(formula.definition.outputs, name)) {
    outputs[name] = invalid(formula, name, '/outputs/' + calculationJsonPointer([name]).slice(1), '请求的输出不存在。', 'missing-dependency');
  }
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) {
    for (const name of selected) outputs[name] = invalid(formula, 'inputs', '/inputs', '公式输入必须为具名值对象。', 'invalid-range');
    return finish();
  }
  const structuralIssues = inspectCalculationStructure(inputs);
  if (structuralIssues.length) {
    const reasons = structuralIssues.map(issue => report(issue.code, '/inputs' + issue.jsonPointer, issue.message));
    for (const name of selected) outputs[name] = emit(formula, 'inputs', [], null, 'invalid', reasons, 'read');
    return finish();
  }
  const inputIssue = (value: unknown, spec: FormulaInput): string | undefined => {
    const parsed = calculationValueSchema.safeParse(value);
    if (!parsed.success || !valueMatchesType(parsed.data, spec.type)) return '输入类型、单位或有限数值要求不匹配。';
    if (parsed.data.kind === 'quantity' && (spec.min !== undefined && parsed.data.value < spec.min || spec.max !== undefined && parsed.data.value > spec.max)) return '输入超出声明范围。';
    return undefined;
  };
  const errors: string[] = [];
  const inputSnapshot = new Map<string, Value | null>();
  for (const name of Object.keys(inputs).sort()) {
    const spec = Object.hasOwn(formula.definition.inputs, name) ? formula.definition.inputs[name] : undefined, value = inputs[name];
    const error = spec ? value === null ? undefined : inputIssue(value, spec) : '提供了未声明的公式输入。';
    if (error) errors.push(report('invalid-range', '/inputs' + calculationJsonPointer([name]), error));
    else inputSnapshot.set(name, value === null ? null : Object.freeze(calculationValueSchema.parse(value)));
  }
  if (errors.length) {
    for (const name of selected) outputs[name] = emit(formula, 'inputs', [], null, 'invalid', errors, 'read');
    return finish();
  }
  const inherit = session.inherit.bind(session);
  const missing = (current: CompiledFormula, key: string, spec: FormulaInput): EvaluatedValue => session.missing(current, key, spec.type,
    definitionKey(current.definition.identity), current.pointer + '/inputs' + calculationJsonPointer([key]), spec.min, spec.max);
  const known = (current: CompiledFormula, id: string, value: Value, dependencies: string[] = []): EvaluatedValue =>
    session.known(current, id, value, dependencies, current.types.get(id));
  function evaluate(frame: Frame, id: string, depth: number): EvaluatedValue {
    const memo = frame.memo.get(id);
    if (memo) return memo;
    const exhausted = session.enter(frame.formula, id, depth);
    if (exhausted) return exhausted;
    const current = frame.formula, node = current.nodes.get(id)!;
    const location = current.pointer + '/nodes/' + current.definition.nodes.indexOf(node);
    const read = (reference: string) => evaluate(frame, reference, depth + 1);
    let result: EvaluatedValue;
    if (node.op === 'constant') result = known(current, id, node.value);
    else if (node.op === 'input') {
      const value = frame.input(node.key, current.definition.inputs[node.key], depth + 1);
      result = value.state === 'known' ? emit(current, id, [value.traceId], value.value, 'known', [], 'read')
        : emit(current, id, [value.traceId], null, value.state, value.reasons, 'read');
    } else if (node.op === 'select') {
      const condition = read(node.condition);
      if (condition.state !== 'known') result = inherit(current, id, [condition])!;
      else {
        const selectedValue = read(condition.value.kind === 'boolean' && condition.value.value ? node.yes : node.no);
        result = selectedValue.state === 'known' ? known(current, id, selectedValue.value, [condition.traceId, selectedValue.traceId])
          : inherit(current, id, [condition, selectedValue])!;
      }
    } else if (node.op === 'condition-group') {
      const values: EvaluatedValue[] = [];
      let decisive: boolean | undefined;
      for (const condition of node.conditions) {
        const value = read(condition); values.push(value);
        if (value.state === 'invalid') break;
        if (value.state === 'known' && value.value.kind === 'boolean' && value.value.value === (node.operator === 'any')) {
          decisive = value.value.value; break;
        }
      }
      result = decisive === undefined ? inherit(current, id, values) ?? known(current, id, { kind: 'boolean', value: node.operator === 'all' }, values.map(value => value.traceId))
        : known(current, id, { kind: 'boolean', value: decisive }, values.map(value => value.traceId));
    } else if (node.op === 'call') {
      const callee = data!.formulas.get(definitionKey(node.formula))!;
      const supplied = new Map<string, EvaluatedValue>();
      const child: Frame = { formula: callee, memo: new Map(), input: (key, spec, inputDepth) => {
        if (supplied.has(key)) return supplied.get(key)!;
        const binding = Object.hasOwn(node.bindings, key) ? node.bindings[key] : undefined;
        const value = binding === undefined ? spec.default !== undefined ? emit(callee, key, [], spec.default, 'known', [], 'read') : missing(callee, key, spec)
          : evaluate(frame, binding, inputDepth + 1);
        const error = value.state === 'known' ? inputIssue(value.value, spec) : undefined;
        const checked = error ? invalid(callee, key, callee.pointer + '/inputs' + calculationJsonPointer([key]), error, 'invalid-range', [value.traceId]) : value;
        supplied.set(key, checked);
        return checked;
      } };
      const value = evaluate(child, callee.definition.outputs[node.output].node, depth + 1);
      result = value.state === 'known' ? emit(current, id, [value.traceId], value.value, 'known', [], 'call')
        : emit(current, id, [value.traceId], null, value.state, value.reasons, 'call');
    } else if (node.op === 'lookup') {
      const index = read(node.index);
      if (index.state !== 'known') result = inherit(current, id, [index])!;
      else {
        const table = data!.tables.get(definitionKey(node.table))!;
        let value: Value | null | undefined;
        if (table.kind === 'integer' && index.value.kind === 'quantity' && Number.isSafeInteger(index.value.value)) value = table.values[index.value.value - table.start];
        if (table.kind === 'enum' && index.value.kind === 'enum' && Object.hasOwn(table.values, index.value.value)) value = table.values[index.value.value];
        result = value === undefined ? invalid(current, id, location, '参数表不存在此索引，不使用临近等级回退。', 'invalid-range', [index.traceId])
          : value === null ? emit(current, id, [index.traceId], null, 'unknown', [report('missing-fact', location, '参数表此项明确未知。', id)])
            : known(current, id, value, [index.traceId]);
      }
    } else if (node.op === 'scale-to-damage') {
      const values = [read(node.attribute), read(node.coefficient)];
      const inherited = inherit(current, id, values);
      if (inherited) result = inherited;
      else {
        const [attribute, coefficient] = values;
        result = attribute.state === 'known' && coefficient.state === 'known' && attribute.value.kind === 'quantity' && coefficient.value.kind === 'quantity'
          ? known(current, id, { kind: 'quantity', unit: 'damage', value: attribute.value.value * coefficient.value.value }, values.map(value => value.traceId))
          : invalid(current, id, location, '伤害缩放输入单位无效。', 'unit-mismatch');
      }
    } else {
      const left = read(node.left), right = read(node.right), inherited = inherit(current, id, [left, right]);
      if (inherited) result = inherited;
      else {
        const a = (left as Extract<EvaluatedValue, { state: 'known' }>).value;
        const b = (right as Extract<EvaluatedValue, { state: 'known' }>).value;
        const dependencies = [left.traceId, right.traceId];
        if (node.op === 'compare') {
          const x = a.value, y = b.value;
          const value = node.relation === 'eq' ? x === y : node.relation === 'lt' ? x < y : node.relation === 'lte' ? x <= y : node.relation === 'gte' ? x >= y : x > y;
          result = known(current, id, { kind: 'boolean', value }, dependencies);
        } else if (a.kind !== 'quantity' || b.kind !== 'quantity') result = invalid(current, id, location, '算术输入必须是数量。', 'unit-mismatch', dependencies);
        else if (node.op === 'divide' && b.value === 0) result = invalid(current, id, location, '公式除数为0。', 'arithmetic', dependencies);
        else {
          const value = node.op === 'add' ? a.value + b.value : node.op === 'subtract' ? a.value - b.value
            : node.op === 'multiply' ? a.value * b.value : node.op === 'divide' ? a.value / b.value
              : node.op === 'min' ? Math.min(a.value, b.value) : Math.max(a.value, b.value);
          const type = current.types.get(id)!;
          result = known(current, id, { kind: 'quantity', unit: type.kind === 'quantity' ? type.unit : 'scalar', value }, dependencies);
        }
      }
    }
    frame.memo.set(id, result);
    return result;
  }
  const readInputs = new Map<string, EvaluatedValue>();
  root = { formula, memo: new Map(), input: (key, spec, depth) => {
    if (readInputs.has(key)) return readInputs.get(key)!;
    const resolved = runtime?.resolveInput(key, spec, depth);
    if (resolved) {
      const error = resolved.state === 'known' ? inputIssue(resolved.value, spec) : undefined;
      const checked = error ? invalid(formula, key, formula.pointer + '/inputs' + calculationJsonPointer([key]), error, 'invalid-range', [resolved.traceId]) : resolved;
      readInputs.set(key, checked);
      return checked;
    }
    const present = inputSnapshot.has(key), value = present ? inputSnapshot.get(key) : spec.default;
    const evaluated = value == null ? missing(formula, key, spec) : emit(formula, key, [], value, 'known', [], 'read');
    readInputs.set(key, evaluated);
    return evaluated;
  } };
  for (const name of selected) {
    if (!Object.hasOwn(formula.definition.outputs, name)) continue;
    const output = formula.definition.outputs[name];
    const value = evaluate(root, output.node, (runtime?.depth ?? 0) + 1);
    outputs[name] = value.state === 'known' && !valueMatchesType(value.value, output.type)
      ? invalid(formula, output.node, formula.pointer + '/outputs' + calculationJsonPointer([name]), '输出不符合声明类型。', 'unit-mismatch', [value.traceId]) : value;
  }
  return finish();
}
