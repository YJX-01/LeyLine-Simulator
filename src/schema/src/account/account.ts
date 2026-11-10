import { z } from 'zod';
import { artifactItemSchema } from './artifact';
import { buildSchema } from './build';

export const accountSlots = ['flower', 'plume', 'sands', 'goblet', 'circlet'] as const;
export type AccountSlot = typeof accountSlots[number];
const text = z.string().min(1).max(160).refine(value=>!!value.trim());
const attack = z.number().finite().nonnegative();
const uid = z.string().regex(/^\d{9,10}$/);
export const accountArtifactSchema = z.object({
  id: text, inventoryId: z.null().optional(), isCopy: z.literal(true).optional(),
  rollSource: z.enum(['inferred', 'showcase', 'manual']).optional(),
  name: text, alias: text.optional(), slot: z.enum(accountSlots), attack,
  real: artifactItemSchema.optional(),
  mona: z.object({ mainValue: attack, omit: z.boolean(), contentHash: z.string().optional(), equippedBy: text.optional(), sourceSetName: text.optional(), setIdentityPending: z.boolean().optional() }).strict().optional(),
}).strict().superRefine((item, ctx) => {
  if (item.real && (item.id !== item.real.id || item.slot !== item.real.slot)) ctx.addIssue({ code: 'custom', message: '库存与数值快照身份不一致。' });
});
export const accountCharacterSchema = z.object({
  id: text, name: text, attack, weapon: z.string().max(160),
  equipment: z.partialRecord(z.enum(accountSlots), text), build: buildSchema.optional(),
  showcase: z.object({ uid, avatarId: z.number().int(), fetchedAt: z.string().refine(value => Number.isFinite(Date.parse(value))), rawHash: z.string().regex(/^[a-f0-9]{64}$/), build: buildSchema }).strict().optional(),
}).strict();
export const accountSchema = z.object({
  schemaVersion: z.literal(2), kind: z.literal('account'), id: text, name: text, uid: uid.optional(),
  characters: z.array(accountCharacterSchema).max(1000), artifacts: z.array(accountArtifactSchema).max(10000),
}).strict().superRefine((account, ctx) => {
  const ids = [...account.characters, ...account.artifacts].map(item => item.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: '账号实体标识重复。' });
  const owners = new Set<string>();
  for (const character of account.characters) for (const [slot, id] of Object.entries(character.equipment)) {
    const item = account.artifacts.find(item => item.id === id);
    if (!item || item.slot !== slot || owners.has(id!)) ctx.addIssue({ code: 'custom', message: '穿戴引用或唯一归属无效。' });
    if (id) owners.add(id);
  }
});
export type AccountArtifact = z.infer<typeof accountArtifactSchema>;
export type AccountCharacter = z.infer<typeof accountCharacterSchema>;
export type LocalAccount = z.infer<typeof accountSchema>;
