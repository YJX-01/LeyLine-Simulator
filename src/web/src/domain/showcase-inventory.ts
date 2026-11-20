import { accountSlots, accountSlotLabels, cloneAccount, parseAccount, type AccountArtifact, type AccountCharacter, type LocalAccount } from './account';
import {persistArtifactRolls} from './artifact-rolls';
import type { Build, StatKey } from '@leyline/schema';
import { physicalArtifact } from './build-snapshot';
import { ratioStat } from './account-real';

function comparableValue(stat: StatKey, value: number) {
  const scale = ratioStat(stat) ? 1000 : 1;
  const display = Math.round(value * scale) / scale;
  // Only remove binary roundoff around the recorded decimal. Genuine extra precision stays distinct.
  return Math.abs(value - display) <= 2 * Number.EPSILON * Math.abs(value) ? display : value;
}

function orderedSubstats(real: NonNullable<AccountArtifact['real']>) {
  return real.substats.map(sub => [sub.stat, comparableValue(sub.stat, sub.value)]);
}

/** Identity-independent item content; history/source metadata is not an equipment change. */
export function artifactValueSignature(item:AccountArtifact){const real=item.real;return JSON.stringify(real?[real.setId,real.slot,real.rarity,real.level,real.mainStat,orderedSubstats(real)]:[item.slot,item.attack]);}

/** Exact, ordered contents shared by import confirmation and read-only inventory status. */
export function orderedArtifactContent(item:AccountArtifact, main?:Build['artifactMain']) {
  const real=item.real;
  if(!real)return '';
  const canonical = main?.[real.rarity][real.mainStat]?.[real.level];
  const observed = item.mona?.mainValue;
  const scale = ratioStat(real.mainStat) ? 1000 : 1;
  let mainValue = observed === undefined ? canonical : comparableValue(real.mainStat, observed);
  if (canonical !== undefined && mainValue === Math.round(canonical * scale) / scale) mainValue = canonical;
  return JSON.stringify([real.setId,real.slot,real.rarity,real.level,real.mainStat,mainValue,orderedSubstats(real)]);
}

export function matchingInventoryArtifact(account: LocalAccount, source: AccountArtifact, main?: Build['artifactMain'], wornId?: string) {
  const signature = orderedArtifactContent(source, main);
  if (!signature) return;
  const matches = (item: AccountArtifact) => item.slot === source.slot && item.inventoryId !== null && !item.isCopy
    && !item.mona?.setIdentityPending && !/ · 副本\d+$/.test(item.alias ?? '') && orderedArtifactContent(item, main) === signature;
  const worn = wornId ? account.artifacts.find(item => item.id === wornId) : undefined;
  return worn && matches(worn) ? worn : account.artifacts.find(matches);
}

export function mergeShowcaseRolls(item: AccountArtifact, observed: AccountArtifact): AccountArtifact {
  if (!item.real || !observed.real?.substats.every(sub => sub.rolls !== undefined)) return item;
  const substats = item.real.substats.map((sub, index) => ({ ...sub, rolls: observed.real!.substats[index].rolls }));
  return { ...item, rollSource: 'showcase', real: { ...item.real, substats } };
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
      // Search inventory order on confirmed import. A later generated duplicate must not shadow its original.
      let physical=matchingInventoryArtifact(next,source,main);
      if(physical){
        matched++;
        if(source.real?.substats.every(sub=>sub.rolls!==undefined)){
          Object.assign(physical, mergeShowcaseRolls(physical, source));
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
  const piece=character.showcase?.build.artifacts.find(item=>item.slot===slot);
  if(!piece)return undefined;
  const real=physicalArtifact(piece);
  const source:AccountArtifact={id:real.id,slot,attack:0,real,rollSource:real.substats.every(sub=>sub.rolls!==undefined)?'showcase' as const:undefined,name:`${character.showcase!.build.sets.find(set=>set.id===real.setId)?.name ?? '展柜装备'} · ${accountSlotLabels[slot]}`};
  // Display status never adopts a local ID or changes the independent showcase snapshot.
  return inventory && !matchingInventoryArtifact(inventory,source,character.showcase!.build.artifactMain)?{...source,inventoryId:null}:source;
}
