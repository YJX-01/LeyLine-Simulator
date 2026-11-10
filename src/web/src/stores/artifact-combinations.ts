import {readRollBasis,type EffectiveRollBasis} from '../domain/effective-roll-basis';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { StatKey } from '@leyline/schema';
import { parseAccount, type AccountArtifact, type LocalAccount } from '../domain/account';
import { combinationSignature, normalizeEffectiveStats, type ArtifactCombination } from '../domain/artifact-combinations';
import { effectiveStatOptions } from '../domain/character-loadout-name';
const key='leyline-artifact-combinations-v1';
export const useArtifactCombinationsStore=defineStore('artifact-combinations',()=>{
  const combinations=ref<ArtifactCombination[]>([]),error=ref('');
  try {
    const raw=JSON.parse(localStorage.getItem(key) ?? '[]');
    if(!Array.isArray(raw) || raw.length>200)throw new Error();
    const ids=new Set<string>();
    combinations.value=raw.map(entry=>{
      if(!entry || typeof entry.id!=='string' || !entry.id || entry.id.length>200 || ids.has(entry.id) || typeof entry.accountId!=='string' || typeof entry.referenceName!=='string' || entry.referenceName.length>200 || !Array.isArray(entry.items) || !entry.items.length || entry.items.length>5 || !Array.isArray(entry.stats) || !entry.stats.length || !entry.stats.every((stat:StatKey)=>effectiveStatOptions.includes(stat)))throw new Error();
      if(entry.nameMode!==undefined && !['auto','custom'].includes(entry.nameMode))throw new Error();
      if(entry.favorite!==undefined && (!Number.isInteger(entry.favorite) || entry.favorite<0 || entry.favorite>3))throw new Error();
      if(entry.name!==undefined && (typeof entry.name!=='string' || !entry.name.trim() || entry.name.length>160))throw new Error();
      ids.add(entry.id);
      const account=parseAccount({schemaVersion:2,kind:'account',id:entry.accountId,name:'组合',characters:[],artifacts:entry.items});
      if(new Set(account.artifacts.map(item=>item.slot)).size!==account.artifacts.length)throw new Error();
      return {id:entry.id,accountId:entry.accountId,items:account.artifacts,stats:normalizeEffectiveStats(entry.stats),referenceName:entry.referenceName,...(entry.nameMode===undefined?{}:{nameMode:entry.nameMode}),basis:readRollBasis(entry.basis),...(entry.name===undefined?{}:{name:entry.name}),...(entry.favorite===undefined?{}:{favorite:entry.favorite})};
    });
  }catch {error.value='组合资料无法读取，原始记录未覆盖。';}
  function persist(next:ArtifactCombination[]) {
    if(error.value)throw new Error(error.value);
    const text=JSON.stringify(next);
    if(new TextEncoder().encode(text).byteLength>8*1024*1024)throw new Error('组合资料超过本地保存上限，请先导出备份并整理。');
    localStorage.setItem(key,text);combinations.value=next;
  }
  function save(account:LocalAccount,items:AccountArtifact[],stats:StatKey[],referenceName='',id='',commit?:()=>void,name?:string,basis?:EffectiveRollBasis,copy=false) {
    if(copy)id='';
    if(name!==undefined && (!name.trim() || name.length>160))throw new Error('请输入1至160字的组合名称，或使用自动命名。');
    if(!items.length)throw new Error('请至少选择一件圣遗物。');
    if(!normalizeEffectiveStats(stats).length)throw new Error('请选择组合的有效属性。');
    const snapshot=parseAccount({...account,characters:[],artifacts:items});
    if(items.length>5 || new Set(items.map(item=>item.slot)).size!==items.length)throw new Error('每个部位只能选择一件圣遗物。');
    if(id && !combinations.value.some(entry=>entry.id===id && entry.accountId===account.id))throw new Error('组合已不存在，请重新打开。');
    const referenceBasis=readRollBasis(basis);
    const normalized=normalizeEffectiveStats(stats),signature=combinationSignature(items,normalized,referenceBasis,referenceName);
    const duplicate=!id && !copy && combinations.value.find(entry=>entry.accountId===account.id && entry.id!==id && combinationSignature(entry.items,entry.stats,entry.basis,entry.referenceName)===signature);
    if(duplicate){commit?.();return {id:duplicate.id,duplicate:true};}
    if(!id && combinations.value.length>=200)throw new Error('组合已达200份，请先导出备份并整理。');
    const favorite=id?combinations.value.find(entry=>entry.id===id && entry.accountId===account.id)?.favorite:undefined;
    const entry={id:id || crypto.randomUUID(),accountId:account.id,items:snapshot.artifacts,stats:normalized,referenceName,nameMode:name===undefined?'auto' as const:'custom' as const,basis:referenceBasis,...(name===undefined?{}:{name:name.trim()}),...(favorite===undefined?{}:{favorite})};
    const before=combinations.value;
    persist(id?before.map(item=>item.id===id?entry:item):[...before,entry]);
    try{commit?.();}catch(cause){try{persist(before);}catch{error.value='组合保存回退失败，请保留当前资料并检查本地存储。';}throw cause;}
    return {id:entry.id,duplicate:false};
  }
  function remove(accountId:string,id:string) {persist(combinations.value.filter(item=>item.accountId!==accountId || item.id!==id));}
  function setFavorite(accountId:string,id:string,value:number) {
    if(!Number.isInteger(value) || value<0 || value>3)throw new Error('收藏等级无效。');
    if(!combinations.value.some(item=>item.id===id && item.accountId===accountId))throw new Error('组合已不存在，请重新打开。');
    persist(combinations.value.map(item=>item.id===id && item.accountId===accountId?{...item,favorite:value}:item));
  }
  function replaceAll(next:ArtifactCombination[],commit:()=>void){const before=combinations.value;persist(next);try{commit();}catch(cause){persist(before);throw cause;}}
  return {combinations,error,save,remove,replaceAll,setFavorite};
});
