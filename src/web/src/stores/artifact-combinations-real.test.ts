import { hasRecordedReference as existsSync, readRecordedReference } from '../../../../tests/helpers/recorded-reference';
import { describe,it,expect,vi } from 'vitest';
import { createPinia,setActivePinia } from 'pinia';
import { useArtifactCombinationsStore } from './artifact-combinations';
import { createAccount,cloneAccount,parseAccount } from '../domain/account';
import { previewEnkaImport,confirmEnkaImport } from '../domain/enka-import';
import { planShowcaseInventory } from '../domain/showcase-inventory';
import { applyCombination,combinationName,combinationSignature,normalizeEffectiveStats } from '../domain/artifact-combinations';
import { defaultEffectiveStats } from '../domain/character-loadout-name';
import { loadAccountGameData } from '../domain/account-presentation';
const path='.references/enka/official-example.json';
describe.skipIf(!existsSync(path))('recorded showcase to independent local combinations',()=>{
 it('imports only after opt-in, reuses exact ordered contents, and never equips automatically',async()=>{
  const raw=JSON.parse(readRecordedReference(path)),account=createAccount();
  const preview=await previewEnkaImport(raw,'618285856',account);expect(preview.rows).toHaveLength(4);
  const ids=preview.rows.map(row=>row.character.id);
  confirmEnkaImport(account,preview,ids);expect(account.artifacts).toHaveLength(0);
  const characters=account.characters,plan=planShowcaseInventory(account,characters);
  expect(plan.added).toBe(20);expect(plan.matched).toBe(0);expect(account.artifacts).toHaveLength(0);
  expect(plan.next.characters.every(character=>!Object.values(character.equipment).length)).toBe(true);
  const repeated=planShowcaseInventory(plan.next,characters);
  expect(repeated.added).toBe(0);expect(repeated.matched).toBe(20);
  expect(repeated.next.artifacts.map(item=>item.id)).toEqual(plan.next.artifacts.map(item=>item.id));
  // A format boundary derived from one recorded item: only its substat order is reversed.
  const reordered=structuredClone(characters[0]);reordered.showcase!.build.artifacts[0].substats.reverse();
  const distinct=planShowcaseInventory(plan.next,[reordered]);expect(distinct.added).toBe(1);expect(distinct.matched).toBe(4);
  const other=createAccount(),direct=await previewEnkaImport(raw,'618285856',other);confirmEnkaImport(other,direct,direct.rows.map(row=>row.character.id),true);expect(other.artifacts).toHaveLength(20);
 });
 it('names real items and applies a saved combination only to a detached draft',async()=>{
  const account=createAccount(),preview=await previewEnkaImport(JSON.parse(readRecordedReference(path)),'618285856',account);
  confirmEnkaImport(account,preview,preview.rows.map(row=>row.character.id));
  const plan=planShowcaseInventory(account,account.characters),character=account.characters[0],items=plan.items[character.id];
  const stats=defaultEffectiveStats(character.name),combination={id:'recorded-boundary-combination',accountId:account.id,items,stats,referenceName:character.name};
  const before=JSON.stringify(plan.next),draft=applyCombination(plan.next,character.id,combination);
  expect(JSON.stringify(plan.next)).toBe(before);expect(Object.values(draft.next.characters[0].equipment)).toHaveLength(5);expect(parseAccount(draft.next)).toEqual(draft.next);
  const target=plan.next.characters[1],transfer=applyCombination(draft.next,target.id,combination);expect(transfer.transfers).toHaveLength(5);
  expect(transfer.next.characters[0].equipment).toEqual({});expect(Object.values(transfer.next.characters[1].equipment)).toHaveLength(5);
  const data=await loadAccountGameData();const name=combinationName(combination,data.catalog.sets);
  const means:Record<string,number>={hp:253.94,hpPercent:.04955,attack:16.535,attackPercent:.04955,defense:19.675,defensePercent:.06195,elementalMastery:19.815,energyRecharge:.05505,critRate:.03305,critDamage:.06605};
  const expected=items.reduce((sum,item)=>sum+item.real!.substats.reduce((value,sub)=>value+(stats.includes(sub.stat)?sub.value/means[sub.stat]:0),0),0);
  expect(name).toMatch(/^2染血\+2苍白-攻物爆/);expect(name.endsWith(expected.toFixed(1)+'词条')).toBe(true);expect(name).not.toContain('undefined');expect(name).not.toContain('NaN');
  expect(combinationSignature(items,stats)).toBe(combinationSignature([...items].reverse(),[...stats].reverse()));
  expect(normalizeEffectiveStats(['attackPercent'])).toEqual(['attack','attackPercent']);
  const changed=cloneAccount(plan.next);changed.artifacts.find(item=>item.id===items[0].id)!.real!.level--;
  expect(()=>applyCombination(changed,character.id,combination)).toThrow('词条已变化');
 });
 it('keeps ordered physical references and rolls back a failed inventory commit',async()=>{
  const memory=new Map<string,string>();
  vi.stubGlobal('localStorage',{getItem:(key:string)=>memory.get(key) ?? null,setItem:(key:string,value:string)=>memory.set(key,value)});
  try{
    setActivePinia(createPinia());const store=useArtifactCombinationsStore();
    const account=createAccount(),preview=await previewEnkaImport(JSON.parse(readRecordedReference(path)),'618285856',account);confirmEnkaImport(account,preview,preview.rows.map(row=>row.character.id));
    const plan=planShowcaseInventory(account,account.characters),character=account.characters[0],items=plan.items[character.id],stats=defaultEffectiveStats(character.name);
    const first=store.save(plan.next,items,stats,character.name,'',undefined,'安柏物伤组合');
    expect(store.combinations[0].name).toBe('安柏物伤组合');
    const before=JSON.stringify(store.combinations),raw=memory.get('leyline-artifact-combinations-v1');
    expect(store.save(plan.next,[...items].reverse(),[...stats].reverse(),character.name)).toEqual({id:first.id,duplicate:true});
    expect(()=>store.save(plan.next,items,[...stats,'defense'],character.name,'',()=>{throw new Error('inventory write failed');})).toThrow('inventory write failed');
    expect(JSON.stringify(store.combinations)).toBe(before);expect(memory.get('leyline-artifact-combinations-v1')).toBe(raw);
    store.remove(plan.next.id,first.id);expect(store.combinations).toEqual([]);expect(plan.next.artifacts).toHaveLength(20);
  }finally{vi.unstubAllGlobals();}
 });

});
