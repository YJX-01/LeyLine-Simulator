import { loadoutSchema, type Loadout, type CombatStats, type EquipmentStat } from '@leyline/schema';
import { content, characterElements, characterNames, type CharacterKey } from '@leyline/game-data';

export interface StatContribution { source: string; stat: string; value: number }
export interface ResolvedLoadout {
  loadout: Loadout; name: string; element: typeof characterElements[CharacterKey];
  stats: CombatStats; baseStats: CombatStats; contributions: StatContribution[];
  baseHp: number; baseDefense: number; sets: Record<string, number>;
  talents: { normal: number; skill: number; burst: number }; energyCapacity: number;
}
const weaponAscension: Record<number, number[]> = {
  3: [0, 19.5, 38.9, 58.4, 77.8, 97.3, 116.7],
  4: [0, 25.9, 51.9, 77.8, 103.7, 129.7, 155.6],
  5: [0, 31.1, 62.2, 93.4, 124.5, 155.6, 186.7],
};
export function resolveLoadout(input: unknown): ResolvedLoadout {
  const loadout = loadoutSchema.parse(input);
  const data = content.characters[loadout.character];
  const weapon = content.weapons[loadout.weapon.id];
  if (weapon.weapon_type !== data.base.weapon) throw new Error(`${loadout.character}: 武器类型不匹配`);
  const maxTalent = [1, 1, 2, 4, 6, 8, 10][loadout.ascension];
  if (Object.values(loadout.talents).some(value => value > maxTalent)) throw new Error('天赋等级超出突破阶段上限');
  const contributions: StatContribution[] = [
    { source: '固有面板', stat: 'CRIT_RATE', value: 0.05 },
    { source: '固有面板', stat: 'CRIT_DMG', value: 0.5 },
    { source: '固有面板', stat: 'ER', value: 1 },
  ];
  const totals: Partial<Record<EquipmentStat, number>> = { CRIT_RATE: 0.05, CRIT_DMG: 0.5, ER: 1 };
  const add = (source: string, stat: string, value: number) => {
    if (!Number.isFinite(value)) throw new Error(`数据缺失或非有限数值: ${source}.${stat}`);
    contributions.push({ source, stat, value });
    totals[stat as EquipmentStat] = (totals[stat as EquipmentStat] ?? 0) + value;
  };
  const curve = content.growth[String(data.base.rarity)][loadout.level];
  const asc = (stat: string) => loadout.ascension ? data.base.asc[stat]?.[loadout.ascension - 1] ?? 0 : 0;
  const baseHp = data.base.HP_BASE * curve + asc('HP_BASE');
  const baseAttack = data.base.ATK_BASE * curve + asc('ATK_BASE');
  const baseDefense = data.base.DEF_BASE * curve + asc('DEF_BASE');
  contributions.push({ source: '角色等级/突破', stat: 'HP_BASE', value: baseHp },
    { source: '角色等级/突破', stat: 'ATK_BASE', value: baseAttack }, { source: '角色等级/突破', stat: 'DEF_BASE', value: baseDefense });
  for (const key of Object.keys(data.base.asc).filter(key => !key.endsWith('_BASE'))) add('角色突破', key, asc(key));
  const weaponAttack = weapon.ATK_BASE * content.weaponGrowth[weapon.atk_curve][loadout.weapon.level]
    + weaponAscension[weapon.rarity][loadout.weapon.ascension];
  contributions.push({ source: '武器等级/突破', stat: 'ATK_BASE', value: weaponAttack });
  add('武器副属性', weapon.sub_stat, weapon.stat_base * content.weaponGrowth[weapon.stat_curve][loadout.weapon.level]);
  const sets: Record<string, number> = {};
  for (const piece of loadout.artifacts) {
    if (!content.artifactAllowed[piece.slot].includes(piece.mainStat)) throw new Error(`圣遗物主词条不适用于部位: ${piece.slot}.${piece.mainStat}`);
    const stat = piece.mainStat.endsWith('_DMG') && piece.mainStat !== 'PHYSICAL_DMG' ? 'ELEM_DMG' : piece.mainStat;
    const value = content.artifactMain[stat]?.[piece.level];
    if (value === undefined) throw new Error(`不支持的主词条: ${piece.mainStat}`);
    add(`圣遗物.${piece.slot}.主`, piece.mainStat, value);
    for (const sub of piece.substats) {
      if (!content.artifactSubstats.includes(sub.stat)) throw new Error(`不支持的副词条: ${sub.stat}`);
      const cap = sub.stat.endsWith('_PER') || ['CRIT_RATE', 'CRIT_DMG', 'ER'].includes(sub.stat) ? 1
        : sub.stat === 'HP_CONST' ? 2000 : sub.stat === 'EM' ? 150 : 200;
      if (sub.value > cap) throw new Error(`副词条数值越界: ${sub.stat}，百分比使用小数`);
      add(`圣遗物.${piece.slot}.副`, sub.stat, sub.value);
    }
    if (piece.set !== 'none') sets[piece.set] = (sets[piece.set] ?? 0) + 1;
  }
  for (const set of ['gladiator', 'shimenawa']) if ((sets[set] ?? 0) >= 2) add(`${set}.2`, 'ATK_PER', 0.18);
  if ((sets.wanderer ?? 0) >= 2) add('wanderer.2', 'EM', 80);
  if ((sets.emblem ?? 0) >= 2) add('emblem.2', 'ER', 0.2);
  if ((sets.bloodstained ?? 0) >= 2) add('bloodstained.2', 'PHYSICAL_DMG', 0.25);
  const rank = loadout.weapon.refinement - 1;
  if (loadout.weapon.id === 'staff-of-homa') add('staff-of-homa.生命', 'HP_PER', 0.2 + rank * 0.05);
  const value = (stat: EquipmentStat) => totals[stat] ?? 0;
  const maxHp = baseHp * (1 + value('HP_PER')) + value('HP_CONST');
  const stats: CombatStats = {
    level: loadout.level, characterBaseAttack: baseAttack, weaponBaseAttack: weaponAttack,
    attackPercent: value('ATK_PER'), flatAttack: value('ATK_CONST'), maxHp,
    defense: baseDefense * (1 + value('DEF_PER')) + value('DEF_CONST'), healingBonus: value('HEAL_BONUS'),
    critRate: value('CRIT_RATE'), critDamage: value('CRIT_DMG'), energyRecharge: value('ER'),
    elementalMastery: value('EM'), reactionBonus: 0, damageBonus: 0,
    damageBonuses: Object.fromEntries(['ANEMO', 'GEO', 'ELECTRO', 'HYDRO', 'PYRO', 'CRYO', 'DENDRO', 'PHYSICAL'].map(element => [element.toLowerCase(), value(`${element}_DMG` as EquipmentStat)])),
    categoryBonuses: {},
  };
  if ((sets.noblesse ?? 0) >= 2) stats.categoryBonuses.burst = 0.2;
  if ((sets.gladiator ?? 0) >= 4) stats.categoryBonuses.normal = 0.35;
  if (loadout.weapon.id === 'white-tassel') stats.categoryBonuses.normal = (stats.categoryBonuses.normal ?? 0) + 0.24 + rank * 0.06;
  if (loadout.weapon.id === 'festering-desire') stats.categoryBonuses.skill = 0.16 + rank * 0.04;
  const baseStats = structuredClone(stats);
  if (loadout.weapon.id === 'harbinger-of-dawn' && loadout.initialHpRatio > 0.9) {
    stats.critRate += 0.14 + rank * 0.035;
    contributions.push({ source: 'harbinger-of-dawn.生命>90%', stat: 'CRIT_RATE', value: 0.14 + rank * 0.035 });
  }
  if (loadout.weapon.id === 'staff-of-homa') {
    const converted = maxHp * (0.008 + rank * 0.002 + (loadout.initialHpRatio < 0.5 ? 0.01 + rank * 0.002 : 0));
    stats.flatAttack += converted;
    contributions.push({ source: 'staff-of-homa.生命转攻击', stat: 'ATK_CONST', value: converted });
  }
  if (loadout.weapon.id === 'engulfing-lightning') {
    const conversion = Math.min((stats.energyRecharge - 1) * (0.28 + rank * 0.07), 0.8 + rank * 0.1);
    stats.attackPercent += Math.max(0, conversion);
    contributions.push({ source: 'engulfing-lightning.充能转攻击', stat: 'ATK_PER', value: conversion });
  }
  if ((sets.emblem ?? 0) >= 4) stats.categoryBonuses.burst = (stats.categoryBonuses.burst ?? 0) + Math.min(0.75, stats.energyRecharge * 0.25);
  const talents = { ...loadout.talents };
  const skillC3 = ['hutao', 'albedo'].includes(loadout.character);
  if (loadout.constellation >= 3) talents[skillC3 ? 'skill' : 'burst'] += 3;
  if (loadout.constellation >= 5) talents[skillC3 ? 'burst' : 'skill'] += 3;
  const energyCapacity = { jean: 80, xingqiu: 80, hutao: 60, albedo: 40, raiden: 90 }[loadout.character];
  if (loadout.initialEnergy > energyCapacity) throw new Error('初始能量超出角色容量');
  return { loadout, name: characterNames[loadout.character], element: characterElements[loadout.character], stats, baseStats,
    baseHp, baseDefense, contributions, sets, talents, energyCapacity };
}
