import { z } from 'zod';
import { finiteSchema, idSchema } from '../common/values';
import { calculationValueSchema, definitionRefSchema } from './values';

export const aggregateDefinitionSchema = z.object({
  identity: definitionRefSchema,
  itemFormula: definitionRefSchema,
  itemOutput: idSchema,
  policy: z.enum(['sum', 'ranked-weighted-sum']),
  rankMetric: z.object({ output: idSchema, at: z.enum(['realized', 'fixed']) }).strict(),
  weights: z.array(finiteSchema.nonnegative()).min(1).max(10000).optional(),
  direction: z.literal('descending'),
  ties: z.literal('equal-value-stable-id'),
  sources: z.array(idSchema).min(1).max(1000),
}).strict().refine(definition => definition.policy === 'sum' || definition.weights !== undefined, '排序聚合必须声明完整权重。');

const aggregateBindingsSchema = z.record(idSchema, calculationValueSchema.nullable());
export const aggregateRequestSchema = z.object({
  definition: definitionRefSchema,
  contributors: z.array(z.object({ id: idSchema, inputs: aggregateBindingsSchema, rankInputs: aggregateBindingsSchema.optional() }).strict()).min(1).max(10000),
  probability: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('fixed') }).strict(),
    z.object({ kind: z.literal('independent'), variables: z.array(z.object({
      id: idSchema, probability: finiteSchema.min(0).max(1).nullable(),
      bindings: z.array(z.object({ contributorId: idSchema, input: idSchema, yes: calculationValueSchema, no: calculationValueSchema }).strict()).min(1).max(10000),
    }).strict()).max(1000) }).strict(),
    z.object({ kind: z.literal('joint'), states: z.array(z.object({
      id: idSchema, probability: finiteSchema.min(0).max(1),
      bindings: z.array(z.object({ contributorId: idSchema, input: idSchema, value: calculationValueSchema }).strict()).max(10000),
    }).strict()).min(1).max(256) }).strict(),
  ]),
}).strict().superRefine((request, context) => {
  const ids = new Set(request.contributors.map(contributor => contributor.id));
  if (ids.size !== request.contributors.length) context.addIssue({ code: 'custom', path: ['contributors'], message: '贡献者身份重复。' });
  if (request.probability.kind === 'independent') {
    const variables = request.probability.variables;
    if (new Set(variables.map(variable => variable.id)).size !== variables.length) context.addIssue({ code: 'custom', path: ['probability'], message: '随机变量身份重复。' });
    const bindings = new Set<string>();
    for (const variable of variables) for (const binding of variable.bindings) {
      const key = JSON.stringify([binding.contributorId, binding.input]);
      if (!ids.has(binding.contributorId) || bindings.has(key)) context.addIssue({ code: 'custom', path: ['probability'], message: '概率绑定须关联存在的贡献者，且每个输入只能由一个变量确定。' });
      bindings.add(key);
    }
  }
  if (request.probability.kind === 'joint') {
    const states = request.probability.states;
    if (new Set(states.map(state => state.id)).size !== states.length) context.addIssue({ code: 'custom', path: ['probability'], message: '联合概率状态身份重复。' });
    if (Math.abs(states.reduce((total, state) => total + state.probability, 0) - 1) > 1e-12) context.addIssue({ code: 'custom', path: ['probability'], message: '联合概率之和必须为1。' });
    for (const state of states) {
      const bindings = new Set<string>();
      for (const binding of state.bindings) {
        const key = JSON.stringify([binding.contributorId, binding.input]);
        if (!ids.has(binding.contributorId) || bindings.has(key)) context.addIssue({ code: 'custom', path: ['probability'], message: '联合状态的贡献者绑定缺失或重复。' });
        bindings.add(key);
      }
    }
    const signatures = states.map(state => state.bindings.map(binding => JSON.stringify([binding.contributorId, binding.input])).sort().join('|'));
    if (signatures.some(signature => signature !== signatures[0])) context.addIssue({ code: 'custom', path: ['probability'], message: '每个联合状态必须确定相同的输入集合。' });
  }
});

export type AggregateDefinition = z.infer<typeof aggregateDefinitionSchema>;
export type AggregateRequest = z.infer<typeof aggregateRequestSchema>;
