import { z } from 'zod';
import { realBuildSchema, realDamageSchema, realEnemySchema } from '../real-game';

const id = z.string().min(1).max(160);
const ms = z.number().int().nonnegative().max(3600000);
export const workbenchUnitSchema = z.enum(['scalar', 'attack', 'damage']);
const quantity = z.object({ value: z.number().finite(), unit: workbenchUnitSchema }).strict();
const node = z.discriminatedUnion('op', [
  z.object({ id, op: z.literal('game-damage') }).strict(),
  z.object({ id, op: z.literal('constant'), quantity }).strict(),
  z.object({ id, op: z.literal('input'), key: id, unit: workbenchUnitSchema }).strict(),
  z.object({ id, op: z.enum(['add', 'multiply', 'divide']), left: id, right: id }).strict(),
  z.object({ id, op: z.literal('condition'), key: id, yes: id, no: id }).strict(),
  z.object({ id, op: z.literal('unsupported'), capability: z.enum(['snapshot', 'history', 'probability']) }).strict(),
]);
const effect = z.object({
  id, startMs: ms, endMs: ms, value: id, condition: id.optional(),
  action: id.optional(),
}).strict().refine(e => e.endMs > e.startMs, 'Effect interval must be nonempty');
const definition = z.object({
  id, version: id, name: id.optional(),
  source: z.object({ kind: z.enum(['preset', 'user']), reference: id, verified: z.boolean() }).strict(),
  nodes: z.array(node).max(1000), damage: id.optional(), effects: z.array(effect).max(1000),
}).strict();
export const workbenchProjectSchema = z.object({
  schemaVersion: z.literal(1), rulesVersion: z.literal('workbench-v1'), id, revision: id,
  definitions: z.array(definition).max(200),
  candidate: z.object({
    id, actors: z.array(z.object({ id, name: id.optional(), character: id, weapon: id, inputs: z.record(id, quantity), realBuild: realBuildSchema.optional(),
      accountSnapshot: z.object({ accountId: id, characterId: id, weapon: z.string().max(160),
        artifacts: z.array(z.object({ id, name: id, slot: z.enum(['flower', 'plume', 'sands', 'goblet', 'circlet']), attack: z.number().finite().nonnegative() }).strict()).max(5),
      }).strict().optional(),
    }).strict()).max(100),
  }).strict(),
  conditions: z.record(id, z.boolean().nullable()),
  enemy: realEnemySchema.optional(),
  timeline: z.array(z.object({
    id, timeMs: ms, order: z.number().int().nonnegative(), actor: id,
    kind: z.enum(['action', 'damage']), definition: id, realDamage: realDamageSchema.optional(),
  }).strict()).max(10000),
  objective: z.object({ damageIds: z.array(id).optional() }).strict(),
}).strict().superRefine((project, context) => {
  const occupied = new Set<string>();
  project.candidate.actors.forEach((actor, index) => {
    if (actor.realBuild) {
      const accountId = actor.realBuild.inventoryAccountId ?? 'local-real-inventory';
      actor.realBuild.artifacts.forEach((artifact, artifactIndex) => {
        const key = JSON.stringify([artifact.inventoryAccountId ?? accountId, artifact.id]);
        if (occupied.has(key)) context.addIssue({ code: 'custom', message: '同一账号的实物圣遗物不能在队伍中重复占用。', path: ['candidate','actors',index,'realBuild','artifacts',artifactIndex] });
        occupied.add(key);
      });
    }
    const snapshot = actor.accountSnapshot;
    if (!snapshot || actor.realBuild) return;
    const slots = new Set<string>();
    snapshot.artifacts.forEach((artifact, artifactIndex) => {
      const key = JSON.stringify([snapshot.accountId, artifact.id]);
      if (occupied.has(key) || slots.has(artifact.slot)) context.addIssue({ code: 'custom', message: '实物圣遗物不能重复占用，同一角色每个部位只能装备一件。', path: ['candidate', 'actors', index, 'accountSnapshot', 'artifacts', artifactIndex] });
      occupied.add(key);
      slots.add(artifact.slot);
    });
  });
});
export type WorkbenchProject = z.infer<typeof workbenchProjectSchema>;
export type WorkbenchNode = z.infer<typeof node>;
export type WorkbenchUnit = z.infer<typeof workbenchUnitSchema>;
export interface WorkbenchDiagnostic {
  code: 'invalid-input' | 'missing-reference' | 'duplicate-id' | 'cycle' | 'unit' | 'unknown' | 'unsupported' | 'arithmetic';
  path: string;
  message: string;
}
