import { z } from 'zod';
import { characterStatsSchema, enemySchema, type AttackResult } from './legacy';

const id = z.string().min(1).max(80);
const ms = z.number().int().min(0).max(3_600_000);
const positiveMs = ms.min(1);
const amount = z.number().finite().min(0).max(10000);
export const energyElementSchema = z.enum(['pyro', 'hydro', 'cryo', 'electro', 'anemo', 'geo', 'dendro']);
export const combatStatsSchema = characterStatsSchema.extend({
  energyRecharge: z.number().finite().min(0).max(100),
  elementalMastery: amount,
  reactionBonus: z.number().finite().min(0).max(100),
  maxHp: z.number().finite().min(1).max(1e9).default(10000),
  defense: z.number().finite().min(0).max(1e9).default(500),
  healingBonus: z.number().finite().min(0).max(100).default(0),
  damageBonuses: z.record(z.string(), z.number().finite().min(0).max(100)).default({}),
  categoryBonuses: z.record(z.string(), z.number().finite().min(0).max(100)).default({}),
}).strict();
export type CombatStats = z.infer<typeof combatStatsSchema>;
const hit = z.object({
  element: z.enum(['pyro', 'hydro', 'cryo', 'physical']),
  multiplier: z.number().finite().min(0).max(10000),
  gauge: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(4)]),
  icdTag: id,
  icdRule: z.enum(['none', 'standard']),
}).strict().refine(h => h.element !== 'physical' || h.gauge === 0, { message: 'Physical hits cannot apply elemental gauge' });
const summon = z.object({
  slot: id, lifetimeMs: positiveMs,
  hit,
  trigger: z.discriminatedUnion('type', [
    z.object({ type: z.literal('periodic'), intervalMs: positiveMs, firstDelayMs: ms }).strict(),
    z.object({ type: z.literal('coordinated'), cooldownMs: positiveMs, delayMs: ms }).strict(),
  ]),
}).strict();
export const combatSkillSchema = z.object({
  id, ownerId: id, cooldownMs: ms, cooldownStartDelayMs: ms, actionLockMs: ms,
  hitDelayMs: ms, energyCost: amount, snapshot: z.boolean(),
  particlesOnHit: z.object({ element: energyElementSchema.or(z.literal('clear')),
    count: z.number().finite().min(0).max(100), travelMs: ms, cooldownMs: ms,
  }).strict().optional(),
  effect: z.discriminatedUnion('type', [
    z.object({ type: z.literal('hit'), hit }).strict(),
    z.object({ type: z.literal('summon'), summon }).strict(),
  ]),
}).strict();
export type CombatSkill = z.infer<typeof combatSkillSchema>;
export const combatBuffSchema = z.object({
  id, targetIds: z.array(id).min(1).max(4), startMs: ms, durationMs: positiveMs,
  stacking: z.enum(['add', 'replace']), group: id,
  modifiers: combatStatsSchema.omit({ level: true, characterBaseAttack: true, weaponBaseAttack: true, damageBonuses: true, categoryBonuses: true })
    .partial().extend({ directDamageBonus: z.number().finite().min(0).max(100).optional() }).strict(),
}).strict();
export type CombatBuff = z.infer<typeof combatBuffSchema>;
const command = z.discriminatedUnion('type', [
  z.object({ type: z.literal('cast'), id, timeMs: ms, skillId: id }).strict(),
  z.object({ type: z.literal('switch'), id, timeMs: ms, actorId: id }).strict(),
]);
const pickup = z.discriminatedUnion('type', [
  z.object({ type: z.enum(['particle', 'orb']), id, timeMs: ms,
    element: energyElementSchema.or(z.literal('clear')), count: z.number().finite().min(0).max(100) }).strict(),
  z.object({ type: z.literal('flat'), id, timeMs: ms, actorId: id, amount }).strict(),
]);
export const combatSchema = z.object({
  schemaVersion: z.literal(1), rulesVersion: z.literal('combat-core-v1'),
  durationMs: positiveMs, seed: z.number().int().min(0).max(0xffffffff),
  mode: z.enum(['expected', 'random', 'critical', 'noncritical']),
  actors: z.array(z.object({ id, name: z.string().min(1).max(80), element: energyElementSchema,
    stats: combatStatsSchema, energyCapacity: z.number().finite().min(1).max(1000), initialEnergy: amount,
  }).strict()).min(1).max(4),
  initialOnField: id,
  enemy: enemySchema.omit({ characterLevel: true }).extend({
    resistances: z.object({ pyro: z.number().finite().min(-10).max(10).optional(),
      hydro: z.number().finite().min(-10).max(10).optional(), cryo: z.number().finite().min(-10).max(10).optional(),
      physical: z.number().finite().min(-10).max(10).optional() }).strict().optional(),
  }).strict(),
  enemyDebuffs: z.array(z.object({ id, startMs: ms, durationMs: positiveMs,
    resistanceReduction: z.number().finite().min(0).max(10),
    defenseReduction: z.number().finite().min(0).max(1),
  }).strict()).max(1000).default([]),
  skills: z.array(combatSkillSchema).min(1).max(64),
  commands: z.array(command).max(2000),
  buffs: z.array(combatBuffSchema).max(1000),
  pickups: z.array(pickup).max(2000),
  logMode: z.enum(['detailed', 'summary']),
  maxLogEvents: z.number().int().min(1).max(20000),
}).strict().superRefine((config, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  for (const key of ['actors', 'skills', 'commands', 'buffs', 'pickups', 'enemyDebuffs'] as const) {
    const seen = new Set<string>();
    config[key].forEach((entry, index) => {
      if (seen.has(entry.id)) issue([key, index, 'id'], 'ID must be unique within its collection');
      seen.add(entry.id);
    });
  }
  const actors = new Map(config.actors.map(actor => [actor.id, actor]));
  const skills = new Map(config.skills.map(skill => [skill.id, skill]));
  if (!actors.has(config.initialOnField)) issue(['initialOnField'], 'Unknown actor');
  config.actors.forEach((actor, i) => {
    if (actor.initialEnergy > actor.energyCapacity) issue(['actors', i, 'initialEnergy'], 'Energy exceeds capacity');
  });
  config.skills.forEach((skill, i) => {
    const actor = actors.get(skill.ownerId);
    if (!actor) issue(['skills', i, 'ownerId'], 'Unknown actor');
    else if (skill.energyCost > actor.energyCapacity) issue(['skills', i, 'energyCost'], 'Cost exceeds capacity');
  });
  config.commands.forEach((entry, i) => {
    if (entry.timeMs > config.durationMs) issue(['commands', i, 'timeMs'], 'Command exceeds simulation duration');
    if (entry.type === 'cast' ? !skills.has(entry.skillId) : !actors.has(entry.actorId)) issue(['commands', i], 'Unknown skill or actor');
  });
  config.buffs.forEach((buff, i) => {
    if (buff.startMs > config.durationMs) issue(['buffs', i, 'startMs'], 'Buff starts after simulation');
    if (new Set(buff.targetIds).size !== buff.targetIds.length) issue(['buffs', i, 'targetIds'], 'Duplicate buff target');
    if (buff.targetIds.some(target => !actors.has(target))) issue(['buffs', i, 'targetIds'], 'Unknown actor');
  });
  config.enemyDebuffs.forEach((entry, i) => {
    if (entry.startMs > config.durationMs) issue(['enemyDebuffs', i, 'startMs'], 'Debuff starts after simulation');
  });
  config.pickups.forEach((entry, i) => {
    if (entry.timeMs > config.durationMs) issue(['pickups', i, 'timeMs'], 'Pickup exceeds simulation duration');
    if (entry.type === 'flat' && !actors.has(entry.actorId)) issue(['pickups', i, 'actorId'], 'Unknown actor');
  });
});
export type CombatInput = z.infer<typeof combatSchema>;
export type CombatReaction = 'vaporize' | 'reverse-vaporize' | 'melt' | 'reverse-melt';
export interface CombatAura { element: 'pyro' | 'hydro' | 'cryo'; units: number; decayPerMs: number }
export interface CombatHitEvent {
  type: 'hit'; timeMs: number; id: string; actorId: string; skillId: string; source: 'direct' | 'summon';
  damage: number; calculation: AttackResult; reactionMultiplier: number; reaction: CombatReaction | null;
  applied: boolean; aura: CombatAura | null; buffIds: string[]; directBuffIds: string[]; snapshot: boolean; critical: boolean | null;
}
export type CombatStateEvent = {
  type: 'cast' | 'rejected' | 'switch' | 'buff-start' | 'buff-end' | 'buff-replaced' | 'energy' | 'summon-start' | 'summon-end' | 'enemy-debuff-start' | 'enemy-debuff-end';
  timeMs: number; id: string; actorId: string; details: Record<string, string | number | boolean>;
};
export type CombatEvent = CombatHitEvent | CombatStateEvent;
export interface CombatResult {
  versions: AttackResult['versions']; seed: number; mode: CombatInput['mode'];
  durationMs: number; totalDamage: number; dps: number; damageByActor: Record<string, number>;
  finalEnergy: Record<string, number>; finalAura: CombatAura | null; finalOnField: string;
  events: CombatEvent[]; eventCounts: Record<string, number>; hits: number; logMode: CombatInput['logMode'];
  reactionCounts: Record<CombatReaction, number>;
}
