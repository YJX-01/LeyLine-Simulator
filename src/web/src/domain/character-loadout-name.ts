import type { RealStat } from '@leyline/schema';
import type { AccountCharacter, LocalAccount } from './account';
import { averageRollCount } from './artifact-rolls';
import metadata from './character-effective-stats.json';

export const effectiveStatGroups: {stat:RealStat;label:string;icon:string;members:RealStat[]}[] = [
  { stat:'hp', label:'生命值', icon:'hpPercent', members:['hp','hpPercent'] },
  { stat:'attack', label:'攻击力', icon:'attackPercent', members:['attack','attackPercent'] },
  { stat:'defense', label:'防御力', icon:'defensePercent', members:['defense','defensePercent'] },
  { stat:'elementalMastery', label:'元素精通', icon:'elementalMastery', members:['elementalMastery'] },
  { stat:'energyRecharge', label:'充能效率', icon:'energyRecharge', members:['energyRecharge'] },
  { stat:'critRate', label:'暴击率', icon:'critRate', members:['critRate'] },
  { stat:'critDamage', label:'暴击伤害', icon:'critDamage', members:['critDamage'] },
];
export function defaultEffectiveStats(name:string):RealStat[] {
  const groups=(metadata.characters as Record<string,string[]>)[name] ?? (name.startsWith('旅行者') ? metadata.characters['旅行者'] : []);
  return effectiveStatGroups.filter(group=>groups.includes(group.stat)).flatMap(group=>group.members);
}

export const effectiveStatOptions: RealStat[] = ['hp','hpPercent','attack','attackPercent','defense','defensePercent','elementalMastery','energyRecharge','critRate','critDamage'];
export function configurationSignature(character: AccountCharacter) {
  return JSON.stringify([character.attack,character.weapon,character.realBuild ?? null, Object.entries(character.equipment).sort(([a],[b])=>a.localeCompare(b))]);
}
export function characterLoadoutName(character: AccountCharacter, account: LocalAccount, stats: readonly RealStat[], sets: readonly {id:string;name:string}[]) {
  const ids = new Set(Object.values(character.equipment));
  const pieces = account.artifacts.filter(item=>ids.has(item.id));
  const total = pieces.reduce((sum,item)=>sum+(item.real?.substats.reduce((value,sub)=>value+(stats.includes(sub.stat)?averageRollCount(sub.stat,sub.value,item.real!.rarity) ?? 0:0),0) ?? 0),0);
  const counts = new Map<string,number>();
  for (const item of pieces) if(item.real && !item.mona?.setIdentityPending) counts.set(item.real.setId,(counts.get(item.real.setId) ?? 0)+1);
  const groups = [...counts].sort((a,b)=>b[1]-a[1]);
  const name = (id:string)=>sets.find(set=>set.id===id)?.name ?? '待核对套装';
  const four = groups.find(([,count])=>count>=4);
  const pairs = groups.filter(([,count])=>count>=2);
  const setName = !pieces.length?'未配圣遗物':four?name(four[0]):pairs.length?pairs.map(([id])=>`${name(id)}2`).join('＋')+(pairs.length===1?'＋散件':''):'散件';
  return `${character.name} · ${stats.length?`${total.toFixed(1)}词条`:'待选词条'} · ${setName} · ${character.realBuild?.weapon.name ?? '未配武器'}`;
}
