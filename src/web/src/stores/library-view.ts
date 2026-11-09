import { reactive } from 'vue';
import { defineStore } from 'pinia';

// Session navigation only. Never exported as account or inventory data.
export const useLibraryViewStore = defineStore('library-view', () => {
  const accounts = reactive<Record<string, {
    characterId:string; query:string; page:number;
    configurationQuery:string; configurationPage:number; configurationFilter:string; configurationSort:string; configurationDirection:'asc'|'desc';
    expandedConfigurations:string[]; expandedCombinations:string[];
    scroll:Record<string,number>;
  }>>({});
  function forAccount(id:string) {
    return accounts[id] ??= { characterId:'', query:'', page:1, configurationQuery:'', configurationPage:1, configurationFilter:'all', configurationSort:'rolls', configurationDirection:'desc', expandedConfigurations:[], expandedCombinations:[], scroll:{} };
  }
  return { forAccount };
});
