import type { RealArtifact, RealStat } from '@leyline/schema';
import table from './data/artifact-rolls.json';
import { ratioStat } from './account-real';
import type {AccountArtifact} from './account';
type Affix = {stat:string;value:number;rarity:number};
const affixes:Record<string,Affix>=table;
/** Average-equivalent entries, including the initial entry; never an upgrade-history count. */
const averages=new Map<string,number>();
for(const rarity of [4,5])for(const stat of new Set(Object.values(affixes).map(item=>item.stat))){
  const tiers=Object.values(affixes).filter(item=>item.stat===stat && item.rarity===rarity);
  if(tiers.length===4)averages.set(`${rarity}/${stat}`,tiers.reduce((sum,item)=>sum+item.value,0)/4);
}
export function averageRollCount(stat:RealStat,value:number,rarity:number):number|undefined {
  const average=averages.get(`${rarity}/${stat}`);
  return average && Number.isFinite(value) && value>=0?value/average:undefined;
}
const displayed=(stat:RealStat,value:number)=>Math.round(value*(ratioStat(stat)?1000:1)+1e-7);
/** Keep exact Enka counts only when every source ID and displayed total agrees. */
export function recordedRolls(artifact:RealArtifact,ids:number[]|undefined):void {
  if(!ids?.length)return;
  const entries=ids.map(id=>affixes[String(id)]);
  if(entries.some(item=>!item||item.rarity!==artifact.rarity))return;
  if(entries.some(item=>!artifact.substats.some(sub=>sub.stat===item.stat)))return;
  for(const sub of artifact.substats) {
    const values=entries.filter(item=>item.stat===sub.stat);
    if(!values.length||displayed(sub.stat,values.reduce((sum,item)=>sum+item.value,0))!==displayed(sub.stat,sub.value))return;
  }
  for(const sub of artifact.substats)sub.rolls=entries.filter(item=>item.stat===sub.stat).length;
}
const candidates=new Map<string,number[]>();
function possibleCounts(stat:RealStat,value:number,rarity:number,max:number):number[] {
  const key=`${stat}/${value}/${rarity}/${max}`;const cached=candidates.get(key);if(cached)return cached;
  const tiers=Object.values(affixes).filter(item=>item.stat===stat&&item.rarity===rarity).map(item=>Math.round(item.value*1e6));
  let sums=new Set([0]);const counts:number[]=[];
  for(let count=1;count<=max;count++) {
    sums=new Set([...sums].flatMap(sum=>tiers.map(tier=>sum+tier)));
    if([...sums].some(sum=>displayed(stat,sum/1e6)===displayed(stat,value)))counts.push(count);
  }
  if(candidates.size>2000)candidates.clear();candidates.set(key,counts);return counts;
}
/** Enumerate joint configurations, retaining the initial-three/four and level constraints. */
function legalRollConfigurations(artifact: RealArtifact): number[][] {
  const upgrades=Math.floor(artifact.level/4);
  const totals=[3,4].filter(initial=>Math.min(4,initial+upgrades)===artifact.substats.length).map(initial=>initial+upgrades);
  const choices=artifact.substats.map(sub=>sub.rolls!==undefined?[sub.rolls]:possibleCounts(sub.stat,sub.value,artifact.rarity,upgrades+1));
  const valid:number[][]=[];
  function visit(index:number,counts:number[]) {
    if(index===choices.length){if(totals.includes(counts.reduce((a,b)=>a+b,0)))valid.push(counts);return;}
    for(const count of choices[index])visit(index+1,[...counts,count]);
  }
  visit(0,[]);
  return valid;
}
/** Compatibility/audit surface: candidate ranges are not observed history. */
export function upgradeCounts(artifact:RealArtifact):({min:number;max:number;recorded:boolean}|undefined)[] {
  const valid=legalRollConfigurations(artifact);
  return artifact.substats.map((sub,index)=>valid.length?{min:Math.min(...valid.map(item=>item[index]))-1,max:Math.max(...valid.map(item=>item[index]))-1,recorded:sub.rolls!==undefined}:undefined);
}

/** User-selected tie rule: smaller legal total first, then smaller entries in display order. */
export function preferredUpgradeCounts(artifact: RealArtifact) {
  const valid=legalRollConfigurations(artifact);
  valid.sort((a,b)=>a.reduce((sum,n)=>sum+n,0)-b.reduce((sum,n)=>sum+n,0) || a.reduce((difference,n,index)=>difference || n-b[index],0));
  const selected=valid[0];
  return artifact.substats.map((sub,index)=>selected?{min:selected[index]-1,max:selected[index]-1,recorded:sub.rolls!==undefined}:undefined);
}

/** A range of possible histories must not be presented as an observed enhancement count. */
export function confirmedUpgradeCounts(artifact: RealArtifact) {
  return upgradeCounts(artifact).map(count => count && count.min === count.max ? count : undefined);
}

/** Editable candidates come from the observed values and level, never stored history locks. */
export function legalUpgradeHistories(artifact:RealArtifact):number[][] {
  const value={...artifact,substats:artifact.substats.map(({stat,value})=>({stat,value}))};
  return legalRollConfigurations(value).map(counts=>counts.map(count=>count-1));
}
export function cycleUpgradeHistory(artifact:RealArtifact,index:number):boolean {
  const histories=legalUpgradeHistories(artifact),choices=[...new Set(histories.map(counts=>counts[index]))].sort((a,b)=>a-b);
  if(choices.length<2)return false;
  const current=artifact.substats.map((sub,index)=>sub.rolls===undefined?preferredUpgradeCounts(artifact)[index]?.min ?? -1:sub.rolls-1);
  const target=choices[(choices.indexOf(current[index])+1)%choices.length];
  const selected=histories.filter(counts=>counts[index]===target).sort((a,b)=>a.reduce((sum,n,i)=>sum+Math.abs(n-current[i]),0)-b.reduce((sum,n,i)=>sum+Math.abs(n-current[i]),0))[0];
  artifact.substats.forEach((sub,i)=>{sub.rolls=selected[i]+1;});return true;
}

/** Persist one legal history; a verified showcase history takes precedence. */
export function persistArtifactRolls(item:AccountArtifact):void {
  if(!item.real)return;
  const complete=item.real.substats.every(sub=>sub.rolls!==undefined);
  if(!complete){for(const sub of item.real.substats)delete sub.rolls;delete item.rollSource;}
  const counts=preferredUpgradeCounts(item.real);
  if(counts.some(count=>!count))return;
  if(!complete)item.real.substats.forEach((sub,index)=>{sub.rolls=counts[index]!.min+1;});
  item.rollSource=complete?(item.rollSource ?? (item.real.source?.format==='enka-showcase'?'showcase':'inferred')):'inferred';
}
