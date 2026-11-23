import { reactive } from 'vue';
import { defineStore } from 'pinia';

export const configurationSortDefaults = { key: 'rolls', direction: 'desc' } as const;
export const teamSortDefaults = { key: 'saved', direction: 'asc' } as const;

// Session navigation only. Never exported as account or inventory data.
export const useLibraryViewStore = defineStore('library-view', () => {
  const accounts = reactive<Record<string, {
    characterId:string; characterOffset:number; query:string; combinationOffset:number;
    configurationQuery:string; configurationOffset:number; configurationFilter:string; configurationSort:string; configurationDirection:'asc'|'desc';
    configurationDensity:'relaxed'|'compact'; configurationFavorites:string[];
    teamQuery:string; teamOffset:number; teamMember:string; teamFavorites:string[]; teamSort:string; teamDirection:'asc'|'desc';
    expandedConfigurations:string[]; expandedCombinations:string[];
    scroll:Record<string,number>;
  }>>({});
  function forAccount(id:string) {
    accounts[id] ??= {
      characterId:'', characterOffset:0, query:'', combinationOffset:0,
      configurationQuery:'', configurationOffset:0, configurationFilter:'all', configurationFavorites:[],
      configurationSort:configurationSortDefaults.key, configurationDirection:configurationSortDefaults.direction, configurationDensity:'compact',
      teamQuery:'', teamOffset:0, teamMember:'', teamFavorites:[], teamSort:teamSortDefaults.key, teamDirection:teamSortDefaults.direction,
      expandedConfigurations:[], expandedCombinations:[], scroll:{},
    };
    return accounts[id];
  }
  return { forAccount };
});
