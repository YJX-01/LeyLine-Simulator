import { accountSlots, accountSlotLabels, cloneAccount, parseAccount, type AccountArtifact, type AccountCharacter, type LocalAccount } from './account';
import {persistArtifactRolls} from './artifact-rolls';
import type { Build } from '@leyline/schema';

/** Identity-independent item content; history/source metadata is not an equipment change. */
export function artifactValueSignature(item:AccountArtifact){const real=item.real;return JSON.stringify(real?[real.setId,real.slot,real.rarity,real.level,real.mainStat,real.substats.map(sub=>[sub.stat,sub.value])]:[item.slot,item.attack]);}

/** Exact, ordered contents shared by import confirmation and read-only inventory status. */
export function orderedArtifactContent(item:AccountArtifact, main?:Build['artifactMain']) {
  const real=item.real;
  if(!real)return '';
  return JSON.stringify([real.setId,real.slot,real.rarity,real.level,real.mainStat,item.mona?.mainValue ?? main?.[real.mainStat]?.[real.level],real.substats.map(sub=>[sub.stat,sub.value])]);
}

function matchingInventoryArtifact(account:LocalAccount,source:AccountArtifact,main?:Build['artifactMain']) {
  const signature=orderedArtifactContent(source,main);
  return signature?account.artifacts.find(item=>item.inventoryId!==null && !item.isCopy && !/ · 副本\d+$/.test(item.alias ?? '') && orderedArtifactContent(item,main)===signature):undefined;
}

export function planShowcaseInventory(account:LocalAccount, characters:readonly AccountCharacter[],selectedSlots:readonly typeof accountSlots[number][]=accountSlots) {
  const next=cloneAccount(account),items:Record<string,AccountArtifact[]>={};
  let added=0,matched=0;
  for(const character of characters) {
    if(!character.showcase)throw new Error('展柜信息已不存在，请重新打开。');
    const main=character.showcase.build.artifactMain;
    items[character.id]=[];
    for(const slot of selectedSlots) {
      const source=showcaseArtifact(character,slot);if(!source)continue;
      let physical=matchingInventoryArtifact(next,source,main);
      if(physical){
        matched++;
        if(source.real?.substats.every(sub=>sub.rolls!==undefined)){
          physical.real!.substats=JSON.parse(JSON.stringify(source.real.substats));physical.rollSource='showcase';
        }else persistArtifactRolls(physical);
      }
      else {
        const id=`local-showcase-${crypto.randomUUID()}`;
        physical={...JSON.parse(JSON.stringify(source)),id,real:{...source.real,id}};
        persistArtifactRolls(physical!);next.artifacts.push(physical!);added++;
      }
      items[character.id].push(physical!);
    }
  }
  return {next:parseAccount(next),items,added,matched};
}

export function showcaseArtifact(character:AccountCharacter,slot:typeof accountSlots[number],inventory?:LocalAccount):AccountArtifact|undefined {
  const real=character.showcase?.build.artifacts.find(item=>item.slot===slot);
  if(!real)return undefined;
  const source:AccountArtifact={id:real.id,slot,attack:0,real,rollSource:real.substats.every(sub=>sub.rolls!==undefined)?'showcase' as const:undefined,name:`${character.showcase!.build.sets.find(set=>set.id===real.setId)?.name ?? '展柜装备'} · ${accountSlotLabels[slot]}`};
  // Display status never adopts a local ID or changes the independent showcase snapshot.
  return inventory && !matchingInventoryArtifact(inventory,source,character.showcase!.build.artifactMain)?{...source,inventoryId:null}:source;
}
