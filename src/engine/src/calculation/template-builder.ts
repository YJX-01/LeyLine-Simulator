import type { DefinitionRef, FormulaDefinition, FormulaInput, Value, ValueType } from '@leyline/schema';
import type { FormulaGraph, FormulaNode } from './formula-ir';

export const quantityType = (unit: Extract<ValueType, { kind: 'quantity' }>['unit']): ValueType => ({ kind: 'quantity', unit });

/** Fixed TS algorithms build this private representation to retain lazy reads, units and traces. */
export class TemplateBuilder {
  readonly graph: FormulaGraph;
  private readonly ids = new Set<string>();
  constructor(recipe: FormulaDefinition) {
    this.graph = { identity: recipe.identity, sources: recipe.sources, inputs: Object.create(null) as Record<string, FormulaInput>,
      nodes: [], outputs: Object.create(null) as FormulaGraph['outputs'], stages: [] };
  }
  node(node: FormulaNode): string {
    if (this.ids.has(node.id)) throw new Error('模板输入与内部名称冲突：' + node.id);
    this.ids.add(node.id); this.graph.nodes.push(node); return node.id;
  }
  input(id: string, type: ValueType, options: Partial<Omit<FormulaInput, 'type'>> = {}): string {
    this.graph.inputs[id] = { type, required: true, ...options };
    return this.node({ id, op: 'input', key: id });
  }
  constant(id: string, value: Value): string { return this.node({ id, op: 'constant', value }); }
  quantity(id: string, unit: Extract<Value, { kind: 'quantity' }>['unit'], value: number): string { return this.constant(id, { kind: 'quantity', unit, value }); }
  add(id: string, left: string, right: string): string { return this.node({ id, op: 'add', left, right }); }
  subtract(id: string, left: string, right: string): string { return this.node({ id, op: 'subtract', left, right }); }
  multiply(id: string, left: string, right: string): string { return this.node({ id, op: 'multiply', left, right }); }
  divide(id: string, left: string, right: string): string { return this.node({ id, op: 'divide', left, right }); }
  min(id: string, left: string, right: string): string { return this.node({ id, op: 'min', left, right }); }
  max(id: string, left: string, right: string): string { return this.node({ id, op: 'max', left, right }); }
  compare(id: string, relation: 'lt' | 'lte' | 'eq' | 'gte' | 'gt', left: string, right: string): string { return this.node({ id, op: 'compare', relation, left, right }); }
  select(id: string, condition: string, yes: string, no: string): string { return this.node({ id, op: 'select', condition, yes, no }); }
  scale(id: string, attribute: string, coefficient: string): string { return this.node({ id, op: 'scale-to-damage', attribute, coefficient }); }
  call(id: string, formula: DefinitionRef, bindings: Record<string, string>, output: string): string { return this.node({ id, op: 'call', formula, bindings, output }); }
  lookup(id: string, table: DefinitionRef, index: string): string { return this.node({ id, op: 'lookup', table, index }); }
  output(id: string, node: string, type: ValueType): void { this.graph.outputs[id] = { node, type }; }
  stage(id: string, node: string, labelKey: string): void { this.graph.stages.push({ id, node, labelKey }); }
  finish(): FormulaGraph { return this.graph; }
}
