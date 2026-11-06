import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root=new URL('../../',import.meta.url);
const canonical=new URL('docs/constant/artifact-rolls.json',root);
const read=path=>readFileSync(new URL(path,root));
if(process.argv.includes('--capture')) {
  const raw=read('.references/enka/reliquary-affixes.json');
  const commit=JSON.parse(read('.references/enka/affix-source-commit.json')).sha;
  if(commit!=='b0501c5d89767ead5f647869a2412521447f7682')throw Error('Review changed affix reference before capture');
  const names={HP:'hp',HP_PERCENT:'hpPercent',ATTACK:'attack',ATTACK_PERCENT:'attackPercent',DEFENSE:'defense',DEFENSE_PERCENT:'defensePercent',CRITICAL:'critRate',CRITICAL_HURT:'critDamage',CHARGE_EFFICIENCY:'energyRecharge',ELEMENT_MASTERY:'elementalMastery'};
  const affixes=Object.fromEntries(JSON.parse(raw).filter(row=>[401,501].includes(row.depotId)&&names[row.propType.replace('FIGHT_PROP_','')]).map(row=>[String(row.id),{stat:names[row.propType.replace('FIGHT_PROP_','')],value:row.propValue,rarity:Math.floor(row.depotId/100)}]));
  const enka=JSON.parse(read('.references/enka/affixes.json'));
  const props={};for(const [name,stat] of Object.entries(names))props[stat]=`FIGHT_PROP_${name}`;
  for(const [id,row] of Object.entries(affixes))if(enka[id]?.propType!==props[row.stat])throw Error(`Enka affix identity mismatch: ${id}`);
  writeFileSync(canonical,JSON.stringify({source:{repository:'Rafs-kk/LunaGC-6.6-res',commit,path:'ExcelBinOutput/ReliquaryAffixExcelConfigData.json',sha256:createHash('sha256').update(raw).digest('hex')},affixes},null,2)+'\n');
}
const data=JSON.parse(readFileSync(canonical));const expected=JSON.stringify(data.affixes)+'\n';
const output=new URL('src/web/src/domain/data/artifact-rolls.json',root);
if(process.argv.includes('--check')) {if(readFileSync(output,'utf8')!==expected)throw Error('Artifact roll data needs regeneration');}else writeFileSync(output,expected);
console.log(JSON.stringify({affixes:Object.keys(data.affixes).length,commit:data.source.commit}));
