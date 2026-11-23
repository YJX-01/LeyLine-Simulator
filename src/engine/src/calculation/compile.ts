import { APP_VERSION } from '@leyline/schema/version';
import { calculationBundleSchema, calculationJsonPointer, calculationLibraryValueLimit, calculationRuntimeFeatures, calculationTemplateIds, definitionKey, inspectCalculationStructure, sameValueType, valueTypeAssignable,
  type AggregateDefinition, type AttributeDefinition, type EffectDefinition, type SourceRecord, type CalculationBundle, type CalculationCoverageRecord, type CalculationDiagnostic, type CalculationDiagnosticCode, type DefinitionRef, type FormulaDefinition, type StateMachineDefinition, type StateValueSource, type TableDefinition, type ValueType } from '@leyline/schema';
import { validateBinding, validateBoundFormula } from './binding-validation';
import { formulaNodeReferences, type FormulaGraph, type FormulaNode } from './formula-ir';
import { instantiateCalculationTemplate } from './templates';

export const calculationBudgets = Object.freeze({ nodes: 20000, depth: 128, visits: 100000, trace: 100000, probabilityStates: 256 });
export interface CompiledFormula {
  configuration: FormulaDefinition;
  definition: FormulaGraph;
  pointer: string;
  nodes: ReadonlyMap<string, FormulaNode>;
  types: ReadonlyMap<string, ValueType>;
  expandedNodes: number;
  depth: number;
}
export interface CompiledData {
  formulas: ReadonlyMap<string, CompiledFormula>;
  tables: ReadonlyMap<string, TableDefinition>;
  aggregates: ReadonlyMap<string, AggregateDefinition>;
  attributes: ReadonlyMap<string, AttributeDefinition>;
  effects: ReadonlyMap<string, EffectDefinition>;
  coverage: ReadonlyMap<string, CalculationCoverageRecord>;
  stateMachines: ReadonlyMap<string, StateMachineDefinition>;
  sources: readonly SourceRecord[];
  damageFamilies: readonly string[];
  features: readonly string[];
}
declare const compiledBrand: unique symbol;
export interface CompiledCalculation { readonly [compiledBrand]: true; readonly runtimeVersion: typeof APP_VERSION; readonly formulaCount: number }
const programs = new WeakMap<CompiledCalculation, CompiledData>();
export function compiledData(program: CompiledCalculation): CompiledData | undefined { return programs.get(program); }
export type CompileResult = { ok: true; program: CompiledCalculation; diagnostics: CalculationDiagnostic[] }
  | { ok: false; diagnostics: CalculationDiagnostic[] };

/** Canonical identity comparison ignores object member order, preserving array order and numeric values. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
  return JSON.stringify(value);
}

/** Coalesce shared snapshots before applying the document budget. Conflicts stay visible to the compiler. */
export function deduplicateCalculationBundle(bundle: CalculationBundle): CalculationBundle {
  const result = {...bundle};
  for (const field of ['sources','formulas','tables','attributes','effects','aggregates','coverage','stateMachines'] as const) {
    const seen = new Map<string, unknown>();
    const definitions = bundle[field].filter(definition => {
      const key = 'identity' in definition ? definitionKey(definition.identity) : definition.id;
      const previous = seen.get(key);
      if (previous) return previous !== definition && canonical(previous) !== canonical(definition);
      seen.set(key, definition);
      return true;
    });
    Object.assign(result, { [field]: definitions });
  }
  return result;
}
function freeze(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
}

export function compileCalculation(input: unknown): CompileResult {
  // The compiler also accepts the offline union of all catalog dependency closures.
  const diagnostics: CalculationDiagnostic[] = inspectCalculationStructure(input, calculationLibraryValueLimit);
  if (diagnostics.length) return { ok: false, diagnostics };
  const report = (code: CalculationDiagnosticCode, jsonPointer: string, message: string, nodeId?: string) => {
    if (!diagnostics.some(item => item.code === code && item.jsonPointer === jsonPointer && item.message === message)) {
      diagnostics.push({ code, severity: 'error', jsonPointer, message, affectedOutputIds: [], ...(nodeId ? { nodeId } : {}) });
    }
  };
  if (input && typeof input === 'object') {
    const raw = input as Record<string, unknown>;
    if (raw.schemaVersion !== APP_VERSION || raw.runtimeVersion !== APP_VERSION) {
      report('unsupported-version', raw.schemaVersion !== APP_VERSION ? '/schemaVersion' : '/runtimeVersion', '计算库或运行时版本不受支持。');
      return { ok: false, diagnostics };
    }
    if (Array.isArray(raw.requiredFeatures)) for (const [index, feature] of raw.requiredFeatures.entries()) {
      if (!(calculationRuntimeFeatures as readonly unknown[]).includes(feature)) report('unsupported-feature', `/requiredFeatures/${index}`, '运行时不支持此能力：' + String(feature));
    }
    if (Array.isArray(raw.formulas)) for (const [index, entry] of raw.formulas.entries()) {
      if (!entry || typeof entry !== 'object') continue;
      const selected = (entry as Record<string, unknown>).template;
      if (!selected || typeof selected !== 'object') continue;
      const template = selected as Record<string, unknown>;
      if (typeof template.id === 'string' && !(calculationTemplateIds as readonly string[]).includes(template.id)) report('unsupported-feature', `/formulas/${index}/template/id`, '运行时不支持此计算模板：' + template.id);
      if (typeof template.revision === 'string' && template.revision !== '1') report('unsupported-version', `/formulas/${index}/template/revision`, '计算模板修订不受支持。');
    }
    if (diagnostics.length) return { ok: false, diagnostics };
  }
  const parsed = calculationBundleSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) report(issue.path.at(-1) === 'id' && issue.path.includes('template') ? 'unsupported-feature'
      : ['schemaVersion', 'runtimeVersion', 'revision'].includes(String(issue.path.at(-1))) ? 'unsupported-version' : 'invalid-range', calculationJsonPointer(issue.path), issue.message);
    return { ok: false, diagnostics };
  }
  const bundle: CalculationBundle = parsed.data;
  freeze(bundle);
  const formulas = new Map<string, { definition: FormulaGraph; configuration: FormulaDefinition; pointer: string }>();
  const tables = new Map<string, TableDefinition>();
  const sources = new Map<string, string>();
  const identities = new Map<string, { kind: string; content: string }>();
  const addIdentity = (reference: DefinitionRef, definition: unknown, kind: string, pointer: string) => {
    const key = definitionKey(reference), content = canonical(definition), existing = identities.get(key);
    if (existing && (existing.kind !== kind || existing.content !== content)) report('conflicting-definition', pointer, '相同完整身份对应不同定义。');
    if (!existing) identities.set(key, { kind, content });
    return key;
  };
  for (const [index, source] of bundle.sources.entries()) {
    const content = canonical(source), previous = sources.get(source.id);
    if (previous !== undefined && previous !== content) report('conflicting-definition', `/sources/${index}`, '同一来源标识的内容冲突。');
    sources.set(source.id, content);
  }
  const sourceRefs = (references: string[], pointer: string) => {
    for (const [index, source] of references.entries()) if (!sources.has(source)) report('missing-dependency', `${pointer}/sources/${index}`, '闭包缺少来源：' + source);
  };
  for (const [index, table] of bundle.tables.entries()) {
    const pointer = `/tables/${index}`;
    const key = addIdentity(table.identity, table, 'table', pointer);
    if (!tables.has(key)) tables.set(key, table);
    sourceRefs(table.sources, pointer);
  }
  for (const [index, configuration] of bundle.formulas.entries()) {
    const pointer = `/formulas/${index}`, key = addIdentity(configuration.identity, configuration, 'formula', pointer);
    if (!formulas.has(key)) {
      try {
        const definition = instantiateCalculationTemplate(configuration); freeze(definition);
        formulas.set(key, { definition, configuration, pointer });
      } catch (cause) { report('invalid-range', pointer + '/template', cause instanceof Error ? cause.message : '固定模板配置非法。'); }
    }
    sourceRefs(configuration.sources, pointer);
  }
  if (Array.from(formulas.values()).reduce((sum, formula) => sum + formula.definition.nodes.length, 0) > calculationBudgets.nodes) {
    report('budget', '/formulas', '公式闭包总节点超过预算。');
  }
  const requireFeature = (feature: string, pointer: string) => {
    if (!bundle.requiredFeatures.includes(feature)) report('unsupported-feature', pointer, '计算库未声明使用的运行能力：' + feature);
  };
  requireFeature('fixed-templates-v1', '/requiredFeatures');
  if (diagnostics.length) return { ok: false, diagnostics };
  const compiled = new Map<string, CompiledFormula>();
  const active = new Set<string>();
  function compile(key: string): CompiledFormula | undefined {
    if (compiled.has(key)) return compiled.get(key)!;
    const entry = formulas.get(key);
    if (!entry) return undefined;
    const { definition, configuration, pointer } = entry;
    if (active.has(key)) { report('cycle', pointer, '公式调用存在递归。'); return undefined; }
    if (active.size >= calculationBudgets.depth) { report('budget', pointer, '公式调用深度超过预算。'); return undefined; }
    active.add(key);
    const nodes = new Map(definition.nodes.map(node => [node.id, node]));
    const types = new Map<string, ValueType>();
    const heights = new Map<string, number>();
    const visiting = new Set<string>();
    let expandedNodes = definition.nodes.length;
    const quantity = (unit: Extract<ValueType, { kind: 'quantity' }>['unit']): ValueType => ({ kind: 'quantity', unit });
    const infer = (id: string): ValueType | undefined => {
      if (types.has(id)) return types.get(id)!;
      const node = nodes.get(id);
      if (!node) return undefined;
      const location = `${pointer}/template`;
      if (visiting.has(id)) { report('cycle', location, '公式节点存在依赖循环。', id); return undefined; }
      if (visiting.size >= calculationBudgets.depth) { report('budget', location, '公式节点深度超过预算。', id); return undefined; }
      visiting.add(id);
      const references = formulaNodeReferences(node);
      for (const reference of references) infer(reference);
      let height = 1 + Math.max(0, ...references.map(reference => heights.get(reference) ?? 0));
      let type: ValueType | undefined;
      const wrong = (message: string) => report('unit-mismatch', location, message, id);
      if (node.op === 'constant') type = node.value.kind === 'quantity' ? quantity(node.value.unit)
        : node.value.kind === 'enum' ? { kind: 'enum', values: [node.value.value] } : { kind: 'boolean' };
      else if (node.op === 'input') type = definition.inputs[node.key].type;
      else if (node.op === 'call') {
        requireFeature('formula-call-v1', location);
        const calleeKey = definitionKey(node.formula), calleeEntry = formulas.get(calleeKey);
        if (!calleeEntry) report('missing-dependency', location + '/formula', '缺少公式的精确版本。', id);
        else {
          const callee = compile(calleeKey);
          if (callee) {
            expandedNodes = Math.min(calculationBudgets.nodes + 1, expandedNodes + callee.expandedNodes);
            height += callee.depth;
            for (const [name, input] of Object.entries(callee.definition.inputs)) {
              const binding = Object.hasOwn(node.bindings, name) ? node.bindings[name] : undefined;
              if (binding === undefined && input.required) report('missing-dependency', location + '/bindings' + calculationJsonPointer([name]), '调用缺少必需输入：' + name, id);
              if (binding !== undefined && types.has(binding) && !valueTypeAssignable(types.get(binding)!, input.type)) wrong('调用输入单位或类型不匹配：' + name);
            }
            for (const name of Object.keys(node.bindings)) if (!Object.hasOwn(callee.definition.inputs, name)) report('invalid-range', location + '/bindings', '调用包含未声明输入：' + name, id);
            const output = Object.hasOwn(callee.definition.outputs, node.output) ? callee.definition.outputs[node.output] : undefined;
            if (!output) report('missing-dependency', location + '/output', '调用输出不存在。', id);
            else type = output.type;
          }
        }
      } else if (node.op === 'lookup') {
        requireFeature('table-lookup-v1', location);
        const table = tables.get(definitionKey(node.table)), index = types.get(node.index);
        if (!table) report('missing-dependency', location + '/table', '缺少参数表的精确版本。', id);
        else {
          if (index && (table.kind === 'integer' ? index.kind !== 'quantity' || index.unit !== 'count'
            : index.kind !== 'enum' || index.values.some(value => !table.keys.includes(value)))) wrong('查表索引必须匹配整数次数或声明的枚举键。');
          type = table.valueType;
        }
      } else if (node.op === 'condition-group') {
        if (node.conditions.some(id => types.get(id)?.kind !== 'boolean')) wrong('组合条件必须全部为布尔值。');
        else type = { kind: 'boolean' };
      } else if (node.op === 'confirmed-multiple') {
        type = types.get(node.basis);
        if (type && (type.kind !== 'quantity' || type.unit !== 'scalar')) wrong('已核实档位需要无量纲数量。');
      } else if (node.op === 'select') {
        const condition = types.get(node.condition), yes = types.get(node.yes), no = types.get(node.no);
        if (condition && condition.kind !== 'boolean') wrong('条件分支必须读取布尔值。');
        if (yes && no) {
          if (yes.kind === 'enum' && no.kind === 'enum') type = { kind: 'enum', values: [...new Set([...yes.values, ...no.values])] };
          else if (!sameValueType(yes, no)) wrong('两个分支类型不一致。'); else type = yes;
        }
      } else if (node.op === 'scale-to-damage') {
        const attribute = types.get(node.attribute), coefficient = types.get(node.coefficient);
        if (attribute && coefficient) {
          if (attribute.kind !== 'quantity' || !['attack', 'hp', 'defense', 'elementalMastery'].includes(attribute.unit)
            || coefficient.kind !== 'quantity' || coefficient.unit !== 'scalar') wrong('伤害缩放只允许攻击、生命、防御或精通乘无量纲系数。');
          else type = quantity('damage');
        }
      } else if ('left' in node) {
        const left = types.get(node.left), right = types.get(node.right);
        if (left && right) {
          if (node.op === 'compare') {
            if (!(sameValueType(left, right) || left.kind === 'enum' && right.kind === 'enum'
              && (valueTypeAssignable(left, right) || valueTypeAssignable(right, left))) || node.relation !== 'eq' && left.kind !== 'quantity') wrong('比较要求同类型，布尔和枚举只允许相等比较。');
            else type = { kind: 'boolean' };
          } else if (left.kind !== 'quantity' || right.kind !== 'quantity') wrong('算术运算要求数量。');
          else if (node.op === 'multiply') {
            if (left.unit !== 'scalar' && right.unit !== 'scalar') wrong('相乘至少一侧须为无量纲数量。');
            else type = quantity(left.unit === 'scalar' ? right.unit : left.unit);
          } else if (node.op === 'divide') {
            if (left.unit !== right.unit && right.unit !== 'scalar') wrong('相除要求相同单位或无量纲除数。');
            else type = quantity(left.unit === right.unit ? 'scalar' : left.unit);
          } else if (left.unit !== right.unit) wrong('相加、相减和取界要求相同单位。');
          else type = left;
        }
      }
      if (height > calculationBudgets.depth) report('budget', location, '展开后的公式深度超过预算。', id);
      heights.set(id, height);
      visiting.delete(id);
      if (type) types.set(id, type);
      return type;
    };
    // Every node is checked, including inactive branches and unrequested outputs.
    for (const node of definition.nodes) infer(node.id);
    for (const [name, output] of Object.entries(definition.outputs)) {
      const inferred = types.get(output.node);
      if (inferred && !valueTypeAssignable(inferred, output.type)) report('unit-mismatch', pointer + '/outputs' + calculationJsonPointer([name]), '声明输出与实际节点类型不一致。', output.node);
    }
    if (Object.keys(definition.modifierPorts ?? {}).length) requireFeature('modifier-port-v1', pointer + '/modifierPorts');
    if (expandedNodes > calculationBudgets.nodes) report('budget', pointer, '调用展开后的节点总量超过预算。');
    const result: CompiledFormula = { definition, configuration, pointer, nodes, types, expandedNodes, depth: Math.max(0, ...heights.values()) };
    active.delete(key);
    compiled.set(key, result);
    return result;
  }
  for (const key of formulas.keys()) compile(key);
  const aggregates = new Map<string, AggregateDefinition>();
  for (const [index, aggregate] of bundle.aggregates.entries()) {
    const pointer = `/aggregates/${index}`;
    requireFeature('aggregate-v1', pointer);
    const key = addIdentity(aggregate.identity, aggregate, 'aggregate', pointer);
    if (!aggregates.has(key)) aggregates.set(key, aggregate);
    sourceRefs(aggregate.sources, pointer);
    const formula = compiled.get(definitionKey(aggregate.itemFormula));
    if (!formula) report('missing-dependency', pointer + '/itemFormula', '聚合缺少逐人公式的精确版本。');
    else for (const output of [aggregate.itemOutput, aggregate.rankMetric.output]) {
      const value = Object.hasOwn(formula.definition.outputs, output) ? formula.definition.outputs[output] : undefined;
      if (!value) report('missing-dependency', pointer, '聚合引用的逐人输出不存在。');
      else if (value.type.kind !== 'quantity' || value.type.unit !== 'damage') report('unit-mismatch', pointer, '贡献值与排序依据必须是伤害数量。');
    }
  }
  const attributes = new Map<string, AttributeDefinition>(), effects = new Map<string, EffectDefinition>();
  for (const [index, attribute] of bundle.attributes.entries()) {
    const pointer = `/attributes/${index}`, key = addIdentity(attribute.identity, attribute, 'attribute', pointer);
    if (!attributes.has(key)) attributes.set(key, attribute);
    sourceRefs(attribute.sources, pointer);
    requireFeature('combat-binding-v1', pointer);
  }
  for (const [index, effect] of bundle.effects.entries()) {
    const pointer = `/effects/${index}`, key = addIdentity(effect.identity, effect, 'effect', pointer);
    if (!effects.has(key)) effects.set(key, effect);
    sourceRefs(effect.sources, pointer);
    requireFeature('combat-binding-v1', pointer); requireFeature('effect-v1', pointer);
  }
  const coverage = new Map<string, CalculationCoverageRecord>();
  for (const [index, record] of bundle.coverage.entries()) {
    const pointer = `/coverage/${index}`, key = addIdentity(record.identity, record, 'coverage', pointer);
    if (!coverage.has(key)) coverage.set(key, record);
    requireFeature('coverage-v1', pointer); sourceRefs(record.sources, pointer);
    for (const mechanism of record.mechanisms) for (const reference of mechanism.ruleIds) if (!effects.has(definitionKey(reference))) report('missing-dependency', pointer + '/mechanisms', '覆盖记录缺少规则的精确版本。');
  }
  const stateMachines = new Map<string, StateMachineDefinition>();
  for (const [index, machine] of bundle.stateMachines.entries()) {
    const pointer = `/stateMachines/${index}`, key = addIdentity(machine.identity, machine, 'state-machine', pointer);
    stateMachines.set(key, machine); sourceRefs(machine.sources, pointer); requireFeature('event-state-v1', pointer);
  }
  const data: CompiledData = { formulas: compiled, tables, aggregates, attributes, effects, coverage, stateMachines, sources: bundle.sources,
    damageFamilies: bundle.damageFamilies ?? [], features: bundle.requiredFeatures };
  for (const [index, attribute] of bundle.attributes.entries()) {
    if (attribute.base.kind !== 'input') validateBinding(data, attribute.base, `/attributes/${index}/base`, report, attribute.type);
  }
  const groups = new Map<string, string>();
  for (const [index, effect] of bundle.effects.entries()) {
    const pointer = `/effects/${index}`;
    if (effect.predicate) validateBinding(data, effect.predicate, pointer + '/predicate', report, { kind: 'boolean' });
    let type: ValueType | undefined;
    if (effect.target.kind === 'attribute') {
      const reference = effect.target.attribute;
      const attribute = attributes.get(definitionKey(reference));
      if (!attribute) report('missing-dependency', pointer + '/target', `效果缺少属性的精确版本（${reference.namespace}/${reference.id}，修订 ${reference.revision}）。`);
      else {
        type = attribute.type;
        if ((effect.recipient.role === 'target') !== (attribute.scope === 'target')) report('unit-mismatch', pointer + '/recipient', '效果接收者与属性作用域不匹配。');
      }
    } else {
      const formula = compiled.get(definitionKey(effect.target.formula));
      const port = formula?.definition.modifierPorts?.[effect.target.port];
      if (!port || !Object.hasOwn(formula!.definition.modifierPorts!, effect.target.port)) report('missing-dependency', pointer + '/target', '效果缺少公式端口的精确版本。');
      else type = port.type;
    }
    validateBinding(data, effect.value, pointer + '/value', report, type);
    if (effect.stacking.policy === 'max' && type?.kind !== 'quantity') report('unit-mismatch', pointer + '/stacking', '最大值叠加要求数量。');
    for (const family of effect.appliesTo.families ?? []) if (!data.damageFamilies.includes(family)) report('missing-dependency', pointer + '/appliesTo/families', '效果引用了未声明的伤害族：' + family);
    const groupKey = JSON.stringify([effect.stacking.group, effect.stacking.scope, effect.target]);
    const policy = canonical({ ...effect.stacking, group: undefined });
    if (groups.has(groupKey) && groups.get(groupKey) !== policy) report('conflicting-definition', pointer + '/stacking', '同一效果组的叠加策略冲突。');
    groups.set(groupKey, policy);
  }
  for (const [index, machine] of bundle.stateMachines.entries()) {
    const valueSource = (source: StateValueSource, expected: ValueType, pointer: string) => {
      if (source.kind === 'literal') {
        const actual = source.value.kind === 'quantity' ? { kind: 'quantity' as const, unit: source.value.unit } : source.value.kind === 'boolean' ? { kind: 'boolean' as const } : { kind: 'enum' as const, values: [source.value.value] };
        if (!valueTypeAssignable(actual, expected)) report('unit-mismatch', pointer, '状态数值来源与目标类型不符。');
        if (expected.kind === 'quantity' && expected.unit === 'milliseconds' && (source.value.kind !== 'quantity' || source.value.value <= 0)) report('invalid-range', pointer, '状态时效必须为正毫秒。');
      } else if (source.kind === 'input') {
        if (!valueTypeAssignable(source.type, expected)) report('unit-mismatch', pointer, '状态事实输入与目标类型不符。');
      } else {
        validateBoundFormula(data, source.invocation, (code, location, message) => report(code, pointer + location, message));
        const type = compiled.get(definitionKey(source.invocation.formula))?.definition.outputs[source.invocation.output]?.type;
        if (type && !valueTypeAssignable(type, expected)) report('unit-mismatch', pointer, '状态公式输出与目标类型不符。');
      }
    };
    for (const [stateIndex, state] of machine.states.entries()) if (state.duration) valueSource(state.duration, { kind: 'quantity', unit: 'milliseconds' }, `/stateMachines/${index}/states/${stateIndex}/duration`);
    for (const [requirementIndex, requirement] of machine.requirements.entries()) valueSource({ kind: 'formula', invocation: requirement.predicate }, { kind: 'boolean' }, `/stateMachines/${index}/requirements/${requirementIndex}/predicate`);
    for (const [transitionIndex, transition] of machine.transitions.entries()) {
      const pointer = `/stateMachines/${index}/transitions/${transitionIndex}`;
      if (transition.predicate) valueSource({ kind: 'formula', invocation: transition.predicate }, { kind: 'boolean' }, pointer + '/predicate');
      for (const [updateIndex, update] of transition.updates.entries()) if (update.value) valueSource(update.value, machine.states.find(state => state.key === update.state)!.type, pointer + `/updates/${updateIndex}/value`);
    }
  }
  if (diagnostics.length) return { ok: false, diagnostics };
  const program = Object.freeze({ runtimeVersion: APP_VERSION, formulaCount: compiled.size }) as CompiledCalculation;
  programs.set(program, data);
  return { ok: true, program, diagnostics };
}
