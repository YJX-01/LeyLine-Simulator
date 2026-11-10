import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { readContentSource } from '../../lib/content-source.mjs';
const root=resolve(import.meta.dirname, '../../..');
const canonical=resolve(root,'tools/data/sources/catalog/enka/catalog.json');
const output=resolve(root,'src/web/generated/enka-catalog.json');
const read=path=>readContentSource(resolve(root,path));
const supplements=read('tools/data/sources/catalog/enka/skill-supplements.json');
if(process.argv.includes('--capture')) {
  const content=readFileSync(resolve(root,'.references/enka/characters.json'));
  const metadata=JSON.parse(content);const source=read('.references/enka/source.json');
  if(source.commit!=='b94bc40528941126590e0eefb0f03278e7a44ec8')throw new Error('Enka metadata source changed; review before capture.');
  const characters=read('tools/data/sources/catalog/genshin-db/characters.json');
  const weapons=read('tools/data/sources/catalog/genshin-db/weapons.json');
  const sets=read('tools/data/sources/catalog/genshin-db/sets.json');
  const characterMap=Object.fromEntries(Object.entries(characters).map(([id,item])=>[String(item.metadata.id),{id,skills:metadata[item.metadata.id]?.SkillOrder??[]}]));
  const elements={Wind:'anemo',Rock:'geo',Electric:'electro',Grass:'dendro',Water:'hydro',Fire:'pyro',Ice:'cryo'};
  for(const [key,item] of Object.entries(metadata))if(/^1000000[57]-\d+$/.test(key) && elements[item.Element]){
    const [avatarId,depot]=key.split('-');
    characterMap[key]={id:`${avatarId==='10000005'?'aether':'lumine'}-${elements[item.Element]}`,skills:item.SkillOrder??[],skillDepotId:Number(depot)};
  }
  for(const [avatarId,item] of Object.entries(supplements.characters)) {
    const entry=characterMap[avatarId];
    if(!entry || entry.id!==item.id || item.skills.length!==3 || new Set(item.skills).size!==3) throw new Error(`Invalid supplemental skill identity: ${avatarId}`);
    if(entry.skills.length && JSON.stringify(entry.skills)!==JSON.stringify(item.skills)) throw new Error(`Conflicting official skill order: ${avatarId}`);
    characterMap[avatarId]={id:entry.id,skills:item.skills,skillDepotId:item.skillDepotId};
  }
  const weaponMap={};
  for(const [id,item] of Object.entries(weapons)) { const key=String(item.metadata.id);weaponMap[key]=Object.hasOwn(weaponMap,key)?null:id; }
  const mapping={characters:characterMap,weapons:Object.fromEntries(Object.entries(weaponMap).filter(([,id])=>id!==null)),sets:Object.fromEntries(Object.entries(sets).map(([id,item])=>[String(item.id),id]))};
  mkdirSync(resolve(root,'tools/data/sources/catalog/enka'),{recursive:true});
  writeFileSync(canonical,`${JSON.stringify({source,mapping},null,2)}\n`);
}
const snapshot=JSON.parse(readFileSync(canonical,'utf8'));
for(const [avatarId,item] of Object.entries(supplements.characters)) {
  const entry=snapshot.mapping.characters[avatarId];
  if(entry?.id!==item.id || JSON.stringify(entry.skills)!==JSON.stringify(item.skills) || entry.skillDepotId!==item.skillDepotId) throw new Error(`Supplement needs recapture: ${avatarId}`);
}
const expected=`${JSON.stringify(snapshot.mapping)}\n`;
if(process.argv.includes('--check')) { if(readFileSync(output,'utf8')!==expected)throw new Error('Enka catalog needs regeneration.'); }
else writeFileSync(output,expected);
console.log(JSON.stringify({characters:Object.keys(snapshot.mapping.characters).length,weapons:Object.keys(snapshot.mapping.weapons).length,sets:Object.keys(snapshot.mapping.sets).length,sourceCommit:snapshot.source.commit}));
