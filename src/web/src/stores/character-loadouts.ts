import { storageKeyFor } from '@leyline/schema/version';
import { packDocument, unpackDocument } from '../domain/content-document';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { StatKey } from '@leyline/schema';
import { configurationSignature, effectiveStatOptions, defaultEffectiveStats, effectiveStatGroups } from '../domain/character-loadout-name';
import { parseAccount, type AccountCharacter, type LocalAccount } from '../domain/account';

export interface CharacterLoadout { id: string; name: string; accountId: string; characterId: string; snapshot: LocalAccount }
const key = storageKeyFor('character-loadouts');
const favoriteKey = storageKeyFor('character-favorites');
const configurationKey = (accountId: string, characterId: string, presetId: string) => JSON.stringify([accountId, characterId, presetId]);

function writePreferences(storageKey: string, next: Record<string, number | StatKey[]>, commit?: () => void) {
  const previous = localStorage.getItem(storageKey);
  localStorage.setItem(storageKey, JSON.stringify(next));
  try { commit?.(); }
  catch (cause) {
    if (previous === null) localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, previous);
    throw cause;
  }
}
export const useCharacterLoadoutsStore = defineStore('character-loadouts', () => {
  const loadouts = ref<CharacterLoadout[]>([]);
  const error = ref('');
  const favorites=ref<Record<string,number>>({});
  try {
    const raw=JSON.parse(localStorage.getItem(favoriteKey) ?? '{}');
    if(raw && typeof raw==='object' && !Array.isArray(raw))for(const [id,level] of Object.entries(raw)) {
      if(typeof level==='number' && Number.isInteger(level) && level>=0 && level<=3)favorites.value[id]=level;
    }
  }catch { /* Invalid preferences never replace account data. */ }
  function favoriteLevel(accountId: string, characterId: string, presetId?: string) {
    const characterLevel = favorites.value[`${accountId}/${characterId}`] ?? 0;
    if (presetId === undefined) return characterLevel;
    return favorites.value[configurationKey(accountId, characterId, presetId)] ?? (presetId ? 0 : characterLevel);
  }
  function writeFavorites(next: Record<string, number>, commit?: () => void) {
    writePreferences(favoriteKey, next, commit);
    favorites.value = next;
  }
  function setFavorite(accountId:string,characterId:string,level:number,presetId?:string) {
    if(!Number.isInteger(level) || level<0 || level>3)throw new Error('收藏等级无效。');
    const next={...favorites.value};
    const preferred = configurationKey(accountId, characterId, '');
    // Earlier detail views shared the role mark. Keep its last value on the preferred configuration.
    if (presetId === undefined) next[preferred] ??= favoriteLevel(accountId, characterId);
    const id = presetId === undefined ? `${accountId}/${characterId}` : configurationKey(accountId, characterId, presetId);
    if (level || presetId === '') next[id] = level;
    else delete next[id];
    writeFavorites(next);
  }

  const effective = ref<Record<string,StatKey[]>>({});
  try {
    const raw=JSON.parse(localStorage.getItem(storageKeyFor('effective-stats')) ?? '{}');
    if(raw && typeof raw==='object' && !Array.isArray(raw)) for(const [id,stats] of Object.entries(raw)) {
      if(Array.isArray(stats) && stats.every(stat=>effectiveStatOptions.includes(stat))) effective.value[id]=[...new Set(stats)] as StatKey[];
    }
  } catch { /* Invalid display preferences do not replace account data. */ }
  function effectiveStats(accountId:string,characterId:string,name='') {
    const selected=effective.value[`${accountId}/${characterId}`];
    return selected ? effectiveStatGroups.filter(group=>group.members.some(stat=>selected.includes(stat))).flatMap(group=>group.members) : defaultEffectiveStats(name);
  }
  function setEffectiveStats(accountId:string,characterId:string,stats:StatKey[],commit?:()=>void) {
    const next={...effective.value,[`${accountId}/${characterId}`]:[...new Set(stats.filter(stat=>effectiveStatOptions.includes(stat)))]};
    writePreferences(storageKeyFor('effective-stats'), next, commit);
    effective.value=next;
  }
  function persist(next:CharacterLoadout[]) {
    const content=JSON.stringify(packDocument('character-loadouts', next));
    if(new TextEncoder().encode(content).byteLength>8*1024*1024)throw new Error('配装方案超过本地保存大小上限。');
    localStorage.setItem(key,content);loadouts.value=next;
  }
  function replaceAll(next:CharacterLoadout[],commit:()=>void) {
    if(error.value)throw new Error(error.value);
    const before=loadouts.value;persist(next);
    try{commit();}catch(cause){persist(before);throw cause;}
  }
  function removeConfigurations(accountId: string, characterId: string, presetId: string,
    plan: { removedIds: readonly string[]; promotedId: string; removedCharacter: boolean }, commit: () => void) {
    if (plan.removedCharacter) return removeCharacter(accountId, characterId, commit);
    if (error.value) throw new Error(error.value);
    const next = loadouts.value.filter(item => !plan.removedIds.includes(item.id));
    const marks = { ...favorites.value };
    for (const id of plan.removedIds) delete marks[configurationKey(accountId, characterId, id)];
    if (!presetId) {
      const preferred = configurationKey(accountId, characterId, '');
      marks[preferred] = plan.promotedId ? favoriteLevel(accountId, characterId, plan.promotedId) : 0;
    }
    writeFavorites(marks, () => next.length === loadouts.value.length ? commit() : replaceAll(next, commit));
  }
  function removeCharacter(accountId:string,characterId:string,commit:()=>void) {
    if(error.value)throw new Error(error.value);
    const preferenceId=`${accountId}/${characterId}`;
    const next=loadouts.value.filter(item=>item.accountId!==accountId || item.characterId!==characterId);
    const nextFavorites={...favorites.value},nextEffective={...effective.value};
    for (const id of ['', ...loadouts.value.filter(item=>item.accountId===accountId && item.characterId===characterId).map(item=>item.id)]) {
      delete nextFavorites[configurationKey(accountId, characterId, id)];
    }
    delete nextFavorites[preferenceId];delete nextEffective[preferenceId];
    const writes:[[string,unknown],[string,unknown],[string,unknown]]=[[key,packDocument('character-loadouts', next)],[storageKeyFor('character-favorites'),nextFavorites],[storageKeyFor('effective-stats'),nextEffective]];
    const previous=writes.map(([storageKey])=>[storageKey,localStorage.getItem(storageKey)] as const);
    try{
      for(const [storageKey,value] of writes)localStorage.setItem(storageKey,JSON.stringify(value));
      commit();
    }catch(cause){
      try{for(const [storageKey,value] of previous)if(value===null)localStorage.removeItem(storageKey);else localStorage.setItem(storageKey,value);}
      catch{error.value='角色删除回退失败，请保留当前资料并检查本地存储。';}
      throw cause;
    }
    loadouts.value=next;favorites.value=nextFavorites;effective.value=nextEffective;
  }
  function update(id:string,name:string,account:LocalAccount,character:AccountCharacter) {
    if(!name.trim() || name.length>160)throw new Error('请输入不超过 160 字的方案名称。');
    if(error.value)throw new Error(error.value);
    const existing=loadouts.value.find(item=>item.id===id);
    if(!existing || existing.accountId!==account.id || existing.characterId!==character.id)throw new Error('方案不属于当前账号角色。');
    const ids=new Set(Object.values(character.equipment));
    const snapshot=parseAccount({...account,characters:[character],artifacts:account.artifacts.filter(item=>ids.has(item.id))});
    persist(loadouts.value.map(item=>item.id===id?{...item,name,snapshot}:item));
  }
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const input = unpackDocument('character-loadouts', JSON.parse(raw));
      if (!Array.isArray(input) || input.length > 50) throw new Error();
      const ids = new Set<string>();
      const next:CharacterLoadout[] = input.map(entry => {
        if (!entry || typeof entry.id !== 'string' || ids.has(entry.id) || typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 160) throw new Error();
        ids.add(entry.id);
        const snapshot = parseAccount(entry.snapshot);
        if (snapshot.characters.length !== 1 || snapshot.id !== entry.accountId || snapshot.characters[0].id !== entry.characterId) throw new Error();
        return { id:entry.id, name:entry.name, accountId:entry.accountId, characterId:entry.characterId, snapshot };
      });
      loadouts.value = next;
    }
  } catch { error.value = '角色配装方案无法读取，原始资料未覆盖。'; }
  function newLoadout(name: string, account: LocalAccount, character: AccountCharacter) {
    if (error.value) throw new Error(error.value);
    if (!name.trim() || name.length > 160) throw new Error('请输入不超过 160 字的方案名称。');
    if (loadouts.value.length >= 50) throw new Error('角色配装方案已达 50 份上限。');
    const selected = new Set(Object.values(character.equipment));
    const snapshot = parseAccount({ ...account, characters:[character], artifacts:account.artifacts.filter(item => selected.has(item.id)) });
    return { id:crypto.randomUUID(), name:name.trim(), accountId:account.id, characterId:character.id, snapshot };
  }
  function save(name: string, account: LocalAccount, character: AccountCharacter) {
    const entry = newLoadout(name, account, character);
    persist([...loadouts.value, entry]);
    return entry.id;
  }
  function adoptPreferred(account: LocalAccount, current: AccountCharacter, name: string, selectedId: string, commit: () => void) {
    if (error.value) throw new Error(error.value);
    const previous = loadouts.value.find(item => item.accountId === account.id && item.characterId === current.id
      && configurationSignature(item.snapshot.characters[0]) === configurationSignature(current));
    const alternate = previous ?? newLoadout(name, account, current);
    const marks = { ...favorites.value };
    marks[configurationKey(account.id, current.id, alternate.id)] = favoriteLevel(account.id, current.id, '');
    marks[configurationKey(account.id, current.id, '')] = favoriteLevel(account.id, current.id, selectedId);
    writeFavorites(marks, () => previous ? commit() : replaceAll([...loadouts.value, alternate], commit));
  }
  return { loadouts, error, favoriteLevel, setFavorite, save, update, adoptPreferred, removeConfigurations, removeCharacter, replaceAll, effectiveStats, setEffectiveStats };
});
