import {describe,it,expect,vi} from 'vitest';
import {createPinia,setActivePinia} from 'pinia';
import {hasRecordedReference,readRecordedReference} from '../../../helpers/recorded-reference';
import {previewEnkaImport,confirmEnkaImport} from '../../../../src/web/src/domain/enka-import';
import {createAccount,equipArtifact,parseAccount} from '../../../../src/web/src/domain/account';
import {planShowcaseInventory,showcaseArtifact} from '../../../../src/web/src/domain/showcase-inventory';
import {copyArtifact,detachArtifact} from '../../../../src/web/src/domain/artifact-references';
import {persistArtifactRolls,preferredUpgradeCounts} from '../../../../src/web/src/domain/artifact-rolls';
import {useAccountStore} from '../../../../src/web/src/stores/account';
import {useCharacterLoadoutsStore} from '../../../../src/web/src/stores/character-loadouts';
import {useArtifactCombinationsStore} from '../../../../src/web/src/stores/artifact-combinations';
import {useArtifactRemoval} from '../../../../src/web/src/composables/use-artifact-removal';
import {useInventoryHistoryMerge} from '../../../../src/web/src/composables/use-inventory-history-merge';
const path='.references/enka/official-example.json';
describe.skipIf(!hasRecordedReference(path))('observed artifact identity and persisted history',()=>{
  async function recorded(){const account=createAccount(),preview=await previewEnkaImport(JSON.parse(readRecordedReference(path)),'618285856',account);confirmEnkaImport(account,preview,preview.rows.map(row=>row.character.id),true);return account;}
  it('shows showcase items as unstored after inventory deletion without changing their snapshot',async()=>{
    const account=await recorded(),role=account.characters[0],before=JSON.stringify(role.showcase),raw=showcaseArtifact(role,'flower')!,physical=planShowcaseInventory(account,[role],['flower']).items[role.id][0];
    expect(physical.id).not.toBe(raw.id);
    expect(showcaseArtifact(role,'flower',account)?.inventoryId).toBeUndefined();
    account.artifacts=[];
    expect(showcaseArtifact(role,'flower',account)?.inventoryId).toBeNull();
    // A detached worn snapshot and an explicit copy of that observed item are not inventory matches.
    account.artifacts=[detachArtifact(physical),copyArtifact(physical)];
    expect(showcaseArtifact(role,'flower',account)?.inventoryId).toBeNull();
    // A boundary derived by reversing only the recorded substat order must not match.
    const reordered=structuredClone(physical);reordered.real!.substats.reverse();account.artifacts.push(reordered);
    expect(showcaseArtifact(role,'flower',account)?.inventoryId).toBeNull();
    account.artifacts.push(structuredClone(physical));
    const resolved=showcaseArtifact(role,'flower',account)!;
    expect(resolved.inventoryId).toBeUndefined();expect(resolved.id).toBe(raw.id);
    expect(JSON.stringify(role.showcase)).toBe(before);
  });
  it('persists inference then replaces only ordered exact matches with observed showcase history',async()=>{
    const account=await recorded(),source=JSON.parse(JSON.stringify(account)),item=account.artifacts[0],sourceItem=source.artifacts[0];
    for(const sub of item.real!.substats)delete sub.rolls;delete item.rollSource;
    const expected=preferredUpgradeCounts(item.real!).map(count=>count!.min+1);persistArtifactRolls(item);expect(item.rollSource).toBe('inferred');expect(item.real!.substats.map(sub=>sub.rolls)).toEqual(expected);expect(parseAccount(account).artifacts[0].rollSource).toBe('inferred');
    item.alias='保留别名';const plan=planShowcaseInventory(account,account.characters);expect(plan.added).toBe(0);expect(plan.matched).toBe(source.artifacts.length);expect(plan.next.artifacts[0].id).toBe(item.id);expect(plan.next.artifacts[0].alias).toBe('保留别名');expect(plan.next.artifacts[0].rollSource).toBe('showcase');expect(plan.next.artifacts[0].real!.substats.map(sub=>sub.rolls)).toEqual(sourceItem.real.substats.map((sub:{rolls:number})=>sub.rolls));
    // Ordered-stat boundary derived solely by reversing the recorded item's display order.
    item.real!.substats.reverse();expect(planShowcaseInventory(account,account.characters).added).toBe(1);
    const copy=copyArtifact(sourceItem,source.artifacts),copy2=copyArtifact(sourceItem,[...source.artifacts,copy]);expect(copy2.alias).not.toBe(copy.alias);expect(copy2.id).not.toBe(copy.id);
  });
  it('merges the default original rather than a deliberately saved copy',async()=>{
    const account=await recorded(),original=account.artifacts[0],copy=copyArtifact(original,account.artifacts);account.artifacts.unshift(copy);
    const plan=planShowcaseInventory(account,account.characters);expect(plan.items[account.characters[0].id].some(item=>item.id===original.id)).toBe(true);expect(plan.items[account.characters[0].id].some(item=>item.id===copy.id)).toBe(false);expect(copy.isCopy).toBe(true);
  });
  it('deletion keeps detached configuration/combination values, removes inventory identity and rolls back failed writes',async()=>{
    const memory=new Map<string,string>();let failAccountWrite=false;vi.stubGlobal('localStorage',{getItem:(key:string)=>memory.get(key) ?? null,setItem:(key:string,value:string)=>{if(failAccountWrite && key==='leyline-account-v2'){failAccountWrite=false;throw new Error('storage failure');}memory.set(key,value);},removeItem:(key:string)=>memory.delete(key)});
    try{
      setActivePinia(createPinia());const account=useAccountStore(),loadouts=useCharacterLoadoutsStore(),groups=useArtifactCombinationsStore(),record=await recorded(),item=record.artifacts[0],role=record.characters[0];equipArtifact(record,role.id,item.id,true);account.commitEdit(record);
      const preset=loadouts.save(role.name,record,role),group=groups.save(record,[item],['critRate'],role.name).id,values=item.real!.substats.map(({stat,value})=>({stat,value}));
      // Remove only observed history metadata, then merge it back from the real source.
      const savedPiece=groups.combinations[0].items[0];for(const sub of savedPiece.real!.substats)delete sub.rolls;savedPiece.rollSource='inferred';
      useInventoryHistoryMerge()(record);expect(groups.combinations[0].items[0].rollSource).toBe('showcase');expect(groups.combinations[0].items[0].real!.substats.map(sub=>sub.rolls)).toEqual(item.real!.substats.map(sub=>sub.rolls));
      const beforeFailure=JSON.stringify([account.account,loadouts.loadouts,groups.combinations]),storedGroups=memory.get('leyline-artifact-combinations-v1'),storedLoadouts=memory.get('leyline-character-loadouts-v2');failAccountWrite=true;expect(()=>useArtifactRemoval()(item.id)).toThrow('本地保存失败');expect(JSON.stringify([account.account,loadouts.loadouts,groups.combinations])).toBe(beforeFailure);expect(memory.get('leyline-artifact-combinations-v1')).toBe(storedGroups);expect(memory.get('leyline-character-loadouts-v2')).toBe(storedLoadouts);
      useArtifactRemoval()(item.id);expect(account.account.artifacts.some(piece=>piece.id===item.id)).toBe(false);const worn=account.account.artifacts.find(piece=>piece.id===account.account.characters[0].equipment[item.slot]);expect(worn?.inventoryId).toBeNull();expect(worn?.real!.substats.map(({stat,value})=>({stat,value}))).toEqual(values);
      const snapshot=groups.combinations.find(item=>item.id===group)!.items[0];expect(snapshot.inventoryId).toBeNull();expect(snapshot.id).not.toBe(item.id);expect(snapshot.real!.substats.map(({stat,value})=>({stat,value}))).toEqual(values);expect(loadouts.loadouts.find(item=>item.id===preset)!.snapshot.artifacts[0].inventoryId).toBeNull();
      setActivePinia(createPinia());expect(useArtifactCombinationsStore().combinations[0].items[0].inventoryId).toBeNull();expect(useCharacterLoadoutsStore().loadouts[0].snapshot.artifacts[0].inventoryId).toBeNull();
      const original=JSON.stringify(useArtifactCombinationsStore().combinations),storage=memory.get('leyline-artifact-combinations-v1');expect(()=>useArtifactCombinationsStore().replaceAll([],()=>{throw new Error('storage failure');})).toThrow('storage failure');expect(JSON.stringify(useArtifactCombinationsStore().combinations)).toBe(original);expect(memory.get('leyline-artifact-combinations-v1')).toBe(storage);
    }finally{vi.unstubAllGlobals();}
  });
});
