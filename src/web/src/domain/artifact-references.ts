import {cloneAccount,type AccountArtifact,type LocalAccount} from './account';
import type {ArtifactCombination} from './artifact-combinations';
import type {AccountConfiguration} from './account-configurations';
import {persistArtifactRolls} from './artifact-rolls';
export type ArtifactReferenceTarget={kind:'character';characterId:string}|{kind:'configuration';characterId:string;presetId:string}|{kind:'combination';id:string};
export interface ArtifactReference {key:string;kind:'character'|'configuration'|'combination';name:string;target:ArtifactReferenceTarget}
export function artifactReferences(account:LocalAccount,configurations:readonly AccountConfiguration[],combinations:readonly ArtifactCombination[],itemId:string):ArtifactReference[]{
  return [
    ...account.characters.filter(character=>Object.values(character.equipment).includes(itemId)).map(character=>({key:`character-${character.id}`,kind:'character' as const,name:character.name,target:{kind:'character' as const,characterId:character.id}})),
    ...configurations.filter(item=>Object.values(item.character.equipment).includes(itemId)).map(item=>({key:`configuration-${item.id}`,kind:'configuration' as const,name:`${item.character.name} · ${item.presetId?'备选':'首选'}配置`,target:{kind:'configuration' as const,characterId:item.character.id,presetId:item.presetId}})),
    ...combinations.filter(item=>item.accountId===account.id && item.items.some(piece=>piece.id===itemId)).map(item=>({key:`combination-${item.id}`,kind:'combination' as const,name:item.name ?? item.referenceName+'圣遗物组合',target:{kind:'combination' as const,id:item.id}})),
  ];
}
export function copyArtifact(item:AccountArtifact,inventory:readonly AccountArtifact[]=[]):AccountArtifact{
  const copied=JSON.parse(JSON.stringify(item)) as AccountArtifact;copied.id=crypto.randomUUID();copied.isCopy=true;delete copied.mona;delete copied.inventoryId;delete copied.rollSource;
  const names=new Set(inventory.map(item=>item.alias ?? item.name)),base=(item.alias ?? item.name).slice(0,140);let index=1;
  do{copied.alias=`${base} · 副本${index++}`;}while(names.has(copied.alias));
  if(copied.real){copied.real.id=copied.id;delete copied.real.source;for(const sub of copied.real.substats)delete sub.rolls;}persistArtifactRolls(copied);return copied;
}
export function detachArtifact(item:AccountArtifact):AccountArtifact{
  const snapshot=JSON.parse(JSON.stringify(item)) as AccountArtifact;snapshot.id=`snapshot:${crypto.randomUUID()}`;snapshot.inventoryId=null;delete snapshot.mona;if(snapshot.real){snapshot.real.id=snapshot.id;delete snapshot.real.source;}return snapshot;
}
export function detachAccountArtifact(account:LocalAccount,itemId:string):LocalAccount{
  const next=cloneAccount(account),item=next.artifacts.find(item=>item.id===itemId);if(!item)return next;
  const snapshot=detachArtifact(item);next.artifacts=next.artifacts.map(item=>item.id===itemId?snapshot:item);
  for(const character of next.characters)for(const slot of Object.keys(character.equipment) as (keyof typeof character.equipment)[])if(character.equipment[slot]===itemId)character.equipment[slot]=snapshot.id;
  return next;
}
export function removeInventoryArtifact(account:LocalAccount,itemId:string):LocalAccount{
  if(!account.artifacts.some(item=>item.id===itemId))throw new Error('圣遗物已不存在。');
  const worn=account.characters.some(character=>Object.values(character.equipment).includes(itemId));
  if(worn)return detachAccountArtifact(account,itemId);
  const next=cloneAccount(account);next.artifacts=next.artifacts.filter(item=>item.id!==itemId);return next;
}
