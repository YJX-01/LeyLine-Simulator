import { z } from 'zod';

const id = z.string().min(1).max(160);
const ms = z.number().int().nonnegative().max(3600000);
export const workbenchUnitSchema = z.enum(['scalar', 'attack', 'damage']);
const quantity = z.object({ value: z.number().finite(), unit: workbenchUnitSchema }).strict();
const node = z.discriminatedUnion('op', [
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
  id, version: id,
  source: z.object({ kind: z.enum(['preset', 'user']), reference: id, verified: z.boolean() }).strict(),
  nodes: z.array(node).max(1000), damage: id.optional(), effects: z.array(effect).max(1000),
}).strict();
export const workbenchProjectSchema = z.object({
  schemaVersion: z.literal(1), rulesVersion: z.literal('workbench-v1'), id, revision: id,
  definitions: z.array(definition).max(200),
  candidate: z.object({
    id, actors: z.array(z.object({ id, character: id, weapon: id, inputs: z.record(id, quantity) }).strict()).max(100),
  }).strict(),
  conditions: z.record(id, z.boolean().nullable()),
  timeline: z.array(z.object({
    id, timeMs: ms, order: z.number().int().nonnegative(), actor: id,
    kind: z.enum(['action', 'damage']), definition: id,
  }).strict()).max(10000),
  objective: z.object({ damageIds: z.array(id).optional() }).strict(),
}).strict();
export type WorkbenchProject = z.infer<typeof workbenchProjectSchema>;
export type WorkbenchNode = z.infer<typeof node>;
export type WorkbenchUnit = z.infer<typeof workbenchUnitSchema>;
export interface WorkbenchDiagnostic {
  code: 'invalid-input' | 'missing-reference' | 'duplicate-id' | 'cycle' | 'unit' | 'unknown' | 'unsupported' | 'arithmetic';
  path: string;
  message: string;
}
