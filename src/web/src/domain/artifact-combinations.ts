import shortNames from './data/artifact-set-short-names.json';
import type { RealStat } from '@leyline/schema';
import { accountSlots, cloneAccount, parseAccount, equipArtifact, artifactOwner, type AccountArtifact, type LocalAccount } from './account';
import { effectiveRollBreakdown, effectiveStatGroups } from './character-loadout-name';

export interface ArtifactCombination {
  id:string; accountId:string; items:AccountArtifact[]; stats:RealStat[]; referenceName:string; name?:string;
}
export function normalizeEffectiveStats(stats:readonly RealStat[]) {
  return effectiveStatGroups.filter(group=>group.members.some(stat=>stats.includes(stat))).flatMap(group=>group.members);
}
export function combinationSignature(items:readonly AccountArtifact[],stats:readonly RealStat[]) {
  return JSON.stringify([accountSlots.map(slot=>items.find(item=>item.slot===slot)?.id ?? ''),normalizeEffectiveStats(stats)]);
}
export function effectiveTotal(items:readonly AccountArtifact[],stats:readonly RealStat[]) {
  const rows=effectiveRollBreakdown(items).filter(row=>row.members.some(stat=>stats.includes(stat)));
  return rows.some(row=>row.value===undefined)?undefined:rows.reduce((total,row)=>total+(row.value ?? 0),0);
}
export const mainStatInitials:Record<RealStat,string>={hp:'生',hpPercent:'生',attack:'攻',attackPercent:'攻',defense:'防',defensePercent:'防',elementalMastery:'精',energyRecharge:'充',critRate:'暴',critDamage:'爆',healingBonus:'治',anemoBonus:'风',geoBonus:'岩',electroBonus:'雷',dendroBonus:'草',hydroBonus:'水',pyroBonus:'火',cryoBonus:'冰',physicalBonus:'物'};
export function defaultCombinationName(combination:Pick<ArtifactCombination,'items'|'stats'>,sets:readonly {id:string;name:string}[]) {
  const counts=new Map<string,number>();
  for(const item of combination.items)if(item.real && !item.mona?.setIdentityPending)counts.set(item.real.setId,(counts.get(item.real.setId) ?? 0)+1);
  const groups=[...counts].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0]));
  const title=(id:string)=>(shortNames as Record<string,string>)[id] ?? sets.find(set=>set.id===id)?.name ?? '待核对套装';
  const four=groups.find(([,count])=>count>=4),pairs=groups.filter(([,count])=>count>=2).slice(0,2);
  const set=four?`4${title(four[0])}`:pairs.length?pairs.map(([id])=>`2${title(id)}`).join('+')+(pairs.length===1?'+散件':''):'散件';
  const main=(['sands','goblet','circlet'] as const).map(slot=>{const stat=combination.items.find(item=>item.slot===slot)?.real?.mainStat;return stat?mainStatInitials[stat]:'缺';}).join('');
  const total=effectiveTotal(combination.items,combination.stats);
  return `${set}-${main}${combination.stats.length?(total===undefined?'?':total.toFixed(1))+'词条':'待选词条'}`;
}
export function combinationName(combination:Pick<ArtifactCombination,'items'|'stats'|'name'>,sets:readonly {id:string;name:string}[]) {
  return combination.name ?? defaultCombinationName(combination,sets);
}
export function validateCombinationItems(account:LocalAccount,items:readonly AccountArtifact[]) {
  for(const item of items) {
    const current=account.artifacts.find(candidate=>candidate.id===item.id);
    if(!current || JSON.stringify(current.real)!==JSON.stringify(item.real))throw new Error('组合中的实物已缺失或词条已变化，请在组合编辑中重新选择。');
  }
}
export function applyCombination(account:LocalAccount,characterId:string,combination:ArtifactCombination) {
  if(combination.accountId!==account.id)throw new Error('组合不属于当前账号。');
  validateCombinationItems(account,combination.items);
  const next=cloneAccount(account),character=next.characters.find(item=>item.id===characterId);
  if(!character)throw new Error('角色已不存在。');
  const transfers:string[]=[];
  character.equipment={};
  for(const item of combination.items) {
    const owner=artifactOwner(next,item.id);
    if(owner && owner.id!==characterId)transfers.push(`从「${owner.name}」转移「${item.name}」`);
    equipArtifact(next,characterId,item.id,true);
  }
  return {next:parseAccount(next),transfers};
}
