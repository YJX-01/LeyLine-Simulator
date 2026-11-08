import { existsSync,readFileSync } from 'node:fs';
import { describe,it,expect } from 'vitest';
import { previewEnkaImport } from '../../src/web/src/domain/enka-import';
import { createAccount } from '../../src/web/src/domain/account';
import { upgradeCounts, averageRollCount, confirmedUpgradeCounts, preferredUpgradeCounts } from '../../src/web/src/domain/artifact-rolls';
import { loadAccountGameData } from '../../src/web/src/domain/account-presentation';
import { previewMonaImport } from '../../src/web/src/domain/mona-import';
import { formatGameStat } from '../../src/web/src/domain/account-presentation';
import { defaultEffectiveStats, characterLoadoutName } from '../../src/web/src/domain/character-loadout-name';
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
