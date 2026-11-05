import { z } from 'zod';
import type { CombatInput, CombatResult } from './combat';

const nonnegative = z.number().finite().min(0).max(1e9);
export const enemySchema = z.object({
  characterLevel: z.number().int().min(1).max(100),
  enemyLevel: z.number().int().min(1).max(200),
  resistance: z.number().finite().min(-10).max(10),
  defenseReduction: z.number().finite().min(0).max(1),
  defenseIgnore: z.number().finite().min(0).max(1),
}).strict();
export const attackSchema = z.object({
  schemaVersion: z.literal(1),
  attack: nonnegative,
  multiplier: nonnegative,
  damageBonus: nonnegative,
  critRate: z.number().finite().min(0).max(1),
  critDamage: nonnegative,
  mode: z.enum(['expected', 'critical', 'noncritical']),
  enemy: enemySchema.optional(),
}).strict();
export type AttackInput = z.infer<typeof attackSchema>;
export interface AttackResult {
  versions: { schema: 1; engine: string; rules: string; data: string };
  baseDamage: number;
  bonusMultiplier: number;
  critMultiplier: number;
  defenseMultiplier: number;
  resistanceMultiplier: number;
  damage: number;
}
const timeMs = z.number().int().min(0).max(3_600_000);
const identifier = z.string().min(1).max(80);
export const rotationSchema = z.object({
  schemaVersion: z.literal(1),
  durationMs: timeMs.min(1),
  attacker: attackSchema,
  actions: z.array(z.object({
    id: identifier, timeMs, multiplier: nonnegative,
  }).strict()).min(1).max(10000),
  buffs: z.array(z.object({
    id: identifier, startMs: timeMs, durationMs: timeMs.min(1),
    damageBonus: z.number().finite().min(0).max(100),
  }).strict()).max(1000),
}).strict().superRefine((config, ctx) => {
  for (const key of ['actions', 'buffs'] as const) {
    const ids = new Set<string>();
    config[key].forEach((entry, index) => {
      if (ids.has(entry.id)) ctx.addIssue({ code: 'custom', path: [key, index, 'id'], message: 'ID 必须唯一' });
      ids.add(entry.id);
      const start = 'timeMs' in entry ? entry.timeMs : entry.startMs;
      if (start > config.durationMs) ctx.addIssue({ code: 'custom', path: [key, index], message: '事件超出模拟时长' });
    });
  }
});
export type RotationInput = z.infer<typeof rotationSchema>;
export type RotationEvent =
  | { type: 'buff-start' | 'buff-end'; timeMs: number; id: string }
  | { type: 'hit'; timeMs: number; id: string; activeBuffIds: string[]; calculation: AttackResult; skillId?: string; element?: string }
  | { type: 'cast'; timeMs: number; id: string; skillId: string; readyAtMs: number; hitAtMs: number }
  | { type: 'rejected'; timeMs: number; id: string; skillId: string; reason: 'action-lock' | 'cooldown' };
export interface RotationResult {
  versions: AttackResult['versions'];
  durationMs: number;
  totalDamage: number;
  dps: number;
  events: RotationEvent[];
  resolvedAttack?: number;
}
export const characterStatsSchema = z.object({
  level: z.number().int().min(1).max(100),
  characterBaseAttack: nonnegative.max(1e6),
  weaponBaseAttack: nonnegative.max(1e6),
  attackPercent: z.number().finite().min(0).max(100),
  flatAttack: nonnegative.max(1e6),
  damageBonus: z.number().finite().min(0).max(100),
  critRate: z.number().finite().min(0).max(1),
  critDamage: z.number().finite().min(0).max(100),
}).strict();
export type CharacterStats = z.infer<typeof characterStatsSchema>;
export const characterSimulationSchema = z.object({
  schemaVersion: z.literal(1),
  durationMs: timeMs.min(1),
  character: z.literal('jean'),
  stats: characterStatsSchema,
  talentLevel: z.number().int().min(1).max(10),
  mode: z.enum(['expected', 'critical', 'noncritical']),
  enemy: enemySchema.omit({ characterLevel: true }).optional(),
  commands: z.array(z.object({ id: identifier, timeMs, skillId: z.literal('jean.e.tap') }).strict()).min(1).max(10000),
  buffs: rotationSchema.shape.buffs,
}).strict().superRefine((config, ctx) => {
  for (const key of ['commands', 'buffs'] as const) {
    const ids = new Set<string>();
    config[key].forEach((entry, index) => {
      if (ids.has(entry.id)) ctx.addIssue({ code: 'custom', path: [key, index, 'id'], message: 'ID 必须唯一' });
      ids.add(entry.id);
      if (('timeMs' in entry ? entry.timeMs : entry.startMs) > config.durationMs) {
        ctx.addIssue({ code: 'custom', path: [key, index], message: '事件超出模拟时长' });
      }
    });
  }
});
export type CharacterSimulationInput = z.infer<typeof characterSimulationSchema>;
export type WorkerRequest = { id: number } & (
  { kind: 'attack'; input: AttackInput } | { kind: 'rotation'; input: RotationInput }
  | { kind: 'character'; input: CharacterSimulationInput }
  | { kind: 'combat'; input: CombatInput }
);
export type WorkerResponse = { id: number } & (
  { ok: true; kind: 'attack'; result: AttackResult }
  | { ok: true; kind: 'rotation'; result: RotationResult }
  | { ok: true; kind: 'character'; result: RotationResult }
  | { ok: true; kind: 'combat'; result: CombatResult }
  | { ok: false; error: string }
);
