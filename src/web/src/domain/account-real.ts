import type { ArtifactItem, StatKey } from '@leyline/schema';

export const accountStatLabels: Record<StatKey, string> = { hp: '生命值', hpPercent: '生命值%', attack: '攻击力', attackPercent: '攻击力%', defense: '防御力', defensePercent: '防御力%', critRate: '暴击率', critDamage: '暴击伤害', energyRecharge: '充能效率', elementalMastery: '元素精通', physicalBonus: '物理伤害加成', anemoBonus: '风元素伤害加成', geoBonus: '岩元素伤害加成', electroBonus: '雷元素伤害加成', hydroBonus: '水元素伤害加成', pyroBonus: '火元素伤害加成', cryoBonus: '冰元素伤害加成', dendroBonus: '草元素伤害加成', healingBonus: '治疗加成' };
export const ratioStat = (stat: StatKey) => !['hp', 'attack', 'defense', 'elementalMastery'].includes(stat);
export const accountSubstats: StatKey[] = ['hp', 'hpPercent', 'attack', 'attackPercent', 'defense', 'defensePercent', 'critRate', 'critDamage', 'energyRecharge', 'elementalMastery'];
const percentMain: StatKey[] = ['hpPercent', 'attackPercent', 'defensePercent', 'elementalMastery'];
export const accountMainStats: Record<ArtifactItem['slot'], StatKey[]> = {
  flower: ['hp'], plume: ['attack'], sands: [...percentMain, 'energyRecharge'],
  goblet: [...percentMain, 'physicalBonus', 'anemoBonus', 'geoBonus', 'electroBonus', 'hydroBonus', 'pyroBonus', 'cryoBonus', 'dendroBonus'],
  circlet: [...percentMain, 'critRate', 'critDamage', 'healingBonus'],
};
export function validateAccountArtifact(artifact: ArtifactItem): void {
  if (!accountMainStats[artifact.slot].includes(artifact.mainStat)) throw new Error('圣遗物主词条不适用于所选部位。');
  const seen = new Set<StatKey>();
  for (const sub of artifact.substats) {
    if (!accountSubstats.includes(sub.stat) || sub.stat === artifact.mainStat || seen.has(sub.stat) || !Number.isFinite(sub.value) || sub.value <= 0) throw new Error('圣遗物副词条无效，不能重复或与主词条相同。');
    const caps: Partial<Record<StatKey, number>> = { hp: 1793, attack: 117, defense: 139, hpPercent: 0.35, attackPercent: 0.35, defensePercent: 0.44, energyRecharge: 0.4, elementalMastery: 140, critRate: 0.24, critDamage: 0.48 };
    const cap = caps[sub.stat] ?? 0;
    if (sub.value > cap) throw new Error('圣遗物副词条数值越界；比例在文件中应使用小数。');
    seen.add(sub.stat);
  }
}
