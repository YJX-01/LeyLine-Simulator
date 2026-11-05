import { content, characterNames } from '@leyline/game-data/content';
import { type CharacterId, type Loadout, type TeamInput, type EquipmentStat } from '@leyline/schema';
export { content, characterNames };
export const weaponNames = { 'harbinger-of-dawn': '黎明神剑', 'favonius-sword': '西风剑', 'sacrificial-sword': '祭礼剑', 'festering-desire': '腐殖之剑', 'white-tassel': '白缨枪', 'prototype-starglitter': '试作星镰', 'staff-of-homa': '护摩之杖', 'engulfing-lightning': '薙草之稻光' };
export const sets = { none: '散件', gladiator: '角斗士的终幕礼', wanderer: '流浪大地的乐团', noblesse: '昔日宗室之仪', emblem: '绝缘之旗印', shimenawa: '追忆之注连', bloodstained: '染血的骑士道' };
export const slots = { FLOWER: '生之花', PLUME: '死之羽', SANDS: '时之沙', GOBLET: '空之杯', CIRCLET: '理之冠' };
export const statNames: Record<string, string> = { HP_CONST: '生命值', ATK_CONST: '攻击力', DEF_CONST: '防御力', HP_PER: '生命值%', ATK_PER: '攻击力%', DEF_PER: '防御力%', EM: '元素精通', ER: '元素充能效率%', CRIT_RATE: '暴击率%', CRIT_DMG: '暴击伤害%', HEAL_BONUS: '治疗加成%', ANEMO_DMG: '风伤%', GEO_DMG: '岩伤%', ELECTRO_DMG: '雷伤%', HYDRO_DMG: '水伤%', PYRO_DMG: '火伤%', CRYO_DMG: '冰伤%', DENDRO_DMG: '草伤%', PHYSICAL_DMG: '物伤%' };
export const percentStat = (stat: string) => !['HP_CONST', 'ATK_CONST', 'DEF_CONST', 'EM', 'HP_BASE', 'ATK_BASE', 'DEF_BASE'].includes(stat);
export const talentCap = (ascension: number) => [1, 1, 2, 4, 6, 8, 10][ascension];
export const capacity: Record<CharacterId, number> = { jean: 80, xingqiu: 80, hutao: 60, albedo: 40, raiden: 90 };
export function newActor(character: CharacterId, id: string = character): Loadout {
  const polearm = content.characters[character].base.weapon === 3;
  return { id, character, level: 90, ascension: 6, constellation: 0, talents: { normal: 8, skill: 8, burst: 8 },
    weapon: { id: polearm ? 'prototype-starglitter' : 'favonius-sword', level: 90, ascension: 6, refinement: 1 }, artifacts: [], initialHpRatio: 1, initialEnergy: capacity[character] };
}
export function removeActor(input: TeamInput, id: string): TeamInput {
  if (input.actors.length === 1) return input;
  const actors = input.actors.filter(actor => actor.id !== id);
  return { ...input, actors, commands: input.commands.filter(command => command.actorId !== id), initialOnField: input.initialOnField === id ? actors[0].id : input.initialOnField };
}
export function allowedMain(slot: keyof typeof slots): EquipmentStat[] { return content.artifactAllowed[slot] as EquipmentStat[]; }
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
  return JSON.stringify(value);
}
