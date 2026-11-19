import shortNames from 'virtual:leyline-display/artifact-set-short-names';
import type { AccountArtifact } from './account';

export function artifactSetName(items:readonly AccountArtifact[], sets:readonly {id:string;name:string}[]) {
  const counts=new Map<string,number>();
  for(const item of items) {
    if(!item.real || item.mona?.setIdentityPending)continue;
    const id=item.real.setId;
    counts.set(id,(counts.get(id) ?? 0)+1);
  }
  const groups=[...counts].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0]));
  const name=(id:string)=>(shortNames as Record<string,string>)[id] ?? sets.find(set=>set.id===id)?.name ?? '待核对套装';
  const four=groups.find(([,count])=>count>=4);
  if(four)return `4${name(four[0])}`;
  const pairs=groups.filter(([,count])=>count>=2).slice(0,2);
  if(!pairs.length)return '散件';
  return pairs.map(([id])=>`2${name(id)}`).join('+')+(pairs.length===1?'+散件':'');
}
