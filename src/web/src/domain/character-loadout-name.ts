import {defaultRollBasis,buildRollBasis,type EffectiveRollBasis} from './effective-roll-basis';
import type { RealStat } from '@leyline/schema';
import type { AccountArtifact, AccountCharacter, LocalAccount } from './account';
import { averageRollCount } from './artifact-rolls';
import metadata from './character-effective-stats.json';

export const effectiveStatGroups: {stat:RealStat;label:string;icon:string;members:RealStat[]}[] = [
  { stat:'critDamage', label:'暴击伤害', icon:'critDamage', members:['critDamage'] },
  { stat:'critRate', label:'暴击率', icon:'critRate', members:['critRate'] },
  { stat:'elementalMastery', label:'元素精通', icon:'elementalMastery', members:['elementalMastery'] },
  { stat:'attack', label:'攻击力', icon:'attackPercent', members:['attack','attackPercent'] },
  { stat:'defense', label:'防御力', icon:'defensePercent', members:['defense','defensePercent'] },
  { stat:'hp', label:'生命值', icon:'hpPercent', members:['hp','hpPercent'] },
  { stat:'energyRecharge', label:'充能效率', icon:'energyRecharge', members:['energyRecharge'] },
];
export function defaultEffectiveStats(name:string):RealStat[] {
  const groups=(metadata.characters as Record<string,string[]>)[name] ?? ((name.startsWith('旅行者') || /^[空荧]（[风岩雷草水火冰]）$/.test(name)) ? metadata.characters['旅行者'] : []);
  return effectiveStatGroups.filter(group=>groups.includes(group.stat)).flatMap(group=>group.members);
}

export const effectiveStatOptions: RealStat[] = ['hp','hpPercent','attack','attackPercent','defense','defensePercent','elementalMastery','energyRecharge','critRate','critDamage'];
export function effectiveRollBreakdown(items:readonly AccountArtifact[],basis:EffectiveRollBasis=defaultRollBasis()) {
  return effectiveStatGroups.map(group=>{
    let value:number|undefined=0;
    for(const item of items)for(const sub of item.real?.substats ?? []) {
      if(!group.members.includes(sub.stat))continue;
      const flat=sub.stat==='hp' || sub.stat==='attack' || sub.stat==='defense';
      const count=flat?averageRollCount(`${sub.stat}Percent` as RealStat,sub.value/basis[sub.stat as 'hp'|'attack'|'defense'],item.real!.rarity):averageRollCount(sub.stat,sub.value,item.real!.rarity);
      value=value===undefined || count===undefined ? undefined : value+count;
    }
    return {...group,value};
  });
}
export function configurationSignature(character: AccountCharacter) {
  return JSON.stringify([character.attack,character.weapon,character.realBuild ?? null, Object.entries(character.equipment).sort(([a],[b])=>a.localeCompare(b))]);
}
export function characterLoadoutName(character: AccountCharacter, account: LocalAccount, stats: readonly RealStat[], sets: readonly {id:string;name:string}[]) {
  const ids=new Set(Object.values(character.equipment));
  return equipmentConfigurationName(character.name,account.artifacts.filter(item=>ids.has(item.id)),stats,sets,buildRollBasis(character.realBuild),character.realBuild?.weapon.name ?? '未配武器');
}
export function equipmentConfigurationName(characterName:string,pieces:readonly AccountArtifact[],stats:readonly RealStat[],sets:readonly {id:string;name:string}[],basis:EffectiveRollBasis,weaponName:string,rollTotal?:number) {
  const total=rollTotal ?? effectiveRollBreakdown(pieces,basis).filter(group=>group.members.some(stat=>stats.includes(stat))).reduce((sum,row)=>sum+(row.value ?? 0),0);
  const counts = new Map<string,number>();
  for (const item of pieces) if(item.real && !item.mona?.setIdentityPending) counts.set(item.real.setId,(counts.get(item.real.setId) ?? 0)+1);
  const groups = [...counts].sort((a,b)=>b[1]-a[1]);
  const name = (id:string)=>sets.find(set=>set.id===id)?.name ?? '待核对套装';
  const four = groups.find(([,count])=>count>=4);
  const pairs = groups.filter(([,count])=>count>=2);
  const setName = !pieces.length?'未配圣遗物':four?name(four[0]):pairs.length?pairs.map(([id])=>`${name(id)}2`).join('＋')+(pairs.length===1?'＋散件':''):'散件';
  return `${characterName} · ${stats.length?`${total.toFixed(1)}词条`:'待选词条'} · ${setName} · ${weaponName}`;
}
