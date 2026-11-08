import { accountSlots, accountSlotLabels, cloneAccount, parseAccount, type AccountArtifact, type AccountCharacter, type LocalAccount } from './account';
import type { RealBuild } from '@leyline/schema';

/** Exact, ordered content matching, used only after an explicit showcase-to-inventory choice. */
export function orderedArtifactContent(item:AccountArtifact, main?:RealBuild['artifactMain']) {
  const real=item.real;
  if(!real)return '';
  return JSON.stringify([real.setId,real.slot,real.rarity,real.level,real.mainStat,item.mona?.mainValue ?? main?.[real.mainStat]?.[real.level],real.substats.map(sub=>[sub.stat,sub.value])]);
}

export function planShowcaseInventory(account:LocalAccount, characters:readonly AccountCharacter[]) {
  const next=cloneAccount(account),items:Record<string,AccountArtifact[]>={};
  let added=0,matched=0;
  for(const character of characters) {
    if(!character.showcase)throw new Error('展柜信息已不存在，请重新打开。');
    const main=character.showcase.build.artifactMain;
    items[character.id]=[];
    for(const slot of accountSlots) {
      const source=showcaseArtifact(character,slot);if(!source)continue;
      const signature=orderedArtifactContent(source,main);
      let physical=next.artifacts.find(item=>orderedArtifactContent(item,main)===signature);
      if(physical)matched++;
      else {
        const id=`local-showcase-${crypto.randomUUID()}`;
        physical={...JSON.parse(JSON.stringify(source)),id,real:{...source.real,id}};
        next.artifacts.push(physical!);added++;
      }
      items[character.id].push(physical!);
    }
  }
  return {next:parseAccount(next),items,added,matched};
}

export function showcaseArtifact(character:AccountCharacter,slot:typeof accountSlots[number]) {
  const real=character.showcase?.build.artifacts.find(item=>item.slot===slot);
  if(!real)return undefined;
  return {id:real.id,slot,attack:0,real,name:`${character.showcase!.build.sets.find(set=>set.id===real.setId)?.name ?? '展柜装备'} · ${accountSlotLabels[slot]}`};
}
