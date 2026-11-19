import { calculationJsonPointer, calculationValueSchema, definitionKey, valueMatchesType, valueTypeAssignable,
  type BoundFormula, type CalculationBinding, type CalculationDiagnosticCode, type DefinitionRef, type ValueType } from '@leyline/schema';
import type { CompiledData } from './compile';

export type BindingReporter = (code: CalculationDiagnosticCode, pointer: string, message: string) => unknown;

export function validateFormulaBindings(data: CompiledData, reference: DefinitionRef, bindings: Record<string, CalculationBinding>,
  output: string, pointer: string, report: BindingReporter, ports = false, depth = 0): ValueType | undefined {
  const formula = data.formulas.get(definitionKey(reference));
  if (!formula) { report('missing-dependency', pointer + '/formula', '绑定缺少公式的精确版本。'); return; }
  const portInputs = new Set(ports ? Object.values(formula.definition.modifierPorts ?? {}).map(port => port.input) : []);
  for (const [key, spec] of Object.entries(formula.definition.inputs)) {
    const binding = Object.hasOwn(bindings, key) ? bindings[key] : undefined;
    if (portInputs.has(key)) {
      if (binding) report('conflicting-definition', pointer + '/bindings' + calculationJsonPointer([key]), '效果端口拥有的输入不得同时手工绑定。');
    } else if (binding) validateBinding(data, binding, pointer + '/bindings' + calculationJsonPointer([key]), report, spec.type, depth + 1);
    else if (spec.required) report('missing-dependency', pointer + '/bindings' + calculationJsonPointer([key]), '缺少必需绑定：' + key);
  }
  for (const key of Object.keys(bindings)) if (!Object.hasOwn(formula.definition.inputs, key)) report('invalid-range', pointer + '/bindings' + calculationJsonPointer([key]), '未声明此公式输入。');
  if (!Object.hasOwn(formula.definition.outputs, output)) { report('missing-dependency', pointer + '/output', '绑定输出不存在。'); return; }
  return formula.definition.outputs[output].type;
}

export function validateBinding(data: CompiledData, binding: CalculationBinding, pointer: string, report: BindingReporter,
  expected?: ValueType, depth = 0): ValueType | undefined {
  if (depth > 128) { report('budget', pointer, '绑定深度超过预算。'); return; }
  let type: ValueType | undefined;
  if (binding.kind === 'constant') type = binding.value.kind === 'quantity' ? { kind: 'quantity', unit: binding.value.unit }
    : binding.value.kind === 'enum' ? { kind: 'enum', values: [binding.value.value] } : { kind: 'boolean' };
  else if (binding.kind === 'attribute' || binding.kind === 'enemy') {
    const attribute = data.attributes.get(definitionKey(binding.key));
    if (!attribute) report('missing-dependency', pointer + '/key', '绑定缺少属性的精确版本。');
    else {
      type = attribute.type;
      if ((binding.kind === 'enemy') !== (attribute.scope === 'target')) report('unit-mismatch', pointer, '属性读取方式与作用域不匹配。');
    }
  } else if (binding.kind === 'formula') type = validateFormulaBindings(data, binding.formula, binding.inputs, binding.output, pointer, report, false, depth + 1);
  else if (binding.kind === 'actor-state' || binding.kind === 'team-count') type = { kind: 'quantity', unit: 'count' };
  else {
    type = binding.type;
    if (binding.kind === 'refinement-parameter' && binding.values.some(value => {
      const parsed = calculationValueSchema.safeParse({ kind: 'quantity', unit: binding.type.unit, value });
      return !parsed.success || !valueMatchesType(parsed.data, binding.type);
    })) report('invalid-range', pointer, '精炼参数不符合声明类型。');
  }
  if (type && expected && !valueTypeAssignable(type, expected)) report('unit-mismatch', pointer, '绑定类型或单位与目标不一致。');
  return type;
}

export function validateBoundFormula(data: CompiledData, invocation: BoundFormula, report: BindingReporter): void {
  validateFormulaBindings(data, invocation.formula, invocation.bindings, invocation.output, '/invocation', report, true);
  if (invocation.predicate) validateBinding(data, invocation.predicate, '/invocation/predicate', report, { kind: 'boolean' });
  const captures = new Map(invocation.captures.map(slot => [slot.id, slot]));
  if (captures.size !== invocation.captures.length) report('conflicting-definition', '/invocation/captures', '捕获槽标识重复。');
  for (const [index, slot] of invocation.captures.entries()) for (const reference of slot.attributes) {
    if (!data.attributes.has(definitionKey(reference))) report('missing-dependency', `/invocation/captures/${index}`, '捕获槽缺少属性的精确版本。');
  }
  function visit(binding: CalculationBinding): void {
    if (binding.kind === 'attribute' && binding.at.kind === 'capture') {
      const slot = captures.get(binding.at.slot);
      if (!slot || !slot.attributes.some(attribute => definitionKey(attribute) === definitionKey(binding.key))) report('missing-dependency', '/invocation/bindings', '属性未在对应捕获槽中声明。');
    }
    if (binding.kind === 'formula') Object.values(binding.inputs).forEach(visit);
  }
  Object.values(invocation.bindings).forEach(visit);
  if (invocation.predicate) visit(invocation.predicate);
}
