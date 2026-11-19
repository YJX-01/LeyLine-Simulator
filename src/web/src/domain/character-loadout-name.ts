import {defaultRollBasis,buildRollBasis,type EffectiveRollBasis} from './effective-roll-basis';
import type { StatKey } from '@leyline/schema';
import type { AccountArtifact, AccountCharacter, LocalAccount } from './account';
import { averageRollCount } from './artifact-rolls';
import { artifactSetName } from './artifact-set-name';
import metadata from 'virtual:leyline-display/character-effective-stats';

export const effectiveStatGroups: {stat:StatKey;label:string;icon:string;members:StatKey[]}[] = [
  { stat:'critDamage', label:'暴击伤害', icon:'critDamage', members:['critDamage'] },
  { stat:'critRate', label:'暴击率', icon:'critRate', members:['critRate'] },
  { stat:'elementalMastery', label:'元素精通', icon:'elementalMastery', members:['elementalMastery'] },
  { stat:'attack', label:'攻击力', icon:'attackPercent', members:['attack','attackPercent'] },
  { stat:'defense', label:'防御力', icon:'defensePercent', members:['defense','defensePercent'] },
  { stat:'hp', label:'生命值', icon:'hpPercent', members:['hp','hpPercent'] },
  { stat:'energyRecharge', label:'充能效率', icon:'energyRecharge', members:['energyRecharge'] },
];
export function defaultEffectiveStats(name:string):StatKey[] {
  const names=metadata.characters as Record<string,string[]>;
  const manekinBase=name.match(/^(奇偶·(?:男性|女性))（[风岩雷草水火冰]）$/)?.[1];
  const groups=names[name] ?? names[manekinBase ?? ''] ?? ((name.startsWith('旅行者') || /^[空荧]（[风岩雷草水火冰]）$/.test(name)) ? metadata.characters['旅行者'] : []);
  return effectiveStatGroups.filter(group=>groups.includes(group.stat)).flatMap(group=>group.members);
}

export const effectiveStatOptions: StatKey[] = ['hp','hpPercent','attack','attackPercent','defense','defensePercent','elementalMastery','energyRecharge','critRate','critDamage'];
export function effectiveRollBreakdown(items:readonly AccountArtifact[],basis:EffectiveRollBasis=defaultRollBasis()) {
  return effectiveStatGroups.map(group=>{
    let value:number|undefined=0;
    for(const item of items)for(const sub of item.real?.substats ?? []) {
      if(!group.members.includes(sub.stat))continue;
      const flat=sub.stat==='hp' || sub.stat==='attack' || sub.stat==='defense';
      const count=flat?averageRollCount(`${sub.stat}Percent` as StatKey,sub.value/basis[sub.stat as 'hp'|'attack'|'defense'],item.real!.rarity):averageRollCount(sub.stat,sub.value,item.real!.rarity);
      value=value===undefined || count===undefined ? undefined : value+count;
    }
    return {...group,value};
  });
}
export function configurationSignature(character: AccountCharacter) {
  return JSON.stringify([character.attack,character.weapon,character.build ?? null, Object.entries(character.equipment).sort(([a],[b])=>a.localeCompare(b))]);
}
export function characterLoadoutName(character: AccountCharacter, account: LocalAccount, stats: readonly StatKey[], sets: readonly {id:string;name:string}[]) {
  return `${character.name} | ${characterLoadoutLabel(character,account,stats,sets)}`;
}
export function characterLoadoutLabel(character: AccountCharacter, account: LocalAccount, stats: readonly StatKey[], sets: readonly {id:string;name:string}[]) {
  const ids=new Set(Object.values(character.equipment));
  return equipmentConfigurationLabel(account.artifacts.filter(item=>ids.has(item.id)),stats,sets,buildRollBasis(character.build),character.build?.weapon.name ?? '未配武器');
}
export function equipmentConfigurationLabel(pieces:readonly AccountArtifact[],stats:readonly StatKey[],sets:readonly {id:string;name:string}[],basis:EffectiveRollBasis,weaponName:string,rollTotal?:number) {
  const total=rollTotal ?? effectiveRollBreakdown(pieces,basis).filter(group=>group.members.some(stat=>stats.includes(stat))).reduce((sum,row)=>sum+(row.value ?? 0),0);
  const setName=pieces.length?artifactSetName(pieces,sets):'未配圣遗物';
  return `${stats.length?`${total.toFixed(1)}词条`:'待选词条'}|${setName}|${weaponName}`;
}
