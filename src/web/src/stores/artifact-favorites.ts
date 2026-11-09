import {defineStore} from 'pinia';
import {ref} from 'vue';
const key='leyline-artifact-favorites-v1';
export const useArtifactFavoritesStore=defineStore('artifact-favorites',()=>{
  const levels=ref<Record<string,number>>({});
  try{const raw=JSON.parse(localStorage.getItem(key) ?? '{}');if(raw && typeof raw==='object' && !Array.isArray(raw))for(const [id,value] of Object.entries(raw))if(Number.isInteger(value) && Number(value)>=1 && Number(value)<=3)levels.value[id]=Number(value);}catch{ /* Preferences never replace inventory data. */ }
  function level(accountId:string,itemId:string){return levels.value[`${accountId}/${itemId}`] ?? 0;}
  function set(accountId:string,itemId:string,value:number){if(!Number.isInteger(value) || value<0 || value>3)throw new Error('收藏等级无效。');const next={...levels.value},id=`${accountId}/${itemId}`;if(value)next[id]=value;else delete next[id];localStorage.setItem(key,JSON.stringify(next));levels.value=next;}
  function remove(accountId:string,itemId:string,commit:()=>void){const before=levels.value;set(accountId,itemId,0);try{commit();}catch(cause){localStorage.setItem(key,JSON.stringify(before));levels.value=before;throw cause;}}
  return {levels,level,set,remove};
});
