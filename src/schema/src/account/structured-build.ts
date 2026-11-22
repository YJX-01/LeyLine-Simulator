import { hitRefSchema } from '../content/hit-ref';
import { APP_VERSION } from '../version.mjs';
import { z } from 'zod';
import { idSchema } from '../common/values';
import { buildFieldsSchema } from './build-fields';
import { artifactItemSchema, validateArtifactEnhancement } from './artifact';
import { calculationSourceSchema } from '../calculation/source';
import { structuredArtifactSetDefinitionSchema, structuredCharacterDefinitionSchema, structuredWeaponDefinitionSchema } from '../content/structured-content';
import { combatContextSchema, combatFrameSchema } from '../calculation/context';
import { elements } from '../content/stats';

export const structuredArtifactItemSchema = z.object(artifactItemSchema.shape).extend({
  inventory: z.object({ accountId: idSchema, itemId: idSchema }).strict().nullable(), sourceRefs: z.array(idSchema).max(1000),
}).strict().superRefine(validateArtifactEnhancement);
export const structuredBuildSchema = buildFieldsSchema.extend({
  schemaVersion: z.literal(APP_VERSION), kind: z.literal('calculation-build'), character: structuredCharacterDefinitionSchema, weapon: structuredWeaponDefinitionSchema.nullable(),
  sets: z.array(structuredArtifactSetDefinitionSchema).max(100), artifacts: z.array(structuredArtifactItemSchema).max(5),
  theoreticalSetSlots: z.array(z.object({ slot: artifactItemSchema.shape.slot, setId: idSchema }).strict()).max(5).optional(),
  sources: z.array(calculationSourceSchema).max(1000), artifactMainSourceRefs: z.array(idSchema).min(1).max(1000),
}).strict();
export type StructuredBuild = z.infer<typeof structuredBuildSchema>;
export const structuredBuildActorsSchema = z.array(z.object({ id: idSchema, build: structuredBuildSchema.optional(), element: z.enum(elements).optional() }).strict()).min(1).max(1000)
  .refine(actors => new Set(actors.map(actor => actor.id)).size === actors.length, '配装队员身份重复。');
export const structuredCombatSetupSchema = z.object(combatContextSchema.shape).omit({ actors: true }).strict();
export const structuredHitRequestSchema = z.object({ actorId: idSchema, hit: hitRefSchema,
  frame: z.object(combatFrameSchema.shape).omit({ ownerId: true, recipientId: true, contributorId: true, hit: true }).strict(),
  critMode: z.enum(['noncritical', 'critical', 'expected']).nullable(), reactionMode: idSchema.nullable(),
}).strict();
export type StructuredCombatSetup = z.infer<typeof structuredCombatSetupSchema>;
export type StructuredHitRequest = z.infer<typeof structuredHitRequestSchema>;
