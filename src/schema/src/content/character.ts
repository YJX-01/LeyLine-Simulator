import { z } from 'zod';
import { idSchema, finiteSchema, supportSchema } from '../common/values';
import { elements, statSchema } from './stats';
import { modifierSchema } from './effects';
import { talentSchema, passiveSchema, constellationSchema } from './talent';
const curve = z.array(finiteSchema.nonnegative()).min(91).max(101);
export const characterDefinitionSchema = z.object({
  schemaVersion:z.literal(2),kind:z.literal('character-definition'),id:idSchema,revision:idSchema,dataVersion:idSchema,origin:z.enum(['builtin','custom']),
  derivedFrom:z.object({id:idSchema,name:idSchema,revision:idSchema.optional()}).strict().optional(),
  identity:z.object({name:idSchema,title:z.string().max(500),description:z.string().max(40000),element:z.enum(elements),weaponType:idSchema,rarity:z.number().int().min(1).max(5).nullable(),gameId:z.number().int().positive().optional(),region:z.string().max(160).optional()}).strict(),
  attributes:z.object({base:z.object({hp:finiteSchema.positive(),attack:finiteSchema.nonnegative(),defense:finiteSchema.nonnegative(),critRate:finiteSchema.nonnegative(),critDamage:finiteSchema.nonnegative()}).strict(),specialized:statSchema,modifiers:z.array(modifierSchema).max(30)}).strict(),
  progression:z.object({curves:z.object({hp:curve,attack:curve,defense:curve}).strict(),promotion:z.array(z.object({maxLevel:finiteSchema,hp:finiteSchema,attack:finiteSchema,defense:finiteSchema,specialized:finiteSchema}).strict()).min(7).max(8)}).strict(),
  talents:z.array(talentSchema).max(30),passives:z.array(passiveSchema).max(30),constellations:z.array(constellationSchema).max(6),
  capabilities:z.object({text:z.enum(['complete','unavailable']),numbers:z.enum(['complete','partial']),calculation:supportSchema,notes:z.array(z.string().min(1).max(2000)).max(10).optional()}).strict(),
}).strict().superRefine((character,context)=>{
  if(new Set(character.talents.map(talent=>talent.id)).size!==character.talents.length)context.addIssue({code:'custom',message:'角色技能标识重复。',path:['talents']});
  if(new Set(character.constellations.map(item=>item.rank)).size!==character.constellations.length)context.addIssue({code:'custom',message:'命座等级重复。',path:['constellations']});
});
export const characterMetadataSchema = characterDefinitionSchema;
export type CharacterDefinition = z.infer<typeof characterDefinitionSchema>;
export type CharacterDefinitionFile = CharacterDefinition;
