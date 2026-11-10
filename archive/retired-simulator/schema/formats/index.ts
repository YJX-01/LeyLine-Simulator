import { z } from 'zod';
import { buildSchema, damageRequestSchema, enemySchema } from '../real-game';

const id = z.string().min(1).max(160);
const ms = z.number().int().nonnegative().max(3600000);
export const workbenchUnitSchema = z.enum(['scalar', 'attack', 'damage']);
const quantity = z.object({ value: z.number().finite(), unit: workbenchUnitSchema }).strict();
const node = z.discriminatedUnion('op', [
  z.object({ id, op: z.literal('attribute'), actor: id.optional(), key: id, unit: workbenchUnitSchema, at: id.optional(), phase: z.enum(['before', 'after']).optional() }).strict(),
  z.object({ id, op: z.literal('capture'), at: id, value: id, phase: z.enum(['before', 'after']).optional() }).strict(),
  z.object({ id, op: z.literal('history'), mode: z.enum(['sum', 'count']), startMs: ms, endMs: ms, actor: id.optional(), definition: id.optional(), initial: z.number().finite().optional(), cap: z.number().finite().nonnegative().optional(), resetAt: z.array(id).max(1000).optional(), includeCurrent: z.boolean().optional() }).strict(),
  z.object({ id, op: z.literal('game-damage') }).strict(),
  z.object({ id, op: z.literal('constant'), quantity }).strict(),
  z.object({ id, op: z.literal('input'), key: id, unit: workbenchUnitSchema }).strict(),
  z.object({ id, op: z.enum(['add', 'multiply', 'divide']), left: id, right: id }).strict(),
  z.object({ id, op: z.literal('condition'), key: id, yes: id, no: id }).strict(),
  z.object({ id, op: z.literal('unsupported'), capability: z.enum(['snapshot', 'history', 'probability']) }).strict(),
]);
const effect = z.object({
  id, startMs: ms, endMs: ms, value: id, condition: id.optional(),
  action: id.optional(), recipient: id.optional(), attribute: id.optional(), unit: workbenchUnitSchema.optional(),
  group: id.optional(), policy: z.enum(['add', 'replace', 'stack']).optional(), maxStacks: z.number().int().min(1).max(1000).optional(),
  captureAt: z.enum(['dynamic', 'source']).optional(),
}).strict().refine(e => e.endMs > e.startMs, 'Effect interval must be nonempty');
const definition = z.object({
  id, version: id, name: id.optional(),
  source: z.object({ kind: z.enum(['preset', 'user']), reference: id, verified: z.boolean() }).strict(),
  nodes: z.array(node).max(1000), damage: id.optional(), effects: z.array(effect).max(1000),
}).strict();
export const projectSchema = z.object({
  schemaVersion: z.literal(1), rulesVersion: z.enum(['workbench-v1', 'workbench-p3']), id, name: id.optional(), revision: id,
  definitions: z.array(definition).max(200),
  candidate: z.object({
    id, actors: z.array(z.object({ id, name: id.optional(), character: id, weapon: id, inputs: z.record(id, quantity), build: buildSchema.optional(),
      accountSnapshot: z.object({ accountId: id, characterId: id, weapon: z.string().max(160),
        artifacts: z.array(z.object({ id, name: id, slot: z.enum(['flower', 'plume', 'sands', 'goblet', 'circlet']), attack: z.number().finite().nonnegative() }).strict()).max(5),
      }).strict().optional(),
    }).strict()).max(100),
  }).strict(),
  effectRevisions: z.array(z.object({ instanceId: id.max(2000), disabled: z.boolean(), value: quantity.optional() }).strict()).max(10000).optional(),
  conditions: z.record(id, z.boolean().nullable()),
  enemy: enemySchema.optional(),
  timeline: z.array(z.object({
    id, timeMs: ms, order: z.number().int().nonnegative(), actor: id,
    kind: z.enum(['action', 'damage']), definition: id, damage: damageRequestSchema.optional(),
  }).strict()).max(10000),
  objective: z.object({ damageIds: z.array(id).optional() }).strict(),
}).strict().superRefine((project, context) => {
  if (project.rulesVersion === 'workbench-v1') {
    if (project.effectRevisions !== undefined || project.definitions.some(d => d.nodes.some(n => ['attribute', 'capture', 'history'].includes(n.op)) || d.effects.some(e => ['recipient', 'attribute', 'unit', 'group', 'policy', 'maxStacks', 'captureAt'].some(k => Object.hasOwn(e, k))))) {
      context.addIssue({ code: 'custom', message: 'P3 能力须显式采用 workbench-p3，旧版规则不自动升级。', path: ['rulesVersion'] });
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
export type ExpressionNode = z.infer<typeof node>;
export type QuantityUnit = z.infer<typeof workbenchUnitSchema>;
export interface Diagnostic {
  code: 'invalid-input' | 'missing-reference' | 'duplicate-id' | 'cycle' | 'unit' | 'unknown' | 'unsupported' | 'arithmetic' | 'budget' | 'stale-revision';
  path: string;
  message: string;
}
