import { z } from 'zod';
import { idSchema, finiteSchema, contentSourceSchema, supportSchema } from '../common/values';
import { modifierSchema } from './effects';
export const artifactSetDefinitionSchema = z.object({ id: idSchema, name: idSchema, effects: z.array(z.object({ pieces: z.number().int().min(1).max(5), modifiers: z.array(modifierSchema).max(30), support: supportSchema }).strict()).max(5), source: contentSourceSchema }).strict();

export type ArtifactSetDefinition = z.infer<typeof artifactSetDefinitionSchema>;
