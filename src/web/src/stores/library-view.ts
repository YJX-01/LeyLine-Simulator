import { reactive } from 'vue';
import { defineStore } from 'pinia';

export const configurationSortDefaults = { key: 'rolls', direction: 'desc' } as const;
export const teamSortDefaults = { key: 'saved', direction: 'asc' } as const;

// Session navigation only. Never exported as account or inventory data.
export const useLibraryViewStore = defineStore('library-view', () => {
  const accounts = reactive<Record<string, {
    characterId:string; query:string; page:number;
    configurationQuery:string; configurationPage:number; configurationFilter:string; configurationSort:string; configurationDirection:'asc'|'desc';
    configurationDensity:'relaxed'|'compact';
    teamQuery:string; teamPage:number; teamMember:string; teamMemberCount:number; teamSort:string; teamDirection:'asc'|'desc';
    expandedConfigurations:string[]; expandedCombinations:string[];
    scroll:Record<string,number>;
  }>>({});
  function forAccount(id:string) {
    return accounts[id] ??= {
      characterId:'', query:'', page:1,
      configurationQuery:'', configurationPage:1, configurationFilter:'all',
      configurationSort:configurationSortDefaults.key, configurationDirection:configurationSortDefaults.direction, configurationDensity:'relaxed',
      teamQuery:'', teamPage:1, teamMember:'', teamMemberCount:0, teamSort:teamSortDefaults.key, teamDirection:teamSortDefaults.direction,
      expandedConfigurations:[], expandedCombinations:[], scroll:{},
    };
  }
  return { forAccount };
});
