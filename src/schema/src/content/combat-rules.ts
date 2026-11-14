import { z } from 'zod';
import { idSchema, contentSourceSchema, supportSchema } from '../common/values';
import { effectSchema, expressionNodeSchema, expressionReferences } from '../project/expressions';

/** Content snapshots share the project's expression and effect contracts, never executable code. */
export const combatRuleSchema = z.object({
  id: idSchema, revision: idSchema, source: contentSourceSchema,
  support: supportSchema.optional(),
  nodes: z.array(expressionNodeSchema).min(1).max(1000),
  effects: z.array(effectSchema).min(1).max(100),
}).strict().superRefine((rule, context) => {
  const nodes = new Map(rule.nodes.map(node => [node.id, node]));
  if (nodes.size !== rule.nodes.length || new Set(rule.effects.map(effect => effect.id)).size !== rule.effects.length) {
    context.addIssue({ code: 'custom', message: '内容规则节点或效果标识重复。' });
  }
  const visited = new Set<string>();
  function visit(id: string, path: Set<string>) {
    if (path.has(id) || path.size >= 128) { context.addIssue({ code: 'custom', message: '内容规则依赖循环或过深。' }); return; }
    if (visited.has(id)) return;
    const node = nodes.get(id);
    if (!node) { context.addIssue({ code: 'custom', message: '内容规则引用了不存在的节点。' }); return; }
    for (const reference of expressionReferences(node)) visit(reference, new Set(path).add(id));
    visited.add(id);
  }
  for (const node of rule.nodes) {
    // Project IDs cannot be stored as reusable canonical content references.
    if (node.op === 'capture' || node.op === 'history' || node.op === 'game-damage' || ('at' in node && node.at) || ('actor' in node && node.actor)) {
      context.addIssue({ code: 'custom', message: '内容规则不得嵌入项目事件或队员ID。', path: ['nodes'] });
    }
    visit(node.id, new Set());
  }
  for (const effect of rule.effects) {
    visit(effect.value, new Set());
    if (effect.action || (effect.recipient && !['self', 'team'].includes(effect.recipient))) context.addIssue({ code: 'custom', message: '内容规则使用技能触发与自身/全队对象，不绑定项目ID。', path: ['effects'] });
  }
});
export const combatRulesSchema = z.array(combatRuleSchema).max(30).refine(rules => new Set(rules.map(rule => rule.id)).size === rules.length, '内容规则标识重复。');
export type CombatRule = z.infer<typeof combatRuleSchema>;
