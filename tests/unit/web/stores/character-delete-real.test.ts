import {describe,it,expect,vi} from 'vitest';
import {createPinia,setActivePinia} from 'pinia';
import {hasRecordedReference,readRecordedReference} from '../../../helpers/recorded-reference';
import {useCharacterLoadoutsStore} from '../../../../src/web/src/stores/character-loadouts';
import {createAccount,cloneAccount,parseAccount} from '../../../../src/web/src/domain/account';
import {previewEnkaImport,confirmEnkaImport} from '../../../../src/web/src/domain/enka-import';
const path='.references/enka/official-example.json';
describe.skipIf(!hasRecordedReference(path))('whole character removal from recorded showcase',()=>{
  it('rolls back failed commits and removes only that character records, preserving physical items',async()=>{
    const memory=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>memory.get(key) ?? null,setItem:(key:string,value:string)=>memory.set(key,value),removeItem:(key:string)=>memory.delete(key)});
    try{
      setActivePinia(createPinia());const store=useCharacterLoadoutsStore(),account=createAccount();
      const preview=await previewEnkaImport(JSON.parse(readRecordedReference(path)),'618285856',account);confirmEnkaImport(account,preview,preview.rows.map(row=>row.character.id),true);
      const [target,other]=account.characters;store.save('原展柜培养',account,target);store.save('另一角色培养',account,other);
      store.setFavorite(account.id,target.id,2);store.setFavorite(account.id,other.id,1);store.setEffectiveStats(account.id,target.id,['attack','attackPercent']);
      const before=new Map(memory),snapshots=JSON.stringify(store.loadouts),inventory=JSON.stringify(account.artifacts);
      expect(()=>store.removeCharacter(account.id,target.id,()=>{throw new Error('account write failed');})).toThrow('account write failed');
      expect(memory).toEqual(before);expect(JSON.stringify(store.loadouts)).toBe(snapshots);expect(store.favoriteLevel(account.id,target.id)).toBe(2);
      const next=cloneAccount(account);next.characters=next.characters.filter(character=>character.id!==target.id);
      store.removeCharacter(account.id,target.id,()=>{account.characters=parseAccount(next).characters;});
      expect(account.characters).toHaveLength(3);expect(JSON.stringify(account.artifacts)).toBe(inventory);expect(store.loadouts).toHaveLength(1);expect(store.loadouts[0].characterId).toBe(other.id);
      expect(store.favoriteLevel(account.id,target.id)).toBe(0);expect(store.favoriteLevel(account.id,other.id)).toBe(1);expect(JSON.parse(memory.get('leyline-effective-stats-v1')!)[`${account.id}/${target.id}`]).toBeUndefined();
    }finally{vi.unstubAllGlobals();}
  });
});
