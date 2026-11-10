import {describe,it,expect,vi} from 'vitest';
import {createPinia,setActivePinia} from 'pinia';
import {hasRecordedReference,readRecordedReference} from '../../../helpers/recorded-reference';
import {createAccount,cloneAccount} from '../../../../src/web/src/domain/account';
import {previewEnkaImport,confirmEnkaImport} from '../../../../src/web/src/domain/enka-import';
import {planShowcaseInventory} from '../../../../src/web/src/domain/showcase-inventory';
import {planConfigurationRemoval,hasLocalConfiguration} from '../../../../src/web/src/domain/account-configurations';
import {useCharacterLoadoutsStore} from '../../../../src/web/src/stores/character-loadouts';
const path='.references/enka/official-example.json';
describe.skipIf(!hasRecordedReference(path))('configuration removal from recorded physical items',()=>{
  it('removes only a preset, promotes a valid alternative, and rolls back a failed account write',async()=>{
    const memory=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>memory.get(key) ?? null,setItem:(key:string,value:string)=>memory.set(key,value),removeItem:(key:string)=>memory.delete(key)});
    try{
      setActivePinia(createPinia());const store=useCharacterLoadoutsStore(),initial=createAccount();
      const preview=await previewEnkaImport(JSON.parse(readRecordedReference(path)),'618285856',initial);confirmEnkaImport(initial,preview,preview.rows.map(row=>row.character.id));
      const recorded=initial.characters.find(character=>character.name==='安柏')!,plan=planShowcaseInventory(initial,[recorded]),account=plan.next,target=account.characters.find(character=>character.id===recorded.id)!;
      target.equipment=Object.fromEntries(plan.items[target.id].map(item=>[item.slot,item.id]));
      const inventory=JSON.stringify(account.artifacts),showcase=JSON.stringify(target.showcase);
      // Explicit UI trial: the recorded physical set with its flower unequipped, not a player export.
      const trial=cloneAccount(account),alternative=trial.characters.find(character=>character.id===target.id)!;delete alternative.equipment.flower;
      const id=store.save('安柏缺花试配',trial,alternative);
      const preset=planConfigurationRemoval(account,store.loadouts,target.id,id);expect(preset.accountChanged).toBe(false);expect(preset.next).toBe(account);expect(preset.removedIds).toEqual([id]);
      const preferred=planConfigurationRemoval(account,store.loadouts,target.id);expect(preferred.promotedId).toBe(id);expect(preferred.removedIds).toEqual([id]);expect(preferred.next.characters.find(character=>character.id===target.id)!.equipment).toEqual(alternative.equipment);expect(Object.values(target.equipment)).toHaveLength(5);
      const before=new Map(memory),saved=JSON.stringify(store.loadouts);
      expect(()=>store.removeMany(preferred.removedIds,()=>{throw new Error('account write failed');})).toThrow('account write failed');expect(memory).toEqual(before);expect(JSON.stringify(store.loadouts)).toBe(saved);
      expect(JSON.stringify(preferred.next.artifacts)).toBe(inventory);expect(JSON.stringify(preferred.next.characters.find(character=>character.id===target.id)!.showcase)).toBe(showcase);
      const last=planConfigurationRemoval(account,[],target.id);const retained=last.next.characters.find(character=>character.id===target.id)!;expect(hasLocalConfiguration(retained)).toBe(false);expect(retained.showcase).toEqual(target.showcase);expect(JSON.stringify(last.next.artifacts)).toBe(inventory);expect(last.removedCharacter).toBe(false);
      expect(()=>planConfigurationRemoval(account,store.loadouts,target.id,'missing')).toThrow('配置已不存在');
    }finally{vi.unstubAllGlobals();}
  });
});
