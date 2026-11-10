import {artifactValueSignature} from './showcase-inventory';
import { cloneAccount, parseAccount, equipArtifact, artifactOwner, accountSlots, type AccountCharacter, type LocalAccount } from './account';
import { configurationSignature } from './character-loadout-name';

export interface AccountConfiguration { id:string; character:AccountCharacter; source:LocalAccount; presetId:string }
interface SavedConfiguration { id:string; accountId:string; characterId:string; snapshot:LocalAccount }

export function localConfigurationComplete(account:LocalAccount,character:AccountCharacter):boolean {
  return !!character.build && accountSlots.every(slot=>{
    const item=account.artifacts.find(item=>item.id===character.equipment[slot]);
    return item?.slot===slot && !!item.real && !item.mona?.setIdentityPending;
  });
}

/** References existing local objects only; public showcase equipment is never inferred as inventory. */
export function accountConfigurations(account:LocalAccount,saved:readonly SavedConfiguration[]):AccountConfiguration[] {
  return account.characters.flatMap(character=>[
    {id:`current-${character.id}`,character,source:account,presetId:''},
    ...saved.filter(item=>item.accountId===account.id && item.characterId===character.id)
      .filter(item=>configurationSignature(item.snapshot.characters[0])!==configurationSignature(character))
      .map(item=>({id:item.id,character:item.snapshot.characters[0],source:item.snapshot,presetId:item.id})),
  ]);
}

export function artifactCombinations(configurations:readonly AccountConfiguration[]) {
  const groups=new Map<string,{id:string;configurations:AccountConfiguration[]}>();
  for(const configuration of configurations) {
    const ids=accountSlots.map(slot=>configuration.character.equipment[slot] ?? '');
    if(!ids.some(Boolean))continue;
    const id=JSON.stringify(ids);
    const group=groups.get(id) ?? {id,configurations:[]};
    group.configurations.push(configuration);groups.set(id,group);
  }
  return [...groups.values()];
}


/** Validate snapshot identity against current physical inventory before adopting it. */
export function preparePreferredConfiguration(account:LocalAccount,configuration:AccountConfiguration) {
  if(!configuration.presetId || configuration.source.id!==account.id)throw new Error('请选择当前账号的备选配置。');
  const current=account.characters.find(item=>item.id===configuration.character.id);
  if(!current)throw new Error('角色已不存在，请重新打开。');
  for(const item of configuration.source.artifacts) {
    const physical=account.artifacts.find(candidate=>candidate.id===item.id);
    if(!physical || artifactValueSignature(physical)!==artifactValueSignature(item))throw new Error('方案实物已缺失或词条已变化，请核对库存。');
  }
  const next=cloneAccount(account),snapshot=JSON.parse(JSON.stringify(configuration.character)) as AccountCharacter;
  const equipment={...snapshot.equipment};snapshot.equipment={};snapshot.showcase=current.showcase;
  next.characters[next.characters.findIndex(item=>item.id===snapshot.id)]=snapshot;
  const transfers:string[]=[];
  for(const id of Object.values(equipment))if(id) {
    const owner=artifactOwner(next,id),item=next.artifacts.find(item=>item.id===id);
    if(owner && owner.id!==snapshot.id)transfers.push(`从「${owner.name}」转移「${item?.name ?? '圣遗物'}」`);
    equipArtifact(next,snapshot.id,id,true);
  }
  return {next:parseAccount(next),transfers,current};
}


export function hasLocalConfiguration(character:AccountCharacter):boolean {
  return !!character.build || Object.values(character.equipment).some(Boolean) || character.attack>0 || !!character.weapon.trim();
}
export function hasCharacterInformation(character:AccountCharacter):boolean { return hasLocalConfiguration(character) || !!character.showcase; }

/** A cleared configuration is removed; the first usable saved alternative replaces the preferred one. */
export function planClearedConfiguration(before:LocalAccount,draft:LocalAccount,saved:readonly SavedConfiguration[],characterId:string,presetId='') {
  const edited=draft.characters.find(item=>item.id===characterId),original=before.characters.find(item=>item.id===characterId);
  if(!edited || !original)throw new Error('角色已变化，请重新打开。');
  const belongs=saved.filter(item=>item.accountId===before.id && item.characterId===characterId);
  const removedIds=belongs.filter(item=>presetId?item.id===presetId:configurationSignature(item.snapshot.characters[0])===configurationSignature(original)).map(item=>item.id);
  const base=cloneAccount(presetId?before:draft);
  const current=base.characters.find(item=>item.id===characterId)!;
  if(hasLocalConfiguration(current))return {next:parseAccount(base),removedIds,promotedId:'',transfers:[] as string[],removedCharacter:false};
  const candidates=belongs.filter(item=>!removedIds.includes(item.id) && hasLocalConfiguration(item.snapshot.characters[0]));
  let reason:unknown;
  for(const candidate of candidates) {
    try {
      const prepared=preparePreferredConfiguration(base,{id:candidate.id,presetId:candidate.id,character:candidate.snapshot.characters[0],source:candidate.snapshot});
      return {next:prepared.next,removedIds:[...removedIds,candidate.id],promotedId:candidate.id,transfers:prepared.transfers,removedCharacter:false};
    }catch(cause){reason=cause;}
  }
  if(candidates.length)throw reason instanceof Error?reason:new Error('备选配置不可采用，请核对实物。');
  const removedCharacter=!hasCharacterInformation(current);
  if(removedCharacter)base.characters=base.characters.filter(item=>item.id!==characterId);
  return {next:parseAccount(base),removedIds:removedCharacter?belongs.map(item=>item.id):removedIds,promotedId:'',transfers:[] as string[],removedCharacter};
}

/** Removing a preset never changes equipped items; removing the preferred config may promote an alternative. */
export function planConfigurationRemoval(account:LocalAccount,saved:readonly SavedConfiguration[],characterId:string,presetId='') {
  if(presetId){
    if(!saved.some(item=>item.id===presetId && item.accountId===account.id && item.characterId===characterId))throw new Error('配置已不存在，请重新打开。');
    return {next:account,removedIds:[presetId],promotedId:'',transfers:[] as string[],removedCharacter:false,accountChanged:false};
  }
  const draft=cloneAccount(account),character=draft.characters.find(item=>item.id===characterId);
  if(!character || !hasLocalConfiguration(character))throw new Error('本地配置已不存在，请重新打开。');
  delete character.build;character.attack=0;character.weapon='';character.equipment={};
  return {...planClearedConfiguration(account,draft,saved,characterId),accountChanged:true};
}
