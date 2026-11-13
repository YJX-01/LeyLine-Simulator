import { z } from 'zod';
import { idSchema,millisecondsSchema,quantitySchema } from '../common/values';
import { buildSchema } from '../account/build';
import { damageRequestSchema } from './damage';
import { enemySchema } from './enemy';
import { ruleDefinitionSchema } from './expressions';
import { combatStateIntervalSchema, validateCombatStates } from './combat-state';
export const projectSchema = z.object({
  schemaVersion: z.literal(2), rulesVersion: z.literal('timeline-v1'), calculationProfile: z.enum(['direct','dependency']), id: idSchema, name: idSchema.optional(), revision: idSchema,
  definitions: z.array(ruleDefinitionSchema).max(200),
  candidate: z.object({
    id: idSchema, actors: z.array(z.object({ id: idSchema, name: idSchema.optional(), character: idSchema, weapon: idSchema, inputs: z.record(idSchema, quantitySchema), build: buildSchema.optional(),
      accountSnapshot: z.object({ accountId: idSchema, characterId: idSchema, weapon: z.string().max(160),
        artifacts: z.array(z.object({ id: idSchema, name: idSchema, slot: z.enum(['flower', 'plume', 'sands', 'goblet', 'circlet']), attack: z.number().finite().nonnegative() }).strict()).max(5),
      }).strict().optional(),
    }).strict()).max(100),
  }).strict(),
  effectRevisions: z.array(z.object({ instanceId: idSchema.max(2000), disabled: z.boolean(), value: quantitySchema.optional() }).strict()).max(10000).optional(),
  conditions: z.record(idSchema, z.boolean().nullable()),
  combatStates: z.array(combatStateIntervalSchema).max(10000).optional(),
  enemy: enemySchema.optional(),
  timeline: z.array(z.object({
    id: idSchema, timeMs: millisecondsSchema, order: z.number().int().nonnegative(), actor: idSchema,
    kind: z.enum(['action', 'damage']), definition: idSchema, damage: damageRequestSchema.optional(),
  }).strict()).max(10000),
  objective: z.object({ damageIds: z.array(idSchema).optional() }).strict(),
}).strict().superRefine((project, context) => {
  validateCombatStates(project, context);
  if (project.calculationProfile === 'direct') {
    if (project.effectRevisions !== undefined || project.definitions.some(d => d.nodes.some(n => ['attribute', 'capture', 'history'].includes(n.op)) || d.effects.some(e => ['recipient', 'attribute', 'unit', 'group', 'policy', 'maxStacks', 'captureAt'].some(k => Object.hasOwn(e, k))))) {
      context.addIssue({ code: 'custom', message: '属性读取、捕获、累计和效果修订需要明确采用依赖求值配置。', path: ['rulesVersion'] });
    }
  }
  project.definitions.forEach((definition, definitionIndex) => {
    definition.nodes.forEach((node, nodeIndex) => {
      if (node.op === 'history' && node.endMs <= node.startMs) context.addIssue({ code: 'custom', message: '累计窗口必须为非空左闭右开区间。', path: ['definitions', definitionIndex, 'nodes', nodeIndex] });
    });
  });
  const occupied = new Set<string>();
  project.candidate.actors.forEach((actor, index) => {
    if (actor.build) {
      const accountId = actor.build.inventoryAccountId ?? 'local-real-inventory';
      actor.build.artifacts.forEach((artifact, artifactIndex) => {
        const key = JSON.stringify([artifact.inventoryAccountId ?? accountId, artifact.id]);
        if (occupied.has(key)) context.addIssue({ code: 'custom', message: '同一账号的实物圣遗物不能在队伍中重复占用。', path: ['candidate','actors',index,'build','artifacts',artifactIndex] });
        occupied.add(key);
      });
    }
    const snapshot = actor.accountSnapshot;
    if (!snapshot || actor.build) return;
    const slots = new Set<string>();
    snapshot.artifacts.forEach((artifact, artifactIndex) => {
      const key = JSON.stringify([snapshot.accountId, artifact.id]);
      if (occupied.has(key) || slots.has(artifact.slot)) context.addIssue({ code: 'custom', message: '实物圣遗物不能重复占用，同一角色每个部位只能装备一件。', path: ['candidate', 'actors', index, 'accountSnapshot', 'artifacts', artifactIndex] });
      occupied.add(key);
      slots.add(artifact.slot);
    });
  });
});
export type Project = z.infer<typeof projectSchema>;
export interface Diagnostic {
  code: 'invalid-input' | 'missing-reference' | 'duplicate-id' | 'cycle' | 'unit' | 'unknown' | 'unsupported' | 'arithmetic' | 'budget' | 'stale-revision';
  path: string;
  message: string;
}
