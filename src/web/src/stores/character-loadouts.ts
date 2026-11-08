import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { RealStat } from '@leyline/schema';
import { effectiveStatOptions, defaultEffectiveStats, effectiveStatGroups } from '../domain/character-loadout-name';
import { parseAccount, type AccountCharacter, type LocalAccount } from '../domain/account';

export interface CharacterLoadout { id: string; name: string; accountId: string; characterId: string; snapshot: LocalAccount }
const key = 'leyline-character-loadouts-v1';
export const useCharacterLoadoutsStore = defineStore('character-loadouts', () => {
  const loadouts = ref<CharacterLoadout[]>([]);
  const error = ref('');
  const favorites=ref<Record<string,number>>({});
  try {
    const raw=JSON.parse(localStorage.getItem('leyline-character-favorites-v1') ?? '{}');
    if(raw && typeof raw==='object' && !Array.isArray(raw))for(const [id,level] of Object.entries(raw)) {
      if(typeof level==='number' && Number.isInteger(level) && level>=1 && level<=3)favorites.value[id]=level;
    }
  }catch { /* Invalid preferences never replace account data. */ }
  function favoriteLevel(accountId:string,characterId:string) { return favorites.value[`${accountId}/${characterId}`] ?? 0; }
  function setFavorite(accountId:string,characterId:string,level:number) {
    if(!Number.isInteger(level) || level<0 || level>3)throw new Error('收藏等级无效。');
    const next={...favorites.value};
    if(level)next[`${accountId}/${characterId}`]=level;else delete next[`${accountId}/${characterId}`];
    localStorage.setItem('leyline-character-favorites-v1',JSON.stringify(next));favorites.value=next;
  }

  const effective = ref<Record<string,RealStat[]>>({});
  try {
    const raw=JSON.parse(localStorage.getItem('leyline-effective-stats-v1') ?? '{}');
    if(raw && typeof raw==='object' && !Array.isArray(raw)) for(const [id,stats] of Object.entries(raw)) {
      if(Array.isArray(stats) && stats.every(stat=>effectiveStatOptions.includes(stat))) effective.value[id]=[...new Set(stats)] as RealStat[];
    }
  } catch { /* Invalid display preferences do not replace account data. */ }
  function effectiveStats(accountId:string,characterId:string,name='') {
    const selected=effective.value[`${accountId}/${characterId}`];
    return selected ? effectiveStatGroups.filter(group=>group.members.some(stat=>selected.includes(stat))).flatMap(group=>group.members) : defaultEffectiveStats(name);
  }
  function setEffectiveStats(accountId:string,characterId:string,stats:RealStat[]) {
    const next={...effective.value,[`${accountId}/${characterId}`]:[...new Set(stats.filter(stat=>effectiveStatOptions.includes(stat)))]};
    localStorage.setItem('leyline-effective-stats-v1',JSON.stringify(next)); effective.value=next;
  }
  function persist(next:CharacterLoadout[]) {
    const content=JSON.stringify(next);
    if(new TextEncoder().encode(content).byteLength>8*1024*1024)throw new Error('配装方案超过本地保存大小上限。');
    localStorage.setItem(key,content);loadouts.value=next;
  }
  function removeMany(ids:readonly string[],commit:()=>void) {
    if(error.value)throw new Error(error.value);
    const next=loadouts.value.filter(item=>!ids.includes(item.id));
    if(next.length===loadouts.value.length){commit();return;}
    const previous=JSON.stringify(loadouts.value);
    localStorage.setItem(key,JSON.stringify(next));
    try { commit(); }
    catch(cause) {
      try{localStorage.setItem(key,previous);}catch{error.value='配置保存回退失败，请保留账号备份并检查本地存储。';}
      throw cause;
    }
    loadouts.value=next;
  }
  function removeCharacter(accountId:string,characterId:string,commit:()=>void) {
    if(error.value)throw new Error(error.value);
    const preferenceId=`${accountId}/${characterId}`;
    const next=loadouts.value.filter(item=>item.accountId!==accountId || item.characterId!==characterId);
    const nextFavorites={...favorites.value},nextEffective={...effective.value};
    delete nextFavorites[preferenceId];delete nextEffective[preferenceId];
    const writes:[[string,unknown],[string,unknown],[string,unknown]]=[[key,next],['leyline-character-favorites-v1',nextFavorites],['leyline-effective-stats-v1',nextEffective]];
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
      const input = JSON.parse(raw);
      if (!Array.isArray(input) || input.length > 50) throw new Error();
      const ids = new Set<string>();
      loadouts.value = input.map(entry => {
        if (!entry || typeof entry.id !== 'string' || ids.has(entry.id) || typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 160) throw new Error();
        ids.add(entry.id);
        const snapshot = parseAccount(entry.snapshot);
        if (snapshot.characters.length !== 1 || snapshot.id !== entry.accountId || snapshot.characters[0].id !== entry.characterId) throw new Error();
        return { id:entry.id, name:entry.name, accountId:entry.accountId, characterId:entry.characterId, snapshot };
      });
    }
  } catch { error.value = '角色配装方案无法读取，原始资料未覆盖。'; }
  function save(name: string, account: LocalAccount, character: AccountCharacter) {
    if (error.value) throw new Error(error.value);
    if (!name.trim() || name.length > 160) throw new Error('请输入不超过 160 字的方案名称。');
    if (loadouts.value.length >= 50) throw new Error('角色配装方案已达 50 份上限。');
    const selected = new Set(Object.values(character.equipment));
    const snapshot = parseAccount({ ...account, characters:[character], artifacts:account.artifacts.filter(item => selected.has(item.id)) });
    const entry = { id:crypto.randomUUID(), name:name.trim(), accountId:account.id, characterId:character.id, snapshot };
    const next = [...loadouts.value, entry];
    const content = JSON.stringify(next);
    if (new TextEncoder().encode(content).byteLength > 8 * 1024 * 1024) throw new Error('配装方案超过本地保存大小上限。');
    localStorage.setItem(key, content);
    loadouts.value = next;
    return entry.id;
  }
  return { loadouts, error, favoriteLevel, setFavorite, save, update, removeMany, removeCharacter, effectiveStats, setEffectiveStats };
});
