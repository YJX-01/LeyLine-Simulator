import {describe,it,expect,vi} from 'vitest';
import {createPinia,setActivePinia} from 'pinia';
import {hasRecordedReference,readRecordedReference} from '../../../helpers/recorded-reference';
import {createAccount} from '../../../../src/web/src/domain/account';
import {previewEnkaImport,confirmEnkaImport} from '../../../../src/web/src/domain/enka-import';
import {showcaseArtifact} from '../../../../src/web/src/domain/showcase-inventory';
import {accountSlots} from '../../../../src/web/src/domain/account';
import {effectiveRollBreakdown} from '../../../../src/web/src/domain/character-loadout-name';
import {buildRollBasis,defaultRollBasis} from '../../../../src/web/src/domain/effective-roll-basis';
import {effectiveTotal} from '../../../../src/web/src/domain/artifact-combinations';
import {preferredUpgradeCounts,upgradeCounts,legalUpgradeHistories,cycleUpgradeHistory} from '../../../../src/web/src/domain/artifact-rolls';
import {useArtifactCombinationsStore} from '../../../../src/web/src/stores/artifact-combinations';
const path='.references/enka/uid-107590923.json';
describe.skipIf(!hasRecordedReference(path))('weighted entries and legal inference from the recorded 12-character showcase',()=>{
  it('Flins attack is 8.3 entries after converting flat attack by actual character and weapon white stats',async()=>{
    const raw=JSON.parse(readRecordedReference(path)),account=createAccount(),preview=await previewEnkaImport(raw,'107590923',account);
    const flins=preview.rows.find(row=>row.character.showcase?.avatarId===10000120)!.character,build=flins.showcase!.build,basis=buildRollBasis(build);
    const observed=raw.avatarInfoList.find((avatar:{avatarId:number})=>avatar.avatarId===10000120);
    expect(basis.attack).toBeCloseTo(observed.fightPropMap['4'],2);expect(basis.hp).toBeCloseTo(observed.fightPropMap['1'],2);expect(basis.defense).toBeCloseTo(observed.fightPropMap['7'],2);
    const items=accountSlots.map(slot=>showcaseArtifact(flins,slot)!);
    const entries=effectiveRollBreakdown(items,basis),attack=entries.find(row=>row.stat==='attack')!.value!;
    // Independent sums from the recorded substat display: ATK 11.1%+5.3%+19.8%, flat ATK 33+19.
    const expected=(.362+52/observed.fightPropMap['4'])/.04955;
    expect(expected).toBeCloseTo(8.32867567,6);expect(attack).toBeCloseTo(expected,5);expect(attack.toFixed(1)).toBe('8.3');
    expect(entries.find(row=>row.stat==='defense')!.value).toBeCloseTo((39+37)/observed.fightPropMap['7']/.06195,5);
    const stats=['attack','attackPercent','critRate','critDamage','elementalMastery','energyRecharge'] as const;
    const total=expected+.769/.06605+.334/.03305+67/19.815+.162/.05505;
    expect(effectiveTotal(items,[...stats],basis)).toBeCloseTo(total,5);
    const memory=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>memory.get(key) ?? null,setItem:(key:string,value:string)=>memory.set(key,value)});
    try{
      setActivePinia(createPinia());const store=useArtifactCombinationsStore();confirmEnkaImport(account,preview,preview.rows.map(row=>row.character.id),true);
      // Persist a snapshot of the recorded basis, independent of subsequent UI weapon trials.
      const id=store.save(account,items,[...stats],flins.name,'',undefined,undefined,basis).id;
      const other=preview.rows.find(row=>row.character.showcase!.build.weapon.weaponType===build.weapon.weaponType && row.character.showcase!.build.weapon.id!==build.weapon.id)!.character.showcase!.build;
      const trial=buildRollBasis({...build,weapon:other.weapon,weaponLevel:other.weaponLevel,weaponAscension:other.weaponAscension});expect(trial.attack).not.toBe(basis.attack);
      const saved=store.combinations.find(item=>item.id===id)!;expect(saved.basis).toEqual(basis);expect(effectiveTotal(saved.items,saved.stats,saved.basis)).toBeCloseTo(total,5);
      expect(store.save(account,items,[...stats],flins.name,'',undefined,undefined,basis)).toEqual({id,duplicate:true});
      expect(store.save(account,items,[...stats],flins.name,'',undefined,undefined,trial).duplicate).toBe(false);
      setActivePinia(createPinia());expect(useArtifactCombinationsStore().combinations.find(item=>item.id===id)!.basis).toEqual(basis);
      expect(defaultRollBasis()).toEqual({hp:14000,attack:750,defense:700,source:'default'});expect(effectiveTotal(items,[...stats])).toBeCloseTo((.362+52/750)/.04955+.769/.06605+.334/.03305+67/19.815+.162/.05505,6);
    }finally{vi.unstubAllGlobals();}
  });
  it('34.2% crit damage has four recorded upgrades, and inference without IDs chooses the smaller legal count',async()=>{
    const account=createAccount(),preview=await previewEnkaImport(JSON.parse(readRecordedReference(path)),'107590923',account);
    const owner=preview.rows.find(row=>row.character.showcase?.avatarId===10000143)!.character;
    const artifact=owner.showcase!.build.artifacts.find(item=>item.substats.some(sub=>sub.stat==='critDamage' && Math.abs(sub.value-.342)<1e-8))!;
    const original=JSON.stringify(artifact),index=artifact.substats.findIndex(sub=>sub.stat==='critDamage');expect(artifact.substats[index].rolls).toBe(5);expect(preferredUpgradeCounts(artifact)[index]!.min).toBe(4);
    // A metadata-removal compatibility boundary, retaining every observed item value.
    const without=JSON.parse(original) as typeof artifact;for(const sub of without.substats)delete sub.rolls;
    expect(upgradeCounts(without)[index]).toMatchObject({min:4,max:5,recorded:false});const chosen=preferredUpgradeCounts(without);expect(chosen[index]!.min).toBe(4);expect(chosen.reduce((sum,item)=>sum+item!.min,0)).toBe(4);expect(JSON.stringify(artifact)).toBe(original);const editable=JSON.parse(original) as typeof artifact;expect([...new Set(legalUpgradeHistories(editable).map(row=>row[index]))]).toContain(5);expect(cycleUpgradeHistory(editable,index)).toBe(true);expect(editable.substats[index].rolls).toBe(6);expect(cycleUpgradeHistory(editable,index)).toBe(true);expect(editable.substats[index].rolls).toBe(5);
  });
});
