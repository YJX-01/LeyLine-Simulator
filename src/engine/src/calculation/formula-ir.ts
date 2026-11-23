import type { DefinitionRef, FormulaInput, Value, ValueType } from '@leyline/schema';

/** Engine-owned execution representation. Never accepted as a document or exported in a bundle. */
export type FormulaNode =
  | { id: string; op: 'constant'; value: Value }
  | { id: string; op: 'input'; key: string }
  | { id: string; op: 'add' | 'subtract' | 'multiply' | 'divide' | 'min' | 'max'; left: string; right: string }
  | { id: string; op: 'compare'; relation: 'lt' | 'lte' | 'eq' | 'gte' | 'gt'; left: string; right: string }
  | { id: string; op: 'select'; condition: string; yes: string; no: string }
  | { id: string; op: 'condition-group'; operator: 'all' | 'any'; conditions: string[] }
  | { id: string; op: 'confirmed-multiple'; basis: string; step: number }
  | { id: string; op: 'scale-to-damage'; attribute: string; coefficient: string }
  | { id: string; op: 'lookup'; table: DefinitionRef; index: string }
  | { id: string; op: 'call'; formula: DefinitionRef; bindings: Record<string, string>; output: string };
export interface FormulaGraph {
  identity: DefinitionRef;
  inputs: Record<string, FormulaInput>;
  nodes: FormulaNode[];
  outputs: Record<string, { node: string; type: ValueType }>;
  stages: { id: string; node: string; labelKey: string }[];
  modifierPorts?: Record<string, { input: string; type: ValueType; combine: 'sum' | 'product' | 'max' | 'replace'; neutral: Value; scope: 'hit' | 'contributor' }>;
  sources: string[];
}
export function formulaNodeReferences(node: FormulaNode): string[] {
  if ('left' in node) return [node.left, node.right];
  if (node.op === 'select') return [node.condition, node.yes, node.no];
  if (node.op === 'condition-group') return node.conditions;
  if (node.op === 'confirmed-multiple') return [node.basis];
  if (node.op === 'scale-to-damage') return [node.attribute, node.coefficient];
  if (node.op === 'lookup') return [node.index];
  if (node.op === 'call') return Object.values(node.bindings);
  return [];
}
