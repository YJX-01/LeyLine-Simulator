import {describe,it,expect,vi} from 'vitest';
import {createPinia,setActivePinia} from 'pinia';
import {hasRecordedReference,readRecordedReference} from '../../../../tests/helpers/recorded-reference';
import {createAccount,parseAccount,equipArtifact} from './account';
import {previewEnkaImport,confirmEnkaImport} from './enka-import';
import {artifactReferences,copyArtifact,removeInventoryArtifact} from './artifact-references';
import {useArtifactFavoritesStore} from '../stores/artifact-favorites';
const path='.references/enka/official-example.json';
describe.skipIf(!hasRecordedReference(path))('recorded item metadata and reference operations',()=>{
  it('keeps actual numeric content and original identity while a deliberate copy receives a new identity',async()=>{
    const account=createAccount(),preview=await previewEnkaImport(JSON.parse(readRecordedReference(path)),'618285856',account);confirmEnkaImport(account,preview,preview.rows.map(row=>row.character.id),true);const item=account.artifacts[0],before=JSON.stringify(item);item.alias='原件别名';expect(parseAccount(account).artifacts[0].alias).toBe('原件别名');
    const copy=copyArtifact(item);expect(copy.id).not.toBe(item.id);expect(copy.real!.id).toBe(copy.id);expect(copy.name).toBe(item.name);expect(copy.slot).toBe(item.slot);expect(copy.real!.setId).toBe(item.real!.setId);expect(copy.real!.substats.map(({stat,value})=>({stat,value}))).toEqual(item.real!.substats.map(({stat,value})=>({stat,value})));expect(copy.real!.source).toBeUndefined();expect(copy.mona).toBeUndefined();expect(copy.rollSource).toBe('inferred');expect(copy.alias).toBe('原件别名 · 副本1');delete item.alias;expect(JSON.stringify(item)).toBe(before);
    // Explicit UI-style attachment of an observed item, not a claimed player inventory export.
    const role=account.characters.find(character=>character.showcase!.build.artifacts.some(piece=>piece.slot===item.slot && piece.setId===item.real!.setId))!;equipArtifact(account,role.id,item.id,true);const configurations=[{id:'current-'+role.id,character:role,source:account,presetId:''}],combination={id:'recorded-item-reference',accountId:account.id,referenceName:role.name,items:[item],stats:[]};const references=artifactReferences(account,configurations,[combination],item.id);expect(references.map(reference=>reference.kind)).toEqual(['character','configuration','combination']);
    const beforeAccount=JSON.stringify(account),removed=removeInventoryArtifact(account,item.id);expect(removed.artifacts.some(artifact=>artifact.id===item.id)).toBe(false);const worn=removed.artifacts.find(piece=>piece.id===removed.characters.find(character=>character.id===role.id)!.equipment[item.slot]);expect(worn?.inventoryId).toBeNull();expect(worn?.real?.substats).toEqual(item.real!.substats);expect(JSON.stringify(account)).toBe(beforeAccount);expect(combination.items[0].id).toBe(item.id);
  });
  it('isolates three-level favorites by account and rolls back a failed deletion commit',async()=>{
    const memory=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>memory.get(key) ?? null,setItem:(key:string,value:string)=>memory.set(key,value)});
    try{setActivePinia(createPinia());const store=useArtifactFavoritesStore(),account=createAccount(),preview=await previewEnkaImport(JSON.parse(readRecordedReference(path)),'618285856',account);confirmEnkaImport(account,preview,preview.rows.map(row=>row.character.id),true);const item=account.artifacts[0];for(const level of [1,2,3]){store.set(account.id,item.id,level);expect(store.level(account.id,item.id)).toBe(level);}expect(store.level('unrelated-account-format-boundary',item.id)).toBe(0);expect(()=>store.set(account.id,item.id,4)).toThrow('收藏等级无效');const before=memory.get('leyline-artifact-favorites-v1');expect(()=>store.remove(account.id,item.id,()=>{throw new Error('write failed');})).toThrow('write failed');expect(store.level(account.id,item.id)).toBe(3);expect(memory.get('leyline-artifact-favorites-v1')).toBe(before);setActivePinia(createPinia());expect(useArtifactFavoritesStore().level(account.id,item.id)).toBe(3);}finally{vi.unstubAllGlobals();}
  });
});
