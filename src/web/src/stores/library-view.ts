import { reactive } from 'vue';
import { defineStore } from 'pinia';

// Session navigation only. Never exported as account or inventory data.
export const useLibraryViewStore = defineStore('library-view', () => {
  const accounts = reactive<Record<string, {
    characterId:string; query:string; page:number;
    expandedConfigurations:string[]; expandedCombinations:string[];
    scroll:Record<string,number>;
  }>>({});
  function forAccount(id:string) {
    return accounts[id] ??= { characterId:'', query:'', page:1, expandedConfigurations:[], expandedCombinations:[], scroll:{} };
  }
  return { forAccount };
});
