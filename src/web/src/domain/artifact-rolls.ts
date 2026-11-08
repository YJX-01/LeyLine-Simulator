import type { RealArtifact, RealStat } from '@leyline/schema';
import table from './data/artifact-rolls.json';
import { ratioStat } from './account-real';
type Affix = {stat:string;value:number;rarity:number};
const affixes:Record<string,Affix>=table;
/** Average-equivalent entries, including the initial entry; never an upgrade-history count. */
export function averageRollCount(stat: RealStat, value: number, rarity: number): number | undefined {
  const tiers = Object.values(affixes).filter(item => item.stat === stat && item.rarity === rarity);
  if (tiers.length !== 4 || !Number.isFinite(value) || value < 0) return undefined;
  const average = tiers.reduce((sum, item) => sum + item.value, 0) / tiers.length;
  return average > 0 ? value / average : undefined;
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

/** User-selected tie rule: larger legal total first, then larger entries in display order. */
export function preferredUpgradeCounts(artifact: RealArtifact) {
  const valid=legalRollConfigurations(artifact);
  valid.sort((a,b)=>b.reduce((sum,n)=>sum+n,0)-a.reduce((sum,n)=>sum+n,0) || a.reduce((difference,n,index)=>difference || b[index]-n,0));
  const selected=valid[0];
  return artifact.substats.map((sub,index)=>selected?{min:selected[index]-1,max:selected[index]-1,recorded:sub.rolls!==undefined}:undefined);
}

/** A range of possible histories must not be presented as an observed enhancement count. */
export function confirmedUpgradeCounts(artifact: RealArtifact) {
  return upgradeCounts(artifact).map(count => count && count.min === count.max ? count : undefined);
}
