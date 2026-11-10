import { existsSync, readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { createPinia, disposePinia, setActivePinia } from 'pinia';
import { createAccount, parseAccount } from '../../src/web/src/domain/account';
import { previewEnkaImport } from '../../src/web/src/domain/enka-import';
import { createEmptyProject, importProject } from '../../src/web/src/domain/workbench-project';
import { addActorFromBuild } from '../../src/web/src/domain/real-project';
import { parseCharacterDefinition } from '../../src/web/src/domain/character-definition';
import { parseDefinitionLibrary } from '../../src/web/src/domain/definition-library';
import { useAccountStore } from '../../src/web/src/stores/account';
import { useCharacterLoadoutsStore } from '../../src/web/src/stores/character-loadouts';
import { useSavedTeamsStore } from '../../src/web/src/stores/saved-teams';
import { useDefinitionLibraryStore } from '../../src/web/src/stores/definition-library';
import { useAxisWorkspaceStore } from '../../src/web/src/stores/axis-workspace';

afterEach(() => vi.unstubAllGlobals());

async function recordedDocuments() {
  const account=createAccount();
  const response=JSON.parse(readFileSync('.references/enka/official-example.json','utf8'));
  const preview=await previewEnkaImport(response,'618285856',account);
  account.characters=preview.rows.map(row=>row.character);
  const build=account.characters[0].showcase!.build;
  const project=createEmptyProject();
  addActorFromBuild(project,build);
  const library={schemaVersion:2,kind:'definition-library',id:project.id,name:'公开展柜定义快照',definitions:project.definitions};
  return {account,build,project,library};
}

it.skipIf(!existsSync('.references/enka/official-example.json'))('accepts current documents and rejects old version tags without converting recorded snapshots', async () => {
  const {account,build,project,library}=await recordedDocuments();
  const before=JSON.stringify({account,build,project,library});
  expect(parseAccount(account)).toEqual(account);
  expect(importProject(JSON.stringify(project))).toEqual(project);
  expect(parseCharacterDefinition(JSON.stringify(build.character))).toEqual(build.character);
  expect(parseDefinitionLibrary(library)).toEqual(library);
  // Version-tag derivatives test a file boundary, not original player exports or combat records.
  expect(()=>parseAccount({...account,schemaVersion:1})).toThrow();
  expect(()=>importProject(JSON.stringify({...project,schemaVersion:1}))).toThrow();
  expect(()=>parseCharacterDefinition(JSON.stringify({...build.character,schemaVersion:1}))).toThrow();
  expect(()=>parseDefinitionLibrary({...library,schemaVersion:1})).toThrow();
  expect(JSON.stringify({account,build,project,library})).toBe(before);
});

it.skipIf(!existsSync('.references/enka/official-example.json'))('ignores retired storage namespaces and leaves their original bytes untouched', async () => {
  const {account,project,library}=await recordedDocuments();
  const old=new Map([
    ['leyline-account-v1',JSON.stringify({...account,schemaVersion:1})],
    ['leyline-character-loadouts-v1','[]'],['leyline-saved-teams-v1','[]'],
    ['leyline-definition-library-v1',JSON.stringify({...library,schemaVersion:1})],
    ['leyline-axis-recovery-v1',JSON.stringify({schemaVersion:1,project})],
  ]);
  const memory=new Map(old),reads:string[]=[];
  vi.stubGlobal('localStorage',{getItem:(key:string)=>{reads.push(key);return memory.get(key)??null;},setItem:(key:string,value:string)=>memory.set(key,value)});
  const pinia=createPinia();setActivePinia(pinia);
  try {
    expect(useAccountStore().account.characters).toEqual([]);
    expect(useCharacterLoadoutsStore().loadouts).toEqual([]);
    expect(useSavedTeamsStore().teams).toEqual([]);
    expect(useDefinitionLibraryStore().library.definitions).toEqual([]);
    expect(useAxisWorkspaceStore().recoveryAvailable).toBe(false);
    for(const [key,value] of old){expect(reads).not.toContain(key);expect(memory.get(key)).toBe(value);}
  } finally {disposePinia(pinia);}
});

it.skipIf(!existsSync('.references/enka/official-example.json'))('restores current account, configuration, team, library and recovery snapshots directly', async () => {
  const {account,project,library}=await recordedDocuments(),character=account.characters[0];
  const configurations=[{id:character.id,name:character.name,accountId:account.id,characterId:character.id,snapshot:{...account,characters:[character]}}];
  const teams=[{id:project.id,name:character.name,project}];
  const memory=new Map([
    ['leyline-account-v2',JSON.stringify(account)],['leyline-character-loadouts-v2',JSON.stringify(configurations)],
    ['leyline-saved-teams-v2',JSON.stringify(teams)],['leyline-definition-library-v2',JSON.stringify(library)],
    ['leyline-axis-recovery-v2',JSON.stringify({schemaVersion:2,project,savedSnapshot:null})],
  ]);
  vi.stubGlobal('localStorage',{getItem:(key:string)=>memory.get(key)??null,setItem:(key:string,value:string)=>memory.set(key,value)});
  const pinia=createPinia();setActivePinia(pinia);
  try {
    expect(useAccountStore().account).toEqual(account);
    expect(useCharacterLoadoutsStore().loadouts).toEqual(configurations);
    expect(useSavedTeamsStore().teams).toEqual(teams);
    expect(useDefinitionLibraryStore().library).toEqual(library);
    const workspace=useAxisWorkspaceStore();expect(workspace.recover()).toBe(true);expect(workspace.project).toEqual(project);
  } finally {disposePinia(pinia);}
});
