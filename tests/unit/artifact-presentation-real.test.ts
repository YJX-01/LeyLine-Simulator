import { existsSync,readFileSync } from 'node:fs';
import { describe,it,expect } from 'vitest';
import { previewEnkaImport } from '../../src/web/src/domain/enka-import';
import { createAccount } from '../../src/web/src/domain/account';
import { upgradeCounts, averageRollCount, confirmedUpgradeCounts, preferredUpgradeCounts } from '../../src/web/src/domain/artifact-rolls';
import { loadAccountGameData } from '../../src/web/src/domain/account-presentation';
import { previewMonaImport } from '../../src/web/src/domain/mona-import';
import { formatGameStat } from '../../src/web/src/domain/account-presentation';
import { defaultEffectiveStats, characterLoadoutName, effectiveRollBreakdown } from '../../src/web/src/domain/character-loadout-name';
const path='.references/enka/uid-107590923.json';
describe.skipIf(!existsSync(path))('Actual showcase artifact presentation',()=>{
 it('keeps exact values, uses game display precision and counts recorded enhancement hits',async()=>{
  const raw=JSON.parse(readFileSync(path,'utf8'));const preview=await previewEnkaImport(raw,'107590923',createAccount());expect(preview.skipped).toEqual([]);
  const flower=preview.rows.find(row=>row.character.realBuild?.character.id==='vesna')!.character.showcase!.build.artifacts.find(item=>item.slot==='flower')!;
  expect(flower.substats.map(sub=>sub.rolls)).toEqual([1,1,3,3]);
  expect(upgradeCounts(flower).map(count=>count?.min)).toEqual([0,0,2,2]);
  const nahida=preview.rows.find(row=>row.character.realBuild?.character.id==='nahida')!.character.showcase!.build;
  expect(formatGameStat('critRate',nahida.artifactMain.critRate![20])).toBe('31.1%');
  expect(formatGameStat('elementalMastery',nahida.artifactMain.elementalMastery![20])).toBe('187');
  expect(formatGameStat('attackPercent',nahida.artifactMain.attackPercent![20])).toBe('46.6%');
  for(const row of preview.rows) for(const piece of row.character.showcase!.build.artifacts) {
   const detached=structuredClone(piece);detached.substats.forEach(sub=>delete sub.rolls);const inferred=upgradeCounts(detached);
   piece.substats.forEach((sub,index)=>{if(sub.rolls!==undefined){expect(inferred[index]?.min).toBeLessThanOrEqual(sub.rolls-1);expect(inferred[index]?.max).toBeGreaterThanOrEqual(sub.rolls-1);}});
  }
  const before=JSON.stringify(flower);upgradeCounts(flower);expect(JSON.stringify(flower)).toBe(before);
  const noHistory=structuredClone(flower);noHistory.substats.forEach(sub=>delete sub.rolls);
  expect(upgradeCounts(noHistory).every(count=>!count||!count.recorded)).toBe(true);
 });
});

const monaPath='.references/artifacts_mona.json';
describe.skipIf(!existsSync(monaPath))('Actual Mona inventory enhancement inference',()=>{
 it('infers the first real item without changing rounded export values',async()=>{
  const data=await loadAccountGameData();const preview=await previewMonaImport(readFileSync(monaPath,'utf8'),createAccount(),data.catalog.sets,data.main);
  const piece=preview.additions.find(item=>item.real?.source?.key==='id:8770563143816081')!.real!;const before=JSON.stringify(piece);
  expect(piece.substats.map(sub=>sub.value)).toEqual([.058,.11,.109,.179]);
  const counts=upgradeCounts(piece);expect(counts.map(count=>count?.min)).toEqual([0,1,2,2]);expect(counts.map(count=>count?.max)).toEqual([0,1,2,2]);expect(counts.every(count=>count&&!count.recorded)).toBe(true);
  expect(JSON.stringify(piece)).toBe(before);
  // Independent reference: arithmetic means of the four pinned affix tiers, not max-roll RV.
  const means=[(.0408+.0466+.0525+.0583)/4,(.0453+.0518+.0583+.0648)/4,(.0272+.0311+.035+.0389)/4,(.0544+.0622+.0699+.0777)/4];
  piece.substats.forEach((sub,index)=>expect(averageRollCount(sub.stat,sub.value,5)).toBeCloseTo(sub.value/means[index],10));
  expect(piece.substats.map(sub=>averageRollCount(sub.stat,sub.value,5)!.toFixed(1))).toEqual(['1.2','2.0','3.3','2.7']);
  // Pinned miao default: Jean uses attack and recharge; flat and ratio attack are one group.
  const jeanStats=defaultEffectiveStats('琴');
  expect(jeanStats).toEqual(['attack','attackPercent','energyRecharge']);
  const organizedAccount=createAccount();organizedAccount.artifacts=preview.additions;
  const { organizeMonaWearNotes }=await import('../../src/web/src/domain/mona-wear-notes');
  organizeMonaWearNotes(organizedAccount);
  const jean=organizedAccount.characters.find(item=>item.name==='琴')!;
  expect(jean).toBeDefined();
  const expectedCount=Object.values(jean.equipment).reduce((sum,id)=>sum+organizedAccount.artifacts.find(item=>item.id===id)!.real!.substats.reduce((value,sub)=>{
    const means:Record<string,number>={attack:(13.62+15.56+17.51+19.45)/4,attackPercent:(.0408+.0466+.0525+.0583)/4,energyRecharge:(.0453+.0518+.0583+.0648)/4};
    return value+(means[sub.stat]?sub.value/means[sub.stat]:0);
  },0),0);
  expect(characterLoadoutName(jean,organizedAccount,jeanStats,data.catalog.sets)).toContain(`琴 · ${expectedCount.toFixed(1)}词条`);
  const jeanPieces=organizedAccount.artifacts.filter(item=>Object.values(jean.equipment).includes(item.id));
  const breakdown=effectiveRollBreakdown(jeanPieces);
  const referenceMeans:Record<string,number>={hp:253.94,hpPercent:.04955,attack:16.535,attackPercent:.04955,defense:19.675,defensePercent:.06195,elementalMastery:19.815,energyRecharge:.05505,critRate:.03305,critDamage:.06605};
  const groups:Record<string,string[]>={hp:['hp','hpPercent'],attack:['attack','attackPercent'],defense:['defense','defensePercent'],elementalMastery:['elementalMastery'],energyRecharge:['energyRecharge'],critRate:['critRate'],critDamage:['critDamage']};
  for(const [group,members] of Object.entries(groups)) {
    const expected=jeanPieces.reduce((total,item)=>total+item.real!.substats.reduce((sum,sub)=>sum+(members.includes(sub.stat)?sub.value/referenceMeans[sub.stat]:0),0),0);
    expect(breakdown.find(row=>row.stat===group)?.value).toBeCloseTo(expected,8);
  }
  expect(confirmedUpgradeCounts(piece).map(count=>count?.min)).toEqual([0,1,2,2]);
  const ambiguous = preview.additions.find(item=>item.real?.source?.key==='id:3965604424477510')?.real;
  expect(ambiguous).toBeDefined();
  expect(ambiguous!.substats.map(sub=>sub.value)).toEqual([.117,.14,.054000000000000006,19]);
  expect(upgradeCounts(ambiguous!)[1]).toMatchObject({min:3,max:4});
  const selected=preferredUpgradeCounts(ambiguous!).map(count=>count?.min);
  expect(selected).toEqual([1,4,0,0]);
  expect(selected.reduce((sum,count)=>sum!+count!,0)).toBe(5);
  upgradeCounts(ambiguous!).forEach((count,index)=>{if(count && count.min!==count.max) expect(confirmedUpgradeCounts(ambiguous!)[index]).toBeUndefined();});
 });
});


describe.skipIf(!existsSync(monaPath))('Preferred configuration from actual inventory operations',()=>{
 it('adopts an unequipped-flower draft without cloning inventory and rejects missing referenced physical items',async()=>{
  const data=await loadAccountGameData();
  const original=createAccount();
  original.artifacts=(await previewMonaImport(readFileSync(monaPath,'utf8'),original,data.catalog.sets,data.main)).additions;
  const {organizeMonaWearNotes}=await import('../../src/web/src/domain/mona-wear-notes');
  const {preparePreferredConfiguration}=await import('../../src/web/src/domain/account-configurations');
  organizeMonaWearNotes(original);
  const before=JSON.stringify(original),jean=original.characters.find(item=>item.name==='琴')!;
  // Derived UI boundary: the real five-piece record with its flower explicitly unequipped.
  const snapshot=structuredClone(original),draft=snapshot.characters.find(item=>item.id===jean.id)!;
  delete draft.equipment.flower;
  snapshot.characters=[draft];snapshot.artifacts=snapshot.artifacts.filter(item=>Object.values(draft.equipment).includes(item.id));
  const saved={id:'derived-unequip',presetId:'derived-unequip',character:draft,source:snapshot};
  const prepared=preparePreferredConfiguration(original,saved);
  expect(prepared.next.characters.find(item=>item.id===jean.id)!.equipment).toEqual(draft.equipment);
  expect(prepared.next.artifacts).toEqual(original.artifacts);
  expect(prepared.transfers).toEqual([]);expect(JSON.stringify(original)).toBe(before);
  const missing=structuredClone(original);missing.artifacts=missing.artifacts.filter(item=>item.id!==draft.equipment.plume);
  expect(()=>preparePreferredConfiguration(missing,saved)).toThrow('实物已缺失');
  expect(JSON.stringify(original)).toBe(before);
  const {planClearedConfiguration}=await import('../../src/web/src/domain/account-configurations');
  const cleared=structuredClone(original),empty=cleared.characters.find(item=>item.id===jean.id)!;
  delete empty.realBuild;delete empty.showcase;empty.attack=0;empty.weapon='';empty.equipment={};
  const duplicate=structuredClone(original);duplicate.characters=[structuredClone(jean)];duplicate.artifacts=duplicate.artifacts.filter(item=>Object.values(jean.equipment).includes(item.id));
  const alternatives=[{id:'old-current',accountId:original.id,characterId:jean.id,snapshot:duplicate},{id:'four-piece',accountId:original.id,characterId:jean.id,snapshot}];
  const promoted=planClearedConfiguration(original,cleared,alternatives,jean.id);
  expect(promoted.promotedId).toBe('four-piece');expect(promoted.removedIds).toEqual(['old-current','four-piece']);
  expect(promoted.next.characters.find(item=>item.id===jean.id)!.equipment).toEqual(draft.equipment);
  expect(promoted.next.artifacts).toEqual(original.artifacts);expect(promoted.removedCharacter).toBe(false);
  const last=planClearedConfiguration(original,cleared,[],jean.id);
  expect(last.removedCharacter).toBe(true);expect(last.next.characters.some(item=>item.id===jean.id)).toBe(false);
  expect(last.next.characters).toEqual(original.characters.filter(item=>item.id!==jean.id));expect(last.next.artifacts).toEqual(original.artifacts);
  const removeBackup=planClearedConfiguration(original,cleared,alternatives,jean.id,'four-piece');
  expect(removeBackup.next).toEqual(original);expect(removeBackup.removedIds).toEqual(['four-piece']);
 });
});
