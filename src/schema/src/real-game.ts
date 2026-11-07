import { z } from 'zod';

const id = z.string().min(1).max(160);
const finite = z.number().finite();
export const realElements = ['physical', 'anemo', 'geo', 'electro', 'hydro', 'pyro', 'cryo', 'dendro'] as const;
export const realStatKeys = ['hp', 'hpPercent', 'attack', 'attackPercent', 'defense', 'defensePercent', 'critRate', 'critDamage', 'energyRecharge', 'elementalMastery', 'physicalBonus', 'anemoBonus', 'geoBonus', 'electroBonus', 'hydroBonus', 'pyroBonus', 'cryoBonus', 'dendroBonus', 'healingBonus'] as const;
export const realStatSchema = z.enum(realStatKeys);
const source = z.object({ repository: id, commit: id, path: z.string().min(1).max(500) }).strict();
const modifier = z.object({ stat: realStatSchema, values: z.array(finite).min(1).max(5), category: z.enum(['normal', 'skill', 'burst']).optional(), minAscension: z.number().int().min(0).max(6).optional(), hpAbove: finite.optional() }).strict();
const support = z.object({ supported: z.boolean(), reason: z.string().max(1000) }).strict();
const curve = z.array(finite).min(91).max(101);
export const realCharacterSchema = z.object({ id, name: id, element: z.enum(realElements), weaponType: id,
  base: z.object({ hp: finite, attack: finite, defense: finite, critRate: finite, critDamage: finite }).strict(),
  curves: z.object({ hp: curve, attack: curve, defense: curve }).strict(),
  specialized: realStatSchema,
  promotion: z.array(z.object({ maxLevel: finite, hp: finite, attack: finite, defense: finite, specialized: finite }).strict()).min(7).max(8),
  skills: z.array(z.object({ id, name: id, category: z.enum(['normal', 'skill', 'burst']), element: z.enum(realElements), multipliers: z.array(z.array(finite).min(1).max(15)).max(30), support }).strict()).max(30),
  modifiers: z.array(modifier).max(30), support, source,
}).strict();
export const realWeaponSchema = z.object({ id, name: id, weaponType: id, rarity: z.number().int().min(1).max(5),
  baseAttack: finite, baseStat: finite, stat: realStatSchema,
  attackCurve: curve, statCurve: curve, promotion: z.array(finite).min(5).max(8),
  modifiers: z.array(modifier).max(30), support, source,
}).strict();
export const realSetSchema = z.object({ id, name: id, effects: z.array(z.object({ pieces: z.number().int().min(1).max(5), modifiers: z.array(modifier).max(30), support }).strict()).max(5), source }).strict();
export const realArtifactSchema = z.object({ id, inventoryAccountId: id.optional(), setId: id, slot: z.enum(['flower', 'plume', 'sands', 'goblet', 'circlet']), rarity: z.literal(5), level: z.number().int().min(0).max(20), mainStat: realStatSchema,
  substats: z.array(z.object({ stat: realStatSchema, value: finite.nonnegative(), rolls: z.number().int().min(1).max(6).optional() }).strict()).max(4),
  source: z.object({ format: id, key: id, fingerprint: id }).strict().optional(),
}).strict();
export const realBuildSchema = z.object({ dataVersion: id, inventoryAccountId: id.optional(), character: realCharacterSchema, weapon: realWeaponSchema, sets: z.array(realSetSchema).max(100),
  artifactMain: z.record(realStatSchema, z.array(finite).length(21)),
  level: z.number().int().min(1).max(100).refine(value => value <= 90 || value === 95 || value === 100, '角色等级须为1–90、95或100'), ascension: z.number().int().min(0).max(6), constellation: z.number().int().min(0).max(6),
  talents: z.object({ normal: z.number().int().min(1).max(15), skill: z.number().int().min(1).max(15), burst: z.number().int().min(1).max(15) }).strict(),
  weaponLevel: z.number().int().min(1).max(90), weaponAscension: z.number().int().min(0).max(6), refinement: z.number().int().min(1).max(5), hpRatio: finite.min(0).max(1),
  artifacts: z.array(realArtifactSchema).max(5),
}).strict();
export const realDamageSchema = z.object({ skillId: id, hitIndex: z.number().int().nonnegative().max(29), crit: z.enum(['critical', 'noncritical', 'expected']).nullable(), reaction: z.literal('none').nullable() }).strict();
export const realEnemySchema = z.object({ level: z.number().int().min(1).max(200), resistances: z.record(z.enum(realElements), finite.min(-10).max(10)), defenseReduction: finite.min(0).max(1), defenseIgnore: finite.min(0).max(1) }).strict();
export type RealStat = z.infer<typeof realStatSchema>;
export type RealCharacter = z.infer<typeof realCharacterSchema>;
export type RealWeapon = z.infer<typeof realWeaponSchema>;
export type RealSet = z.infer<typeof realSetSchema>;
export type RealArtifact = z.infer<typeof realArtifactSchema>;
export type RealBuild = z.infer<typeof realBuildSchema>;
export type RealDamage = z.infer<typeof realDamageSchema>;
export type RealEnemy = z.infer<typeof realEnemySchema>;
