import { z } from 'zod';
import { idSchema, finiteSchema, supportSchema } from '../common/values';
import { elements } from './stats';
export const parameterSchema = z.object({ id: idSchema, unit: z.enum(['ratio','scalar','seconds','energy','stamina','unknown']), values: z.array(finiteSchema).min(1).max(30) }).strict();
export const talentSchema = z.object({ id: idSchema, name: idSchema, description: z.string().max(40000), flavorText: z.string().max(10000).optional(),
  category: z.enum(['normal','skill','burst']), element: z.enum(elements),
  parameters: z.array(parameterSchema).max(100), details: z.array(z.object({ label: z.string().max(500), template: z.string().max(2000) }).strict()).max(100),
  hits: z.array(z.object({ parameter: idSchema }).strict()).max(30), support: supportSchema,
}).strict().superRefine((talent, context) => {
  const ids = new Set(talent.parameters.map(parameter => parameter.id));
  if (ids.size !== talent.parameters.length) context.addIssue({ code:'custom', message:'技能参数标识重复。', path:['parameters'] });
  if (talent.support.supported && !talent.hits.length) context.addIssue({ code:'custom', message:'已支持技能必须声明命中参数。', path:['hits'] });
  for (const [index, hit] of talent.hits.entries()) if (!ids.has(hit.parameter)) context.addIssue({ code:'custom',message:'命中引用了不存在的参数。',path:['hits',index] });
});
export const passiveSchema = z.object({ id: idSchema, name: idSchema, description: z.string().max(40000), unlockAscension:z.number().int().min(0).max(6).nullable(), support:supportSchema }).strict();
export const constellationSchema = z.object({ rank:z.number().int().min(1).max(6), name:idSchema, description:z.string().max(40000),
  talentBonuses:z.array(z.object({category:z.enum(['normal','skill','burst']),levels:z.literal(3)}).strict()).max(3), support:supportSchema }).strict();
export type Talent = z.infer<typeof talentSchema>;
