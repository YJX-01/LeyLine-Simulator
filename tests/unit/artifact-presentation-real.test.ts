import { existsSync,readFileSync } from 'node:fs';
import { describe,it,expect } from 'vitest';
import { previewEnkaImport } from '../../src/web/src/domain/enka-import';
import { createAccount } from '../../src/web/src/domain/account';
import { upgradeCounts } from '../../src/web/src/domain/artifact-rolls';
import { loadAccountGameData } from '../../src/web/src/domain/account-presentation';
import { previewMonaImport } from '../../src/web/src/domain/mona-import';
import { formatGameStat } from '../../src/web/src/domain/account-presentation';
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
 });
});
