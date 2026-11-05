import { z } from 'zod';
import type { CombatResult, CombatStats } from './combat';
export const characterIdSchema = z.enum(['jean', 'xingqiu', 'hutao', 'albedo', 'raiden']);
export const weaponIdSchema = z.enum(['harbinger-of-dawn', 'favonius-sword', 'sacrificial-sword', 'festering-desire', 'white-tassel', 'prototype-starglitter', 'staff-of-homa', 'engulfing-lightning']);
export const artifactSetSchema = z.enum(['none', 'gladiator', 'wanderer', 'noblesse', 'emblem', 'shimenawa', 'bloodstained']);
export const equipmentStatSchema = z.enum(['HP_CONST', 'ATK_CONST', 'DEF_CONST', 'HP_PER', 'ATK_PER', 'DEF_PER', 'EM', 'ER', 'CRIT_RATE', 'CRIT_DMG', 'HEAL_BONUS', 'ANEMO_DMG', 'GEO_DMG', 'ELECTRO_DMG', 'HYDRO_DMG', 'PYRO_DMG', 'CRYO_DMG', 'DENDRO_DMG', 'PHYSICAL_DMG']);
const id = z.string().min(1).max(80);
const ms = z.number().int().min(0).max(3600000);
const level = z.number().int().min(1).max(90);
const ascension = z.number().int().min(0).max(6);
const talent = z.number().int().min(1).max(10);
export const artifactPieceSchema = z.object({
  slot: z.enum(['FLOWER', 'PLUME', 'SANDS', 'GOBLET', 'CIRCLET']), set: artifactSetSchema,
  level: z.number().int().min(0).max(20), mainStat: equipmentStatSchema,
  substats: z.array(z.object({ stat: equipmentStatSchema, value: z.number().finite().min(0).max(5000) }).strict()).max(4),
}).strict().superRefine((piece, ctx) => {
  const seen = new Set<string>();
  piece.substats.forEach((sub, index) => {
    if (sub.stat === piece.mainStat || seen.has(sub.stat)) ctx.addIssue({ code: 'custom', path: ['substats', index], message: '副词条不得重复或与主词条相同' });
    seen.add(sub.stat);
  });
});
export const loadoutSchema = z.object({
  id, character: characterIdSchema, level, ascension, constellation: z.number().int().min(0).max(6),
  talents: z.object({ normal: talent, skill: talent, burst: talent }).strict(),
  weapon: z.object({ id: weaponIdSchema, level, ascension, refinement: z.number().int().min(1).max(5) }).strict(),
  artifacts: z.array(artifactPieceSchema).max(5),
  initialHpRatio: z.number().finite().min(0.01).max(1), initialEnergy: z.number().finite().min(0).max(100),
}).strict().superRefine((actor, ctx) => {
  if (new Set(actor.artifacts.map(piece => piece.slot)).size !== actor.artifacts.length) ctx.addIssue({ code: 'custom', path: ['artifacts'], message: '圣遗物部位不能重复' });
  const ranges = [[1, 20], [20, 40], [40, 50], [50, 60], [60, 70], [70, 80], [80, 90]];
  for (const [path, value] of [['character', actor], ['weapon', actor.weapon]] as const) {
    const [min, max] = ranges[value.ascension];
    if (value.level < min || value.level > max) ctx.addIssue({ code: 'custom', path: path === 'weapon' ? ['weapon', 'ascension'] : ['ascension'], message: '等级与突破阶段不匹配' });
  }
});
export const teamSchema = z.object({
  schemaVersion: z.literal(1), rulesVersion: z.literal('team-repo-v1'),
  durationMs: ms.min(1), seed: z.number().int().min(0).max(0xffffffff),
  mode: z.enum(['expected', 'random', 'critical', 'noncritical']),
  actors: z.array(loadoutSchema).min(1).max(4), initialOnField: id,
  enemy: z.object({ level: z.number().int().min(1).max(200), hpRatio: z.number().finite().min(0).max(1),
    resistance: z.number().finite().min(-10).max(10), defenseReduction: z.number().finite().min(0).max(1),
    fatalBlossomHits: z.number().int().min(0).max(7).optional(),
    collectCrystallizeShards: z.boolean().default(false),
  }).strict(),
  commands: z.array(z.discriminatedUnion('type', [
    z.object({ type: z.literal('switch'), id, timeMs: ms, actorId: id }).strict(),
    z.object({ type: z.literal('cast'), id, timeMs: ms, actorId: id,
      action: z.enum(['N', 'N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'C', 'PL', 'PH', 'E', 'Q']),
      holdMs: ms.max(5000).optional(),
    }).strict(),
  ])).max(2000),
  logMode: z.enum(['detailed', 'summary']), maxLogEvents: z.number().int().min(1).max(20000),
}).strict().superRefine((team, ctx) => {
  const ids = new Set(team.actors.map(actor => actor.id));
  if (ids.size !== team.actors.length) ctx.addIssue({ code: 'custom', path: ['actors'], message: '角色槽位ID重复' });
  if (new Set(team.actors.map(actor => actor.character)).size !== team.actors.length) ctx.addIssue({ code: 'custom', path: ['actors'], message: '同一角色不得重复入队' });
  if (!ids.has(team.initialOnField)) ctx.addIssue({ code: 'custom', path: ['initialOnField'], message: '前台角色不存在' });
  const commands = new Set<string>();
  team.commands.forEach((command, index) => {
    if (commands.has(command.id) || !ids.has(command.actorId) || command.timeMs > team.durationMs) ctx.addIssue({ code: 'custom', path: ['commands', index], message: '指令ID重复、角色不存在或时间超出窗口' });
    commands.add(command.id);
    if (command.type === 'cast' && command.holdMs && command.action !== 'E') ctx.addIssue({ code: 'custom', path: ['commands', index, 'holdMs'], message: '只有琴E支持长按时长' });
  });
});
export type CharacterId = z.infer<typeof characterIdSchema>;
export type Loadout = z.infer<typeof loadoutSchema>;
export type TeamInput = z.infer<typeof teamSchema>;
export type EquipmentStat = z.infer<typeof equipmentStatSchema>;
export interface TeamSimulationResult extends CombatResult {
  loadouts: { loadout: Loadout; name: string; element: string; stats: CombatStats;
    contributions: { source: string; stat: string; value: number }[] }[];
  warnings: string[];
}
