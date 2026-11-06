import type { WorkbenchProject } from '@leyline/schema';
import { actorLabel, definitionLabel, nodeLabel, unitLabel, inputLabel, capabilityLabel } from './workbench-labels';

export interface DamagePresentation {
  actorLabel: string;
  definitionLabel: string;
  rootLabel: string;
  expression: string;
}

/** Display the saved expression structure without evaluating combat rules. */
export function formatWorkbenchExpression(project: WorkbenchProject, definitionId: string, rootId?: string): string {
  const definition = project.definitions.find(entry => entry.id === definitionId);
  if (!definition) return '缺失定义';
  const root = rootId ?? definition.damage;
  if (!root) return '未指定公式';
  const nodes = new Map(definition.nodes.map(node => [node.id, node]));
  let visits = 0;
  let overBudget = false;
  const format = (id: string, path: ReadonlySet<string>, depth: number): string => {
    if (overBudget) return '';
    if (depth >= 32 || ++visits > 512) { overBudget = true; return ''; }
    if (path.has(id)) return '循环引用';
    const node = nodes.get(id);
    if (!node) return '缺失节点';
    const next = new Set(path).add(id);
    switch (node.op) {
      case 'constant': return `${node.quantity.value} [${unitLabel(node.quantity.unit)}]`;
      case 'input': return `${inputLabel(node.key)} [${unitLabel(node.unit)}]`;
      case 'add': case 'multiply': case 'divide': {
        const symbol = node.op === 'add' ? '+' : node.op === 'multiply' ? '×' : '÷';
        return `(${format(node.left, next, depth + 1)} ${symbol} ${format(node.right, next, depth + 1)})`;
      }
      case 'condition': return `(条件 ${inputLabel(node.key)} ? ${format(node.yes, next, depth + 1)} : ${format(node.no, next, depth + 1)})`;
      case 'unsupported': return `尚未支持(${capabilityLabel(node.capability)})`;
    }
  };
  const expression = format(root, new Set(), 0);
  return overBudget ? '表达式过长' : expression;
}

/** Resolve display labels from the selected record's own definition snapshot. */
export function getDamagePresentation(project: WorkbenchProject, recordId: string): DamagePresentation {
  const record = project.timeline.find(entry => entry.id === recordId);
  if (!record) return { actorLabel: '未选择角色', definitionLabel: '未选择定义', rootLabel: '未指定公式', expression: '未选择记录' };
  const definition = project.definitions.find(entry => entry.id === record.definition);
  return {
    actorLabel: actorLabel(project, record.actor),
    definitionLabel: definition ? `${definitionLabel(project, definition.id)} · 版本${definition.version}` : '缺失定义',
    rootLabel: nodeLabel(project, record.definition, definition?.damage),
    expression: formatWorkbenchExpression(project, record.definition),
  };
}
